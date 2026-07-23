import React, { useState, useEffect } from 'react';
import Header from './components/Header';
import ClientMenu from './components/ClientMenu';
import CartDrawer from './components/CartDrawer';
import CheckoutModal from './components/CheckoutModal';
import OrderTrackerModal from './components/OrderTrackerModal';
import CustomerAuthModal from './components/CustomerAuthModal';
import KitchenPanel from './components/KitchenPanel';
import { AppConfig, MenuCategory, MenuItem, CartItem, CustomerUser } from './types';

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [categories, setCategories] = useState<MenuCategory[]>([]);
  const [activeTab, setActiveTab] = useState<'menu' | 'kitchen'>('menu');

  const [cart, setCart] = useState<CartItem[]>([]);
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);
  const [isCheckoutOpen, setIsCheckoutOpen] = useState<boolean>(false);
  const [isTrackerOpen, setIsTrackerOpen] = useState<boolean>(false);
  const [isAuthOpen, setIsAuthOpen] = useState<boolean>(false);

  const [customer, setCustomer] = useState<CustomerUser | null>(() => {
    try {
      const saved = localStorage.getItem('shogatsu_customer');
      return saved ? JSON.parse(saved) : null;
    } catch (e) {
      return null;
    }
  });

  const [activeOrderId, setActiveOrderId] = useState<string | null>(() => {
    return localStorage.getItem('shogatsu_last_order_id') || null;
  });

  const [couponCode, setCouponCode] = useState<string>('');
  const [appliedCouponMessage, setAppliedCouponMessage] = useState<string | null>(null);
  const [obs, setObs] = useState<string>('');

  // Load config & categories
  const loadConfig = async () => {
    try {
      const res = await fetch('/api/config');
      if (res.ok) {
        const data = await res.json();
        setConfig(data.cfg);
        setCategories(data.menu || []);
      }
    } catch (e) {
      console.error('Failed to load config:', e);
    }
  };

  useEffect(() => {
    loadConfig();

    // Listen to public SSE menu updates
    const es = new EventSource('/api/public-stream');
    es.addEventListener('menu-updated', () => loadConfig());
    return () => es.close();
  }, []);

  // Add item to cart
  const handleAddToCart = (item: MenuItem) => {
    const existingIndex = cart.findIndex((c) => c.name === item.name);
    if (existingIndex >= 0) {
      const updated = [...cart];
      updated[existingIndex].qtyNum += 1;
      setCart(updated);
    } else {
      const newCartItem: CartItem = {
        ...item,
        cartId: 'cart_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        qtyNum: 1
      };
      setCart([...cart, newCartItem]);
    }
    setIsCartOpen(true);
  };

  const handleUpdateQty = (cartId: string, delta: number) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.cartId === cartId) {
            const nextQty = item.qtyNum + delta;
            return nextQty > 0 ? { ...item, qtyNum: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean) as CartItem[]
    );
  };

  const handleRemoveItem = (cartId: string) => {
    setCart((prev) => prev.filter((i) => i.cartId !== cartId));
  };

  const handleClearCart = () => {
    setCart([]);
  };

  const handleValidateCoupon = async () => {
    if (!couponCode) return;
    const subtotal = cart.reduce((s, i) => s + i.price * i.qtyNum, 0);
    try {
      const res = await fetch('/api/coupon/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: couponCode, subtotal })
      });
      const data = await res.json();
      if (data.valid) {
        setAppliedCouponMessage(data.message);
      } else {
        setAppliedCouponMessage(data.error);
      }
    } catch (e) {
      setAppliedCouponMessage('Erro ao validar cupom.');
    }
  };

  const handleOrderCreated = (orderId: string) => {
    setActiveOrderId(orderId);
    localStorage.setItem('shogatsu_last_order_id', orderId);
    setCart([]);
    setIsCheckoutOpen(false);
    setIsCartOpen(false);
    setIsTrackerOpen(true);
  };

  const handleCustomerLogin = (user: CustomerUser) => {
    setCustomer(user);
    localStorage.setItem('shogatsu_customer', JSON.stringify(user));
  };

  const handleCustomerLogout = () => {
    setCustomer(null);
    localStorage.removeItem('shogatsu_customer');
  };

  const subtotal = cart.reduce((s, i) => s + i.price * i.qtyNum, 0);
  const cartCount = cart.reduce((s, i) => s + i.qtyNum, 0);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans flex flex-col selection:bg-amber-500 selection:text-slate-950">
      
      {/* Header */}
      <Header
        config={config}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        cartCount={cartCount}
        openCart={() => setIsCartOpen(true)}
        customer={customer}
        openAuth={() => setIsAuthOpen(true)}
        openTracker={() => setIsTrackerOpen(true)}
        activeOrderCount={0}
      />

      {/* Main Content Area */}
      <main className="flex-1 pb-16">
        {activeTab === 'menu' ? (
          <ClientMenu
            categories={categories}
            onAddToCart={handleAddToCart}
            isOpen={Boolean(config?.open ?? 1)}
          />
        ) : (
          <KitchenPanel
            config={config}
            categories={categories}
            onReloadConfig={loadConfig}
          />
        )}
      </main>

      {/* Shopping Cart Drawer */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        onUpdateQty={handleUpdateQty}
        onRemoveItem={handleRemoveItem}
        onClearCart={handleClearCart}
        subtotal={subtotal}
        couponCode={couponCode}
        setCouponCode={setCouponCode}
        appliedCouponMessage={appliedCouponMessage}
        onValidateCoupon={handleValidateCoupon}
        onOpenCheckout={() => {
          setIsCartOpen(false);
          setIsCheckoutOpen(true);
        }}
        obs={obs}
        setObs={setObs}
      />

      {/* Checkout Modal */}
      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={() => setIsCheckoutOpen(false)}
        cart={cart}
        subtotal={subtotal}
        couponCode={couponCode}
        obs={obs}
        customer={customer}
        config={config}
        onOrderCreated={handleOrderCreated}
      />

      {/* Order Tracker Modal */}
      <OrderTrackerModal
        isOpen={isTrackerOpen}
        onClose={() => setIsTrackerOpen(false)}
        activeOrderId={activeOrderId}
        phone={customer?.phone || ''}
      />

      {/* Customer Account Auth Modal */}
      <CustomerAuthModal
        isOpen={isAuthOpen}
        onClose={() => setIsAuthOpen(false)}
        customer={customer}
        onLoginSuccess={handleCustomerLogin}
        onLogout={handleCustomerLogout}
      />

      {/* Footer */}
      <footer className="bg-slate-950 border-t border-slate-900 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 space-y-2">
          <p className="font-semibold text-slate-400">
            {config?.name || 'Shogatsu Culinária Oriental'} • {config?.addr || 'Rio das Ostras - RJ'}
          </p>
          <p>© {new Date().getFullYear()} Shogatsu Pedidos Online. Todos os direitos reservados.</p>
        </div>
      </footer>

    </div>
  );
}
