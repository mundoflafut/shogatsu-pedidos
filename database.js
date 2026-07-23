// ═══════════════════════════════════════════════════════════
// database.js — ÚNICO módulo com acesso a banco de dados do Shogatsu.
//
// Todo o sistema (cardápio, configurações, pedidos, clientes, campanhas de
// notificação e assinaturas de push) é lido e gravado exclusivamente no
// PostgreSQL (Render Postgres, Supabase, Neon, etc.) através deste arquivo.
// Nenhuma outra parte do projeto deve rodar SQL diretamente — server.js e
// notifications.js só chamam as funções exportadas aqui.
//
// Os arquivos data/*.json e default-menu.json passam a servir SOMENTE como
// SEED (dado inicial) na primeira vez que o banco é criado, nunca mais como
// armazenamento operacional. Depois da primeira inicialização, eles podem
// até ser apagados — o sistema não olha mais pra eles.
//
// Exige a variável de ambiente DATABASE_URL configurada. Sem ela, o servidor
// recusa-se a subir com uma mensagem clara — preferimos falhar rápido e
// visivelmente a rodar "quase funcionando" com dados que somem a cada
// reinício (que era exatamente o bug que motivou essa migração).
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(
    'DATABASE_URL não configurada. O Shogatsu agora exige um banco PostgreSQL ' +
    '(Render Postgres, Supabase ou Neon) para guardar cardápio, configurações, ' +
    'pedidos e clientes — nada mais é salvo em arquivo JSON. Configure a variável ' +
    'de ambiente DATABASE_URL com a connection string do seu banco antes de rodar ' +
    '`node server.js`. Veja o README para o passo a passo.'
  );
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  // Render/Neon/Supabase pedem SSL, mas com certificado que o driver não valida
  // por padrão — isso é normal pra esses provedores, não é falha de segurança.
  ssl: { rejectUnauthorized: false }
});

const DATA_DIR = path.join(__dirname, 'data');
const DEFAULT_MENU = require('./default-menu.json');

// ─── Config padrão (usada só como seed, na primeira inicialização do banco) ───
const DEFAULT_CFG = {
  whats: '552227641333', storePhone: '(22) 2764-1333', fee: 8, min: 60,
  name: 'Shogatsu Culinária Oriental', days: 'Ter–Dom',
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras · CEP 22896-155',
  hours: '18h30–23h', open: 1,
  schedule: { enabled: false, openTime: '18:00', closeTime: '23:00' },
  adminPass: 'shogatsu2026',
  masterPass: 'shogatsuMaster2026',
  users: [
    { username: 'master', password: 'shogatsuMaster2026', role: 'master' },
    { username: 'admin', password: 'shogatsu2026', role: 'admin' }
  ],
  logoUrl: '',
  print: 0,
  sound: 1,
  labels: {
    actionNovo: 'Aceitar Pedido', actionPrep: 'Marcar Pronto', actionPronto: 'Confirmar Entrega',
    colNovo: 'Novos', colPrep: 'Preparando', colPronto: 'Pronto', colEntregue: 'Entregue',
    btnCancel: 'Cancelar', btnPrint: 'Imprimir',
  },
  pixKey: '', pixName: 'Shogatsu Culinaria Oriental', pixCity: 'RIO DAS OSTRAS',
  printFont: 'Verdana, sans-serif', printSize: 20, printColor: '#000000',
  logoShape: 'retangular', logoSize: 40,
  stations: {
    cozinha:  { label: 'Cozinha',  method: 'navegador', ip: '', port: 9100, device: '' },
    sushibar: { label: 'Sushibar', method: 'navegador', ip: '', port: 9100, device: '' },
    bar:      { label: 'Bar',      method: 'navegador', ip: '', port: 9100, device: '' },
    caixa:    { label: 'Caixa',    method: 'navegador', ip: '', port: 9100, device: '' }
  },
  cancelReasons: ['Item em falta', 'Fora da área de entrega', 'Pedido duplicado', 'Cliente desistiu', 'Loja fechada no momento'],
  uiFonts: { pedidos: 13, config: 13, clientes: 13, relatorios: 13 },
  theme: { primary: '#c9a84c', accent: '#c0392b', bg: '#0a0a0a' },
  slides: [],
  feeMode: 'fixo',
  storeLat: null, storeLng: null,
  feeBaseKm: 2, feeBaseValue: 8, feePerKm: 2.5, feeMaxKm: 12, feeRound: 0.5,
  feeZonesCep: [], feeZonesBairro: [], feeZoneFallback: 'padrao',
  coupons: [],
  nextTicketNumber: 1,
  sms: { accountSid: '', authToken: '', fromNumber: '' },
  vapid: { publicKey: '', privateKey: '' },
  reviewPrompt: 'O que você achou do seu pedido? Sua opinião ajuda muito a gente! 🍣',
  reviewPhrases: [
    'Comida deliciosa! 😋', 'Entrega rápida! 🛵', 'Atendimento excelente! ⭐',
    'Embalagem caprichada 📦', 'Voltarei a pedir com certeza! 🙌'
  ],
  announcements: []
};

