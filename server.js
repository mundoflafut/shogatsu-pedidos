// ═══════════════════════════════════════════════════════════
// SHOGATSU · Servidor de Pedidos Online
// Node.js puro (sem dependências) — http, fs, crypto
// ═══════════════════════════════════════════════════════════
const http = require('http');
const https = require('https');
const net = require('net');
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
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

// ─── Config / Menu padrão (usados só na primeira execução) ───
const DEFAULT_CFG = {
  whats: '552227641333', storePhone: '(22) 2764-1333', fee: 8, min: 60,
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras',
  hours: '18h30–23h', open: 1,
  adminPass: 'shogatsu2026',
  masterPass: 'shogatsuMaster2026',
  logoUrl: '',
  pixKey: '', pixName: 'Shogatsu Culinaria Oriental', pixCity: 'RIO DAS OSTRAS',
  // ── Impressão do comprovante ──
  printFont: 'monospace',      // 'monospace' | 'sans-serif' | 'serif'
  printSize: 14,                // tamanho da fonte em px
  printColor: '#000000',        // cor do texto
  // ── Logotipo ──
  logoShape: 'retangular',      // 'redondo' | 'quadrado' | 'retangular'
  logoSize: 40,                  // altura em px
  // ── Impressoras por estação (vias separadas) ──
  stations: {
    cozinha:  { label: 'Cozinha',  method: 'navegador', ip: '', port: 9100, device: '' },
    sushibar: { label: 'Sushibar', method: 'navegador', ip: '', port: 9100, device: '' },
    bar:      { label: 'Bar',      method: 'navegador', ip: '', port: 9100, device: '' },
    caixa:    { label: 'Caixa',    method: 'navegador', ip: '', port: 9100, device: '' }
  },
  // ── Motivos de cancelamento/recusa (chips rápidos no painel) ──
  cancelReasons: ['Item em falta', 'Fora da área de entrega', 'Pedido duplicado', 'Cliente desistiu', 'Loja fechada no momento'],
  // ── Aparência do painel (tamanho de fonte por aba) ──
  uiFonts: { pedidos: 13, config: 13, clientes: 13, relatorios: 13 },
  // ── Paleta de cores do site do cliente ──
  theme: { primary: '#c9a84c', accent: '#c0392b', bg: '#0a0a0a' },
  // ── Slider de capa (imagens rotativas no topo do site) ──
  slides: [],
  // ── Taxa de entrega por distância ──
  feeMode: 'fixo',            // 'fixo' (taxa única) ou 'distancia' (calculada por km)
  storeLat: null, storeLng: null, // coordenadas do restaurante (preenchidas pelo painel)
  feeBaseKm: 2,                // km inclusos na taxa base
  feeBaseValue: 8,             // R$ da taxa até feeBaseKm
  feePerKm: 2.5,                // R$ por km excedente
  feeMaxKm: 12,                 // raio máximo de entrega (0 = sem limite)
  feeRound: 0.5                 // arredonda a taxa para múltiplos disso
};
const DEFAULT_MENU = require('./default-menu.json');

// ─── Bootstrap dos arquivos de dados ───
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(CONFIG_FILE)) {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ cfg: DEFAULT_CFG, menu: DEFAULT_MENU }, null, 2));
}
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, '[]');
if (!fs.existsSync(CUSTOMERS_FILE)) fs.writeFileSync(CUSTOMERS_FILE, '[]');

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// Lê o config.json e preenche com os valores padrão quaisquer campos novos que
// ainda não existiam (ex: sites já em produção antes desta atualização) —
// sem precisar apagar ou resetar nada que o restaurante já configurou.
function readConfig() {
  const data = readJSON(CONFIG_FILE);
  const cfg = {
    ...DEFAULT_CFG,
    ...data.cfg,
    stations: { ...DEFAULT_CFG.stations, ...(data.cfg.stations || {}) },
    uiFonts: { ...DEFAULT_CFG.uiFonts, ...(data.cfg.uiFonts || {}) },
    theme: { ...DEFAULT_CFG.theme, ...(data.cfg.theme || {}) },
    cancelReasons: data.cfg.cancelReasons || DEFAULT_CFG.cancelReasons,
    slides: data.cfg.slides || DEFAULT_CFG.slides
  };
  return { cfg, menu: normalizeMenu(data.menu) };
}

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

