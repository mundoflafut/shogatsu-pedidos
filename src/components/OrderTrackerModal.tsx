import React, { useState } from 'react';
import { X, Trash2, Plus, Minus, ShoppingBag, ArrowRight, Tag, AlertCircle } from 'lucide-react';
import { CartItem } from '../types';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  onUpdateQty: (cartId: string, delta: number) => void;
  onRemoveItem: (cartId: string) => void;
  onClearCart: () => void;
  subtotal: number;
  couponCode: string;
  setCouponCode: (code: string) => void;
  appliedCouponMessage: string | null;
  onValidateCoupon: () => void;
  onOpenCheckout: () => void;
  obs: string;
  setObs: (obs: string) => void;
}

export default function CartDrawer({
  isOpen,
  onClose,
  cart,
  onUpdateQty,
  onRemoveItem,
  onClearCart,
  subtotal,
  couponCode,
  setCouponCode,
  appliedCouponMessage,
  onValidateCoupon,
  onOpenCheckout,
  obs,
  setObs
}: CartDrawerProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-950/80 backdrop-blur-sm transition-opacity">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="fixed inset-y-0 right-0 max-w-full flex pl-10">
        <div className="w-screen max-w-md bg-slate-900 border-l border-slate-800 text-slate-100 flex flex-col shadow-2xl">
          
          {/* Drawer Header */}
          <div className="px-6 py-5 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-amber-400" />
              <h2 className="text-lg font-bold text-slate-100 font-serif">Seu Carrinho</h2>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {cart.length}
              </span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Cart Items List */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center space-y-3 py-12">
                <div className="w-16 h-16 rounded-2xl bg-slate-800/50 flex items-center justify-center text-3xl text-slate-500">
                  🛒
                </div>
                <h3 className="text-base font-semibold text-slate-300">Seu carrinho está vazio</h3>
                <p className="text-xs text-slate-500 max-w-xs">
                  Adicione pratos deliciosos do nosso cardápio para fazer o seu pedido.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between pb-2 border-b border-slate-800 text-xs text-slate-400">
                  <span>Itens selecionados</span>
                  <button
                    onClick={onClearCart}
                    className="text-rose-400 hover:underline flex items-center gap-1"
                  >
                    <Trash2 className="w-3 h-3" /> Limpar tudo
                  </button>
                </div>

                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.cartId}
                      className="p-4 rounded-xl bg-slate-800/40 border border-slate-800 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold text-slate-200 truncate">
                          {item.name}
                        </h4>
                        <div className="text-xs text-amber-400 font-semibold mt-0.5">
                          R$ {(item.price * item.qtyNum).toFixed(2).replace('.', ',')}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 bg-slate-900 border border-slate-700/60 rounded-lg p-1">
                        <button
                          onClick={() => onUpdateQty(item.cartId, -1)}
                          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="text-xs font-bold w-5 text-center text-slate-200">
                          {item.qtyNum}
                        </span>
                        <button
                          onClick={() => onUpdateQty(item.cartId, 1)}
                          className="p-1 rounded text-slate-400 hover:text-slate-100 hover:bg-slate-800"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => onRemoveItem(item.cartId)}
                        className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>

                {/* Coupon Input */}
                <div className="pt-4 border-t border-slate-800 space-y-2">
                  <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Tag className="w-3.5 h-3.5 text-amber-400" /> Cupom de desconto
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={(e) => setCouponCode(e.target.value.toUpperCase())}
                      placeholder="Ex: BEMVINDO10"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs uppercase text-slate-100 focus:outline-none focus:border-amber-500/50"
                    />
                    <button
                      onClick={onValidateCoupon}
                      className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700"
                    >
                      Aplicar
                    </button>
                  </div>
                  {appliedCouponMessage && (
                    <p className="text-xs text-amber-400 font-medium">
                      {appliedCouponMessage}
                    </p>
                  )}
                </div>

                {/* Observações / Notes */}
                <div className="space-y-1.5 pt-2">
                  <label className="text-xs font-semibold text-slate-300">
                    Observações do pedido
                  </label>
                  <textarea
                    rows={2}
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                    placeholder="Ex: Sem cebolinha, molho tare extra, talheres descartáveis..."
                    className="w-full p-2.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-amber-500/50 resize-none"
                  />
                </div>
              </>
            )}
          </div>

          {/* Drawer Footer / Checkout */}
          {cart.length > 0 && (
            <div className="p-6 bg-slate-950 border-t border-slate-800 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-400">Subtotal</span>
                <span className="font-bold text-slate-100 text-base">
                  R$ {subtotal.toFixed(2).replace('.', ',')}
                </span>
              </div>

              <button
                onClick={onOpenCheckout}
                className="w-full py-3.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-400 hover:to-amber-500 text-slate-950 font-extrabold rounded-xl text-sm shadow-lg shadow-amber-500/20 flex items-center justify-center gap-2 active:scale-[0.99] transition-all"
              >
                <span>Avançar para Checkout</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
