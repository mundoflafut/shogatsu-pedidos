// ═══════════════════════════════════════════════════════════
// SHOGATSU · Servidor de Pedidos Online
// Node.js puro (sem dependências) — http, fs, crypto
// ═══════════════════════════════════════════════════════════
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

// ─── Config / Menu padrão (usados só na primeira execução) ───
const DEFAULT_CFG = {
  whats: '5522988683755', fee: 8, min: 60,
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras',
  hours: '18h30–23h', open: 1,
  adminPass: 'shogatsu2026',
  masterPass: 'shogatsuMaster2026',
  pixKey: '', pixName: 'Shogatsu Culinaria Oriental', pixCity: 'RIO DAS OSTRAS'
};
const DEFAULT_MENU = require('./default-menu.json');

// ─── Bootstrap dos arquivos de dados ───
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ cfg: DEFAULT_CFG, menu: DEFAULT_MENU }, null, 2));
}
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ─── Sessões admin (em memória) ───
const sessions = new Map(); // token -> expiresAt
function newSession() {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, Date.now() + 1000 * 60 * 60 * 12); // 12h
  return token;
}
function checkAuth(token) {
  if (!token) return false;
  const exp = sessions.get(token);
  if (!exp || exp < Date.now()) { sessions.delete(token); return false; }
  return true;
}

// ─── Clientes conectados via SSE (painel da cozinha) ───
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (e) {} }
}

// ─── PIX — geração do payload BR Code (copia-e-cola) ───
function crc16(payload) {
  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let b = 0; b < 8; b++) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xFFFF;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}
function tlv(id, value) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}
function sanitizePix(str, max) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase().slice(0, max) || 'NA';
}
function buildPixPayload({ pixKey, merchantName, merchantCity, amount, txid }) {
  if (!pixKey) return null;
  const gui = tlv('00', 'br.gov.bcb.pix');
  const key = tlv('01', pixKey.trim());
  const merchantAccount = tlv('26', gui + key);
  const mcc = tlv('52', '0000');
  const currency = tlv('53', '986');
  const value = amount != null ? tlv('54', Number(amount).toFixed(2)) : '';
  const country = tlv('58', 'BR');
  const name = tlv('59', sanitizePix(merchantName, 25));
  const city = tlv('60', sanitizePix(merchantCity, 15));
  const ref = tlv('05', sanitizePix(txid || 'PEDIDO', 25));
  const addData = tlv('62', ref);
  let payload = tlv('00', '01') + merchantAccount + mcc + currency + value + country + name + city + addData + '6304';
  return payload + crc16(payload);
}

