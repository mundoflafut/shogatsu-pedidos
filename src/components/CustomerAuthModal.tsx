import React, { useState } from 'react';
import { X, Phone, Lock, User, Key, MessageSquare, AlertCircle, CheckCircle2 } from 'lucide-react';
import { CustomerUser } from '../types';

interface CustomerAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  customer: CustomerUser | null;
  onLoginSuccess: (customer: CustomerUser) => void;
  onLogout: () => void;
}

export default function CustomerAuthModal({
  isOpen,
  onClose,
  customer,
  onLoginSuccess,
  onLogout
}: CustomerAuthModalProps) {
  const [tab, setTab] = useState<'login' | 'register' | 'recovery'>('login');
  
  const [phone, setPhone] = useState<string>('');
  const [pin, setPin] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [code, setCode] = useState<string>('');
  const [newPin, setNewPin] = useState<string>('');

  const [waUrl, setWaUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/customer/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao fazer login.');
      onLoginSuccess(data.customer);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/customer/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, name, pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao cadastrar.');
      onLoginSuccess(data.customer);
      onClose();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/customer/recovery-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao solicitar recuperação.');
      setWaUrl(data.waUrl);
      setMessage(`Código gerado: ${data.code}. Clique abaixo para mandar no WhatsApp do restaurante para aprovação!`);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch('/api/customer/recovery-set-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, code, newPin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao redefinir senha.');
      setMessage('Senha alterada com sucesso! Faça login com sua nova senha.');
      setTab('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 my-8">
        
        {/* Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-base font-bold text-slate-100 font-serif">
            {customer ? 'Minha Conta' : tab === 'login' ? 'Entrar na Conta' : tab === 'register' ? 'Criar Conta' : 'Recuperar Senha'}
          </h3>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          
          {error && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {message && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-400" />
              <span>{message}</span>
            </div>
          )}

          {/* Logged in state */}
          {customer ? (
            <div className="space-y-4 py-2">
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-1">
                <span className="text-xs text-slate-400 block">Cliente Conectado</span>
                <h4 className="text-lg font-extrabold text-amber-400">{customer.name}</h4>
                <p className="text-xs text-slate-300">{customer.phone}</p>
                {customer.orderCount !== undefined && (
                  <p className="text-xs text-slate-500 pt-2 border-t border-slate-800 mt-2">
                    {customer.orderCount} pedido(s) realizado(s) no total
                  </p>
                )}
              </div>

              <button
                onClick={onLogout}
                className="w-full py-2.5 px-4 bg-rose-500/10 border border-rose-500/30 hover:bg-rose-500/20 text-rose-300 font-bold rounded-xl text-xs transition-colors"
              >
                Sair da Conta
              </button>
            </div>
          ) : (
            <>
              {/* Tab Selector */}
              <div className="flex border-b border-slate-800 text-xs font-bold text-slate-400">
                <button
                  onClick={() => { setTab('login'); setError(null); setMessage(null); }}
                  className={`flex-1 pb-3 text-center transition-colors border-b-2 ${tab === 'login' ? 'border-amber-500 text-amber-400' : 'border-transparent'}`}
                >
                  Entrar
                </button>
                <button
                  onClick={() => { setTab('register'); setError(null); setMessage(null); }}
                  className={`flex-1 pb-3 text-center transition-colors border-b-2 ${tab === 'register' ? 'border-amber-500 text-amber-400' : 'border-transparent'}`}
                >
                  Cadastrar
                </button>
                <button
                  onClick={() => { setTab('recovery'); setError(null); setMessage(null); }}
                  className={`flex-1 pb-3 text-center transition-colors border-b-2 ${tab === 'recovery' ? 'border-amber-500 text-amber-400' : 'border-transparent'}`}
                >
                  Esqueci a Senha
                </button>
              </div>

              {/* Login Form */}
              {tab === 'login' && (
                <form onSubmit={handleLogin} className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Telefone / WhatsApp</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(22) 99999-8888"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Senha (4 dígitos)</label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="****"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20"
                  >
                    {loading ? 'Entrando...' : 'Entrar'}
                  </button>
                </form>
              )}

              {/* Register Form */}
              {tab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Seu Nome Completo</label>
                    <input
                      type="text"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder="Ex: Ana Souza"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Telefone / WhatsApp</label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="(22) 99999-8888"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400 block mb-1">Crie uma Senha (4 dígitos)</label>
                    <input
                      type="password"
                      maxLength={4}
                      required
                      value={pin}
                      onChange={(e) => setPin(e.target.value)}
                      placeholder="Ex: 1234"
                      className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs shadow-md shadow-amber-500/20"
                  >
                    {loading ? 'Cadastrando...' : 'Criar Minha Conta'}
                  </button>
                </form>
              )}

              {/* Recovery Form */}
              {tab === 'recovery' && (
                <div className="space-y-4 pt-2">
                  {!waUrl ? (
                    <form onSubmit={handleRecoveryRequest} className="space-y-3">
                      <div>
                        <label className="text-xs text-slate-400 block mb-1">Informe seu Telefone Cadastrado</label>
                        <input
                          type="tel"
                          required
                          value={phone}
                          onChange={(e) => setPhone(e.target.value)}
                          placeholder="(22) 99999-8888"
                          className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none"
                        />
                      </div>
                      <button
                        type="submit"
                        disabled={loading}
                        className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
                      >
                        {loading ? 'Solicitando...' : 'Gerar Código de Recuperação'}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2"
                      >
                        <MessageSquare className="w-4 h-4" /> Enviar Código pelo WhatsApp
                      </a>

                      <form onSubmit={handleSetNewPin} className="space-y-3 pt-3 border-t border-slate-800">
                        <p className="text-xs text-slate-400">Após a aprovação da loja pelo WhatsApp, digite o código e sua nova senha:</p>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Código (6 dígitos)</label>
                          <input
                            type="text"
                            required
                            value={code}
                            onChange={(e) => setCode(e.target.value)}
                            placeholder="123456"
                            className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                          />
                        </div>
                        <div>
                          <label className="text-xs text-slate-400 block mb-1">Nova Senha (4 dígitos)</label>
                          <input
                            type="password"
                            maxLength={4}
                            required
                            value={newPin}
                            onChange={(e) => setNewPin(e.target.value)}
                            placeholder="****"
                            className="w-full px-3.5 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100"
                          />
                        </div>
                        <button
                          type="submit"
                          disabled={loading}
                          className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-xl text-xs"
                        >
                          Salvar Nova Senha
                        </button>
                      </form>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

        </div>

      </div>
    </div>
  );
}
