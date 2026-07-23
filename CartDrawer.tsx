import React from 'react';
import { ShoppingBag, User, UtensilsCrossed, ChefHat, Clock, Phone, MapPin } from 'lucide-react';
import { AppConfig, CustomerUser } from '../types';

interface HeaderProps {
  config: AppConfig | null;
  activeTab: 'menu' | 'kitchen';
  setActiveTab: (tab: 'menu' | 'kitchen') => void;
  cartCount: number;
  openCart: () => void;
  customer: CustomerUser | null;
  openAuth: () => void;
  openTracker: () => void;
  activeOrderCount: number;
}

export default function Header({
  config,
  activeTab,
  setActiveTab,
  cartCount,
  openCart,
  customer,
  openAuth,
  openTracker,
  activeOrderCount
}: HeaderProps) {
  const isOpen = config ? Boolean(config.open) : true;

  return (
    <header className="sticky top-0 z-40 bg-slate-950/90 backdrop-blur-md border-b border-amber-500/20 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-20">
          
          {/* Logo & Brand */}
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 flex items-center justify-center text-slate-950 shadow-md shadow-amber-500/20 font-bold text-2xl tracking-tighter">
              🍣
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-black tracking-tight text-slate-100 font-serif">
                  {config?.name || 'Shogatsu'}
                </h1>
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    isOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-400 border-rose-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                      isOpen ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'
                    }`}
                  ></span>
                  {isOpen ? 'Aberto' : 'Fechado'}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5 hidden sm:flex">
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3 text-amber-400" />
                  {config?.hours || '18h30–23h'} ({config?.days || 'Ter–Dom'})
                </span>
                <span className="text-slate-600">•</span>
                <span className="flex items-center gap-1">
                  <Phone className="w-3 h-3 text-amber-400" />
                  {config?.storePhone || '(22) 2764-1333'}
                </span>
              </div>
            </div>
          </div>

          {/* Navigation View Switcher (Cardápio vs Cozinha) */}
          <div className="hidden md:flex items-center bg-slate-900/90 border border-slate-800 p-1.5 rounded-xl">
            <button
              onClick={() => setActiveTab('menu')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'menu'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <UtensilsCrossed className="w-4 h-4" />
              Cardápio
            </button>
            <button
              onClick={() => setActiveTab('kitchen')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === 'kitchen'
                  ? 'bg-amber-500 text-slate-950 shadow-md font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
              }`}
            >
              <ChefHat className="w-4 h-4" />
              Painel da Cozinha
              {activeOrderCount > 0 && (
                <span className="px-1.5 py-0.5 text-xs font-bold rounded-full bg-rose-600 text-white animate-bounce">
                  {activeOrderCount}
                </span>
              )}
            </button>
          </div>

          {/* Actions (Login, Tracker, Cart) */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            
            {/* Mobile Tab Toggle */}
            <button
              onClick={() => setActiveTab(activeTab === 'menu' ? 'kitchen' : 'menu')}
              className="md:hidden p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white"
              title="Alternar entre Cardápio e Painel da Cozinha"
            >
              {activeTab === 'menu' ? <ChefHat className="w-5 h-5 text-amber-400" /> : <UtensilsCrossed className="w-5 h-5 text-amber-400" />}
            </button>

            {/* Order Tracker Button if active orders */}
            <button
              onClick={openTracker}
              className="relative p-2.5 rounded-xl bg-slate-900 border border-amber-500/30 text-amber-400 hover:bg-slate-800 transition-colors flex items-center gap-1.5 text-xs font-semibold"
              title="Acompanhar meus pedidos"
            >
              <Clock className="w-4 h-4" />
              <span className="hidden sm:inline">Meus Pedidos</span>
            </button>

            {/* Customer Account Button */}
            <button
              onClick={openAuth}
              className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 hover:text-amber-400 hover:border-amber-500/30 transition-all flex items-center gap-2 text-xs font-medium"
            >
              <User className="w-4 h-4 text-amber-400" />
              <span className="hidden sm:inline">
                {customer ? customer.name.split(' ')[0] : 'Entrar'}
              </span>
            </button>

            {/* Cart Button */}
            {activeTab === 'menu' && (
              <button
                onClick={openCart}
                className="relative px-4 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold hover:from-amber-400 hover:to-amber-500 transition-all shadow-md shadow-amber-500/20 flex items-center gap-2 text-sm"
              >
                <ShoppingBag className="w-4 h-4" />
                <span className="hidden sm:inline">Carrinho</span>
                {cartCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 text-xs bg-slate-950 text-amber-400 rounded-full font-black">
                    {cartCount}
                  </span>
                )}
              </button>
            )}

          </div>

        </div>
      </div>
    </header>
  );
}