// ─── Helpers HTTP ───
function sendJSON(res, status, obj) {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,OPTIONS'
  });
  res.end(body);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = '';
    req.on('data', c => { chunks += c; if (chunks.length > 8e6) req.destroy(); });
    req.on('end', () => { try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function getToken(req, query) {
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return query.token || null;
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon'
};

function serveStatic(req, res, pathname) {
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  if (!filePath.startsWith(PUBLIC_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const query = parsed.query;

  if (req.method === 'OPTIONS') { return sendJSON(res, 204, {}); }

  // ── GET /api/config — dados públicos do cardápio/config ──
  if (pathname === '/api/config' && req.method === 'GET') {
    const { cfg, menu } = readJSON(CONFIG_FILE);
    const { adminPass, masterPass, ...publicCfg } = cfg; // nunca vaza as senhas
    return sendJSON(res, 200, { cfg: publicCfg, menu });
  }

  // ── POST /api/config — admin salva config/cardápio ──
  if (pathname === '/api/config' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      const current = readJSON(CONFIG_FILE);
      const merged = {
        cfg: { ...current.cfg, ...body.cfg, adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass },
        menu: body.menu || current.menu
      };
      writeJSON(CONFIG_FILE, merged);
      broadcast('config-updated', {});
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/change-password — troca senha do painel (admin) ou senha master ──
  if (pathname === '/api/change-password' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { which, current: curPass, next } = await readBody(req);
      const field = which === 'master' ? 'masterPass' : 'adminPass';
      const data = readJSON(CONFIG_FILE);
      if (curPass !== data.cfg[field]) return sendJSON(res, 403, { error: 'senha atual incorreta' });
      if (!next || next.length < 4) return sendJSON(res, 400, { error: 'nova senha muito curta (mín. 4 caracteres)' });
      data.cfg[field] = next;
      writeJSON(CONFIG_FILE, data);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/upload — envia foto de um produto (admin) ──
  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { dataUrl } = await readBody(req);
      const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
      if (!m) return sendJSON(res, 400, { error: 'Formato inválido. Use PNG, JPG ou WEBP.' });
      const ext = m[1].toLowerCase() === 'jpeg' ? 'jpg' : m[1].toLowerCase();
      const buffer = Buffer.from(m[2], 'base64');
      if (buffer.length > 4 * 1024 * 1024) return sendJSON(res, 400, { error: 'Imagem muito grande (máx. 4MB).' });
      const filename = crypto.randomBytes(8).toString('hex') + '.' + ext;
      fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
      return sendJSON(res, 200, { url: '/uploads/' + filename });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/orders/purge — apaga pedidos antigos (exige senha master) ──
  if (pathname === '/api/orders/purge' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { masterPass, beforeDate } = await readBody(req);
      const data = readJSON(CONFIG_FILE);
      if (masterPass !== data.cfg.masterPass) return sendJSON(res, 403, { error: 'Senha master incorreta.' });
      if (!beforeDate) return sendJSON(res, 400, { error: 'Informe a data limite.' });
      const cutoff = new Date(beforeDate).getTime();
      let orders = readJSON(ORDERS_FILE);
      const before = orders.length;
      orders = orders.filter(o => new Date(o.createdAt).getTime() >= cutoff);
      writeJSON(ORDERS_FILE, orders);
      return sendJSON(res, 200, { ok: true, deleted: before - orders.length });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/reports — relatório de vendas (admin) ──
  if (pathname === '/api/reports' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const orders = readJSON(ORDERS_FILE);
    const from = query.from ? new Date(query.from + 'T00:00:00').getTime() : 0;
    const to = query.to ? new Date(query.to + 'T23:59:59').getTime() : Infinity;
    const filtered = orders.filter(o => {
      const t = new Date(o.createdAt).getTime();
      return t >= from && t <= to && o.status !== 'cancelado';
    });
    const totalOrders = filtered.length;
    const totalRevenue = filtered.reduce((s, o) => s + Number(o.total || 0), 0);
    const avgTicket = totalOrders ? totalRevenue / totalOrders : 0;
    const byPayMethod = {}, byDayMap = {}, itemsMap = {};
    filtered.forEach(o => {
      byPayMethod[o.payMethod] = (byPayMethod[o.payMethod] || 0) + Number(o.total || 0);
      const day = o.createdAt.slice(0, 10);
      if (!byDayMap[day]) byDayMap[day] = { date: day, revenue: 0, orders: 0 };
      byDayMap[day].revenue += Number(o.total || 0);
      byDayMap[day].orders++;
      (o.items || []).forEach(i => {
        if (!itemsMap[i.name]) itemsMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
        itemsMap[i.name].qty += i.qty;
        itemsMap[i.name].revenue += i.price * i.qty;
      });
    });
    const topItems = Object.values(itemsMap).sort((a, b) => b.qty - a.qty).slice(0, 15);
    const byDay = Object.values(byDayMap).sort((a, b) => a.date.localeCompare(b.date));
    return sendJSON(res, 200, { totalOrders, totalRevenue, avgTicket, byPayMethod, byDay, topItems });
  }

  // ── POST /api/login — autenticação do painel ──
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { password } = await readBody(req);
      const { cfg } = readJSON(CONFIG_FILE);
      if (password === cfg.adminPass) return sendJSON(res, 200, { token: newSession() });
      return sendJSON(res, 401, { error: 'senha incorreta' });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/pix — gera o copia-e-cola para um valor ──
  if (pathname === '/api/pix' && req.method === 'POST') {
    try {
      const { amount, txid } = await readBody(req);
      const { cfg } = readJSON(CONFIG_FILE);
      if (!cfg.pixKey) return sendJSON(res, 400, { error: 'PIX não configurado pelo restaurante' });
      const payload = buildPixPayload({
        pixKey: cfg.pixKey, merchantName: cfg.pixName, merchantCity: cfg.pixCity, amount, txid
      });
      const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload)}`;
      return sendJSON(res, 200, { payload, qrImg });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/orders — cria um novo pedido (cliente) ──
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { cfg } = readJSON(CONFIG_FILE);
      if (!Number(cfg.open)) return sendJSON(res, 400, { error: 'Restaurante fechado no momento.' });
      if (!body.items || !body.items.length) return sendJSON(res, 400, { error: 'Carrinho vazio.' });

      const orders = readJSON(ORDERS_FILE);
      const order = {
        id: 'SG' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        status: 'novo',
        mode: body.mode === 'retirada' ? 'retirada' : 'delivery',
        name: String(body.name || '').slice(0, 80),
        phone: String(body.phone || '').slice(0, 30),
        address: String(body.address || '').slice(0, 200),
        items: (body.items || []).slice(0, 60).map(i => ({
          name: String(i.name || '').slice(0, 80),
          qty: Math.max(1, parseInt(i.qty) || 1),
          price: Number(i.price) || 0
        })),
        obs: String(body.obs || '').slice(0, 300),
        payMethod: String(body.payMethod || '').slice(0, 20),
        troco: String(body.troco || '').slice(0, 20),
        subtotal: Number(body.subtotal) || 0,
        fee: Number(body.fee) || 0,
        total: Number(body.total) || 0
      };
      orders.unshift(order);
      writeJSON(ORDERS_FILE, orders);
      broadcast('new-order', order);
      return sendJSON(res, 201, { ok: true, order });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/orders — lista pedidos (painel, requer auth) ──
  if (pathname === '/api/orders' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    return sendJSON(res, 200, readJSON(ORDERS_FILE));
  }

  // ── PATCH /api/orders/:id — atualiza status (painel) ──
  if (pathname.startsWith('/api/orders/') && req.method === 'PATCH') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const id = pathname.split('/').pop();
    try {
      const { status } = await readBody(req);
      const valid = ['novo', 'preparando', 'saiu', 'entregue', 'cancelado'];
      if (!valid.includes(status)) return sendJSON(res, 400, { error: 'status inválido' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
      order.status = status;
      writeJSON(ORDERS_FILE, orders);
      broadcast('order-updated', order);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/track/:id — cliente acompanha status do próprio pedido (público) ──
  if (pathname.startsWith('/api/track/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
    const { name, phone, address, ...rest } = order;
    return sendJSON(res, 200, rest); // não expõe dados pessoais de novo, só status/itens/valores
  }

  // ── GET /api/stream — Server-Sent Events (painel em tempo real) ──
  if (pathname === '/api/stream' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) { res.writeHead(401); return res.end(); }
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    sseClients.add(res);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(keepAlive); sseClients.delete(res); });
    return;
  }

  // ── Arquivos estáticos (site do cliente + painel) ──
  if (req.method === 'GET') return serveStatic(req, res, pathname);

  res.writeHead(404); res.end('Not found');
});

server.listen(PORT, () => {
  console.log(`🍣 Shogatsu rodando em http://localhost:${PORT}`);
  console.log(`   Painel da cozinha: http://localhost:${PORT}/painel.html`);
});