// ─── Contas de cliente (telefone + senha de 4 dígitos) ───
// Mantém só dígitos no telefone, pra "22999991234" e "(22) 99999-1234" serem o mesmo cliente.
function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }

function hashPin(phone, pin) {
  return crypto.createHash('sha256').update(normalizePhone(phone) + ':' + String(pin) + ':shogatsu-salt').digest('hex');
}

function findCustomer(customers, phone) {
  const p = normalizePhone(phone);
  return customers.find(c => c.phone === p);
}

// Calcula quantos pedidos e o último pedido de um cliente, direto do orders.json
// (evita manter dois lugares com a mesma contagem fora de sincronia).
function customerStats(phone, orders) {
  const p = normalizePhone(phone);
  const mine = orders.filter(o => normalizePhone(o.phone) === p && o.status !== 'cancelado');
  return {
    orderCount: mine.length,
    lastOrderAt: mine.length ? mine[0].createdAt : null // orders.json fica sempre com o mais novo primeiro (unshift)
  };
}

// ─── Clientes conectados via SSE (painel da cozinha) ───
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (e) {} }
}

// ─── Geolocalização / taxa por distância ───
// Faz um GET https e retorna o corpo já parseado como JSON, com timeout.
function httpsGetJSON(urlStr, headers = {}, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          return reject(new Error('HTTP ' + res.statusCode));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

// CEP (só dígitos) → endereço aproximado via ViaCEP (gratuito, sem chave)
async function lookupCEP(cep) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const data = await httpsGetJSON(`https://viacep.com.br/ws/${clean}/json/`);
  if (!data || data.erro) return null;
  return { street: data.logradouro || '', hood: data.bairro || '', city: data.localidade || '', uf: data.uf || '' };
}