const DEFAULT_CAMPANHAS = {
  horarios: ['11:00', '15:30', '19:00'],
  ponteiroRodizio: 0,
  mensagens: [
    { id: 'desc_001', categoria: 'desconto', titulo: 'Terça do Sushi', texto: '🍣 Hoje é dia de Terça do Sushi! 15% OFF em todos os combinados, só até o fechamento.', active: true },
    { id: 'desc_002', categoria: 'desconto', titulo: 'Happy Hour', texto: '🍶 Happy Hour agora: 20% OFF em sakês e drinks das 17h às 19h!', active: true },
    { id: 'desc_003', categoria: 'desconto', titulo: 'Primeira visita', texto: '🎌 Ainda não veio nos visitar? Ganhe 10% OFF na primeira experiência. Use BEMVINDO10.', active: true },
    { id: 'desc_004', categoria: 'desconto', titulo: 'Aniversário da casa', texto: '🎉 Estamos de aniversário! A casa toda com 25% OFF esta semana.', active: false },
    { id: 'desc_005', categoria: 'desconto', titulo: 'Grupos (4+)', texto: '👥 Vindo em grupo? Mesas de 4+ pessoas ganham 12% OFF. Reserve com antecedência.', active: true },
    { id: 'aniv_001', categoria: 'aniversario', titulo: 'Parabéns + sobremesa', texto: '🎂 Parabéns! Para comemorar, sua sobremesa é por nossa conta na próxima visita.', active: true },
    { id: 'aniv_002', categoria: 'aniversario', titulo: 'Lembrete 3 dias antes', texto: '🎈 Seu aniversário está chegando! Que tal reservar uma mesa especial pra comemorar?', active: true },
    { id: 'aniv_003', categoria: 'aniversario', titulo: 'Convite para comemorar', texto: '🍱 Comemore seu aniversário conosco! Traga até 5 amigos e todos ganham um aperitivo cortesia.', active: false },
    { id: 'aniv_004', categoria: 'aniversario', titulo: 'Cupom válido 7 dias', texto: '🎁 Seu cupom de aniversário (20% OFF) é válido pelos próximos 7 dias!', active: true },
    { id: 'res_001', categoria: 'reserva', titulo: 'Lembrete de reserva', texto: '⏰ Passando para lembrar da sua reserva hoje. Qualquer mudança, é só chamar no WhatsApp.', active: true },
    { id: 'res_002', categoria: 'reserva', titulo: 'Pós-visita + avaliação', texto: '🙏 Obrigado pela visita! Como foi sua experiência? Sua avaliação ajuda muito a gente.', active: true },
    { id: 'nov_001', categoria: 'novidade', titulo: 'Novo prato no cardápio', texto: '🍜 Novidade no cardápio! Chegou o novo Omakase do chef. Vem provar!', active: true },
    { id: 'nov_002', categoria: 'evento', titulo: 'Noite do rodízio', texto: '🥢 Quinta-feira é noite de rodízio especial com harmonização de sakê. Vagas limitadas!', active: false },
    { id: 'nov_003', categoria: 'fidelidade', titulo: 'Pontos acumulados', texto: '⭐ Você já acumulou pontos no nosso programa de fidelidade. Falta pouco pro próximo prêmio!', active: true },
    { id: 'nov_004', categoria: 'feedback', titulo: 'Pesquisa de satisfação', texto: '📝 Sua opinião importa! Responda 3 perguntinhas rápidas sobre sua última visita.', active: false },
    { id: 'nov_005', categoria: 'reengajamento', titulo: 'Sentimos sua falta', texto: '👋 Faz tempo que não te vemos por aqui! Que tal um cupom de 15% OFF pra voltar?', active: true },
    { id: 'nov_006', categoria: 'data_comemorativa', titulo: 'Dia Mundial do Sushi', texto: '🍣 Hoje é o Dia Mundial do Sushi! Viemos comemorar com um combo especial só por hoje.', active: true },
    { id: 'nov_007', categoria: 'delivery', titulo: 'Frete grátis', texto: '🛵 Hoje o frete é por nossa conta em pedidos acima de R$ 80. Aproveita!', active: true },
    { id: 'nov_008', categoria: 'evento', titulo: 'Ano Novo Japonês', texto: '🎍 Feliz Shogatsu! Venha celebrar o Ano Novo Japonês com o nosso menu especial de temporada.', active: false },
    { id: 'nov_009', categoria: 'novidade', titulo: 'Combo executivo', texto: '🍱 Novo combo executivo para o almoço, prontinho em 15 minutos. Peça pelo app!', active: true },
  ],
};

