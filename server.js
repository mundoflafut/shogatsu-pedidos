// ═══════════════════════════════════════════════════════════
// SHOGATSU · Servidor de Pedidos Online
// Node.js + PostgreSQL (persistência via db.js — ver DATABASE_URL)
// Nenhum dado de negócio é gravado em arquivo local: tudo fica no Postgres,
// então nada se perde em restart/redeploy no Render.
// ═══════════════════════════════════════════════════════════
const http = require('http');
const https = require('https');
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const url = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ─── Config / Menu padrão (usados só para semear um banco vazio, uma única vez) ───
const DEFAULT_CFG = {
  whats: '552227641333', storePhone: '(22) 2764-1333', fee: 8, min: 60,
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costa Azul · Rio das Ostras · CEP 28896-155',
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

// Lê a configuração do banco e preenche com os valores padrão quaisquer campos
// novos que ainda não existiam (ex: bancos já em produção antes de uma
// atualização) — sem apagar ou resetar nada que o restaurante já configurou.
async function getConfig() {
  const stored = (await db.getSettings()) || {};
  return {
    ...DEFAULT_CFG,
    ...stored,
    stations: { ...DEFAULT_CFG.stations, ...(stored.stations || {}) },
    uiFonts: { ...DEFAULT_CFG.uiFonts, ...(stored.uiFonts || {}) },
    theme: { ...DEFAULT_CFG.theme, ...(stored.theme || {}) },
    cancelReasons: stored.cancelReasons || DEFAULT_CFG.cancelReasons,
    slides: stored.slides || DEFAULT_CFG.slides
  };
}

// ─── Sessões admin (em memória — tokens são efêmeros por natureza; um restart
// apenas exige novo login, isso não é "perda de dado de negócio") ───
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

// ─── Contas de cliente — helpers de senha (telefone + PIN de 4 dígitos) ───
function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }
function hashPin(phone, pin) {
  return crypto.createHash('sha256').update(normalizePhone(phone) + ':' + String(pin) + ':shogatsu-salt').digest('hex');
}

// ─── Clientes conectados via SSE (painel da cozinha) ───
const sseClients = new Set();
function broadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (e) {} }
}

// ─── Geolocalização / taxa por distância ───
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

async function lookupCEP(cep) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const data = await httpsGetJSON(`https://viacep.com.br/ws/${clean}/json/`);
  if (!data || data.erro) return null;
  return { street: data.logradouro || '', hood: data.bairro || '', city: data.localidade || '', uf: data.uf || '' };
}

