// ═══════════════════════════════════════════════════════════
// Shogatsu · Camada de persistência (PostgreSQL)
// Toda a leitura/escrita de dados do sistema passa por aqui.
// Nenhum outro arquivo deve gravar dados de negócio em disco.
// ═══════════════════════════════════════════════════════════
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

if (!process.env.DATABASE_URL) {
  console.error('❌ Variável de ambiente DATABASE_URL não definida.');
  console.error('   Configure-a com a connection string do seu banco PostgreSQL');
  console.error('   (no Render: Dashboard → seu Postgres → "Internal/External Database URL").');
  process.exit(1);
}

// Render exige SSL nas conexões externas; conexões locais (dev) não usam SSL.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false }
});

// Loga erros inesperados de conexões ociosas sem derrubar o servidor.
pool.on('error', (err) => {
  console.error('❌ Erro inesperado no pool do PostgreSQL:', err.message);
});

async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (err) {
    console.error('❌ Erro de consulta no banco:', err.message, '\n   Query:', text.slice(0, 200));
    throw err;
  }
}

// Executa uma função dentro de uma transação, com rollback automático em caso de erro.
async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Transação revertida (rollback) por erro:', err.message);
    throw err;
  } finally {
    client.release();
  }
}

// ─── Migrations ───
// Aplica cada arquivo .sql da pasta /migrations em ordem, uma única vez cada.
// Nunca recria tabelas existentes (todo SQL usa IF NOT EXISTS) e nunca apaga dados.
async function runMigrations() {
  await query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    id TEXT PRIMARY KEY,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`);

  const dir = path.join(__dirname, 'migrations');
  if (!fs.existsSync(dir)) { console.log('ℹ️  Nenhuma pasta de migrations encontrada — pulando.'); return; }
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();

  for (const file of files) {
    const already = await query('SELECT 1 FROM schema_migrations WHERE id = $1', [file]);
    if (already.rows.length) { console.log(`↷  Migration já aplicada: ${file}`); continue; }

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    try {
      await withTransaction(async (client) => {
        await client.query(sql);
        await client.query('INSERT INTO schema_migrations (id) VALUES ($1)', [file]);
      });
      console.log(`✅ Migration aplicada com sucesso: ${file}`);
    } catch (err) {
      console.error(`❌ Falha ao aplicar migration "${file}": ${err.message}`);
      throw err; // interrompe o boot — melhor falhar alto a subir com schema incompleto
    }
  }
}

// Cria os dados iniciais SOMENTE se o banco estiver completamente vazio (primeiro
// boot de sempre). Nunca sobrescreve nada que já exista. Pode ser desligado de vez
// setando AUTO_SEED=false nas variáveis de ambiente, se preferir semear manualmente.
async function seedIfEmpty(DEFAULT_CFG, DEFAULT_MENU) {
  if (process.env.AUTO_SEED === 'false') {
    console.log('ℹ️  AUTO_SEED=false — pulando verificação de dados iniciais.');
    return;
  }
  const settingsCount = await query('SELECT COUNT(*)::int AS n FROM settings');
  if (settingsCount.rows[0].n === 0) {
    console.log('🌱 Nenhuma configuração encontrada (primeiro boot) — gravando valores padrão...');
    await saveSettings(DEFAULT_CFG);
  }
  const catCount = await query('SELECT COUNT(*)::int AS n FROM categories');
  if (catCount.rows[0].n === 0) {
    console.log('🌱 Nenhuma categoria encontrada (primeiro boot) — gravando cardápio padrão...');
    await saveMenu(DEFAULT_MENU);
  }
}

async function init(DEFAULT_CFG, DEFAULT_MENU) {
  console.log('🔌 Conectando ao PostgreSQL...');
  await query('SELECT 1'); // valida a conexão cedo, com erro claro se falhar
  console.log('✅ Conectado ao PostgreSQL com sucesso.');
  console.log('📦 Verificando migrations...');
  await runMigrations();
  await seedIfEmpty(DEFAULT_CFG, DEFAULT_MENU);
  console.log('✅ Banco de dados pronto.');
}

// ─── Settings (configuração do restaurante) ───
async function getSettings() {
  const r = await query('SELECT data FROM settings WHERE id = 1');
  return r.rows[0] ? r.rows[0].data : null;
}
async function saveSettings(cfg) {
  await query(
    `INSERT INTO settings (id, data, updated_at) VALUES (1, $1, now())
     ON CONFLICT (id) DO UPDATE SET data = $1, updated_at = now()`,
    [cfg]
  );
}

// ─── Menu (categorias + produtos) ───
// Mantém o mesmo formato em JSON usado pelo site/painel: array de seções,
// cada uma com .items — só muda ONDE isso é guardado, não o formato.
async function getMenu() {
  const cats = await query('SELECT * FROM categories ORDER BY position ASC, id ASC');
  const prods = await query('SELECT * FROM products ORDER BY category_id ASC, position ASC, id ASC');
  const byCategory = {};
  for (const p of prods.rows) {
    (byCategory[p.category_id] ||= []).push({
      name: p.name, desc: p.description, price: Number(p.price), qty: p.qty_label,
      badge: p.badge, img: p.img, station: p.station, available: p.available
    });
  }
  return cats.rows.map(c => ({ id: c.id, icon: c.icon, title: c.title, note: c.note, items: byCategory[c.id] || [] }));
}

async function saveMenu(menu) {
  return withTransaction(async (client) => {
    const incomingIds = menu.map(s => s.id);
    for (let i = 0; i < menu.length; i++) {
      const s = menu[i];
      await client.query(
        `INSERT INTO categories (id, icon, title, note, position)
         VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (id) DO UPDATE SET icon=$2, title=$3, note=$4, position=$5`,
        [s.id, s.icon || '', s.title, s.note || '', i]
      );
    }
    // Remove categorias que não vieram mais na lista (produtos somem junto via CASCADE)
    if (incomingIds.length) {
      await client.query('DELETE FROM categories WHERE id <> ALL($1::text[])', [incomingIds]);
    } else {
      await client.query('DELETE FROM categories');
    }
    // Substitui os produtos de cada categoria (mais simples e seguro do que tentar
    // casar item a item, já que o cardápio nunca tem tantos itens a ponto de pesar)
    for (const s of menu) {
      await client.query('DELETE FROM products WHERE category_id = $1', [s.id]);
      const items = s.items || [];
      for (let j = 0; j < items.length; j++) {
        const it = items[j];
        await client.query(
          `INSERT INTO products (category_id, name, description, price, qty_label, badge, img, station, available, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [s.id, it.name || '', it.desc || '', Number(it.price) || 0, it.qty || '', it.badge || '', it.img || '',
           it.station || 'cozinha', it.available !== false, j]
        );
      }
    }
  });
}

