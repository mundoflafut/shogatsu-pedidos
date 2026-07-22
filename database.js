// ═══════════════════════════════════════════════════════════════════════════
// database.js — Modulo Unico de Acesso ao Banco de Dados (PostgreSQL/Supabase)
//
// TODA consulta SQL fica aqui. O server.js apenas chama funcoes deste modulo.
// Se DATABASE_URL nao estiver configurada, cai automaticamente para o modo
// arquivo (JSON local) — compatibilidade total, nada quebra.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

// ─── Configuracao do Pool PostgreSQL ───
let pool = null;
let Pool = null;

try {
  const pg = require('pg');
  Pool = pg.Pool;
} catch (e) {
  console.log('[database] Pacote "pg" nao instalado — modo arquivo ativado.');
}

if (process.env.DATABASE_URL && Pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });
  pool.on('error', (err) => {
    console.error('[database] Erro inesperado no pool:', err.message);
  });
}

const useDB = !!pool;

// ─── Diretorios e arquivos locais (fallback) ───
const DATA_DIR = path.join(__dirname, 'data');
const LOCAL_FILES = {
  config: path.join(DATA_DIR, 'config.json'),
  orders: path.join(DATA_DIR, 'orders.json'),
  customers: path.join(DATA_DIR, 'customers.json'),
  campaigns: path.join(DATA_DIR, 'campaigns.json'),
  subs: path.join(DATA_DIR, 'push-subs.json')
};

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