// Endereço em texto → { lat, lng } via Nominatim/OpenStreetMap (gratuito, sem chave)
async function geocodeAddress(addressText) {
  const q = encodeURIComponent(addressText);
  const data = await httpsGetJSON(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`,
    { 'User-Agent': 'ShogatsuPedidosOnline/1.0 (contato via painel do restaurante)' }
  );
  if (!Array.isArray(data) || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

// Distância em linha reta entre dois pontos (km)
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Aplica a fórmula de taxa (base + excedente por km, arredondada)
function calcFeeByDistance(cfg, distanceKm) {
  const baseKm = Number(cfg.feeBaseKm) || 0;
  const extraKm = Math.max(0, distanceKm - baseKm);
  let fee = (Number(cfg.feeBaseValue) || 0) + extraKm * (Number(cfg.feePerKm) || 0);
  const round = Number(cfg.feeRound) || 0;
  if (round > 0) fee = Math.ceil(fee / round) * round;
  return Math.round(fee * 100) / 100;
}

// ─── Impressão — rede (ESC/POS via TCP) e USB (dispositivo local) ───
// Comandos ESC/POS básicos
const ESC = {
  init: '\x1B\x40',
  boldOn: '\x1B\x45\x01', boldOff: '\x1B\x45\x00',
  center: '\x1B\x61\x01', left: '\x1B\x61\x00',
  doubleOn: '\x1D\x21\x11', doubleOff: '\x1D\x21\x00',
  cut: '\x1D\x56\x01',
  feed: '\n\n\n'
};

// Monta o texto puro do ticket (usado tanto na pré-visualização quanto na impressão real)
function buildTicketText(lines) {
  return ESC.init + lines.join('\n') + ESC.feed + ESC.cut;
}

// Envia bytes brutos para uma impressora de rede (porta 9100 é o padrão da maioria)
function sendNetworkPrint(ip, port, text) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: port || 9100, timeout: 5000 }, () => {
      socket.write(Buffer.from(text, 'binary'), () => socket.end());
    });
    socket.on('close', () => resolve(true));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout ao conectar na impressora')); });
    socket.on('error', reject);
  });
}

// Envia para um dispositivo USB local (ex: /dev/usb/lp0) — só funciona quando o
// servidor roda na mesma máquina física conectada à impressora (ex: Raspberry Pi/PC local).
function sendUSBPrint(devicePath, text) {
  return new Promise((resolve, reject) => {
    fs.writeFile(devicePath, Buffer.from(text, 'binary'), (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

// Preenche valores padrão em itens antigos do cardápio (sem alterar o arquivo salvo)
function normalizeMenu(menu) {
  return (menu || []).map(sec => ({
    ...sec,
    items: (sec.items || []).map(it => ({ station: 'cozinha', available: true, ...it }))
  }));
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
    const { cfg, menu } = readConfig();
    const { adminPass, masterPass, ...publicCfg } = cfg; // nunca vaza as senhas
    return sendJSON(res, 200, { cfg: publicCfg, menu });
  }

  // ── POST /api/config — admin salva config/cardápio ──
  if (pathname === '/api/config' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      const current = readConfig();
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
      const data = readConfig();
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
      const data = readConfig();
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
      const { cfg } = readConfig();
      if (password === cfg.adminPass) return sendJSON(res, 200, { token: newSession() });
      return sendJSON(res, 401, { error: 'senha incorreta' });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/pix — gera o copia-e-cola para um valor ──
  if (pathname === '/api/pix' && req.method === 'POST') {
    try {
      const { amount, txid } = await readBody(req);
      const { cfg } = readConfig();
      if (!cfg.pixKey) return sendJSON(res, 400, { error: 'PIX não configurado pelo restaurante' });
      const payload = buildPixPayload({
        pixKey: cfg.pixKey, merchantName: cfg.pixName, merchantCity: cfg.pixCity, amount, txid
      });
      const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload)}`;
      return sendJSON(res, 200, { payload, qrImg });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/delivery-fee — cliente informa CEP/endereço, taxa é calculada pela distância ──
  if (pathname === '/api/delivery-fee' && req.method === 'POST') {
    try {
      const { cep, street, hood, city, uf } = await readBody(req);
      const { cfg } = readConfig();

      // Se o restaurante não usa taxa por distância (ou ainda não configurou as
      // coordenadas da loja), devolve a taxa padrão direto — sem chamar nada externo.
      if (cfg.feeMode !== 'distancia' || !cfg.storeLat || !cfg.storeLng) {
        return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo', distanceKm: null });
      }

      try {
        let addrStreet = String(street || '').trim();
        let addrHood = String(hood || '').trim();
        let addrCity = String(city || '').trim();
        let addrUf = String(uf || '').trim();

        // Se veio CEP, usa ele para completar/confirmar bairro-cidade-UF (mais preciso)
        if (cep) {
          const viacep = await lookupCEP(cep);
          if (viacep) {
            addrHood = addrHood || viacep.hood;
            addrCity = addrCity || viacep.city;
            addrUf = addrUf || viacep.uf;
            if (!addrStreet) addrStreet = viacep.street;
          }
        }

        const queryText = [addrStreet, addrHood, addrCity, addrUf, 'Brasil'].filter(Boolean).join(', ');
        if (!queryText || (!addrStreet && !addrHood && !cep)) {
          return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
        }

        const geo = await geocodeAddress(queryText);
        if (!geo) {
          return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
        }

        const distanceKm = haversineKm(Number(cfg.storeLat), Number(cfg.storeLng), geo.lat, geo.lng);
        const maxKm = Number(cfg.feeMaxKm) || 0;
        if (maxKm > 0 && distanceKm > maxKm) {
          return sendJSON(res, 200, { error: 'fora_area', distanceKm: Math.round(distanceKm * 10) / 10, maxKm });
        }

        const fee = calcFeeByDistance(cfg, distanceKm);
        return sendJSON(res, 200, { fee, mode: 'distancia', distanceKm: Math.round(distanceKm * 10) / 10 });
      } catch (geoErr) {
        // Qualquer falha nas APIs externas (fora do ar, CEP não encontrado, etc.)
        // não pode travar o pedido — cai para a taxa padrão configurada.
        return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
      }
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/admin/geocode-store — painel localiza e salva as coordenadas da loja ──
  if (pathname === '/api/admin/geocode-store' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      const data = readConfig();
      const address = String(body.address || data.cfg.addr || '').trim();
      if (!address) return sendJSON(res, 400, { error: 'Informe o endereço do restaurante.' });
      const geo = await geocodeAddress(address + ', Brasil');
      if (!geo) return sendJSON(res, 404, { error: 'Não conseguimos localizar esse endereço. Tente descrevê-lo de outro jeito (ex: rua, número, bairro, cidade).' });
      data.cfg.storeLat = geo.lat;
      data.cfg.storeLng = geo.lng;
      writeJSON(CONFIG_FILE, data);
      return sendJSON(res, 200, { lat: geo.lat, lng: geo.lng, label: geo.label });
    } catch (e) { return sendJSON(res, 500, { error: 'Erro ao localizar endereço. Tente novamente.' }); }
  }

  // ── POST /api/print — imprime a via de uma estação para um pedido ──
  if (pathname === '/api/print' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { orderId, station } = await readBody(req);
      const st = ['cozinha', 'sushibar', 'bar', 'caixa'].includes(station) ? station : null;
      if (!st) return sendJSON(res, 400, { error: 'Via inválida.' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJSON(res, 404, { error: 'Pedido não encontrado.' });
      const { cfg } = readConfig();

      const items = st === 'caixa' ? order.items : order.items.filter(i => (i.stations || [i.station || 'cozinha']).includes(st));
      if (!items.length) return sendJSON(res, 200, { ok: true, printed: false, skipped: true, order, station: st });

      const printerCfg = cfg.stations[st] || { method: 'navegador' };
      if (printerCfg.method === 'navegador') {
        // O navegador do cliente (painel) monta e imprime o ticket — servidor só confirma os dados.
        return sendJSON(res, 200, { ok: true, printed: false, order, station: st, method: 'navegador' });
      }

      const lines = [];
      lines.push(ESC.center + ESC.boldOn + 'SHOGATSU' + ESC.boldOff + ESC.left);
      lines.push((printerCfg.label || st).toUpperCase() + (st !== 'caixa' ? ' - VIA DE PRODUCAO' : ' - COMPROVANTE'));
      lines.push('--------------------------------');
      lines.push('Pedido #' + order.id + '  ' + new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      lines.push(order.mode === 'delivery' ? 'DELIVERY' : 'RETIRADA');
      lines.push('--------------------------------');
      items.forEach(i => lines.push(`${i.qty}x ${i.name}` + (st === 'caixa' ? `   R$ ${(i.price * i.qty).toFixed(2)}` : '')));
      if (order.obs) { lines.push('--------------------------------'); lines.push('Obs: ' + order.obs); }
      if (st === 'caixa') {
        lines.push('--------------------------------');
        lines.push(`Subtotal: R$ ${order.subtotal.toFixed(2)}`);
        lines.push(`Entrega: R$ ${order.fee.toFixed(2)}`);
        lines.push(ESC.boldOn + `TOTAL: R$ ${order.total.toFixed(2)}` + ESC.boldOff);
        lines.push('Pagamento: ' + order.payMethod);
      } else {
        lines.push('--------------------------------');
        lines.push(order.name + ' - ' + order.phone);
      }
      const ticketText = buildTicketText(lines);

      try {
        if (printerCfg.method === 'rede') {
          if (!printerCfg.ip) return sendJSON(res, 400, { error: `Impressora de rede da via "${st}" sem IP configurado.` });
          await sendNetworkPrint(printerCfg.ip, printerCfg.port, ticketText);
        } else if (printerCfg.method === 'usb') {
          if (!printerCfg.device) return sendJSON(res, 400, { error: `Caminho do dispositivo USB da via "${st}" não configurado.` });
          await sendUSBPrint(printerCfg.device, ticketText);
        }
        return sendJSON(res, 200, { ok: true, printed: true, order, station: st, method: printerCfg.method });
      } catch (printErr) {
        return sendJSON(res, 502, { error: `Falha ao imprimir na via "${st}": ${printErr.message}` });
      }
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/print-test — envia um ticket de teste para a impressora de uma via ──
  if (pathname === '/api/print-test' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { station } = await readBody(req);
      const { cfg } = readConfig();
      const printerCfg = cfg.stations[station];
      if (!printerCfg) return sendJSON(res, 400, { error: 'Via inválida.' });
      if (printerCfg.method === 'navegador') return sendJSON(res, 200, { ok: true, method: 'navegador' });
      const text = buildTicketText([
        ESC.center + ESC.boldOn + 'TESTE DE IMPRESSAO' + ESC.boldOff + ESC.left,
        'Via: ' + (printerCfg.label || station),
        new Date().toLocaleString('pt-BR')
      ]);
      if (printerCfg.method === 'rede') {
        if (!printerCfg.ip) return sendJSON(res, 400, { error: 'Informe o IP da impressora.' });
        await sendNetworkPrint(printerCfg.ip, printerCfg.port, text);
      } else if (printerCfg.method === 'usb') {
        if (!printerCfg.device) return sendJSON(res, 400, { error: 'Informe o caminho do dispositivo USB.' });
        await sendUSBPrint(printerCfg.device, text);
      }
      return sendJSON(res, 200, { ok: true, printed: true });
    } catch (e) { return sendJSON(res, e.message && e.code ? 502 : 400, { error: e.message || 'invalid body' }); }
  }

  // ── POST /api/customer/register — cliente cria conta (telefone + senha de 4 dígitos) ──
  if (pathname === '/api/customer/register' && req.method === 'POST') {
    try {
      const { phone, name, pin, cep, street, hood, comp, ref } = await readBody(req);
      const p = normalizePhone(phone);
      if (!name || !name.trim()) return sendJSON(res, 400, { error: 'Preencha o campo "Nome completo".' });
      if (p.length < 10) return sendJSON(res, 400, { error: 'Preencha o campo "WhatsApp / Telefone" corretamente.' });
      if (!/^\d{4}$/.test(String(pin || ''))) return sendJSON(res, 400, { error: 'A senha precisa ter exatamente 4 dígitos.' });

      const customers = readJSON(CUSTOMERS_FILE);
      let customer = findCustomer(customers, p);
      if (customer) return sendJSON(res, 409, { error: 'Já existe uma conta com esse telefone. Use "Entrar" ou "Esqueci minha senha".' });

      const cleanCep = String(cep || '').trim().slice(0, 12);
      const cleanStreet = String(street || '').trim().slice(0, 120);
      const cleanHood = String(hood || '').trim().slice(0, 80);
      const cleanComp = String(comp || '').trim().slice(0, 80);
      const cleanRef = String(ref || '').trim().slice(0, 120);
      const address = cleanStreet
        ? cleanStreet + ', ' + cleanHood + (cleanComp ? ' - ' + cleanComp : '') + (cleanRef ? ' (' + cleanRef + ')' : '')
        : null;

      customer = {
        phone: p, name: String(name).trim().slice(0, 80),
        pinHash: hashPin(p, pin), createdAt: new Date().toISOString(),
        address: { cep: cleanCep, street: cleanStreet, hood: cleanHood, comp: cleanComp, ref: cleanRef },
        lastAddress: address, recovery: null
      };
      customers.push(customer);
      writeJSON(CUSTOMERS_FILE, customers);
      return sendJSON(res, 201, { ok: true, customer: { phone: customer.phone, name: customer.name, address: customer.address, lastAddress: address } });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/customer/login — cliente entra com telefone + senha de 4 dígitos ──
  if (pathname === '/api/customer/login' && req.method === 'POST') {
    try {
      const { phone, pin } = await readBody(req);
      const p = normalizePhone(phone);
      const customers = readJSON(CUSTOMERS_FILE);
      const customer = findCustomer(customers, p);
      if (!customer || customer.pinHash !== hashPin(p, pin)) return sendJSON(res, 401, { error: 'Telefone ou senha incorretos.' });
      const orders = readJSON(ORDERS_FILE);
      const stats = customerStats(p, orders);
      return sendJSON(res, 200, { ok: true, customer: { phone: customer.phone, name: customer.name, address: customer.address || null, lastAddress: customer.lastAddress, ...stats } });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/customer/recovery-request — gera código e devolve link do WhatsApp da loja ──
  if (pathname === '/api/customer/recovery-request' && req.method === 'POST') {
    try {
      const { phone } = await readBody(req);
      const p = normalizePhone(phone);
      const customers = readJSON(CUSTOMERS_FILE);
      const customer = findCustomer(customers, p);
      if (!customer) return sendJSON(res, 404, { error: 'Não existe conta com esse telefone.' });

      const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
      customer.recovery = { code, requestedAt: new Date().toISOString(), approved: false };
      writeJSON(CUSTOMERS_FILE, customers);

      const { cfg } = readConfig();
      const waText = `Olá! Quero recuperar minha senha do Shogatsu.\nMeu telefone: ${customer.phone}\nCódigo: ${code}`;
      const waUrl = `https://wa.me/${cfg.whats}?text=${encodeURIComponent(waText)}`;
      return sendJSON(res, 200, { ok: true, code, waUrl });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/customer/recovery-set-pin — cliente define nova senha (precisa já ter sido aprovado no painel) ──
  if (pathname === '/api/customer/recovery-set-pin' && req.method === 'POST') {
    try {
      const { phone, code, newPin } = await readBody(req);
      const p = normalizePhone(phone);
      if (!/^\d{4}$/.test(String(newPin || ''))) return sendJSON(res, 400, { error: 'A nova senha precisa ter exatamente 4 dígitos.' });
      const customers = readJSON(CUSTOMERS_FILE);
      const customer = findCustomer(customers, p);
      if (!customer || !customer.recovery || customer.recovery.code !== String(code)) {
        return sendJSON(res, 400, { error: 'Código inválido.' });
      }
      if (!customer.recovery.approved) {
        return sendJSON(res, 403, { error: 'Ainda aguardando a confirmação da loja pelo WhatsApp. Tente novamente em instantes.' });
      }
      customer.pinHash = hashPin(p, newPin);
      customer.recovery = null;
      writeJSON(CUSTOMERS_FILE, customers);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/admin/customers — lista de clientes com estatísticas (painel, requer auth) ──
  if (pathname === '/api/admin/customers' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const customers = readJSON(CUSTOMERS_FILE);
    const orders = readJSON(ORDERS_FILE);
    const list = customers.map(c => ({
      phone: c.phone, name: c.name, createdAt: c.createdAt, lastAddress: c.lastAddress,
      hasPendingRecovery: !!(c.recovery && !c.recovery.approved),
      ...customerStats(c.phone, orders)
    })).sort((a, b) => b.orderCount - a.orderCount);
    return sendJSON(res, 200, { customers: list });
  }

  // ── GET /api/admin/customers/orders?phone=... — histórico de pedidos de um cliente ──
  if (pathname === '/api/admin/customers/orders' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const p = normalizePhone(query.phone);
    const orders = readJSON(ORDERS_FILE).filter(o => normalizePhone(o.phone) === p);
    return sendJSON(res, 200, { orders });
  }

  // ── POST /api/admin/customers/recovery-approve — restaurante confirma o código recebido no WhatsApp ──
  if (pathname === '/api/admin/customers/recovery-approve' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { phone } = await readBody(req);
      const p = normalizePhone(phone);
      const customers = readJSON(CUSTOMERS_FILE);
      const customer = findCustomer(customers, p);
      if (!customer || !customer.recovery) return sendJSON(res, 404, { error: 'Nenhuma recuperação pendente pra esse telefone.' });
      customer.recovery.approved = true;
      writeJSON(CUSTOMERS_FILE, customers);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/orders — cria um novo pedido (cliente) ──
  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { cfg } = readConfig();
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
        items: (body.items || []).slice(0, 60).map(i => {
          const rawStations = Array.isArray(i.stations) ? i.stations : (i.station ? [i.station] : []);
          const stations = rawStations.filter(s => ['cozinha', 'sushibar', 'bar'].includes(s));
          return {
            name: String(i.name || '').slice(0, 80),
            qty: Math.max(1, parseInt(i.qty) || 1),
            price: Number(i.price) || 0,
            stations: stations.length ? stations : ['cozinha']
          };
        }),
        obs: String(body.obs || '').slice(0, 300),
        payMethod: String(body.payMethod || '').slice(0, 20),
        troco: String(body.troco || '').slice(0, 20),
        subtotal: Number(body.subtotal) || 0,
        fee: Number(body.fee) || 0,
        total: Number(body.total) || 0
      };
      orders.unshift(order);
      writeJSON(ORDERS_FILE, orders);

      // Se o telefone tem conta cadastrada, guarda o endereço mais recente pra pré-preencher da próxima vez
      if (order.mode === 'delivery') {
        const customers = readJSON(CUSTOMERS_FILE);
        const customer = findCustomer(customers, order.phone);
        if (customer) {
          customer.lastAddress = order.address;
          writeJSON(CUSTOMERS_FILE, customers);
        }
      }

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
      const { status, fee, cancelReason } = await readBody(req);
      const valid = ['novo', 'preparando', 'saiu', 'entregue', 'cancelado'];
      if (!valid.includes(status)) return sendJSON(res, 400, { error: 'status inválido' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
      order.status = status;
      if (status === 'cancelado') order.cancelReason = String(cancelReason || '').slice(0, 200) || 'Não informado';
      if (fee !== undefined && fee !== null && fee !== '') {
        order.fee = Number(fee) || 0;
        order.total = Number(order.subtotal || 0) + order.fee;
      }
      writeJSON(ORDERS_FILE, orders);
      broadcast('order-updated', order);
      return sendJSON(res, 200, { ok: true, order });
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