// ─── Leitura dos arquivos JSON antigos, usada só para migrar dados de quem já
// tinha o sistema rodando na versão anterior (arquivo) pra dentro do banco,
// uma única vez, na primeira execução com DATABASE_URL configurada. ───
function readLegacyJSON(filename, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA_DIR, filename), 'utf8')); }
  catch (e) { return fallback; }
}

// ═══════════════════════════════════════════════════════════
// SCHEMA
// ═══════════════════════════════════════════════════════════
async function initSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS settings (
      key         TEXT PRIMARY KEY,
      value       JSONB NOT NULL,
      updated_at  TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS menu_categories (
      id        TEXT PRIMARY KEY,
      icon      TEXT DEFAULT '',
      title     TEXT NOT NULL,
      note      TEXT DEFAULT '',
      position  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS menu_items (
      id           SERIAL PRIMARY KEY,
      category_id  TEXT REFERENCES menu_categories(id) ON DELETE CASCADE,
      name         TEXT NOT NULL,
      description  TEXT DEFAULT '',
      price        NUMERIC(10,2) DEFAULT 0,
      qty          TEXT DEFAULT '',
      badge        TEXT DEFAULT '',
      image        TEXT DEFAULT '',
      stations     JSONB DEFAULT '["cozinha"]',
      available    BOOLEAN DEFAULT true,
      variants     JSONB DEFAULT '[]',
      position     INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_menu_items_category ON menu_items(category_id);

    -- Reservada para adicionais/opcionais normalizados por item no futuro.
    -- Hoje os "adicionais com preço extra" já são cobertos por menu_items.variants,
    -- então esta tabela existe pronta pra uso mas pode ficar vazia.
    CREATE TABLE IF NOT EXISTS menu_extras (
      id        SERIAL PRIMARY KEY,
      item_id   INTEGER REFERENCES menu_items(id) ON DELETE CASCADE,
      name      TEXT NOT NULL,
      price     NUMERIC(10,2) DEFAULT 0,
      position  INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS customers (
      phone         TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      pin_hash      TEXT NOT NULL,
      last_address  TEXT DEFAULT '',
      recovery      JSONB DEFAULT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id            TEXT PRIMARY KEY,
      ticket_number INTEGER,
      phone         TEXT,
      customer_name TEXT,
      status        TEXT DEFAULT 'novo',
      pay_method    TEXT,
      fee           NUMERIC(10,2) DEFAULT 0,
      discount      NUMERIC(10,2) DEFAULT 0,
      coupon_code   TEXT,
      total         NUMERIC(10,2) DEFAULT 0,
      data          JSONB NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(phone);
    CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

    CREATE TABLE IF NOT EXISTS order_items (
      id        SERIAL PRIMARY KEY,
      order_id  TEXT REFERENCES orders(id) ON DELETE CASCADE,
      name      TEXT,
      price     NUMERIC(10,2),
      qty       INTEGER,
      stations  JSONB DEFAULT '[]'
    );
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

    CREATE TABLE IF NOT EXISTS delivery_zones (
      id        SERIAL PRIMARY KEY,
      kind      TEXT NOT NULL, -- 'cep' | 'bairro'
      matcher   TEXT NOT NULL, -- prefixo do CEP ou nome do bairro
      label     TEXT DEFAULT '',
      fee       NUMERIC(10,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS printers (
      station  TEXT PRIMARY KEY, -- cozinha | sushibar | bar | caixa
      label    TEXT,
      method   TEXT DEFAULT 'navegador',
      ip       TEXT DEFAULT '',
      port     INTEGER DEFAULT 9100,
      device   TEXT DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS users (
      username  TEXT PRIMARY KEY,
      password  TEXT NOT NULL,
      role      TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS coupons (
      code         TEXT PRIMARY KEY,
      type         TEXT NOT NULL,
      value        NUMERIC(10,2) DEFAULT 0,
      active       BOOLEAN DEFAULT true,
      expires_at   TIMESTAMPTZ,
      usage_limit  INTEGER DEFAULT 0,
      used_count   INTEGER DEFAULT 0,
      min_order    NUMERIC(10,2) DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint    TEXT PRIMARY KEY,
      phone       TEXT,
      subscription JSONB NOT NULL,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
    CREATE INDEX IF NOT EXISTS idx_push_subs_phone ON push_subscriptions(phone);

    CREATE TABLE IF NOT EXISTS logs (
      id          SERIAL PRIMARY KEY,
      event       TEXT NOT NULL,
      detail      JSONB,
      created_at  TIMESTAMPTZ DEFAULT now()
    );
  `);

  // ── Auto-reparo de schema: como a tabela `customers` já existia numa versão
  // anterior deste projeto (antes do database.js), "CREATE TABLE IF NOT EXISTS"
  // não mexe nela se já existir — então garantimos aqui, coluna por coluna, que
  // tudo que o código precisa está presente, não importa o que já existia antes.
  await pool.query(`
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS name TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS pin_hash TEXT;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS last_address TEXT DEFAULT '';
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS recovery JSONB;
    ALTER TABLE customers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now();
  `);

  // Log de diagnóstico: mostra nos logs do Render exatamente quais colunas a
  // tabela customers tem agora, pra confirmar (ou descartar) problema de schema.
  try {
    const { rows: cols } = await pool.query(
      `SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'customers' ORDER BY ordinal_position`
    );
    console.log('🔍 Colunas atuais da tabela customers:', cols.map(c => `${c.column_name}(${c.data_type}${c.is_nullable === 'NO' ? ', obrigatório' : ''})`).join(', '));
  } catch (e) { console.error('[diagnóstico] não consegui listar colunas de customers:', e.message); }
  // ou seja, só na primeiríssima vez que o banco é preparado. Depois disso,
  // sempre lê/grava só no banco. ──
  const { rows } = await pool.query(`SELECT 1 FROM settings WHERE key = 'cfg'`);
  if (!rows.length) {
    const legacyConfig = readLegacyJSON('config.json', null); // sistema antigo, se existir
    const seedCfg = (legacyConfig && legacyConfig.cfg) || DEFAULT_CFG;
    const seedMenu = (legacyConfig && legacyConfig.menu) || DEFAULT_MENU;
    await pool.query(`INSERT INTO settings (key, value) VALUES ('cfg', $1)`, [JSON.stringify(seedCfg)]);
    await saveMenu(normalizeMenuShape(seedMenu));

    const legacyOrders = readLegacyJSON('orders.json', []);
    if (Array.isArray(legacyOrders) && legacyOrders.length) await importLegacyOrders(legacyOrders);

    const legacyCustomers = readLegacyJSON('customers.json', []);
    if (Array.isArray(legacyCustomers) && legacyCustomers.length) await replaceAllCustomers(legacyCustomers);

    console.log(`✅ Banco inicializado${legacyConfig ? ' (dados migrados de data/*.json)' : ' (seed padrão)'}.`);
  }

  const { rows: campRows } = await pool.query(`SELECT 1 FROM settings WHERE key = 'campaigns'`);
  if (!campRows.length) {
    const legacyCampaigns = readLegacyJSON('campaigns.json', DEFAULT_CAMPANHAS);
    await pool.query(`INSERT INTO settings (key, value) VALUES ('campaigns', $1)`, [JSON.stringify(legacyCampaigns)]);
  }

  const legacySubs = readLegacyJSON('push-subs.json', []);
  if (Array.isArray(legacySubs) && legacySubs.length) {
    for (const s of legacySubs) {
      await pool.query(
        `INSERT INTO push_subscriptions (endpoint, phone, subscription, created_at) VALUES ($1,$2,$3,$4)
         ON CONFLICT (endpoint) DO NOTHING`,
        [s.endpoint, s.phone || '', JSON.stringify(s.subscription), s.createdAt || new Date().toISOString()]
      );
    }
  }
}

// ═══════════════════════════════════════════════════════════
// CONFIG / SETTINGS
// ═══════════════════════════════════════════════════════════
function isWithinSchedule(openTime, closeTime) {
  if (!openTime || !closeTime) return true;
  const nowStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const nowMin = toMinutes(nowStr), openMin = toMinutes(openTime), closeMin = toMinutes(closeTime);
  if (openMin === closeMin) return true;
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
}

function normalizeMenuShape(menu) {
  const validStations = ['cozinha', 'sushibar', 'bar'];
  return (menu || []).map(sec => ({
    ...sec,
    items: (sec.items || []).map(it => {
      const base = { station: 'cozinha', available: true, variants: [], ...it };
      let stations = Array.isArray(base.stations) ? base.stations.filter(s => validStations.includes(s)) : [];
      if (!stations.length) stations = [validStations.includes(base.station) ? base.station : 'cozinha'];
      const { station, ...rest } = base;
      return { ...rest, stations: [...new Set(stations)] };
    })
  }));
}

async function getSetting(key, fallback) {
  const { rows } = await pool.query(`SELECT value FROM settings WHERE key = $1`, [key]);
  return rows.length ? rows[0].value : fallback;
}
async function setSetting(key, value) {
  await pool.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1,$2,now())
     ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = now()`,
    [key, JSON.stringify(value)]
  );
}

async function getMenu() {
  const { rows: cats } = await pool.query(`SELECT * FROM menu_categories ORDER BY position ASC, id ASC`);
  const { rows: items } = await pool.query(`SELECT * FROM menu_items ORDER BY category_id ASC, position ASC, id ASC`);
  return cats.map(c => ({
    id: c.id, icon: c.icon || '', title: c.title, note: c.note || '',
    items: items.filter(i => i.category_id === c.id).map(i => ({
      name: i.name,
      desc: i.description || '',
      price: Number(i.price) || 0,
      qty: i.qty || '',
      badge: i.badge || '',
      image: i.image || '',
      stations: i.stations || ['cozinha'],
      available: i.available !== false,
      variants: i.variants || []
    }))
  }));
}

// Substitui TODO o cardápio de uma vez (mesmo comportamento de antes: o painel
// sempre manda o cardápio inteiro pra salvar — aqui só troca onde ele é gravado).
async function saveMenu(menu) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM menu_categories'); // cascata apaga menu_items/menu_extras também
    let catPos = 0;
    for (const sec of normalizeMenuShape(menu)) {
      const catId = String(sec.id || ('cat' + catPos));
      await client.query(
        `INSERT INTO menu_categories (id, icon, title, note, position) VALUES ($1,$2,$3,$4,$5)`,
        [catId, sec.icon || '', sec.title || '', sec.note || '', catPos++]
      );
      let itemPos = 0;
      for (const it of (sec.items || [])) {
        await client.query(
          `INSERT INTO menu_items (category_id, name, description, price, qty, badge, image, stations, available, variants, position)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
          [catId, it.name || '', it.desc || '', Number(it.price) || 0, it.qty || '', it.badge || '', it.image || '',
           JSON.stringify(it.stations || ['cozinha']), it.available !== false, JSON.stringify(it.variants || []), itemPos++]
        );
      }
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// Lê config + cardápio juntos, já preenchidos com os defaults — equivalente
// direto ao antigo readConfig() (mesma forma de retorno: { cfg, menu }).
async function getConfig() {
  const savedCfg = await getSetting('cfg', DEFAULT_CFG);
  const cfg = {
    ...DEFAULT_CFG,
    ...savedCfg,
    stations: { ...DEFAULT_CFG.stations, ...(savedCfg.stations || {}) },
    labels: { ...DEFAULT_CFG.labels, ...(savedCfg.labels || {}) },
    uiFonts: { ...DEFAULT_CFG.uiFonts, ...(savedCfg.uiFonts || {}) },
    theme: { ...DEFAULT_CFG.theme, ...(savedCfg.theme || {}) },
    cancelReasons: savedCfg.cancelReasons || DEFAULT_CFG.cancelReasons,
    slides: savedCfg.slides || DEFAULT_CFG.slides,
    users: (Array.isArray(savedCfg.users) && savedCfg.users.length) ? savedCfg.users : DEFAULT_CFG.users,
    sms: { ...DEFAULT_CFG.sms, ...(savedCfg.sms || {}) },
    vapid: { ...DEFAULT_CFG.vapid, ...(savedCfg.vapid || {}) },
    schedule: { ...DEFAULT_CFG.schedule, ...(savedCfg.schedule || {}) }
  };
  if (cfg.schedule && cfg.schedule.enabled) {
    cfg.open = isWithinSchedule(cfg.schedule.openTime, cfg.schedule.closeTime) ? 1 : 0;
  }
  const menu = await getMenu();
  return { cfg, menu };
}

// Equivalente direto ao antigo writeJSON(CONFIG_FILE, { cfg, menu }).
async function saveConfig({ cfg, menu }) {
  if (cfg) await setSetting('cfg', cfg);
  if (menu) await saveMenu(menu);
}

// ═══════════════════════════════════════════════════════════
// CAMPANHAS (notifications.js)
// ═══════════════════════════════════════════════════════════
async function getCampaigns() {
  const saved = await getSetting('campaigns', DEFAULT_CAMPANHAS);
  return { ...DEFAULT_CAMPANHAS, ...saved, mensagens: saved.mensagens || DEFAULT_CAMPANHAS.mensagens };
}
async function saveCampaigns(data) { await setSetting('campaigns', data); }

async function addPushSubscription(phone, subscription) {
  const normPhone = String(phone || '').replace(/\D/g, '');
  await pool.query(
    `INSERT INTO push_subscriptions (endpoint, phone, subscription, created_at) VALUES ($1,$2,$3,now())
     ON CONFLICT (endpoint) DO UPDATE SET phone = $2, subscription = $3`,
    [subscription.endpoint, normPhone, JSON.stringify(subscription)]
  );
}
async function removePushSubscription(endpoint) {
  await pool.query(`DELETE FROM push_subscriptions WHERE endpoint = $1`, [endpoint]);
}
async function pushSubscriptionsByPhone(phone) {
  const normPhone = String(phone || '').replace(/\D/g, '');
  const { rows } = await pool.query(`SELECT * FROM push_subscriptions WHERE phone = $1`, [normPhone]);
  return rows.map(r => ({ phone: r.phone, endpoint: r.endpoint, subscription: r.subscription, createdAt: r.created_at }));
}
async function allPushPhones() {
  const { rows } = await pool.query(`SELECT DISTINCT phone FROM push_subscriptions WHERE phone <> ''`);
  return rows.map(r => r.phone);
}

// ═══════════════════════════════════════════════════════════
// CLIENTES
// ═══════════════════════════════════════════════════════════
function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }
function rowToCustomer(row) {
  if (!row) return null;
  return {
    phone: row.phone, name: row.name, pinHash: row.pin_hash,
    lastAddress: row.last_address || '', recovery: row.recovery || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}
async function findCustomerByPhone(phone) {
  const { rows } = await pool.query('SELECT * FROM customers WHERE phone=$1', [normalizePhone(phone)]);
  return rowToCustomer(rows[0]);
}
async function createCustomer(c) {
  const record = { ...c, phone: normalizePhone(c.phone) };
  await pool.query(
    `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6)`,
    [record.phone, record.name, record.pinHash, record.lastAddress || '', record.recovery ? JSON.stringify(record.recovery) : null, record.createdAt || new Date().toISOString()]
  );
  return record;
}
async function updateCustomer(phone, fields) {
  const p = normalizePhone(phone);
  const cols = { name: 'name', pinHash: 'pin_hash', lastAddress: 'last_address', recovery: 'recovery' };
  const sets = [], vals = [];
  let i = 1;
  for (const key of Object.keys(fields)) {
    if (!cols[key]) continue;
    sets.push(`${cols[key]}=$${i++}`);
    vals.push(key === 'recovery' ? (fields[key] ? JSON.stringify(fields[key]) : null) : fields[key]);
  }
  if (!sets.length) return;
  vals.push(p);
  await pool.query(`UPDATE customers SET ${sets.join(', ')} WHERE phone=$${i}`, vals);
}
async function listCustomers() {
  const { rows } = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  return rows.map(rowToCustomer);
}
async function replaceAllCustomers(arr) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('DELETE FROM customers');
    for (const c of arr) {
      await client.query(
        `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at) VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO NOTHING`,
        [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || new Date().toISOString()]
      );
    }
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

// ═══════════════════════════════════════════════════════════
// PEDIDOS
//
// Cada pedido continua sendo um objeto único (igual ao formato que o
// server.js e o painel já usam) gravado na coluna `data` (JSONB) — isso
// preserva 100% do formato e da lógica existentes. As colunas típicas
// (status, phone, total, etc.) e a tabela order_items são preenchidas
// em paralelo, pra permitir relatórios/consultas em SQL puro depois.
// ═══════════════════════════════════════════════════════════
function rowToOrder(row) { return row.data; }

async function getOrders() {
  const { rows } = await pool.query(`SELECT data FROM orders ORDER BY created_at DESC`);
  return rows.map(rowToOrder);
}

async function upsertOrderRow(client, order) {
  await client.query(
    `INSERT INTO orders (id, ticket_number, phone, customer_name, status, pay_method, fee, discount, coupon_code, total, data, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     ON CONFLICT (id) DO UPDATE SET
       ticket_number=$2, phone=$3, customer_name=$4, status=$5, pay_method=$6,
       fee=$7, discount=$8, coupon_code=$9, total=$10, data=$11`,
    [
      order.id, order.ticketNumber || null, normalizePhone(order.phone), order.name || '',
      order.status || 'novo', order.payMethod || '', Number(order.fee) || 0, Number(order.discount) || 0,
      order.couponCode || '', Number(order.total) || 0, JSON.stringify(order), order.createdAt || new Date().toISOString()
    ]
  );
  await client.query(`DELETE FROM order_items WHERE order_id = $1`, [order.id]);
  for (const it of (order.items || [])) {
    await client.query(
      `INSERT INTO order_items (order_id, name, price, qty, stations) VALUES ($1,$2,$3,$4,$5)`,
      [order.id, it.name || '', Number(it.price) || 0, Number(it.qty) || 1, JSON.stringify(it.stations || [])]
    );
  }
}

// Cria um pedido novo (usado por POST /api/orders).
async function createOrder(order) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await upsertOrderRow(client, order);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
  return order;
}

// Substitui a lista inteira de pedidos — usado nos poucos lugares que hoje
// fazem "lê tudo, mexe no array em JS, grava tudo de novo" (ex: aceitar/mudar
// status, restaurar backup, apagar antigos). Mantém exatamente esse padrão,
// só trocando o destino do arquivo pro banco, dentro de uma transação.
async function saveOrders(orders) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT id FROM orders`);
    const currentIds = new Set(rows.map(r => r.id));
    const newIds = new Set(orders.map(o => o.id));
    for (const id of currentIds) {
      if (!newIds.has(id)) await client.query(`DELETE FROM orders WHERE id=$1`, [id]);
    }
    for (const order of orders) await upsertOrderRow(client, order);
    await client.query('COMMIT');
  } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
}

async function logEvent(event, detail) {
  try { await pool.query(`INSERT INTO logs (event, detail) VALUES ($1,$2)`, [event, JSON.stringify(detail || {})]); }
  catch (e) { console.error('[logs] falha ao gravar log (não crítico):', e.message); }
}

module.exports = {
  initSchema,
  getConfig, saveConfig, getMenu, saveMenu,
  getCampaigns, saveCampaigns,
  addPushSubscription, removePushSubscription, pushSubscriptionsByPhone, allPushPhones,
  findCustomerByPhone, createCustomer, updateCustomer, listCustomers, replaceAllCustomers,
  getOrders, createOrder, saveOrders,
  logEvent,
  useDB: true // mantido por compatibilidade com o código que checava customerDB.useDB
};