function readLocal(file, fallback = null) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeLocal(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function normalizePhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

function nowISO() {
  return new Date().toISOString();
}

// ═══════════════════════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════════════════════

const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS settings (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  data          JSONB NOT NULL DEFAULT '{}',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_categories (
  id            SERIAL PRIMARY KEY,
  slug          TEXT UNIQUE NOT NULL,
  icon          TEXT DEFAULT '',
  title         TEXT NOT NULL,
  note          TEXT DEFAULT '',
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS menu_items (
  id            SERIAL PRIMARY KEY,
  category_id   INTEGER NOT NULL REFERENCES menu_categories(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  description   TEXT DEFAULT '',
  price         NUMERIC(10,2) NOT NULL DEFAULT 0,
  qty_text      TEXT DEFAULT '',
  badge         TEXT DEFAULT '',
  image_url     TEXT DEFAULT '',
  available     BOOLEAN DEFAULT true,
  stations      TEXT[] DEFAULT ARRAY['cozinha'],
  sort_order    INTEGER DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  ticket_number INTEGER,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now(),
  status        TEXT NOT NULL DEFAULT 'novo' CHECK (status IN ('novo','preparando','saiu','entregue','cancelado')),
  mode          TEXT NOT NULL DEFAULT 'delivery' CHECK (mode IN ('delivery','retirada')),
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL,
  address       TEXT DEFAULT '',
  items         JSONB NOT NULL DEFAULT '[]',
  obs           TEXT DEFAULT '',
  pay_method    TEXT DEFAULT '',
  troco         TEXT DEFAULT '',
  subtotal      NUMERIC(10,2) NOT NULL DEFAULT 0,
  fee           NUMERIC(10,2) NOT NULL DEFAULT 0,
  coupon_code   TEXT DEFAULT '',
  discount      NUMERIC(10,2) NOT NULL DEFAULT 0,
  total         NUMERIC(10,2) NOT NULL DEFAULT 0,
  cancel_reason TEXT DEFAULT '',
  cancelled_by  TEXT DEFAULT '',
  received_by_customer BOOLEAN DEFAULT false,
  received_at   TIMESTAMPTZ,
  review        JSONB,
  lat           NUMERIC(10,6),
  lng           NUMERIC(10,6)
);

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);

CREATE TABLE IF NOT EXISTS customers (
  phone         TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  pin_hash      TEXT NOT NULL,
  last_address  TEXT DEFAULT '',
  recovery      JSONB DEFAULT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS delivery_zones (
  id            SERIAL PRIMARY KEY,
  type          TEXT NOT NULL CHECK (type IN ('cep','bairro','distancia')),
  label         TEXT NOT NULL,
  prefix        TEXT DEFAULT '',
  bairro        TEXT DEFAULT '',
  fee           NUMERIC(10,2) NOT NULL DEFAULT 0,
  active        BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id            SERIAL PRIMARY KEY,
  code          TEXT UNIQUE NOT NULL,
  type          TEXT NOT NULL CHECK (type IN ('percent','valor','frete_gratis')),
  value         NUMERIC(10,2) NOT NULL DEFAULT 0,
  active        BOOLEAN DEFAULT true,
  expires_at    TIMESTAMPTZ,
  usage_limit   INTEGER DEFAULT 0,
  used_count    INTEGER DEFAULT 0,
  min_order     NUMERIC(10,2) DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS printers (
  id            SERIAL PRIMARY KEY,
  station       TEXT UNIQUE NOT NULL CHECK (station IN ('cozinha','sushibar','bar','caixa')),
  label         TEXT NOT NULL,
  method        TEXT NOT NULL DEFAULT 'navegador' CHECK (method IN ('navegador','rede','usb')),
  ip            TEXT DEFAULT '',
  port          INTEGER DEFAULT 9100,
  device        TEXT DEFAULT '',
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  username      TEXT PRIMARY KEY,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('master','admin','vendas')),
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS logs (
  id            SERIAL PRIMARY KEY,
  action        TEXT NOT NULL,
  details       JSONB DEFAULT '{}',
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_settings (
  id            INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  horarios      TEXT[] DEFAULT ARRAY['11:00','15:30','19:00'],
  ponteiro      INTEGER DEFAULT 0,
  mensagens     JSONB DEFAULT '[]',
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id            SERIAL PRIMARY KEY,
  phone         TEXT NOT NULL,
  endpoint      TEXT UNIQUE NOT NULL,
  subscription  JSONB NOT NULL,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON push_subscriptions(phone);
`;

async function initSchema() {
  if (!useDB) {
    for (const [key, file] of Object.entries(LOCAL_FILES)) {
      if (!fs.existsSync(file)) {
        const defaultData = key === 'orders' ? [] : key === 'customers' ? [] : key === 'subs' ? [] : key === 'campaigns' ? { horarios: ['11:00','15:30','19:00'], ponteiroRodizio: 0, mensagens: [] } : {};
        writeLocal(file, defaultData);
      }
    }
    return { mode: 'file', message: 'Modo arquivo ativado (DATABASE_URL nao configurada)' };
  }
  try {
    await pool.query(SCHEMA_SQL);
    const { rows: settingsRows } = await pool.query('SELECT COUNT(*)::int AS n FROM settings');
    if (settingsRows[0].n === 0) {
      await pool.query('INSERT INTO settings (id, data) VALUES (1, $1)', [JSON.stringify({})]);
    }
    const { rows: campRows } = await pool.query('SELECT COUNT(*)::int AS n FROM campaign_settings');
    if (campRows[0].n === 0) {
      await pool.query('INSERT INTO campaign_settings (id, horarios, ponteiro, mensagens) VALUES (1, $1, 0, $2)', [
        ['11:00','15:30','19:00'], JSON.stringify([])
      ]);
    }
    const { rows: printerRows } = await pool.query('SELECT COUNT(*)::int AS n FROM printers');
    if (printerRows[0].n === 0) {
      const defaults = [
        ['cozinha', 'Cozinha', 'navegador', '', 9100, ''],
        ['sushibar', 'Sushibar', 'navegador', '', 9100, ''],
        ['bar', 'Bar', 'navegador', '', 9100, ''],
        ['caixa', 'Caixa', 'navegador', '', 9100, '']
      ];
      for (const [station, label, method, ip, port, device] of defaults) {
        await pool.query(
          'INSERT INTO printers (station, label, method, ip, port, device) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (station) DO NOTHING',
          [station, label, method, ip, port, device]
        );
      }
    }
    await migrateFromLocal();
    return { mode: 'postgres', message: 'PostgreSQL conectado e schema inicializado' };
  } catch (err) {
    console.error('[database] Erro ao inicializar schema:', err.message);
    throw err;
  }
}

async function migrateFromLocal() {
  try {
    const localConfig = readLocal(LOCAL_FILES.config, null);
    if (localConfig && localConfig.cfg) {
      const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
      const current = rows[0]?.data || {};
      if (!current || Object.keys(current).length === 0) {
        await pool.query('UPDATE settings SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(localConfig.cfg)]);
        console.log('[database] Configuracoes migradas do config.json local.');
      }
    }
    if (localConfig && localConfig.menu && Array.isArray(localConfig.menu)) {
      const { rows: catRows } = await pool.query('SELECT COUNT(*)::int AS n FROM menu_categories');
      if (catRows[0].n === 0) {
        for (const section of localConfig.menu) {
          const { rows } = await pool.query(
            'INSERT INTO menu_categories (slug, icon, title, note, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
            [section.id || section.slug || '', section.icon || '', section.title || '', section.note || '', 0]
          );
          const catId = rows[0].id;
          for (const item of (section.items || [])) {
            const stations = Array.isArray(item.stations) ? item.stations : 
                            (item.station && ['cozinha','sushibar','bar'].includes(item.station)) ? [item.station] : ['cozinha'];
            await pool.query(
              'INSERT INTO menu_items (category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
              [catId, item.name || '', item.desc || '', Number(item.price) || 0, item.qty || '', item.badge || '', item.image || '', item.available !== false, stations, 0]
            );
          }
        }
        console.log(`[database] Cardapio migrado (${localConfig.menu.length} categorias).`);
      }
    }
    const localOrders = readLocal(LOCAL_FILES.orders, []);
    if (localOrders.length > 0) {
      const { rows: orderRows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders');
      if (orderRows[0].n === 0) {
        for (const o of localOrders) {
          await pool.query(
            `INSERT INTO orders (id, ticket_number, created_at, updated_at, status, mode, name, phone, address, items, obs, pay_method, troco, subtotal, fee, coupon_code, discount, total, cancel_reason, cancelled_by, received_by_customer, received_at, review, lat, lng)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)
             ON CONFLICT (id) DO NOTHING`,
            [
              o.id, o.ticketNumber || null, o.createdAt, o.createdAt, o.status, o.mode,
              o.name, o.phone, o.address, JSON.stringify(o.items || []), o.obs || '',
              o.payMethod || '', o.troco || '', Number(o.subtotal) || 0, Number(o.fee) || 0,
              o.couponCode || '', Number(o.discount) || 0, Number(o.total) || 0,
              o.cancelReason || '', o.cancelledBy || '', !!o.receivedByCustomer,
              o.receivedAt || null, o.review ? JSON.stringify(o.review) : null,
              o.lat || null, o.lng || null
            ]
          );
        }
        console.log(`[database] ${localOrders.length} pedido(s) migrado(s).`);
      }
    }
    const localCustomers = readLocal(LOCAL_FILES.customers, []);
    if (localCustomers.length > 0) {
      const { rows: custRows } = await pool.query('SELECT COUNT(*)::int AS n FROM customers');
      if (custRows[0].n === 0) {
        for (const c of localCustomers) {
          await pool.query(
            'INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING',
            [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || nowISO()]
          );
        }
        console.log(`[database] ${localCustomers.length} cliente(s) migrado(s).`);
      }
    }
    const localCampaigns = readLocal(LOCAL_FILES.campaigns, null);
    if (localCampaigns) {
      const { rows: campRows } = await pool.query('SELECT mensagens FROM campaign_settings WHERE id = 1');
      const current = campRows[0]?.mensagens;
      if (!current || current.length === 0) {
        await pool.query(
          'UPDATE campaign_settings SET horarios = $1, ponteiro = $2, mensagens = $3, updated_at = now() WHERE id = 1',
          [localCampaigns.horarios || ['11:00','15:30','19:00'], localCampaigns.ponteiroRodizio || 0, JSON.stringify(localCampaigns.mensagens || [])]
        );
        console.log('[database] Campanhas migradas.');
      }
    }
    const localSubs = readLocal(LOCAL_FILES.subs, []);
    if (localSubs.length > 0) {
      const { rows: subRows } = await pool.query('SELECT COUNT(*)::int AS n FROM push_subscriptions');
      if (subRows[0].n === 0) {
        for (const s of localSubs) {
          await pool.query(
            'INSERT INTO push_subscriptions (phone, endpoint, subscription, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO NOTHING',
            [normalizePhone(s.phone), s.endpoint, JSON.stringify(s.subscription), s.createdAt || nowISO()]
          );
        }
        console.log(`[database] ${localSubs.length} assinatura(s) push migrada(s).`);
      }
    }
  } catch (err) {
    console.error('[database] Erro na migracao:', err.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════════════════════

async function getSettings() {
  if (useDB) {
    const { rows } = await pool.query('SELECT data FROM settings WHERE id = 1');
    return rows[0]?.data || {};
  }
  const data = readLocal(LOCAL_FILES.config, {});
  return data.cfg || {};
}

async function updateSettings(data) {
  if (useDB) {
    await pool.query('UPDATE settings SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(data)]);
    return;
  }
  const current = readLocal(LOCAL_FILES.config, {});
  current.cfg = { ...current.cfg, ...data };
  writeLocal(LOCAL_FILES.config, current);
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU CATEGORIES
// ═══════════════════════════════════════════════════════════════════════════

async function listCategories() {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM menu_categories ORDER BY sort_order, id');
    return rows;
  }
  const data = readLocal(LOCAL_FILES.config, {});
  const menu = data.menu || [];
  return menu.map((sec, idx) => ({
    id: idx + 1, slug: sec.id || '', icon: sec.icon || '', title: sec.title || '',
    note: sec.note || '', sort_order: idx
  }));
}

async function getCategory(id) {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM menu_categories WHERE id = $1', [id]);
    return rows[0] || null;
  }
  const cats = await listCategories();
  return cats.find(c => c.id == id) || null;
}

async function createCategory({ slug, icon, title, note, sort_order }) {
  if (useDB) {
    const { rows } = await pool.query(
      'INSERT INTO menu_categories (slug, icon, title, note, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING *',
      [slug || '', icon || '', title || '', note || '', sort_order || 0]
    );
    return rows[0];
  }
  const data = readLocal(LOCAL_FILES.config, { cfg: {}, menu: [] });
  data.menu = data.menu || [];
  data.menu.push({ id: slug || `cat_${Date.now()}`, icon: icon || '', title: title || '', note: note || '', items: [] });
  writeLocal(LOCAL_FILES.config, data);
  return { id: data.menu.length, slug: slug || '', icon: icon || '', title: title || '', note: note || '', sort_order: data.menu.length - 1 };
}

async function updateCategory(id, { slug, icon, title, note, sort_order }) {
  if (useDB) {
    const sets = [], vals = [];
    let i = 1;
    if (slug !== undefined) { sets.push(`slug=$${i++}`); vals.push(slug); }
    if (icon !== undefined) { sets.push(`icon=$${i++}`); vals.push(icon); }
    if (title !== undefined) { sets.push(`title=$${i++}`); vals.push(title); }
    if (note !== undefined) { sets.push(`note=$${i++}`); vals.push(note); }
    if (sort_order !== undefined) { sets.push(`sort_order=$${i++}`); vals.push(sort_order); }
    if (!sets.length) return await getCategory(id);
    sets.push(`updated_at=now()`);
    vals.push(id);
    const { rows } = await pool.query(`UPDATE menu_categories SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    return rows[0];
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  const idx = parseInt(id) - 1;
  if (data.menu && data.menu[idx]) {
    if (slug !== undefined) data.menu[idx].id = slug;
    if (icon !== undefined) data.menu[idx].icon = icon;
    if (title !== undefined) data.menu[idx].title = title;
    if (note !== undefined) data.menu[idx].note = note;
    writeLocal(LOCAL_FILES.config, data);
  }
  return await getCategory(id);
}

async function deleteCategory(id) {
  if (useDB) {
    await pool.query('DELETE FROM menu_categories WHERE id = $1', [id]);
    return true;
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  const idx = parseInt(id) - 1;
  if (data.menu && data.menu[idx]) { data.menu.splice(idx, 1); writeLocal(LOCAL_FILES.config, data); }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// MENU ITEMS
// ═══════════════════════════════════════════════════════════════════════════

async function listMenuItems(categoryId = null) {
  if (useDB) {
    let sql = 'SELECT * FROM menu_items';
    let params = [];
    if (categoryId) { sql += ' WHERE category_id = $1'; params.push(categoryId); }
    sql += ' ORDER BY sort_order, id';
    const { rows } = await pool.query(sql, params);
    return rows;
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  const menu = data.menu || [];
  if (categoryId) {
    const cat = menu[parseInt(categoryId) - 1];
    return (cat?.items || []).map((it, idx) => ({
      id: idx + 1, category_id: parseInt(categoryId), name: it.name || '', description: it.desc || '',
      price: Number(it.price) || 0, qty_text: it.qty || '', badge: it.badge || '',
      image_url: it.image || '', available: it.available !== false,
      stations: Array.isArray(it.stations) ? it.stations : (it.station ? [it.station] : ['cozinha']),
      sort_order: idx
    }));
  }
  const all = [];
  menu.forEach((sec, cidx) => {
    (sec.items || []).forEach((it, idx) => {
      all.push({
        id: idx + 1, category_id: cidx + 1, name: it.name || '', description: it.desc || '',
        price: Number(it.price) || 0, qty_text: it.qty || '', badge: it.badge || '',
        image_url: it.image || '', available: it.available !== false,
        stations: Array.isArray(it.stations) ? it.stations : (it.station ? [it.station] : ['cozinha']),
        sort_order: idx
      });
    });
  });
  return all;
}

async function getMenuItem(id) {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM menu_items WHERE id = $1', [id]);
    return rows[0] || null;
  }
  const all = await listMenuItems();
  return all.find(i => i.id == id) || null;
}

async function createMenuItem({ category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order }) {
  if (useDB) {
    const { rows } = await pool.query(
      'INSERT INTO menu_items (category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *',
      [category_id, name || '', description || '', Number(price) || 0, qty_text || '', badge || '', image_url || '', available !== false, stations || ['cozinha'], sort_order || 0]
    );
    return rows[0];
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  const idx = parseInt(category_id) - 1;
  if (data.menu && data.menu[idx]) {
    data.menu[idx].items = data.menu[idx].items || [];
    data.menu[idx].items.push({
      name: name || '', desc: description || '', price: Number(price) || 0, qty: qty_text || '',
      badge: badge || '', image: image_url || '', available: available !== false, stations: stations || ['cozinha']
    });
    writeLocal(LOCAL_FILES.config, data);
  }
  return { id: (data.menu[idx]?.items?.length || 1), category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order };
}

async function updateMenuItem(id, fields) {
  if (useDB) {
    const cols = {
      category_id: 'category_id', name: 'name', description: 'description', price: 'price',
      qty_text: 'qty_text', badge: 'badge', image_url: 'image_url', available: 'available',
      stations: 'stations', sort_order: 'sort_order'
    };
    const sets = [], vals = [];
    let i = 1;
    for (const [key, col] of Object.entries(cols)) {
      if (fields[key] !== undefined) {
        sets.push(`${col}=$${i++}`);
        vals.push(key === 'stations' && Array.isArray(fields[key]) ? fields[key] : fields[key]);
      }
    }
    if (!sets.length) return await getMenuItem(id);
    sets.push('updated_at=now()');
    vals.push(id);
    const { rows } = await pool.query(`UPDATE menu_items SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    return rows[0];
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  for (let cidx = 0; cidx < (data.menu || []).length; cidx++) {
    for (let iidx = 0; iidx < (data.menu[cidx].items || []).length; iidx++) {
      const itemId = data.menu[cidx].items.slice(0, iidx).length + 1;
      if (itemId == id) {
        const it = data.menu[cidx].items[iidx];
        if (fields.name !== undefined) it.name = fields.name;
        if (fields.description !== undefined) it.desc = fields.description;
        if (fields.price !== undefined) it.price = Number(fields.price);
        if (fields.qty_text !== undefined) it.qty = fields.qty_text;
        if (fields.badge !== undefined) it.badge = fields.badge;
        if (fields.image_url !== undefined) it.image = fields.image_url;
        if (fields.available !== undefined) it.available = fields.available;
        if (fields.stations !== undefined) it.stations = fields.stations;
        writeLocal(LOCAL_FILES.config, data);
        return await getMenuItem(id);
      }
    }
  }
  return null;
}

async function deleteMenuItem(id) {
  if (useDB) {
    await pool.query('DELETE FROM menu_items WHERE id = $1', [id]);
    return true;
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  for (let cidx = 0; cidx < (data.menu || []).length; cidx++) {
    for (let iidx = 0; iidx < (data.menu[cidx].items || []).length; iidx++) {
      const itemId = data.menu[cidx].items.slice(0, iidx).length + 1;
      if (itemId == id) { data.menu[cidx].items.splice(iidx, 1); writeLocal(LOCAL_FILES.config, data); return true; }
    }
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// FULL MENU
// ═══════════════════════════════════════════════════════════════════════════

async function getFullMenu() {
  if (useDB) {
    const { rows: cats } = await pool.query('SELECT * FROM menu_categories ORDER BY sort_order, id');
    const result = [];
    for (const cat of cats) {
      const { rows: items } = await pool.query('SELECT * FROM menu_items WHERE category_id = $1 ORDER BY sort_order, id', [cat.id]);
      result.push({
        id: cat.slug || `cat_${cat.id}`, icon: cat.icon || '', title: cat.title || '',
        note: cat.note || '',
        items: items.map(it => ({
          id: it.id, name: it.name, desc: it.description, price: Number(it.price),
          qty: it.qty_text, badge: it.badge, image: it.image_url,
          available: it.available, stations: it.stations || ['cozinha']
        }))
      });
    }
    return result;
  }
  const data = readLocal(LOCAL_FILES.config, { menu: [] });
  return (data.menu || []).map(sec => ({
    id: sec.id || '', icon: sec.icon || '', title: sec.title || '', note: sec.note || '',
    items: (sec.items || []).map(it => ({
      name: it.name || '', desc: it.desc || '', price: Number(it.price) || 0,
      qty: it.qty || '', badge: it.badge || '', image: it.image || '',
      available: it.available !== false,
      stations: Array.isArray(it.stations) ? it.stations : (it.station ? [it.station] : ['cozinha'])
    }))
  }));
}

async function setFullMenu(menuData) {
  if (useDB) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM menu_items');
      await client.query('DELETE FROM menu_categories');
      for (let cidx = 0; cidx < (menuData || []).length; cidx++) {
        const sec = menuData[cidx];
        const { rows } = await client.query(
          'INSERT INTO menu_categories (slug, icon, title, note, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [sec.id || sec.slug || `cat_${cidx}`, sec.icon || '', sec.title || '', sec.note || '', cidx]
        );
        const catId = rows[0].id;
        for (let iidx = 0; iidx < (sec.items || []).length; iidx++) {
          const it = sec.items[iidx];
          const stations = Array.isArray(it.stations) ? it.stations : 
                          (it.station && ['cozinha','sushibar','bar'].includes(it.station)) ? [it.station] : ['cozinha'];
          await client.query(
            'INSERT INTO menu_items (category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [catId, it.name || '', it.desc || '', Number(it.price) || 0, it.qty || '', it.badge || '', it.image || '', it.available !== false, stations, iidx]
          );
        }
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return;
  }
  const data = readLocal(LOCAL_FILES.config, { cfg: {}, menu: [] });
  data.menu = menuData || [];
  writeLocal(LOCAL_FILES.config, data);
}

// ═══════════════════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════════════════

function rowToOrder(row) {
  return {
    id: row.id, ticketNumber: row.ticket_number,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    status: row.status, mode: row.mode, name: row.name, phone: row.phone, address: row.address,
    items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
    obs: row.obs, payMethod: row.pay_method, troco: row.troco,
    subtotal: Number(row.subtotal), fee: Number(row.fee),
    couponCode: row.coupon_code, discount: Number(row.discount), total: Number(row.total),
    cancelReason: row.cancel_reason, cancelledBy: row.cancelled_by,
    receivedByCustomer: row.received_by_customer, receivedAt: row.received_at,
    review: row.review, lat: row.lat, lng: row.lng
  };
}

async function listOrders(limit = 500, offset = 0, statusFilter = null) {
  if (useDB) {
    let sql = 'SELECT * FROM orders';
    let params = [];
    if (statusFilter) { sql += ' WHERE status = $1'; params.push(statusFilter); }
    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);
    const { rows } = await pool.query(sql, params);
    return rows.map(rowToOrder);
  }
  const orders = readLocal(LOCAL_FILES.orders, []);
  let result = orders;
  if (statusFilter) result = result.filter(o => o.status === statusFilter);
  return result.slice(offset, offset + limit);
}

async function getOrder(id) {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM orders WHERE id = $1', [id]);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  const orders = readLocal(LOCAL_FILES.orders, []);
  return orders.find(o => o.id === id) || null;
}

async function createOrder(orderData) {
  const o = orderData;
  if (useDB) {
    await pool.query(
      `INSERT INTO orders (id, ticket_number, status, mode, name, phone, address, items, obs, pay_method, troco, subtotal, fee, coupon_code, discount, total, lat, lng)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
      [
        o.id, o.ticketNumber || null, o.status, o.mode, o.name, o.phone, o.address,
        JSON.stringify(o.items || []), o.obs, o.payMethod, o.troco,
        Number(o.subtotal) || 0, Number(o.fee) || 0, o.couponCode || '',
        Number(o.discount) || 0, Number(o.total) || 0, o.lat || null, o.lng || null
      ]
    );
    return await getOrder(o.id);
  }
  const orders = readLocal(LOCAL_FILES.orders, []);
  orders.unshift(o);
  writeLocal(LOCAL_FILES.orders, orders);
  return o;
}

async function updateOrder(id, fields) {
  if (useDB) {
    const cols = {
      status: 'status', mode: 'mode', name: 'name', phone: 'phone', address: 'address',
      items: 'items', obs: 'obs', pay_method: 'pay_method', troco: 'troco',
      subtotal: 'subtotal', fee: 'fee', coupon_code: 'coupon_code', discount: 'discount',
      total: 'total', cancel_reason: 'cancel_reason', cancelled_by: 'cancelled_by',
      ticket_number: 'ticket_number', received_by_customer: 'received_by_customer',
      received_at: 'received_at', review: 'review', lat: 'lat', lng: 'lng'
    };
    const sets = [], vals = [];
    let i = 1;
    for (const [key, col] of Object.entries(cols)) {
      if (fields[key] !== undefined) {
        sets.push(`${col}=$${i++}`);
        vals.push(key === 'items' || key === 'review' ? JSON.stringify(fields[key]) : fields[key]);
      }
    }
    if (!sets.length) return await getOrder(id);
    sets.push('updated_at=now()');
    vals.push(id);
    const { rows } = await pool.query(`UPDATE orders SET ${sets.join(', ')} WHERE id=$${i} RETURNING *`, vals);
    return rows[0] ? rowToOrder(rows[0]) : null;
  }
  const orders = readLocal(LOCAL_FILES.orders, []);
  const idx = orders.findIndex(o => o.id === id);
  if (idx >= 0) { Object.assign(orders[idx], fields); writeLocal(LOCAL_FILES.orders, orders); return orders[idx]; }
  return null;
}

async function deleteOrder(id) {
  if (useDB) { await pool.query('DELETE FROM orders WHERE id = $1', [id]); return true; }
  const orders = readLocal(LOCAL_FILES.orders, []);
  writeLocal(LOCAL_FILES.orders, orders.filter(o => o.id !== id));
  return true;
}

async function countOrders() {
  if (useDB) { const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM orders'); return rows[0].n; }
  return readLocal(LOCAL_FILES.orders, []).length;
}

async function getOrderStats(phone) {
  const p = normalizePhone(phone);
  if (useDB) {
    const { rows } = await pool.query(
      "SELECT COUNT(*)::int AS n, MAX(created_at) AS last FROM orders WHERE phone = $1 AND status != 'cancelado'",
      [p]
    );
    return { orderCount: rows[0]?.n || 0, lastOrderAt: rows[0]?.last || null };
  }
  const orders = readLocal(LOCAL_FILES.orders, []);
  const mine = orders.filter(o => normalizePhone(o.phone) === p && o.status !== 'cancelado');
  return { orderCount: mine.length, lastOrderAt: mine.length ? mine[0].createdAt : null };
}

// ═══════════════════════════════════════════════════════════════════════════
// CUSTOMERS
// ═══════════════════════════════════════════════════════════════════════════

function rowToCustomer(row) {
  if (!row) return null;
  return {
    phone: row.phone, name: row.name, pinHash: row.pin_hash,
    lastAddress: row.last_address || '',
    recovery: typeof row.recovery === 'string' ? JSON.parse(row.recovery) : row.recovery,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

async function findCustomerByPhone(phone) {
  const p = normalizePhone(phone);
  if (useDB) { const { rows } = await pool.query('SELECT * FROM customers WHERE phone = $1', [p]); return rows[0] ? rowToCustomer(rows[0]) : null; }
  return readLocal(LOCAL_FILES.customers, []).find(c => c.phone === p) || null;
}

async function createCustomer(c) {
  const record = { ...c, phone: normalizePhone(c.phone) };
  if (useDB) {
    await pool.query('INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [record.phone, record.name, record.pinHash, record.lastAddress || '', record.recovery ? JSON.stringify(record.recovery) : null, record.createdAt || nowISO()]);
    return record;
  }
  const customers = readLocal(LOCAL_FILES.customers, []);
  customers.push(record); writeLocal(LOCAL_FILES.customers, customers); return record;
}

async function updateCustomer(phone, fields) {
  const p = normalizePhone(phone);
  if (useDB) {
    const cols = { name: 'name', pinHash: 'pin_hash', lastAddress: 'last_address', recovery: 'recovery' };
    const sets = [], vals = [];
    let i = 1;
    for (const [key, col] of Object.entries(cols)) {
      if (fields[key] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(key === 'recovery' ? (fields[key] ? JSON.stringify(fields[key]) : null) : fields[key]); }
    }
    if (!sets.length) return;
    vals.push(p);
    await pool.query(`UPDATE customers SET ${sets.join(', ')} WHERE phone=$${i}`, vals);
    return;
  }
  const customers = readLocal(LOCAL_FILES.customers, []);
  const c = customers.find(x => x.phone === p);
  if (c) { Object.assign(c, fields); writeLocal(LOCAL_FILES.customers, customers); }
}

async function listCustomers() {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM customers ORDER BY created_at DESC'); return rows.map(rowToCustomer); }
  return readLocal(LOCAL_FILES.customers, []);
}

async function replaceAllCustomers(arr) {
  if (useDB) {
    const client = await pool.connect();
    try { await client.query('BEGIN'); await client.query('DELETE FROM customers');
      for (const c of arr) { await client.query('INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING',
        [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || nowISO()]); }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return;
  }
  writeLocal(LOCAL_FILES.customers, arr);
}

// ═══════════════════════════════════════════════════════════════════════════
// COUPONS
// ═══════════════════════════════════════════════════════════════════════════

async function listCoupons() {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM coupons ORDER BY id'); return rows; }
  return (await getSettings()).coupons || [];
}

async function getCouponByCode(code) {
  const c = String(code || '').trim().toUpperCase();
  if (useDB) { const { rows } = await pool.query('SELECT * FROM coupons WHERE UPPER(code) = $1', [c]); return rows[0] || null; }
  return ((await getSettings()).coupons || []).find(x => String(x.code || '').toUpperCase() === c) || null;
}

async function createCoupon({ code, type, value, active, expiresAt, usageLimit, usedCount, minOrder }) {
  if (useDB) {
    const { rows } = await pool.query(
      'INSERT INTO coupons (code, type, value, active, expires_at, usage_limit, used_count, min_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *',
      [code, type, Number(value) || 0, active !== false, expiresAt || null, usageLimit || 0, usedCount || 0, minOrder || 0]);
    return rows[0];
  }
  const cfg = await getSettings(); cfg.coupons = cfg.coupons || [];
  cfg.coupons.push({ code, type, value, active, expiresAt, usageLimit, usedCount, minOrder });
  await updateSettings(cfg); return { code, type, value, active, expiresAt, usageLimit, usedCount, minOrder };
}

async function updateCoupon(id, fields) {
  if (useDB) {
    const cols = { code: 'code', type: 'type', value: 'value', active: 'active', expires_at: 'expires_at', usage_limit: 'usage_limit', used_count: 'used_count', min_order: 'min_order' };
    const sets = [], vals = [];
    let i = 1;
    for (const [key, col] of Object.entries(cols)) { if (fields[key] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(fields[key]); } }
    if (!sets.length) return;
    vals.push(id); await pool.query(`UPDATE coupons SET ${sets.join(', ')} WHERE id=$${i}`, vals);
    return;
  }
  const cfg = await getSettings(); const c = (cfg.coupons || []).find(x => x.id == id || x.code === fields.code);
  if (c) Object.assign(c, fields); await updateSettings(cfg);
}

async function deleteCoupon(id) {
  if (useDB) { await pool.query('DELETE FROM coupons WHERE id = $1', [id]); return true; }
  const cfg = await getSettings(); cfg.coupons = (cfg.coupons || []).filter(x => x.id != id); await updateSettings(cfg); return true;
}

async function incrementCouponUsage(code) {
  const c = String(code || '').trim().toUpperCase();
  if (useDB) { await pool.query('UPDATE coupons SET used_count = used_count + 1 WHERE UPPER(code) = $1', [c]); return; }
  const cfg = await getSettings(); const coupon = (cfg.coupons || []).find(x => String(x.code || '').toUpperCase() === c);
  if (coupon) { coupon.usedCount = (coupon.usedCount || 0) + 1; await updateSettings(cfg); }
}

// ═══════════════════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════════════════

async function listUsers() {
  if (useDB) { const { rows } = await pool.query('SELECT username, role, created_at FROM users ORDER BY created_at'); return rows; }
  return ((await getSettings()).users || []).map(u => ({ username: u.username, role: u.role }));
}

async function getUser(username) {
  const uname = String(username || '').trim().toLowerCase();
  if (useDB) { const { rows } = await pool.query('SELECT * FROM users WHERE LOWER(username) = $1', [uname]); return rows[0] || null; }
  return ((await getSettings()).users || []).find(u => String(u.username || '').toLowerCase() === uname) || null;
}

async function createUser({ username, passwordHash, role }) {
  const uname = String(username || '').trim().toLowerCase();
  if (useDB) {
    const { rows } = await pool.query(
      'INSERT INTO users (username, password_hash, role) VALUES ($1,$2,$3) ON CONFLICT (username) DO UPDATE SET password_hash=$2, role=$3 RETURNING *',
      [uname, passwordHash, role]);
    return rows[0];
  }
  const cfg = await getSettings(); cfg.users = cfg.users || [];
  const existing = cfg.users.find(u => String(u.username || '').toLowerCase() === uname);
  if (existing) { existing.password = passwordHash; existing.role = role; }
  else { cfg.users.push({ username: uname, password: passwordHash, role }); }
  await updateSettings(cfg); return { username: uname, role };
}

async function deleteUser(username) {
  const uname = String(username || '').trim().toLowerCase();
  if (useDB) { await pool.query('DELETE FROM users WHERE LOWER(username) = $1', [uname]); return true; }
  const cfg = await getSettings(); cfg.users = (cfg.users || []).filter(u => String(u.username || '').toLowerCase() !== uname); await updateSettings(cfg); return true;
}

async function countMasters() {
  if (useDB) { const { rows } = await pool.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'master'"); return rows[0].n; }
  return ((await getSettings()).users || []).filter(u => u.role === 'master').length;
}

// ═══════════════════════════════════════════════════════════════════════════
// PRINTERS
// ═══════════════════════════════════════════════════════════════════════════

async function listPrinters() {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM printers ORDER BY id'); return rows; }
  const cfg = await getSettings();
  return Object.entries(cfg.stations || {}).map(([station, p]) => ({ station, ...p }));
}

async function getPrinter(station) {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM printers WHERE station = $1', [station]); return rows[0] || null; }
  return (await getSettings()).stations?.[station] || null;
}

async function updatePrinter(station, fields) {
  if (useDB) {
    const cols = { label: 'label', method: 'method', ip: 'ip', port: 'port', device: 'device' };
    const sets = [], vals = [];
    let i = 1;
    for (const [key, col] of Object.entries(cols)) { if (fields[key] !== undefined) { sets.push(`${col}=$${i++}`); vals.push(fields[key]); } }
    if (!sets.length) return;
    sets.push('updated_at=now()');
    vals.push(station);
    await pool.query(`UPDATE printers SET ${sets.join(', ')} WHERE station=$${i}`, vals);
    return;
  }
  const cfg = await getSettings();
  cfg.stations = cfg.stations || {};
  cfg.stations[station] = { ...cfg.stations[station], ...fields };
  await updateSettings(cfg);
}

// ═══════════════════════════════════════════════════════════════════════════
// CAMPAIGNS / PUSH SUBSCRIPTIONS
// ═══════════════════════════════════════════════════════════════════════════

async function getCampaignSettings() {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM campaign_settings WHERE id = 1');
    if (rows[0]) {
      return {
        horarios: rows[0].horarios || ['11:00','15:30','19:00'],
        ponteiroRodizio: rows[0].ponteiro || 0,
        mensagens: rows[0].mensagens || []
      };
    }
  }
  return readLocal(LOCAL_FILES.campaigns, { horarios: ['11:00','15:30','19:00'], ponteiroRodizio: 0, mensagens: [] });
}

async function updateCampaignSettings(data) {
  if (useDB) {
    await pool.query(
      'UPDATE campaign_settings SET horarios = $1, ponteiro = $2, mensagens = $3, updated_at = now() WHERE id = 1',
      [data.horarios || ['11:00','15:30','19:00'], data.ponteiroRodizio || 0, JSON.stringify(data.mensagens || [])]
    );
    return;
  }
  writeLocal(LOCAL_FILES.campaigns, data);
}

async function listPushSubs() {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions ORDER BY created_at DESC');
    return rows.map(r => ({ phone: r.phone, endpoint: r.endpoint, subscription: r.subscription, createdAt: r.created_at }));
  }
  return readLocal(LOCAL_FILES.subs, []);
}

async function savePushSub(phone, subscription) {
  const p = normalizePhone(phone);
  if (useDB) {
    await pool.query(
      'INSERT INTO push_subscriptions (phone, endpoint, subscription, created_at) VALUES ($1,$2,$3,$4) ON CONFLICT (endpoint) DO UPDATE SET phone=$1, subscription=$3, created_at=$4',
      [p, subscription.endpoint, JSON.stringify(subscription), nowISO()]
    );
    return;
  }
  const subs = readLocal(LOCAL_FILES.subs, []);
  const filtered = subs.filter(s => s.endpoint !== subscription.endpoint);
  filtered.push({ phone: p, endpoint: subscription.endpoint, subscription, createdAt: nowISO() });
  writeLocal(LOCAL_FILES.subs, filtered);
}

async function removePushSub(endpoint) {
  if (useDB) { await pool.query('DELETE FROM push_subscriptions WHERE endpoint = $1', [endpoint]); return; }
  const subs = readLocal(LOCAL_FILES.subs, []);
  writeLocal(LOCAL_FILES.subs, subs.filter(s => s.endpoint !== endpoint));
}

async function getPushSubsByPhone(phone) {
  const p = normalizePhone(phone);
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM push_subscriptions WHERE phone = $1', [p]);
    return rows.map(r => ({ phone: r.phone, endpoint: r.endpoint, subscription: r.subscription, createdAt: r.created_at }));
  }
  return readLocal(LOCAL_FILES.subs, []).filter(s => normalizePhone(s.phone) === p);
}

// ═══════════════════════════════════════════════════════════════════════════
// DELIVERY ZONES
// ═══════════════════════════════════════════════════════════════════════════

async function listDeliveryZones() {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM delivery_zones WHERE active = true ORDER BY id'); return rows; }
  const cfg = await getSettings();
  const zones = [];
  (cfg.feeZonesCep || []).forEach(z => zones.push({ type: 'cep', ...z }));
  (cfg.feeZonesBairro || []).forEach(z => zones.push({ type: 'bairro', ...z }));
  return zones;
}

async function createDeliveryZone({ type, label, prefix, bairro, fee, active }) {
  if (useDB) {
    const { rows } = await pool.query(
      'INSERT INTO delivery_zones (type, label, prefix, bairro, fee, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [type, label, prefix || '', bairro || '', Number(fee) || 0, active !== false]
    );
    return rows[0];
  }
  const cfg = await getSettings();
  if (type === 'cep') { cfg.feeZonesCep = cfg.feeZonesCep || []; cfg.feeZonesCep.push({ prefix, label, fee }); }
  else { cfg.feeZonesBairro = cfg.feeZonesBairro || []; cfg.feeZonesBairro.push({ bairro, label, fee }); }
  await updateSettings(cfg);
  return { type, label, prefix, bairro, fee, active };
}

async function deleteDeliveryZone(id) {
  if (useDB) { await pool.query('DELETE FROM delivery_zones WHERE id = $1', [id]); return true; }
  return true;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGS
// ═══════════════════════════════════════════════════════════════════════════

async function addLog(action, details = {}) {
  if (useDB) {
    await pool.query('INSERT INTO logs (action, details) VALUES ($1, $2)', [action, JSON.stringify(details)]);
    return;
  }
  console.log(`[LOG] ${action}:`, JSON.stringify(details));
}

async function listLogs(limit = 100) {
  if (useDB) { const { rows } = await pool.query('SELECT * FROM logs ORDER BY created_at DESC LIMIT $1', [limit]); return rows; }
  return [];
}

// ═══════════════════════════════════════════════════════════════════════════
// BACKUP / RESTORE
// ═══════════════════════════════════════════════════════════════════════════

async function getFullBackup() {
  const settings = await getSettings();
  const menu = await getFullMenu();
  const orders = await listOrders(10000);
  const customers = await listCustomers();
  return { cfg: settings, menu, orders, customers, exportedAt: nowISO(), version: 2 };
}

async function restoreFullBackup({ cfg, menu, orders, customers }) {
  if (useDB) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('UPDATE settings SET data = $1, updated_at = now() WHERE id = 1', [JSON.stringify(cfg || {})]);
      await client.query('DELETE FROM menu_items');
      await client.query('DELETE FROM menu_categories');
      for (let cidx = 0; cidx < (menu || []).length; cidx++) {
        const sec = menu[cidx];
        const { rows } = await client.query(
          'INSERT INTO menu_categories (slug, icon, title, note, sort_order) VALUES ($1,$2,$3,$4,$5) RETURNING id',
          [sec.id || sec.slug || `cat_${cidx}`, sec.icon || '', sec.title || '', sec.note || '', cidx]
        );
        const catId = rows[0].id;
        for (let iidx = 0; iidx < (sec.items || []).length; iidx++) {
          const it = sec.items[iidx];
          const stations = Array.isArray(it.stations) ? it.stations : (it.station ? [it.station] : ['cozinha']);
          await client.query(
            'INSERT INTO menu_items (category_id, name, description, price, qty_text, badge, image_url, available, stations, sort_order) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)',
            [catId, it.name || '', it.desc || '', Number(it.price) || 0, it.qty || '', it.badge || '', it.image || '', it.available !== false, stations, iidx]
          );
        }
      }
      await client.query('DELETE FROM orders');
      for (const o of (orders || [])) {
        await client.query(
          `INSERT INTO orders (id, ticket_number, created_at, updated_at, status, mode, name, phone, address, items, obs, pay_method, troco, subtotal, fee, coupon_code, discount, total, cancel_reason, cancelled_by, received_by_customer, received_at, review, lat, lng)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25)`,
          [
            o.id, o.ticketNumber || null, o.createdAt, o.updatedAt || o.createdAt, o.status, o.mode,
            o.name, o.phone, o.address || '', JSON.stringify(o.items || []), o.obs || '',
            o.payMethod || '', o.troco || '', Number(o.subtotal) || 0, Number(o.fee) || 0,
            o.couponCode || '', Number(o.discount) || 0, Number(o.total) || 0,
            o.cancelReason || '', o.cancelledBy || '', !!o.receivedByCustomer,
            o.receivedAt || null, o.review ? JSON.stringify(o.review) : null,
            o.lat || null, o.lng || null
          ]
        );
      }
      await client.query('DELETE FROM customers');
      for (const c of (customers || [])) {
        await client.query(
          'INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING',
          [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || nowISO()]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return;
  }
  writeLocal(LOCAL_FILES.config, { cfg: cfg || {}, menu: menu || [] });
  writeLocal(LOCAL_FILES.orders, orders || []);
  writeLocal(LOCAL_FILES.customers, customers || []);
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

module.exports = {
  useDB,
  initSchema,

  // Settings
  getSettings,
  updateSettings,

  // Menu Categories
  listCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,

  // Menu Items
  listMenuItems,
  getMenuItem,
  createMenuItem,
  updateMenuItem,
  deleteMenuItem,

  // Full Menu
  getFullMenu,
  setFullMenu,

  // Orders
  listOrders,
  getOrder,
  createOrder,
  updateOrder,
  deleteOrder,
  countOrders,
  getOrderStats,

  // Customers
  findCustomerByPhone,
  createCustomer,
  updateCustomer,
  listCustomers,
  replaceAllCustomers,

  // Coupons
  listCoupons,
  getCouponByCode,
  createCoupon,
  updateCoupon,
  deleteCoupon,
  incrementCouponUsage,

  // Users
  listUsers,
  getUser,
  createUser,
  deleteUser,
  countMasters,

  // Printers
  listPrinters,
  getPrinter,
  updatePrinter,

  // Campaigns / Push
  getCampaignSettings,
  updateCampaignSettings,
  listPushSubs,
  savePushSub,
  removePushSub,
  getPushSubsByPhone,

  // Delivery Zones
  listDeliveryZones,
  createDeliveryZone,
  deleteDeliveryZone,

  // Logs
  addLog,
  listLogs,

  // Backup / Restore
  getFullBackup,
  restoreFullBackup
};
