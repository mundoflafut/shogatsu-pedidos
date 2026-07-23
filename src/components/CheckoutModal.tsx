import React, { useState, useEffect } from 'react';
import { X, MapPin, Truck, Store, QrCode, CreditCard, Banknote, Copy, Check, AlertCircle, Sparkles } from 'lucide-react';
import { CartItem, CustomerUser, AppConfig } from '../types';

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  subtotal: number;
  couponCode: string;
  obs: string;
  customer: CustomerUser | null;
  config: AppConfig | null;
  onOrderCreated: (orderId: string) => void;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  cart,
  subtotal,
  couponCode,
  obs,
  customer,
  config,
  onOrderCreated
}: CheckoutModalProps) {
  const [mode, setMode] = useState<'delivery' | 'retirada'>('delivery');
  const [name, setName] = useState<string>(customer?.name || '');
  const [phone, setPhone] = useState<string>(customer?.phone || '');
  const [cep, setCep] = useState<string>('');
  const [street, setStreet] = useState<string>('');
  const [number, setNumber] = useState<string>('');
  const [hood, setHood] = useState<string>('');
  const [city, setCity] = useState<string>('Rio das Ostras');
  const [uf, setUf] = useState<string>('RJ');
  const [comp, setComp] = useState<string>('');

  const [deliveryFee, setDeliveryFee] = useState<number>(config?.fee || 8);
  const [deliveryError, setDeliveryError] = useState<string | null>(null);
  const [isCalculatingFee, setIsCalculatingFee] = useState<boolean>(false);

  const [payMethod, setPayMethod] = useState<string>('pix');
  const [troco, setTroco] = useState<string>('');

  const [pixPayload, setPixPayload] = useState<string | null>(null);
  const [pixQrImg, setPixQrImg] = useState<string | null>(null);
  const [copiedPix, setCopiedPix] = useState<boolean>(false);

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Sync customer address if available
  useEffect(() => {
    if (customer?.name) setName(customer.name);
    if (customer?.phone) setPhone(customer.phone);
    if (customer?.lastAddress) setStreet(customer.lastAddress);
  }, [customer]);

  // Calculate fee whenever address/cep changes
  const handleCalculateFee = async () => {
    if (mode === 'retirada') {
      setDeliveryFee(0);
      setDeliveryError(null);
      return;
    }

    setIsCalculatingFee(true);
    setDeliveryError(null);

    try {
      const res = await fetch('/api/delivery-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cep, street, hood, city, uf })
      });
      const data = await res.json();
      if (data.error === 'fora_area') {
        setDeliveryError(data.message || 'Endereço fora da área de entrega do restaurante.');
        setDeliveryFee(0);
      } else {
        setDeliveryFee(Number(data.fee) || 0);
      }
    } catch (e) {
      setDeliveryFee(config?.fee || 8);
    } finally {
      setIsCalculatingFee(false);
    }
  };

  // Lookup CEP
  const handleCepBlur = async () => {
    if (!cep || cep.replace(/\D/g, '').length !== 8) return;
    try {
      const res = await fetch(`/api/cep/${cep}`);
      const data = await res.json();
      if (data.ok) {
        setStreet(data.street || street);
        setHood(data.hood || hood);
        setCity(data.city || city);
        setUf(data.uf || uf);
        handleCalculateFee();
      }
    } catch (e) {}
  };

  // Generate PIX QR code
  useEffect(() => {
    if (payMethod === 'pix') {
      const totalAmount = subtotal + (mode === 'delivery' ? deliveryFee : 0);
      fetch('/api/pix', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: totalAmount, txid: 'PEDIDO' + Date.now().toString(36) })
      })
        .then(res => res.json())
        .then(data => {
          if (data.payload) {
            setPixPayload(data.payload);
            setPixQrImg(data.qrImg);
          }
        })
        .catch(() => {});
    }
  }, [payMethod, subtotal, deliveryFee, mode]);

  const handleCopyPix = () => {
    if (pixPayload) {
      navigator.clipboard.writeText(pixPayload);
      setCopiedPix(true);
      setTimeout(() => setCopiedPix(false), 2000);
    }
  };

  const handleSubmitOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { setErrorMsg('Informe seu nome completo.'); return; }
    if (!phone.trim()) { setErrorMsg('Informe seu telefone de contato.'); return; }
    if (mode === 'delivery' && !street.trim()) { setErrorMsg('Informe o endereço de entrega (Rua/Avenida).'); return; }

    setIsSubmitting(true);
    setErrorMsg(null);

    const fullAddress = mode === 'delivery'
      ? `${street}, ${number} ${comp ? '(' + comp + ')' : ''} - ${hood}, ${city}/${uf} ${cep ? 'CEP ' + cep : ''}`
      : 'Retirada no Balcão';

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          name,
          phone,
          address: fullAddress,
          items: cart.map(i => ({ name: i.name, qty: i.qtyNum, price: i.price, station: 'cozinha' })),
          obs,
          payMethod,
          troco: payMethod === 'dinheiro' ? troco : '',
          subtotal,
          fee: mode === 'delivery' ? deliveryFee : 0,
          couponCode
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar o pedido.');
      }

      onOrderCreated(data.order.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Erro ao processar pedido. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const totalAmount = Math.max(0, subtotal + (mode === 'delivery' ? deliveryFee : 0));

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl overflow-hidden text-slate-100 my-8">
        
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-amber-400" />
            <h3 className="text-lg font-bold text-slate-100 font-serif">Finalizar Pedido</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmitOrder} className="p-6 space-y-6 max-h-[80vh] overflow-y-auto">
          
          {errorMsg && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Delivery Mode Toggle */}
          <div className="grid grid-cols-2 gap-3 p-1 bg-slate-950 rounded-2xl border border-slate-800">
            <button
              type="button"
              onClick={() => { setMode('delivery'); setDeliveryFee(config?.fee || 8); }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                mode === 'delivery'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              Entrega (Delivery)
            </button>
            <button
              type="button"
              onClick={() => { setMode('retirada'); setDeliveryFee(0); setDeliveryError(null); }}
              className={`flex items-center justify-center gap-2 py-3 rounded-xl text-xs font-bold transition-all ${
                mode === 'retirada'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-extrabold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Store className="w-4 h-4" />
              Retirar no Balcão
            </button>
          </div>

          {/* Customer Personal Details */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Seus Dados
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-slate-400 block mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: João Silva"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                />
              </div>
              <div>
                <label className="text-xs text-slate-400 block mb-1">Telefone / WhatsApp *</label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(22) 99999-8888"
                  className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                />
              </div>
            </div>
          </div>

          {/* Address Fields (only if Delivery) */}
          {mode === 'delivery' && (
            <div className="space-y-3 pt-2 border-t border-slate-800">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center justify-between">
                <span>Endereço de Entrega</span>
                {isCalculatingFee && <span className="text-[10px] text-amber-400 animate-pulse">Calculando taxa...</span>}
              </h4>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">CEP</label>
                  <input
                    type="text"
                    value={cep}
                    onChange={(e) => setCep(e.target.value)}
                    onBlur={handleCepBlur}
                    placeholder="22896-155"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Rua / Avenida *</label>
                  <input
                    type="text"
                    required
                    value={street}
                    onChange={(e) => setStreet(e.target.value)}
                    onBlur={handleCalculateFee}
                    placeholder="Ex: Av. Governador Roberto Silveira"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Número</label>
                  <input
                    type="text"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    placeholder="109"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 block mb-1">Bairro</label>
                  <input
                    type="text"
                    value={hood}
                    onChange={(e) => setHood(e.target.value)}
                    onBlur={handleCalculateFee}
                    placeholder="Costazul"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
                <div className="col-span-2">
                  <label className="text-xs text-slate-400 block mb-1">Complemento</label>
                  <input
                    type="text"
                    value={comp}
                    onChange={(e) => setComp(e.target.value)}
                    placeholder="Apto 201, Bloco B"
                    className="w-full px-3.5 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 focus:outline-none focus:border-amber-500/50"
                  />
                </div>
              </div>

              {deliveryError && (
                <p className="text-xs text-rose-400 font-medium">{deliveryError}</p>
              )}
            </div>
          )}

          {/* Payment Method */}
          <div className="space-y-3 pt-2 border-t border-slate-800">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Forma de Pagamento
            </h4>

            <div className="grid grid-cols-3 gap-2.5">
              <button
                type="button"
                onClick={() => setPayMethod('pix')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  payMethod === 'pix'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <QrCode className="w-5 h-5" />
                PIX
              </button>

              <button
                type="button"
                onClick={() => setPayMethod('cartao')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  payMethod === 'cartao'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <CreditCard className="w-5 h-5" />
                Cartão (Maquininha)
              </button>

              <button
                type="button"
                onClick={() => setPayMethod('dinheiro')}
                className={`p-3 rounded-xl border text-xs font-bold flex flex-col items-center gap-1.5 transition-all ${
                  payMethod === 'dinheiro'
                    ? 'bg-amber-500/10 border-amber-500 text-amber-400'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Banknote className="w-5 h-5" />
                Dinheiro
              </button>
            </div>

            {/* PIX QR Code Box */}
            {payMethod === 'pix' && (
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 text-center space-y-3">
                <p className="text-xs text-slate-400">
                  Escaneie o QR Code abaixo ou copie a chave PIX copia-e-cola com o valor exato:
                </p>

                {pixQrImg && (
                  <div className="inline-block p-2 bg-white rounded-xl shadow-md">
                    <img src={pixQrImg} alt="QR Code PIX" className="w-40 h-40" />
                  </div>
                )}

                {pixPayload && (
                  <button
                    type="button"
                    onClick={handleCopyPix}
                    className="w-full py-2.5 px-3 bg-slate-900 border border-slate-700 hover:border-amber-500/50 rounded-xl text-xs font-semibold text-amber-400 flex items-center justify-center gap-2"
                  >
                    {copiedPix ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                    <span>{copiedPix ? 'Copiado para a área de transferência!' : 'Copiar Chave PIX Copia e Cola'}</span>
                  </button>
                )}
              </div>
            )}

            {/* Dinheiro Troco Input */}
            {payMethod === 'dinheiro' && (
              <div className="p-3.5 bg-slate-950 rounded-xl border border-slate-800 space-y-1">
                <label className="text-xs text-slate-400 block">Precisa de troco para quanto?</label>
                <input
                  type="text"
                  value={troco}
                  onChange={(e) => setTroco(e.target.value)}
                  placeholder="Ex: Troco para R$ 100,00"
                  className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-100 focus:outline-none"
                />
              </div>
            )}
          </div>

          {/* Order Summary & Confirm */}
          <div className="pt-4 border-t border-slate-800 space-y-2 text-xs">
            <div className="flex justify-between text-slate-400">
              <span>Subtotal dos itens</span>
              <span>R$ {subtotal.toFixed(2).replace('.', ',')}</span>
            </div>
            {mode === 'delivery' && (
              <div className="flex justify-between text-slate-400">
                <span>Taxa de entrega</span>
                <span>R$ {deliveryFee.toFixed(2).replace('.', ',')}</span>
              </div>
            )}
            <div className="flex justify-between font-bold text-slate-100 text-base pt-2 border-t border-slate-800">
              <span>Total do Pedido</span>
              <span className="text-amber-400">
                R$ {totalAmount.toFixed(2).replace('.', ',')}
              </span>
            </div>

            <button
              type="submit"
              disabled={isSubmitting || Boolean(deliveryError)}
              className="w-full mt-4 py-4 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-black rounded-2xl text-base shadow-xl shadow-amber-500/20 active:scale-[0.99] transition-all disabled:opacity-50"
            >
              {isSubmitting ? 'Enviando Pedido...' : 'Confirmar e Enviar Pedido 🚀'}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
}
