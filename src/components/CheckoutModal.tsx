import React, { useState, useMemo } from 'react';
import { Search, Plus, Sparkles, AlertCircle, Info, Star } from 'lucide-react';
import { MenuCategory, MenuItem } from '../types';

interface ClientMenuProps {
  categories: MenuCategory[];
  onAddToCart: (item: MenuItem) => void;
  isOpen: boolean;
}

export default function ClientMenu({ categories, onAddToCart, isOpen }: ClientMenuProps) {
  const [activeCategoryId, setActiveCategoryId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedItem, setSelectedItem] = useState<MenuItem | null>(null);

  const filteredCategories = useMemo(() => {
    return categories
      .map((cat) => {
        const matchesCategory = activeCategoryId === 'all' || cat.id === activeCategoryId;
        if (!matchesCategory) return null;

        const filteredItems = cat.items.filter((item) => {
          const q = searchQuery.toLowerCase().trim();
          if (!q) return true;
          return (
            item.name.toLowerCase().includes(q) ||
            (item.desc && item.desc.toLowerCase().includes(q)) ||
            (item.badge && item.badge.toLowerCase().includes(q))
          );
        });

        if (filteredItems.length === 0) return null;

        return {
          ...cat,
          items: filteredItems,
        };
      })
      .filter(Boolean) as MenuCategory[];
  }, [categories, activeCategoryId, searchQuery]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-8">
      
      {/* Banner / Notice if Closed */}
      {!isOpen && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
          <div className="text-sm">
            <strong className="font-semibold text-rose-200">Restaurante fechado no momento.</strong> Você pode visualizar o cardápio, mas os pedidos estarão disponíveis durante o horário de funcionamento.
          </div>
        </div>
      )}

      {/* Hero Welcome Banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-slate-900 via-slate-900/90 to-amber-950/40 border border-amber-500/20 p-6 sm:p-10 shadow-2xl">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-semibold">
            <Sparkles className="w-3.5 h-3.5" />
            Gastronomia Japonesa de Alta Qualidade
          </div>
          <h2 className="text-3xl sm:text-4xl font-black text-white font-serif tracking-tight">
            Sinta o verdadeiro sabor do Japão na sua casa
          </h2>
          <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
            Combinados de salmão fresco, temakis crocantes, yakisoba artesanal e o genuíno Omakase preparado por mestres sushimen.
          </p>
        </div>
        <div className="absolute right-4 bottom-0 opacity-15 pointer-events-none text-9xl">
          🥢
        </div>
      </div>

      {/* Search Bar & Category Filters */}
      <div className="space-y-4">
        
        {/* Search Input */}
        <div className="relative max-w-md mx-auto sm:mx-0">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Buscar por sushi, sashimi, yakisoba, ceviche..."
            className="w-full pl-10 pr-4 py-3 bg-slate-900 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/50 focus:ring-1 focus:ring-amber-500/50 transition-all"
          />
        </div>

        {/* Categories Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          <button
            onClick={() => setActiveCategoryId('all')}
            className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all border ${
              activeCategoryId === 'all'
                ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
            }`}
          >
            🔥 Todos os Pratos
          </button>
          {categories.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setActiveCategoryId(cat.id)}
              className={`px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all flex items-center gap-1.5 border ${
                activeCategoryId === cat.id
                  ? 'bg-amber-500 text-slate-950 border-amber-400 shadow-md font-bold'
                  : 'bg-slate-900 text-slate-400 border-slate-800 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              <span>{cat.icon}</span>
              <span>{cat.title}</span>
            </button>
          ))}
        </div>

      </div>

      {/* Menu Categories & Grid */}
      {filteredCategories.length === 0 ? (
        <div className="py-16 text-center space-y-3 bg-slate-900/50 rounded-2xl border border-slate-800">
          <div className="text-4xl">🔍</div>
          <h3 className="text-lg font-semibold text-slate-200">Nenhum prato encontrado</h3>
          <p className="text-xs text-slate-400">Tente buscar por outro termo ou mude a categoria selecionada.</p>
        </div>
      ) : (
        filteredCategories.map((cat) => (
          <section key={cat.id} className="space-y-4">
            
            {/* Category Header */}
            <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
              <div className="flex items-center gap-2">
                <span className="text-2xl">{cat.icon}</span>
                <div>
                  <h3 className="text-xl font-bold text-slate-100 font-serif">{cat.title}</h3>
                  {cat.note && <p className="text-xs text-amber-400/80 mt-0.5">{cat.note}</p>}
                </div>
              </div>
              <span className="text-xs font-semibold text-slate-500 bg-slate-900 px-3 py-1 rounded-full border border-slate-800">
                {cat.items.length} {cat.items.length === 1 ? 'opção' : 'opções'}
              </span>
            </div>

            {/* Items Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {cat.items.map((item, idx) => {
                const isAvailable = item.available !== false;

                return (
                  <div
                    key={idx}
                    className={`group relative flex flex-col justify-between p-5 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/30 transition-all duration-200 hover:shadow-xl hover:shadow-amber-500/5 ${
                      !isAvailable ? 'opacity-50 grayscale pointer-events-none' : ''
                    }`}
                  >
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="text-base font-bold text-slate-100 group-hover:text-amber-400 transition-colors">
                          {item.name}
                        </h4>
                        {item.badge && (
                          <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-amber-500/10 text-amber-400 border border-amber-500/30 flex-shrink-0">
                            {item.badge}
                          </span>
                        )}
                      </div>

                      {item.desc && (
                        <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                          {item.desc}
                        </p>
                      )}

                      {item.qty && (
                        <p className="text-[11px] font-medium text-slate-500">
                          Servido em: {item.qty}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-4 mt-4 border-t border-slate-800/60">
                      <div>
                        <span className="text-xs text-slate-500 block">Preço</span>
                        <span className="text-lg font-black text-amber-400">
                          R$ {item.price.toFixed(2).replace('.', ',')}
                        </span>
                      </div>

                      <button
                        disabled={!isOpen || !isAvailable}
                        onClick={() => onAddToCart(item)}
                        className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all ${
                          isOpen && isAvailable
                            ? 'bg-amber-500 text-slate-950 hover:bg-amber-400 shadow-md shadow-amber-500/20 active:scale-95'
                            : 'bg-slate-800 text-slate-500 cursor-not-allowed'
                        }`}
                      >
                        <Plus className="w-4 h-4" />
                        Adicionar
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

          </section>
        ))
      )}

    </div>
  );
}
