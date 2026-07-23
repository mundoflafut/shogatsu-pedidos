import React, { useState, useEffect } from 'react';
import { ChefHat, Printer, CheckCircle2, Clock, Truck, XCircle, DollarSign, Users, Bell, FileText, Settings, RefreshCw, Lock, AlertCircle, Plus, Edit, Trash2 } from 'lucide-react';
import { Order, AppConfig, MenuCategory } from '../types';

interface KitchenPanelProps {
  config: AppConfig | null;
  categories: MenuCategory[];
  onReloadConfig: () => void;
}

export default function KitchenPanel({ config, categories, onReloadConfig }: KitchenPanelProps) {
  const [adminToken, setAdminToken] = useState<string | null>(localStorage.getItem('shogatsu_admin_token'));
  const [adminPassword, setAdminPassWord] = useState<string>('');
  const [loginError, setLoginError] = useState<string | null>(null);

  const [activeTab, setActiveTab] = useState<'kanban' | 'reports' | 'campaigns' | 'settings'>('kanban');
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState<boolean>(false);

  const [reportsData, setReportsData] = useState<any>(null);
  const [campaignsData, setCampaignsData] = useState<any>(null);

  // Printed ticket preview modal state
  const [printedTicket, setPrintedTicket] = useState<{ title: string; lines: string[] } | null>(null);

  // Printer stations config (settings tab)
  const [stationsCfg, setStationsCfg] = useState<Record<string, { label: string; method: string; ip: string; port: number; device: string }>>({});
  const [savingStations, setSavingStations] = useState(false);
  const [stationsMsg, setStationsMsg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState<'usb' | 'rede' | null>(null);
  const [testingStation, setTestingStation] = useState<string | null>(null);

  // Delete order confirmation
  const [orderToDelete, setOrderToDelete] = useState<Order | null>(null);
  const [deleting, setDeleting] = useState(false);

  // AI Assistant panel
  const [aiOpen, setAiOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [aiInput, setAiInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    if (config?.stations) setStationsCfg(config.stations as any);
  }, [config]);

  // Login handler
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: adminPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Senha incorreta');
      setAdminToken(data.token);
      localStorage.setItem('shogatsu_admin_token', data.token);
    } catch (err: any) {
      setLoginError(err.message);
    }
  };

  // Fetch orders
  const fetchOrders = async () => {
    if (!adminToken) return;
    setLoadingOrders(true);
    try {
      const res = await fetch(`/api/orders?token=${adminToken}`);
      if (res.ok) {
        const data = await res.json();
        setOrders(data);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingOrders(false);
    }
  };

  // Fetch reports
  const fetchReports = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/reports?token=${adminToken}`);
      if (res.ok) setReportsData(await res.json());
    } catch (e) {}
  };

  // Fetch campaigns
  const fetchCampaigns = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/campaigns?token=${adminToken}`);
      if (res.ok) setCampaignsData(await res.json());
    } catch (e) {}
  };

  useEffect(() => {
    if (adminToken) {
      fetchOrders();
      fetchReports();
      fetchCampaigns();

      // Setup SSE for real-time order updates
      const es = new EventSource(`/api/stream?token=${adminToken}`);
      es.addEventListener('new-order', () => fetchOrders());
      es.addEventListener('order-updated', () => fetchOrders());
      es.addEventListener('order-deleted', () => fetchOrders());

      return () => {
        es.close();
      };
    }
  }, [adminToken]);

  // Update order status
  const handleUpdateStatus = async (orderId: string, status: Order['status']) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/orders/${orderId}?token=${adminToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      if (res.ok) {
        fetchOrders();
      }
    } catch (e) {}
  };

  // Print simulation handler
  const handlePrint = async (order: Order, station: string) => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/print?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.id, station })
      });
      const data = await res.json();
      if (data.ok) {
        const lines: string[] = [
          `=================================`,
          `    SHOGATSU CULINÁRIA ORIENTAL`,
          `        VIA DE: ${station.toUpperCase()}`,
          `=================================`,
          `PEDIDO #${order.id} ${order.ticketNumber ? `(SENHA Nº ${order.ticketNumber})` : ''}`,
          `Data/Hora: ${new Date(order.createdAt).toLocaleTimeString('pt-BR')}`,
          `Modo: ${order.mode.toUpperCase()}`,
          `Cliente: ${order.name}`,
          `Tel: ${order.phone}`,
          order.address ? `Endereço: ${order.address}` : '',
          `---------------------------------`,
          `ITENS:`,
          ...order.items.map((i) => `  ${i.qty}x ${i.name} - R$ ${(i.price * i.qty).toFixed(2)}`),
          `---------------------------------`,
          `Subtotal: R$ ${order.subtotal.toFixed(2)}`,
          `Taxa Entrega: R$ ${order.fee.toFixed(2)}`,
          order.discount ? `Desconto: -R$ ${order.discount.toFixed(2)}` : '',
          `TOTAL: R$ ${order.total.toFixed(2)}`,
          `Pagamento: ${order.payMethod.toUpperCase()}`,
          order.obs ? `Obs: ${order.obs}` : '',
          `=================================`
        ].filter(Boolean);

        setPrintedTicket({ title: `Impressão: Via ${station.toUpperCase()}`, lines });
      }
    } catch (e) {}
  };

  // ---- Printer stations (Settings tab) ----
  const handleStationChange = (st: string, field: string, value: string | number) => {
    setStationsCfg((prev) => ({ ...prev, [st]: { ...prev[st], [field]: value } }));
  };

  const handleSaveStations = async () => {
    if (!adminToken) return;
    setSavingStations(true);
    setStationsMsg(null);
    try {
      const res = await fetch(`/api/config?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cfg: { stations: stationsCfg } })
      });
      const data = await res.json();
      if (res.ok) {
        setStationsMsg('Configuração de impressoras salva com sucesso.');
        onReloadConfig();
      } else {
        setStationsMsg(data.error || 'Erro ao salvar.');
      }
    } catch (e) {
      setStationsMsg('Erro de conexão ao salvar.');
    } finally {
      setSavingStations(false);
      setTimeout(() => setStationsMsg(null), 4000);
    }
  };

  const handleDetectPrinters = async (type: 'usb' | 'rede') => {
    if (!adminToken) return;
    setDetecting(type);
    try {
      const url = type === 'usb' ? '/api/admin/detect-usb-printers' : '/api/admin/detect-network-printers';
      const res = await fetch(`${url}?token=${adminToken}`);
      const data = await res.json();
      if (data.found && data.found.length) {
        setStationsMsg(`Encontradas: ${data.found.join(', ')}`);
      } else {
        setStationsMsg(data.note || 'Nenhuma impressora encontrada.');
      }
    } catch (e) {
      setStationsMsg('Erro ao detectar impressoras.');
    } finally {
      setDetecting(null);
      setTimeout(() => setStationsMsg(null), 6000);
    }
  };

  const handleTestPrint = async (st: string) => {
    if (!adminToken) return;
    setTestingStation(st);
    try {
      const res = await fetch(`/api/print-test?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ station: st })
      });
      const data = await res.json();
      setStationsMsg(res.ok ? `Teste enviado para "${st}" com sucesso.` : (data.error || 'Falha no teste.'));
    } catch (e) {
      setStationsMsg('Erro ao testar impressora.');
    } finally {
      setTestingStation(null);
      setTimeout(() => setStationsMsg(null), 5000);
    }
  };

  // ---- Delete order ----
  const handleConfirmDelete = async () => {
    if (!adminToken || !orderToDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/orders/${orderToDelete.id}?token=${adminToken}`, { method: 'DELETE' });
      if (res.ok) {
        setOrders((prev) => prev.filter((o) => o.id !== orderToDelete.id));
        setOrderToDelete(null);
      } else {
        const data = await res.json();
        alert(data.error || 'Erro ao excluir pedido.');
      }
    } catch (e) {
      alert('Erro de conexão ao excluir pedido.');
    } finally {
      setDeleting(false);
    }
  };

  // ---- AI Assistant ----
  const handleSendAiMessage = async () => {
    if (!adminToken || !aiInput.trim() || aiLoading) return;
    const question = aiInput.trim();
    setAiMessages((prev) => [...prev, { role: 'user', text: question }]);
    setAiInput('');
    setAiLoading(true);
    try {
      const res = await fetch(`/api/admin/ai-assistant?token=${adminToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: question })
      });
      const data = await res.json();
      setAiMessages((prev) => [...prev, { role: 'ai', text: res.ok ? data.reply : (data.error || 'Erro ao consultar a IA.') }]);
    } catch (e) {
      setAiMessages((prev) => [...prev, { role: 'ai', text: 'Erro de conexão com a IA.' }]);
    } finally {
      setAiLoading(false);
    }
  };

  // Toggle campaign active status
  const handleToggleCampaign = async (id: string, currentActive: boolean) => {
    if (!adminToken) return;
    try {
      await fetch(`/api/admin/campaigns/messages/${id}?token=${adminToken}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: !currentActive })
      });
      fetchCampaigns();
    } catch (e) {}
  };

  // Trigger campaign manually
  const handleSendCampaignNow = async () => {
    if (!adminToken) return;
    try {
      const res = await fetch(`/api/admin/campaigns/send-now?token=${adminToken}`, {
        method: 'POST'
      });
      const data = await res.json();
      alert(data.ok ? `Campanha disparada! Entregue para ${data.entregues} clientes.` : data.error);
    } catch (e) {}
  };

  if (!adminToken) {
    return (
      <div className="max-w-md mx-auto my-12 p-8 bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl text-slate-100 space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 bg-amber-500/10 border border-amber-500/30 text-amber-400 rounded-2xl flex items-center justify-center mx-auto">
            <Lock className="w-7 h-7" />
          </div>
          <h2 className="text-2xl font-bold font-serif">Acesso ao Painel</h2>
          <p className="text-xs text-slate-400">
            Digite a senha do restaurante para gerenciar os pedidos em tempo real.
          </p>
        </div>

        {loginError && (
          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl flex items-center gap-2">
            <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
            <span>{loginError}</span>
          </div>
        )}

        <form onSubmit={handleAdminLogin} className="space-y-4">
          <div>
            <label className="text-xs text-slate-400 block mb-1">Senha do Painel</label>
            <input
              type="password"
              required
              value={adminPassword}
              onChange={(e) => setAdminPassWord(e.target.value)}
              placeholder="Digite a senha..."
              className="w-full px-4 py-3 bg-slate-950 border border-slate-800 rounded-xl text-sm text-slate-100 focus:outline-none focus:border-amber-500"
            />
          </div>

          <button
            type="submit"
            className="w-full py-3.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-sm shadow-lg shadow-amber-500/20"
          >
            Entrar no Painel da Cozinha
          </button>
        </form>

        <p className="text-[11px] text-slate-500 text-center">
          Senha padrão inicial: <code className="text-amber-400">shogatsu2026</code>
        </p>
      </div>
    );
  }

  const columns = [
    { id: 'novo', title: config?.labels?.colNovo || 'Novos Pedidos', color: 'border-amber-500 text-amber-400' },
    { id: 'preparando', title: config?.labels?.colPrep || 'Em Preparo', color: 'border-blue-500 text-blue-400' },
    { id: 'saiu', title: config?.labels?.colPronto || 'A Caminho / Pronto', color: 'border-purple-500 text-purple-400' },
    { id: 'entregue', title: config?.labels?.colEntregue || 'Entregues', color: 'border-emerald-500 text-emerald-400' },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6 text-slate-100">
      
      {/* Top Admin Sub-Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 bg-slate-900/90 border border-slate-800 p-4 rounded-2xl shadow-xl">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-bold flex items-center justify-center">
            <ChefHat className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold font-serif">Painel de Controle da Cozinha</h2>
            <p className="text-xs text-slate-400">Gerenciamento ao vivo dos pedidos, relatórios e automações</p>
          </div>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto">
          <button
            onClick={() => setActiveTab('kanban')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'kanban' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Clock className="w-4 h-4" /> Kanban Pedidos
          </button>

          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'reports' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileText className="w-4 h-4" /> Relatórios
          </button>

          <button
            onClick={() => setActiveTab('campaigns')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'campaigns' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Bell className="w-4 h-4" /> Notificações Push/SMS
          </button>

          <button
            onClick={() => setActiveTab('settings')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
              activeTab === 'settings' ? 'bg-amber-500 text-slate-950 shadow-md' : 'bg-slate-950 text-slate-400 hover:text-slate-200'
            }`}
          >
            <Settings className="w-4 h-4" /> Impressoras
          </button>

          <button
            onClick={() => { localStorage.removeItem('shogatsu_admin_token'); setAdminToken(null); }}
            className="px-3 py-2 rounded-xl text-xs font-semibold bg-rose-500/10 border border-rose-500/30 text-rose-300 hover:bg-rose-500/20"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Kanban Orders Tab */}
      {activeTab === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {columns.map((col) => {
            const columnOrders = orders.filter((o) => o.status === col.id);

            return (
              <div key={col.id} className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 space-y-3 flex flex-col h-[75vh]">
                <div className={`flex items-center justify-between pb-3 border-b border-slate-800 ${col.color}`}>
                  <h3 className="font-bold text-sm flex items-center gap-2">
                    <span>{col.title}</span>
                  </h3>
                  <span className="px-2 py-0.5 rounded-full bg-slate-950 text-xs font-bold">
                    {columnOrders.length}
                  </span>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 pr-1">
                  {columnOrders.length === 0 ? (
                    <div className="py-8 text-center text-xs text-slate-600">Sem pedidos nesta coluna</div>
                  ) : (
                    columnOrders.map((order) => (
                      <div
                        key={order.id}
                        className="p-4 rounded-xl bg-slate-950 border border-slate-800/90 shadow-md space-y-3"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="text-xs font-bold text-amber-400 font-mono">#{order.id}</span>
                            {order.ticketNumber && (
                              <span className="ml-2 px-2 py-0.5 bg-amber-500/20 text-amber-300 font-black text-[10px] rounded-md">
                                Senha Nº {order.ticketNumber}
                              </span>
                            )}
                            <h4 className="text-xs font-bold text-slate-200 mt-1">{order.name}</h4>
                            <p className="text-[11px] text-slate-400">{order.phone}</p>
                          </div>
                          <span className="text-xs font-black text-amber-400">
                            R$ {order.total.toFixed(2).replace('.', ',')}
                          </span>
                        </div>

                        <div className="space-y-1 py-2 border-y border-slate-900 text-xs">
                          {order.items.map((it, i) => (
                            <div key={i} className="flex justify-between text-slate-300">
                              <span>{it.qty}x {it.name}</span>
                              <span className="text-slate-500 text-[10px]">R$ {(it.price * it.qty).toFixed(2)}</span>
                            </div>
                          ))}
                        </div>

                        {order.obs && (
                          <p className="text-[11px] text-amber-300/90 italic bg-amber-500/5 p-2 rounded-lg border border-amber-500/10">
                            Obs: {order.obs}
                          </p>
                        )}

                        {/* Station Print Buttons */}
                        <div className="flex items-center gap-1.5 pt-1 overflow-x-auto">
                          {['cozinha', 'sushibar', 'bar', 'caixa'].map((st) => (
                            <button
                              key={st}
                              onClick={() => handlePrint(order, st)}
                              className="px-2 py-1 bg-slate-900 hover:bg-slate-800 text-slate-400 hover:text-amber-400 rounded-md text-[10px] font-bold border border-slate-800 uppercase flex items-center gap-1"
                              title={`Imprimir via ${st}`}
                            >
                              <Printer className="w-3 h-3" /> {st}
                            </button>
                          ))}
                        </div>

                        {/* Action Status Transitions */}
                        <div className="pt-2 flex gap-1.5">
                          {col.id === 'novo' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'preparando')}
                              className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs"
                            >
                              {config?.labels?.actionNovo || 'Aceitar Pedido'}
                            </button>
                          )}
                          {col.id === 'preparando' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'saiu')}
                              className="w-full py-2 bg-purple-600 hover:bg-purple-500 text-white font-bold rounded-lg text-xs"
                            >
                              {config?.labels?.actionPrep || 'Marcar Pronto'}
                            </button>
                          )}
                          {col.id === 'saiu' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'entregue')}
                              className="w-full py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-lg text-xs"
                            >
                              {config?.labels?.actionPronto || 'Confirmar Entrega'}
                            </button>
                          )}
                          {col.id !== 'entregue' && col.id !== 'cancelado' && (
                            <button
                              onClick={() => handleUpdateStatus(order.id, 'cancelado')}
                              className="px-2.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg text-xs font-bold"
                            >
                              X
                            </button>
                          )}
                          <button
                            onClick={() => setOrderToDelete(order)}
                            title="Excluir pedido permanentemente"
                            className="px-2.5 py-2 bg-slate-900 hover:bg-rose-600 text-slate-500 hover:text-white border border-slate-800 hover:border-rose-600 rounded-lg text-xs font-bold transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>

                      </div>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Reports Tab */}
      {activeTab === 'reports' && reportsData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 block font-medium">Faturamento Total</span>
              <span className="text-2xl font-black text-emerald-400">
                R$ {reportsData.totalRevenue.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 block font-medium">Total de Pedidos</span>
              <span className="text-2xl font-black text-amber-400">
                {reportsData.totalOrders}
              </span>
            </div>
            <div className="p-6 rounded-2xl bg-slate-900 border border-slate-800 space-y-2">
              <span className="text-xs text-slate-400 block font-medium">Ticket Médio</span>
              <span className="text-2xl font-black text-blue-400">
                R$ {reportsData.avgTicket.toFixed(2).replace('.', ',')}
              </span>
            </div>
          </div>

          {/* Top Selling Items Table */}
          <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
            <h3 className="text-base font-bold font-serif text-slate-200">Pratos Mais Vendidos</h3>
            <div className="divide-y divide-slate-800 text-xs">
              {reportsData.topItems.map((item: any, idx: number) => (
                <div key={idx} className="py-2.5 flex justify-between items-center">
                  <span className="font-semibold text-slate-300">{idx + 1}. {item.name}</span>
                  <div className="flex gap-4">
                    <span className="text-slate-400">{item.qty} un</span>
                    <span className="font-bold text-amber-400">R$ {item.revenue.toFixed(2)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Campaigns / Push Notifications Tab */}
      {activeTab === 'campaigns' && campaignsData && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold font-serif text-slate-200">20 Mensagens Pré-Programadas</h3>
              <p className="text-xs text-slate-400">Ative ou desative o rodízio automático de mensagens automáticas</p>
            </div>
            <button
              onClick={handleSendCampaignNow}
              className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20"
            >
              📤 Disparar Próxima Agora
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campaignsData.mensagens.map((msg: any) => (
              <div
                key={msg.id}
                className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                  msg.active ? 'bg-slate-950 border-amber-500/40' : 'bg-slate-950/40 border-slate-800 opacity-60'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-amber-400">{msg.titulo}</span>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 uppercase">
                      {msg.categoria}
                    </span>
                  </div>
                  <p className="text-xs text-slate-300">{msg.texto}</p>
                </div>

                <button
                  onClick={() => handleToggleCampaign(msg.id, msg.active)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors ${
                    msg.active ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40' : 'bg-slate-800 text-slate-500 border-slate-700'
                  }`}
                >
                  {msg.active ? 'Ativo' : 'Inativo'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Printer Settings Tab */}
      {activeTab === 'settings' && (
        <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-6">
          <div className="pb-4 border-b border-slate-800">
            <h3 className="text-base font-bold font-serif text-slate-200">Configuração de Impressoras por Via</h3>
            <p className="text-xs text-slate-400 mt-1">
              Escolha, para cada via, se a impressão sai pelo navegador (visualização em tela) ou direto por
              <span className="text-amber-400 font-semibold"> USB</span> ou <span className="text-amber-400 font-semibold">Rede/IP</span> (impressora térmica ESC/POS).
            </p>
          </div>

          {stationsMsg && (
            <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs">
              {stationsMsg}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={() => handleDetectPrinters('usb')}
              disabled={detecting === 'usb'}
              className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 disabled:opacity-50"
            >
              {detecting === 'usb' ? 'Procurando...' : '🔌 Detectar Impressoras USB'}
            </button>
            <button
              onClick={() => handleDetectPrinters('rede')}
              disabled={detecting === 'rede'}
              className="px-3 py-2 bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-xs font-bold text-slate-300 disabled:opacity-50"
            >
              {detecting === 'rede' ? 'Procurando...' : '📶 Detectar Impressoras de Rede'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.keys(stationsCfg).map((st) => {
              const s = stationsCfg[st] || { label: st, method: 'navegador', ip: '', port: 9100, device: '' };
              return (
                <div key={st} className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
                  <h4 className="text-xs font-bold text-amber-400 uppercase">{s.label || st}</h4>

                  <div className="grid grid-cols-3 gap-2">
                    {(['navegador', 'usb', 'rede'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => handleStationChange(st, 'method', m)}
                        className={`py-1.5 rounded-lg text-[11px] font-bold border capitalize ${
                          s.method === m
                            ? 'bg-amber-500 text-slate-950 border-amber-500'
                            : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
                        }`}
                      >
                        {m}
                      </button>
                    ))}
                  </div>

                  {s.method === 'usb' && (
                    <input
                      type="text"
                      placeholder="/dev/usb/lp0"
                      value={s.device}
                      onChange={(e) => handleStationChange(st, 'device', e.target.value)}
                      className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                    />
                  )}

                  {s.method === 'rede' && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="IP (ex: 192.168.0.50)"
                        value={s.ip}
                        onChange={(e) => handleStationChange(st, 'ip', e.target.value)}
                        className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                      />
                      <input
                        type="number"
                        placeholder="Porta"
                        value={s.port}
                        onChange={(e) => handleStationChange(st, 'port', parseInt(e.target.value) || 9100)}
                        className="w-20 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200"
                      />
                    </div>
                  )}

                  {s.method !== 'navegador' && (
                    <button
                      onClick={() => handleTestPrint(st)}
                      disabled={testingStation === st}
                      className="w-full py-2 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg text-[11px] font-bold text-slate-300 disabled:opacity-50 flex items-center justify-center gap-1.5"
                    >
                      <Printer className="w-3.5 h-3.5" /> {testingStation === st ? 'Testando...' : 'Imprimir Teste'}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          <button
            onClick={handleSaveStations}
            disabled={savingStations}
            className="w-full sm:w-auto px-6 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20 disabled:opacity-50"
          >
            {savingStations ? 'Salvando...' : 'Salvar Configuração de Impressoras'}
          </button>
        </div>
      )}

      {/* Delete Order Confirmation Modal */}
      {orderToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-rose-500/30 rounded-2xl max-w-sm w-full p-6 space-y-4 text-slate-100">
            <div className="flex items-center gap-2 text-rose-400">
              <AlertCircle className="w-5 h-5" />
              <h4 className="font-bold text-sm">Excluir pedido permanentemente?</h4>
            </div>
            <p className="text-xs text-slate-400">
              O pedido <span className="text-amber-400 font-mono">#{orderToDelete.id}</span> de{' '}
              <span className="text-slate-200 font-semibold">{orderToDelete.name}</span> será removido
              definitivamente. Essa ação não pode ser desfeita.
            </p>
            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setOrderToDelete(null)}
                className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold rounded-xl text-xs"
              >
                Cancelar
              </button>
              <button
                onClick={handleConfirmDelete}
                disabled={deleting}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold rounded-xl text-xs disabled:opacity-50"
              >
                {deleting ? 'Excluindo...' : 'Excluir Definitivamente'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* AI Assistant floating button + panel */}
      <button
        onClick={() => setAiOpen((v) => !v)}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xl shadow-amber-500/30 flex items-center justify-center font-black text-lg"
        title="Assistente de IA"
      >
        {aiOpen ? '✕' : '🤖'}
      </button>

      {aiOpen && (
        <div className="fixed bottom-24 right-6 z-40 w-[92vw] max-w-sm h-[70vh] max-h-[520px] bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col overflow-hidden">
          <div className="p-4 border-b border-slate-800 bg-slate-950/60">
            <h4 className="text-sm font-bold text-amber-400">🤖 Assistente do Painel</h4>
            <p className="text-[11px] text-slate-400">Peça resumos de vendas, ajuda com pedidos, textos de promoção e mais.</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {aiMessages.length === 0 && (
              <p className="text-[11px] text-slate-500 text-center mt-6 px-2">
                Ex: "Resuma as vendas de hoje", "Quantos pedidos estão em andamento?", "Escreva uma mensagem de promoção de sexta-feira".
              </p>
            )}
            {aiMessages.map((m, i) => (
              <div
                key={i}
                className={`max-w-[85%] p-2.5 rounded-xl text-xs whitespace-pre-wrap ${
                  m.role === 'user'
                    ? 'ml-auto bg-amber-500 text-slate-950 font-medium'
                    : 'mr-auto bg-slate-950 border border-slate-800 text-slate-200'
                }`}
              >
                {m.text}
              </div>
            ))}
            {aiLoading && <div className="mr-auto p-2.5 rounded-xl text-xs bg-slate-950 border border-slate-800 text-slate-400">Pensando...</div>}
          </div>

          <div className="p-3 border-t border-slate-800 flex gap-2">
            <input
              type="text"
              value={aiInput}
              onChange={(e) => setAiInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSendAiMessage(); }}
              placeholder="Pergunte algo..."
              className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200"
            />
            <button
              onClick={handleSendAiMessage}
              disabled={aiLoading || !aiInput.trim()}
              className="px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs disabled:opacity-50"
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Ticket Print Preview Modal */}
      {printedTicket && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-4 text-slate-100 font-mono text-xs">
            <div className="flex justify-between items-center border-b border-slate-800 pb-2">
              <h4 className="font-bold text-amber-400">{printedTicket.title}</h4>
              <button onClick={() => setPrintedTicket(null)} className="text-slate-400 hover:text-white">✕</button>
            </div>
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-1 overflow-x-auto whitespace-pre">
              {printedTicket.lines.map((line, i) => (
                <div key={i}>{line}</div>
              ))}
            </div>
            <button
              onClick={() => setPrintedTicket(null)}
              className="w-full py-2.5 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs"
            >
              Fechar Visualização
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
