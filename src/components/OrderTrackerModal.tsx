import React, { useState, useEffect } from 'react';
import { X, Clock, CheckCircle2, Truck, Star, Sparkles, AlertCircle, ShoppingBag } from 'lucide-react';
import { Order } from '../types';

interface OrderTrackerModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeOrderId: string | null;
  phone: string;
}

export default function OrderTrackerModal({
  isOpen,
  onClose,
  activeOrderId,
  phone
}: OrderTrackerModalProps) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [ratingStars, setRatingStars] = useState<number>(5);
  const [ratingComment, setRatingComment] = useState<string>('');
  const [ratingSubmitted, setRatingSubmitted] = useState<boolean>(false);

  const fetchMyOrders = async () => {
    if (!phone && !activeOrderId) return;
    setLoading(true);
    try {
      if (activeOrderId) {
        const res = await fetch(`/api/track/${activeOrderId}`);
        if (res.ok) {
          const data = await res.json();
          setSelectedOrder(data);
          setOrders([data]);
        }
      } else if (phone) {
        const res = await fetch(`/api/admin/customers/orders?phone=${phone}`);
        if (res.ok) {
          const data = await res.json();
          setOrders(data.orders || []);
          if (data.orders?.length > 0) {
            setSelectedOrder(data.orders[0]);
          }
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchMyOrders();
    }
  }, [isOpen, activeOrderId, phone]);

  const handleSendReview = async () => {
    if (!selectedOrder) return;
    try {
      const res = await fetch(`/api/orders/${selectedOrder.id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stars: ratingStars, comment: ratingComment })
      });
      if (res.ok) {
        setRatingSubmitted(true);
        fetchMyOrders();
      }
    } catch (e) {}
  };

  if (!isOpen) return null;

  const getStatusStep = (status: string) => {
    switch (status) {
      case 'novo': return 1;
      case 'preparando': return 2;
      case 'saiu': return 3;
      case 'entregue': return 4;
      case 'cancelado': return -1;
      default: return 1;
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-slate-100 font-serif">Acompanhar Pedido</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          {loading ? (
            <div className="py-12 text-center text-slate-400 text-sm">Carregando status do pedido...</div>
          ) : !selectedOrder ? (
            <div className="py-12 text-center space-y-2">
              <ShoppingBag className="w-12 h-12 text-slate-600 mx-auto" />
              <p className="text-sm font-semibold text-slate-300">Nenhum pedido recente localizado</p>
              <p className="text-xs text-slate-500">Faça login com seu telefone ou crie um novo pedido no cardápio.</p>
            </div>
          ) : (
            <div className="space-y-6">
              
              {/* Order Info Badge */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-base font-extrabold text-amber-400 font-mono">
                      #{selectedOrder.id}
                    </span>
                    {selectedOrder.ticketNumber && (
                      <span className="px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-bold text-xs">
                        Senha Nº {selectedOrder.ticketNumber}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Realizado em {new Date(selectedOrder.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} • {selectedOrder.mode === 'delivery' ? 'Delivery' : 'Retirada'}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-xs text-slate-400 block">Total</span>
                  <span className="text-lg font-black text-amber-400">
                    R$ {selectedOrder.total.toFixed(2).replace('.', ',')}
                  </span>
                </div>
              </div>

              {/* Status Progress Bar */}
              {selectedOrder.status === 'cancelado' ? (
                <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-1">
                  <strong className="font-bold block text-sm">Pedido Cancelado</strong>
                  <p>Motivo: {selectedOrder.cancelReason || 'Não informado pela loja'}</p>
                </div>
              ) : (
                <div className="p-6 rounded-2xl bg-slate-950 border border-slate-800 space-y-6">
                  <div className="relative flex items-center justify-between">
                    <div className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-slate-800 w-full z-0" />
                    <div
                      className="absolute left-0 top-1/2 -translate-y-1/2 h-1 bg-amber-500 z-0 transition-all duration-500"
                      style={{
                        width: `${((getStatusStep(selectedOrder.status) - 1) / 3) * 100}%`
                      }}
                    />

                    {[
                      { step: 1, label: 'Recebido', icon: '📝' },
                      { step: 2, label: 'Preparo', icon: '👨‍🍳' },
                      { step: 3, label: selectedOrder.mode === 'delivery' ? 'A Caminho' : 'Pronto', icon: '🛵' },
                      { step: 4, label: 'Concluído', icon: '✅' },
                    ].map((st) => {
                      const currentStep = getStatusStep(selectedOrder.status);
                      const isDone = currentStep >= st.step;
                      const isCurrent = currentStep === st.step;

                      return (
                        <div key={st.step} className="relative z-10 flex flex-col items-center gap-1.5">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold border transition-all ${
                              isDone
                                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-lg shadow-amber-500/30'
                                : 'bg-slate-900 text-slate-500 border-slate-800'
                            }`}
                          >
                            {st.icon}
                          </div>
                          <span className={`text-[11px] font-semibold ${isCurrent ? 'text-amber-400 font-bold' : isDone ? 'text-slate-200' : 'text-slate-500'}`}>
                            {st.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                  Itens do Pedido
                </h4>
                <div className="space-y-2">
                  {selectedOrder.items.map((item, i) => (
                    <div key={i} className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex justify-between text-xs">
                      <span className="font-semibold text-slate-200">
                        {item.qty}x {item.name}
                      </span>
                      <span className="text-amber-400 font-bold">
                        R$ {(item.price * item.qty).toFixed(2).replace('.', ',')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Review Section if Delivered */}
              {selectedOrder.status === 'entregue' && !selectedOrder.review && !ratingSubmitted && (
                <div className="p-5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-3">
                  <h4 className="text-sm font-bold text-amber-300 flex items-center gap-1.5">
                    <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
                    Avalie sua Experiência!
                  </h4>
                  <p className="text-xs text-slate-300">Como estava sua refeição?</p>
                  <div className="flex gap-2">
                    {[1, 2, 3, 4, 5].map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setRatingStars(s)}
                        className={`p-2 text-lg rounded-xl border ${ratingStars >= s ? 'bg-amber-500 text-slate-950 border-amber-400' : 'bg-slate-900 border-slate-800 text-slate-500'}`}
                      >
                        ★
                      </button>
                    ))}
                  </div>
                  <textarea
                    rows={2}
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value)}
                    placeholder="Deixe um comentário curto para a cozinha..."
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none"
                  />
                  <button
                    onClick={handleSendReview}
                    className="px-4 py-2 bg-amber-500 text-slate-950 font-bold rounded-xl text-xs hover:bg-amber-400"
                  >
                    Enviar Avaliação
                  </button>
                </div>
              )}

              {(selectedOrder.review || ratingSubmitted) && (
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs">
                  Obrigado pela sua avaliação! Sua opinião é muito importante para nós. ❤️
                </div>
              )}

            </div>
          )}
        </div>

      </div>
    </div>
  );
}