async function geocodeAddress(addressText) {
  const q = encodeURIComponent(addressText);
  const data = await httpsGetJSON(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`,
    { 'User-Agent': 'ShogatsuPedidosOnline/1.0 (contato via painel do restaurante)' }
  );
  if (!Array.isArray(data) || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcFeeByDistance(cfg, distanceKm) {
  const baseKm = Number(cfg.feeBaseKm) || 0;
  const extraKm = Math.max(0, distanceKm - baseKm);
  let fee = (Number(cfg.feeBaseValue) || 0) + extraKm * (Number(cfg.feePerKm) || 0);
  const round = Number(cfg.feeRound) || 0;
  if (round > 0) fee = Math.ceil(fee / round) * round;
  return Math.round(fee * 100) / 100;
}

// ─── Impressão — rede (ESC/POS via TCP) e USB (dispositivo local) ───
const ESC = {
  init: '\x1B\x40',
  boldOn: '\x1B\x45\x01', boldOff: '\x1B\x45\x00',
  center: '\x1B\x61\x01', left: '\x1B\x61\x00',
  doubleOn: '\x1D\x21\x11', doubleOff: '\x1D\x21\x00',
  cut: '\x1D\x56\x01',
  feed: '\n\n\n'
};
function buildTicketText(lines) {
  return ESC.init + lines.join('\n') + ESC.feed + ESC.cut;
}
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
function sendUSBPrint(devicePath, text) {
  return new Promise((resolve, reject) => {
    fs.writeFile(devicePath, Buffer.from(text, 'binary'), (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
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
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
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

// Serve apenas os arquivos estáticos do app (HTML/CSS/JS/ícones do repositório).
// Nenhum dado de usuário é lido ou gravado aqui — só o código do próprio site.
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

  try {
    // ── GET /api/config — dados públicos do cardápio/config ──
    if (pathname === '/api/config' && req.method === 'GET') {
      const cfg = await getConfig();
      const menu = await db.getMenu();
      const { adminPass, masterPass, ...publicCfg } = cfg; // nunca vaza as senhas
      return sendJSON(res, 200, { cfg: publicCfg, menu });
    }

    // ── POST /api/config — admin salva config/cardápio ──
    if (pathname === '/api/config' && req.method === 'POST') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      try {
        const body = await readBody(req);
        const current = await getConfig();
        const merged = { ...current, ...body.cfg, adminPass: current.adminPass, masterPass: current.masterPass };
        await db.saveSettings(merged);
        if (body.menu) await db.saveMenu(body.menu);
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
        const cfg = await getConfig();
        if (curPass !== cfg[field]) return sendJSON(res, 403, { error: 'senha atual incorreta' });
        if (!next || next.length < 4) return sendJSON(res, 400, { error: 'nova senha muito curta (mín. 4 caracteres)' });
        cfg[field] = next;
        await db.saveSettings(cfg);
        return sendJSON(res, 200, { ok: true });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/upload — envia foto (logo/produto/slide); grava no Postgres, não em disco ──
    if (pathname === '/api/upload' && req.method === 'POST') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      try {
        const { dataUrl } = await readBody(req);
        const m = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
        if (!m) return sendJSON(res, 400, { error: 'Formato inválido. Use PNG, JPG ou WEBP.' });
        const mimeType = 'image/' + (m[1].toLowerCase() === 'jpg' ? 'jpeg' : m[1].toLowerCase());
        const buffer = Buffer.from(m[2], 'base64');
        if (buffer.length > 4 * 1024 * 1024) return sendJSON(res, 400, { error: 'Imagem muito grande (máx. 4MB).' });
        const id = await db.saveUpload(buffer, mimeType);
        return sendJSON(res, 200, { url: '/uploads/' + id });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── GET /uploads/:id — serve uma imagem gravada no banco ──
    if (pathname.startsWith('/uploads/') && req.method === 'GET') {
      const id = pathname.split('/').pop();
      const upload = await db.getUpload(id);
      if (!upload) { res.writeHead(404); return res.end('Not found'); }
      res.writeHead(200, { 'Content-Type': upload.mime_type, 'Cache-Control': 'public, max-age=31536000, immutable' });
      return res.end(upload.data);
    }

    // ── POST /api/orders/purge — apaga pedidos antigos (exige senha master) ──
    if (pathname === '/api/orders/purge' && req.method === 'POST') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      try {
        const { masterPass, beforeDate } = await readBody(req);
        const cfg = await getConfig();
        if (masterPass !== cfg.masterPass) return sendJSON(res, 403, { error: 'Senha master incorreta.' });
        if (!beforeDate) return sendJSON(res, 400, { error: 'Informe a data limite.' });
        const cutoffISO = new Date(beforeDate).toISOString();
        const deleted = await db.purgeOrdersBefore(cutoffISO);
        return sendJSON(res, 200, { ok: true, deleted });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── GET /api/reports — relatório de vendas (admin) ──
    if (pathname === '/api/reports' && req.method === 'GET') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      const from = query.from ? new Date(query.from + 'T00:00:00').getTime() : 0;
      const to = query.to ? new Date(query.to + 'T23:59:59').getTime() : Date.now();
      const rangeOrders = await db.getOrdersInRange(from, to);
      const filtered = rangeOrders.filter(o => o.status !== 'cancelado');
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
        const cfg = await getConfig();
        if (password === cfg.adminPass) return sendJSON(res, 200, { token: newSession() });
        return sendJSON(res, 401, { error: 'senha incorreta' });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/pix — gera o copia-e-cola para um valor ──
    if (pathname === '/api/pix' && req.method === 'POST') {
      try {
        const { amount, txid } = await readBody(req);
        const cfg = await getConfig();
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
        const cfg = await getConfig();

        if (cfg.feeMode !== 'distancia' || !cfg.storeLat || !cfg.storeLng) {
          return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo', distanceKm: null });
        }

        try {
          let addrStreet = String(street || '').trim();
          let addrHood = String(hood || '').trim();
          let addrCity = String(city || '').trim();
          let addrUf = String(uf || '').trim();

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
          return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
        }
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/admin/geocode-store — painel localiza e salva as coordenadas da loja ──
    if (pathname === '/api/admin/geocode-store' && req.method === 'POST') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      try {
        const body = await readBody(req);
        const cfg = await getConfig();
        const address = String(body.address || cfg.addr || '').trim();
        if (!address) return sendJSON(res, 400, { error: 'Informe o endereço do restaurante.' });
        const geo = await geocodeAddress(address + ', Brasil');
        if (!geo) return sendJSON(res, 404, { error: 'Não conseguimos localizar esse endereço. Tente descrevê-lo de outro jeito (ex: rua, número, bairro, cidade).' });
        cfg.storeLat = geo.lat;
        cfg.storeLng = geo.lng;
        await db.saveSettings(cfg);
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
        const order = await db.getOrderById(orderId);
        if (!order) return sendJSON(res, 404, { error: 'Pedido não encontrado.' });
        const cfg = await getConfig();

        const items = st === 'caixa' ? order.items : order.items.filter(i => i.station === st);
        if (!items.length) return sendJSON(res, 200, { ok: true, printed: false, skipped: true, order, station: st });

        const printerCfg = cfg.stations[st] || { method: 'navegador' };
        if (printerCfg.method === 'navegador') {
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
          lines.push(order.name + ' - ' + order.phone);
          if (order.mode === 'delivery' && order.address) lines.push(order.address);
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
        const cfg = await getConfig();
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
        const { phone, name, pin } = await readBody(req);
        const p = normalizePhone(phone);
        if (p.length < 10) return sendJSON(res, 400, { error: 'Telefone inválido.' });
        if (!/^\d{4}$/.test(String(pin || ''))) return sendJSON(res, 400, { error: 'A senha precisa ter exatamente 4 dígitos.' });
        if (!name || !name.trim()) return sendJSON(res, 400, { error: 'Informe seu nome.' });

        const existing = await db.getCustomerByPhone(p);
        if (existing) return sendJSON(res, 409, { error: 'Já existe uma conta com esse telefone. Use "Entrar" ou "Esqueci minha senha".' });

        const customer = await db.createCustomer({ phone: p, name: String(name).trim().slice(0, 80), pinHash: hashPin(p, pin) });
        return sendJSON(res, 201, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: null } });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/customer/login — cliente entra com telefone + senha de 4 dígitos ──
    if (pathname === '/api/customer/login' && req.method === 'POST') {
      try {
        const { phone, pin } = await readBody(req);
        const p = normalizePhone(phone);
        const customer = await db.getCustomerByPhone(p);
        if (!customer || customer.pinHash !== hashPin(p, pin)) return sendJSON(res, 401, { error: 'Telefone ou senha incorretos.' });
        const stats = await db.getCustomerStats(p);
        return sendJSON(res, 200, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: customer.lastAddress, ...stats } });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/customer/recovery-request — gera código e devolve link do WhatsApp da loja ──
    if (pathname === '/api/customer/recovery-request' && req.method === 'POST') {
      try {
        const { phone } = await readBody(req);
        const p = normalizePhone(phone);
        const customer = await db.getCustomerByPhone(p);
        if (!customer) return sendJSON(res, 404, { error: 'Não existe conta com esse telefone.' });

        const code = String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
        await db.setCustomerRecovery(p, { code, requestedAt: new Date().toISOString(), approved: false });

        const cfg = await getConfig();
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
        const customer = await db.getCustomerByPhone(p);
        if (!customer || !customer.recovery || customer.recovery.code !== String(code)) {
          return sendJSON(res, 400, { error: 'Código inválido.' });
        }
        if (!customer.recovery.approved) {
          return sendJSON(res, 403, { error: 'Ainda aguardando a confirmação da loja pelo WhatsApp. Tente novamente em instantes.' });
        }
        await db.updateCustomerPin(p, hashPin(p, newPin));
        return sendJSON(res, 200, { ok: true });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── GET /api/admin/customers — lista de clientes com estatísticas (painel, requer auth) ──
    if (pathname === '/api/admin/customers' && req.method === 'GET') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      const list = await db.listCustomersWithStats();
      return sendJSON(res, 200, { customers: list });
    }

    // ── GET /api/admin/customers/orders?phone=... — histórico de pedidos de um cliente ──
    if (pathname === '/api/admin/customers/orders' && req.method === 'GET') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      const orders = await db.getOrdersByPhone(normalizePhone(query.phone));
      return sendJSON(res, 200, { orders });
    }

    // ── POST /api/admin/customers/recovery-approve — restaurante confirma o código recebido no WhatsApp ──
    if (pathname === '/api/admin/customers/recovery-approve' && req.method === 'POST') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      try {
        const { phone } = await readBody(req);
        const p = normalizePhone(phone);
        const customer = await db.getCustomerByPhone(p);
        if (!customer || !customer.recovery) return sendJSON(res, 404, { error: 'Nenhuma recuperação pendente pra esse telefone.' });
        await db.setCustomerRecovery(p, { ...customer.recovery, approved: true });
        return sendJSON(res, 200, { ok: true });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── POST /api/orders — cria um novo pedido (cliente) ──
    if (pathname === '/api/orders' && req.method === 'POST') {
      try {
        const body = await readBody(req);
        const cfg = await getConfig();
        if (!Number(cfg.open)) return sendJSON(res, 400, { error: 'Restaurante fechado no momento.' });
        if (!body.items || !body.items.length) return sendJSON(res, 400, { error: 'Carrinho vazio.' });

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
            price: Number(i.price) || 0,
            station: ['cozinha', 'sushibar', 'bar', 'caixa'].includes(i.station) ? i.station : 'cozinha'
          })),
          obs: String(body.obs || '').slice(0, 300),
          payMethod: String(body.payMethod || '').slice(0, 20),
          troco: String(body.troco || '').slice(0, 20),
          subtotal: Number(body.subtotal) || 0,
          fee: Number(body.fee) || 0,
          total: Number(body.total) || 0
        };
        await db.createOrder(order);

        // Se o telefone tem conta cadastrada, guarda o endereço mais recente pra pré-preencher da próxima vez
        if (order.mode === 'delivery') {
          const customer = await db.getCustomerByPhone(order.phone);
          if (customer) await db.updateCustomerLastAddress(order.phone, order.address);
        }

        broadcast('new-order', order);
        return sendJSON(res, 201, { ok: true, order });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── GET /api/orders — lista pedidos (painel, requer auth) ──
    if (pathname === '/api/orders' && req.method === 'GET') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      return sendJSON(res, 200, await db.getOrders());
    }

    // ── PATCH /api/orders/:id — atualiza status (painel) ──
    if (pathname.startsWith('/api/orders/') && req.method === 'PATCH') {
      if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
      const id = pathname.split('/').pop();
      try {
        const { status, fee, cancelReason } = await readBody(req);
        const valid = ['novo', 'preparando', 'saiu', 'entregue', 'cancelado'];
        if (!valid.includes(status)) return sendJSON(res, 400, { error: 'status inválido' });
        const existing = await db.getOrderById(id);
        if (!existing) return sendJSON(res, 404, { error: 'pedido não encontrado' });

        const fields = { status };
        if (status === 'cancelado') fields.cancelReason = String(cancelReason || '').slice(0, 200) || 'Não informado';
        if (fee !== undefined && fee !== null && fee !== '') {
          fields.fee = Number(fee) || 0;
          fields.total = Number(existing.subtotal || 0) + fields.fee;
        }
        const order = await db.updateOrder(id, fields);
        broadcast('order-updated', order);
        return sendJSON(res, 200, { ok: true, order });
      } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
    }

    // ── GET /api/track/:id — cliente acompanha status do próprio pedido (público) ──
    if (pathname.startsWith('/api/track/') && req.method === 'GET') {
      const id = pathname.split('/').pop();
      const order = await db.getOrderById(id);
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
  } catch (err) {
    console.error('❌ Erro não tratado numa rota:', err.message);
    return sendJSON(res, 500, { error: 'Erro interno do servidor. Tente novamente.' });
  }
});

// ─── Boot: conecta e prepara o banco ANTES de aceitar requisições ───
(async () => {
  try {
    await db.init(DEFAULT_CFG, DEFAULT_MENU);
    server.listen(PORT, () => {
      console.log(`🍣 Shogatsu rodando em http://localhost:${PORT}`);
      console.log(`   Painel da cozinha: http://localhost:${PORT}/painel.html`);
    });
  } catch (err) {
    console.error('❌ Falha fatal ao iniciar o servidor:', err.message);
    process.exit(1);
  }
})();

// ─── Encerramento gracioso (Render manda SIGTERM antes de reiniciar/reimplantar) ───
async function gracefulShutdown(signal) {
  console.log(`🛑 ${signal} recebido — encerrando servidor com segurança...`);
  server.close(async () => {
    await db.shutdown();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10000).unref(); // trava de segurança
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
