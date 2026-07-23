export interface MenuItem {
  name: string;
  desc?: string;
  price: number;
  qty?: string;
  badge?: string;
  available?: boolean;
  stations?: string[];
  image?: string;
}

export interface MenuCategory {
  id: string;
  icon: string;
  title: string;
  note?: string;
  items: MenuItem[];
}

export interface CartItem extends MenuItem {
  cartId: string;
  qtyNum: number;
  selectedStations?: string[];
}

export interface OrderItem {
  name: string;
  qty: number;
  price: number;
  stations: string[];
}

export interface Order {
  id: string;
  ticketNumber?: number | null;
  createdAt: string;
  status: 'novo' | 'preparando' | 'saiu' | 'entregue' | 'cancelado';
  mode: 'delivery' | 'retirada';
  name: string;
  phone: string;
  address: string;
  items: OrderItem[];
  obs?: string;
  payMethod: string;
  troco?: string;
  subtotal: number;
  fee: number;
  couponCode?: string;
  discount?: number;
  total: number;
  cancelReason?: string;
  cancelledBy?: 'loja' | 'cliente';
  receivedByCustomer?: boolean;
  review?: {
    stars: number;
    comment?: string;
    createdAt: string;
    hidden?: boolean;
  };
}

export interface AppConfig {
  name: string;
  whats: string;
  storePhone: string;
  fee: number;
  min: number;
  days: string;
  time: string;
  addr: string;
  hours: string;
  open: number;
  pixKey: string;
  pixName: string;
  pixCity: string;
  theme: {
    primary: string;
    accent: string;
    bg: string;
  };
  schedule: {
    enabled: boolean;
    openTime: string;
    closeTime: string;
  };
  labels: {
    actionNovo: string;
    actionPrep: string;
    actionPronto: string;
    colNovo: string;
    colPrep: string;
    colPronto: string;
    colEntregue: string;
    btnCancel: string;
    btnPrint: string;
  };
}

export interface CustomerUser {
  phone: string;
  name: string;
  lastAddress?: string;
  orderCount?: number;
  lastOrderAt?: string;
}