// ─── Pedidos ───
const ORDER_SELECT = `
  SELECT o.*,
    COALESCE(
      json_agg(json_build_object('name', oi.name, 'qty', oi.qty, 'price', oi.price, 'station', oi.station) ORDER BY oi.id)
      FILTER (WHERE oi.id IS NOT NULL), '[]'
    ) AS items
  FROM orders o
  LEFT JOIN order_items oi ON oi.order_id = o.id
`;
function mapOrderRow(o) {
  return {
    id: o.id, createdAt: o.created_at.toISOString(), status: o.status, mode: o.mode,
    name: o.name, phone: o.phone, address: o.address, obs: o.obs,
    payMethod: o.pay_method, troco: o.troco,
    subtotal: Number(o.subtotal), fee: Number(o.fee), total: Number(o.total),
    cancelReason: o.cancel_reason,
    items: (o.items || []).map(i => ({ ...i, price: Number(i.price) }))
  };
}

async function createOrder(order) {
  await withTransaction(async (client) => {
    await client.query(
      `INSERT INTO orders (id, status, mode, name, phone, address, obs, pay_method, troco, subtotal, fee, total, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [order.id, order.status, order.mode, order.name, order.phone, order.address, order.obs,
       order.payMethod, order.troco, order.subtotal, order.fee, order.total, order.createdAt]
    );
    for (const it of order.items) {
      await client.query(
        'INSERT INTO order_items (order_id, name, qty, price, station) VALUES ($1,$2,$3,$4,$5)',
        [order.id, it.name, it.qty, it.price, it.station]
      );
    }
  });
  return order;
}

async function getOrders() {
  const r = await query(`${ORDER_SELECT} GROUP BY o.id ORDER BY o.created_at DESC`);
  return r.rows.map(mapOrderRow);
}
async function getOrdersInRange(fromMs, toMs) {
  const r = await query(
    `${ORDER_SELECT} WHERE o.created_at >= to_timestamp($1/1000.0) AND o.created_at <= to_timestamp($2/1000.0)
     GROUP BY o.id ORDER BY o.created_at DESC`,
    [fromMs, toMs]
  );
  return r.rows.map(mapOrderRow);
}
async function getOrderById(id) {
  const r = await query(`${ORDER_SELECT} WHERE o.id = $1 GROUP BY o.id`, [id]);
  return r.rows[0] ? mapOrderRow(r.rows[0]) : null;
}
async function getOrdersByPhone(phone) {
  const r = await query(`${ORDER_SELECT} WHERE o.phone = $1 GROUP BY o.id ORDER BY o.created_at DESC`, [phone]);
  return r.rows.map(mapOrderRow);
}
async function updateOrder(id, fields) {
  const sets = [], vals = [];
  let i = 1;
  if (fields.status !== undefined) { sets.push(`status = $${i++}`); vals.push(fields.status); }
  if (fields.cancelReason !== undefined) { sets.push(`cancel_reason = $${i++}`); vals.push(fields.cancelReason); }
  if (fields.fee !== undefined) { sets.push(`fee = $${i++}`); vals.push(fields.fee); }
  if (fields.total !== undefined) { sets.push(`total = $${i++}`); vals.push(fields.total); }
  if (!sets.length) return getOrderById(id);
  vals.push(id);
  await query(`UPDATE orders SET ${sets.join(', ')} WHERE id = $${i}`, vals);
  return getOrderById(id);
}
async function purgeOrdersBefore(cutoffISO) {
  const r = await query('DELETE FROM orders WHERE created_at < $1', [cutoffISO]);
  return r.rowCount;
}

// ─── Clientes ───
function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }
function mapCustomerRow(c) {
  return {
    phone: c.phone, name: c.name, pinHash: c.pin_hash,
    createdAt: c.created_at.toISOString(), lastAddress: c.last_address, recovery: c.recovery
  };
}
async function getCustomerByPhone(phone) {
  const r = await query('SELECT * FROM customers WHERE phone = $1', [normalizePhone(phone)]);
  return r.rows[0] ? mapCustomerRow(r.rows[0]) : null;
}
async function createCustomer({ phone, name, pinHash }) {
  const r = await query(
    'INSERT INTO customers (phone, name, pin_hash) VALUES ($1,$2,$3) RETURNING *',
    [normalizePhone(phone), name, pinHash]
  );
  return mapCustomerRow(r.rows[0]);
}
async function updateCustomerLastAddress(phone, address) {
  await query('UPDATE customers SET last_address = $1 WHERE phone = $2', [address, normalizePhone(phone)]);
}
async function setCustomerRecovery(phone, recovery) {
  await query('UPDATE customers SET recovery = $1 WHERE phone = $2', [recovery, normalizePhone(phone)]);
}
async function updateCustomerPin(phone, pinHash) {
  await query('UPDATE customers SET pin_hash = $1, recovery = NULL WHERE phone = $2', [pinHash, normalizePhone(phone)]);
}
async function getCustomerStats(phone) {
  const r = await query(
    `SELECT COUNT(*)::int AS order_count, MAX(created_at) AS last_order_at
     FROM orders WHERE phone = $1 AND status <> 'cancelado'`,
    [normalizePhone(phone)]
  );
  return { orderCount: r.rows[0].order_count, lastOrderAt: r.rows[0].last_order_at ? r.rows[0].last_order_at.toISOString() : null };
}
async function listCustomersWithStats() {
  const r = await query(`
    SELECT c.*,
      COUNT(o.id) FILTER (WHERE o.status <> 'cancelado')::int AS order_count,
      MAX(o.created_at) FILTER (WHERE o.status <> 'cancelado') AS last_order_at
    FROM customers c
    LEFT JOIN orders o ON o.phone = c.phone
    GROUP BY c.phone
    ORDER BY order_count DESC, c.created_at DESC
  `);
  return r.rows.map(c => ({
    phone: c.phone, name: c.name, createdAt: c.created_at.toISOString(), lastAddress: c.last_address,
    hasPendingRecovery: !!(c.recovery && !c.recovery.approved),
    orderCount: c.order_count, lastOrderAt: c.last_order_at ? c.last_order_at.toISOString() : null
  }));
}

// ─── Uploads (imagens: logo, fotos de prato, slides) ───
async function saveUpload(buffer, mimeType) {
  const id = crypto.randomBytes(8).toString('hex');
  await query('INSERT INTO uploads (id, mime_type, data) VALUES ($1,$2,$3)', [id, mimeType, buffer]);
  return id;
}
async function getUpload(id) {
  const r = await query('SELECT mime_type, data FROM uploads WHERE id = $1', [id]);
  return r.rows[0] || null;
}

async function shutdown() {
  console.log('🔌 Encerrando pool de conexões do PostgreSQL...');
  await pool.end();
}

module.exports = {
  init, shutdown, withTransaction, query,
  getSettings, saveSettings,
  getMenu, saveMenu,
  createOrder, getOrders, getOrdersInRange, getOrderById, getOrdersByPhone, updateOrder, purgeOrdersBefore,
  getCustomerByPhone, createCustomer, updateCustomerLastAddress, setCustomerRecovery, updateCustomerPin,
  getCustomerStats, listCustomersWithStats,
  saveUpload, getUpload,
  normalizePhone
};
