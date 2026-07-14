-- ═══════════════════════════════════════════════════════════
-- Shogatsu · Migration 001 — schema inicial
-- Idempotente: seguro rodar várias vezes (usa IF NOT EXISTS em tudo).
-- NUNCA usa DROP TABLE — não apaga dados existentes.
-- ═══════════════════════════════════════════════════════════

-- ── Configurações do restaurante (documento único em JSONB) ──
-- Guardamos como JSONB porque a configuração tem muitos campos livres/aninhados
-- (impressoras por estação, paleta de cores, slider etc.) que mudam com frequência
-- conforme o sistema evolui, sem precisar de uma migration nova a cada campo novo.
CREATE TABLE IF NOT EXISTS settings (
  id INT PRIMARY KEY DEFAULT 1,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);

-- ── Categorias do cardápio (ex: Entradas, Sushi, Yakisoba) ──
CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  icon TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Produtos (itens do cardápio) ──
CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  category_id TEXT NOT NULL REFERENCES categories(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  qty_label TEXT NOT NULL DEFAULT '',
  badge TEXT NOT NULL DEFAULT '',
  img TEXT NOT NULL DEFAULT '',
  station TEXT NOT NULL DEFAULT 'cozinha' CHECK (station IN ('cozinha','sushibar','bar','caixa')),
  available BOOLEAN NOT NULL DEFAULT true,
  position INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);

-- ── Clientes (conta com telefone + PIN de 4 dígitos) ──
CREATE TABLE IF NOT EXISTS customers (
  phone TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  pin_hash TEXT NOT NULL,
  last_address TEXT,
  recovery JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Pedidos ──
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','preparando','saiu','entregue','cancelado')),
  mode TEXT NOT NULL CHECK (mode IN ('delivery','retirada')),
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  address TEXT NOT NULL DEFAULT '',
  obs TEXT NOT NULL DEFAULT '',
  pay_method TEXT NOT NULL DEFAULT '',
  troco TEXT NOT NULL DEFAULT '',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  cancel_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);

-- ── Itens de cada pedido ──
CREATE TABLE IF NOT EXISTS order_items (
  id SERIAL PRIMARY KEY,
  order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  station TEXT NOT NULL DEFAULT 'cozinha'
);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- ── Imagens enviadas pelo painel (logo, fotos de prato, slides) ──
-- Guardadas como bytea dentro do banco (e não em arquivo local) para não se
-- perderem quando o Render reinicia/reimplanta o serviço (disco efêmero).
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY,
  mime_type TEXT NOT NULL,
  data BYTEA NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
