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
  whats: '5522988683755', storePhone: '', fee: 8, min: 60,
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras',
  hours: '18h30–23h', open: 1,
  adminPass: 'shogatsu2026',
  masterPass: 'shogatsuMaster2026',
  logoUrl: '',
  print: 0,                     // 1 = imprime automaticamente as vias ao chegar um pedido novo
  labels: {                     // textos dos botões/status do painel, customizáveis pelo admin
    actionNovo: 'Aceitar Pedido',
    actionPrep: 'Marcar Pronto',
    actionPronto: 'Confirmar Entrega',
    colNovo: 'Novos',
    colPrep: 'Preparando',
    colPronto: 'Pronto',
    colEntregue: 'Entregue',
    btnCancel: 'Cancelar',
  },
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
  feeRound: 0.5,                 // arredonda a taxa para múltiplos disso
  // ── Taxa de entrega por CEP ou por Bairro (zonas com valor fixo cada) ──
  feeZonesCep: [],               // [{ prefix:'28890', label:'Costazul', fee:6 }, ...]
  feeZonesBairro: [],            // [{ bairro:'Costazul', fee:6 }, ...]
  feeZoneFallback: 'padrao',      // 'padrao' (usa cfg.fee se não achar a zona) ou 'bloqueado' (recusa o pedido)
  // ── Cupons de desconto (aplicados pelo cliente no checkout) ──
  coupons: []                     // [{code, type:'percent'|'valor'|'frete_gratis', value, active, expiresAt, usageLimit, usedCount, minOrder}]
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
    labels: { ...DEFAULT_CFG.labels, ...(data.cfg.labels || {}) },
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

// ─── Clientes conectados via SSE no SITE DO CLIENTE (só avisa "cardápio mudou",
// nunca manda dados de pedido/cliente — canal público, sem autenticação) ───
const publicSseClients = new Set();
function publicBroadcast(event, data) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of publicSseClients) { try { res.write(payload); } catch (e) {} }
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

// Remove acentos e normaliza texto pra comparar bairros sem depender de
// maiúscula/minúscula ou acentuação exata (ex: "Costázul" == "costazul").
function normalizeText(s) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

// Acha a zona de CEP configurada que melhor bate com o CEP informado,
// testando do prefixo mais específico (8 dígitos) ao menos específico.
function matchCepZone(cep, zones) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (!clean || !Array.isArray(zones) || !zones.length) return null;
  const withPrefix = zones.map(z => ({ ...z, p: String(z.prefix || '').replace(/\D/g, '') })).filter(z => z.p);
  const sorted = withPrefix.sort((a, b) => b.p.length - a.p.length); // mais específico primeiro
  return sorted.find(z => clean.startsWith(z.p)) || null;
}

// Acha a zona de bairro configurada que bate com o bairro informado
// (comparação exata primeiro, depois por aproximação/inclusão de texto).
function matchBairroZone(hood, zones) {
  const h = normalizeText(hood);
  if (!h || !Array.isArray(zones) || !zones.length) return null;
  const exact = zones.find(z => normalizeText(z.bairro) === h);
  if (exact) return exact;
  return zones.find(z => {
    const zb = normalizeText(z.bairro);
    return zb && (h.includes(zb) || zb.includes(h));
  }) || null;
}


// Acha um cupom válido pelo código (não expirado, ativo, dentro do limite de uso
// e do pedido mínimo) e devolve o desconto já calculado pra esse subtotal.
function findValidCoupon(cfg, code, subtotal) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { error: 'Informe um cupom.' };
  const coupon = (cfg.coupons || []).find(x => String(x.code || '').toUpperCase() === c);
  if (!coupon) return { error: 'Cupom não encontrado.' };
  if (coupon.active === false) return { error: 'Esse cupom não está mais ativo.' };
  if (coupon.expiresAt && new Date(coupon.expiresAt) < new Date()) return { error: 'Esse cupom expirou.' };
  if (coupon.usageLimit > 0 && (coupon.usedCount || 0) >= coupon.usageLimit) return { error: 'Esse cupom já atingiu o limite de usos.' };
  if (coupon.minOrder > 0 && subtotal < coupon.minOrder) {
    return { error: `Esse cupom vale a partir de R$ ${Number(coupon.minOrder).toFixed(2).replace('.', ',')} em pedidos.` };
  }
  let discount = 0, freeDelivery = false;
  if (coupon.type === 'percent') discount = Math.round(subtotal * (Number(coupon.value) || 0) / 100 * 100) / 100;
  else if (coupon.type === 'valor') discount = Math.min(Number(coupon.value) || 0, subtotal);
  else if (coupon.type === 'frete_gratis') freeDelivery = true;
  return { coupon, discount, freeDelivery };
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

// Monta o texto puro do ticket (usado tanto na pré-visualização quanto na impressão real).
// Impressoras térmicas não suportam fontes (só o hardware da própria impressora), mas
// suportam alternar entre tamanho normal e "letra grande" — usamos isso pra respeitar
// ao menos o tamanho configurado em cfg.printSize.
function buildTicketText(lines, cfg) {
  const big = cfg && Number(cfg.printSize) >= 18;
  const body = big ? ESC.doubleOn + lines.join('\n') + ESC.doubleOff : lines.join('\n');
  return ESC.init + body + ESC.feed + ESC.cut;
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
        cfg: {
          ...current.cfg, ...body.cfg,
          adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass,
          stations: { ...current.cfg.stations, ...(body.cfg && body.cfg.stations || {}) },
          labels: { ...current.cfg.labels, ...(body.cfg && body.cfg.labels || {}) },
          uiFonts: { ...current.cfg.uiFonts, ...(body.cfg && body.cfg.uiFonts || {}) },
          theme: { ...current.cfg.theme, ...(body.cfg && body.cfg.theme || {}) }
        },
        menu: body.menu || current.menu
      };
      writeJSON(CONFIG_FILE, merged);
      broadcast('config-updated', {});
      publicBroadcast('menu-updated', {});
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

  // ── POST /api/delivery-fee — cliente informa CEP/endereço, taxa é calculada conforme o modo configurado ──
  if (pathname === '/api/delivery-fee' && req.method === 'POST') {
    try {
      const { cep, street, hood, city, uf } = await readBody(req);
      const { cfg } = readConfig();
      const cleanCep = String(cep || '').replace(/\D/g, '');

      // ── Modo CEP: cada faixa de CEP tem uma taxa fixa configurada ──
      if (cfg.feeMode === 'cep') {
        if (!cleanCep) return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
        const match = matchCepZone(cleanCep, cfg.feeZonesCep);
        if (match) return sendJSON(res, 200, { fee: Number(match.fee) || 0, mode: 'cep', zoneLabel: match.label || match.prefix, distanceKm: null });
        if (cfg.feeZoneFallback === 'bloqueado') {
          return sendJSON(res, 200, { error: 'fora_area', message: `Esse CEP ainda não está na nossa área de entrega.` });
        }
        return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
      }

      // ── Modo Bairro: cada bairro cadastrado tem uma taxa fixa configurada ──
      if (cfg.feeMode === 'bairro') {
        let addrHood = String(hood || '').trim();
        if (!addrHood && cleanCep) {
          try { const viacep = await lookupCEP(cleanCep); if (viacep) addrHood = viacep.hood; } catch (e) {}
        }
        if (!addrHood) return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
        const match = matchBairroZone(addrHood, cfg.feeZonesBairro);
        if (match) return sendJSON(res, 200, { fee: Number(match.fee) || 0, mode: 'bairro', zoneLabel: match.bairro, distanceKm: null });
        if (cfg.feeZoneFallback === 'bloqueado') {
          return sendJSON(res, 200, { error: 'fora_area', message: `Ainda não entregamos no bairro "${addrHood}".` });
        }
        return sendJSON(res, 200, { fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
      }

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
        if (cleanCep) {
          const viacep = await lookupCEP(cleanCep);
          if (viacep) {
            addrHood = addrHood || viacep.hood;
            addrCity = addrCity || viacep.city;
            addrUf = addrUf || viacep.uf;
            if (!addrStreet) addrStreet = viacep.street;
          }
        }

        const queryText = [addrStreet, addrHood, addrCity, addrUf, 'Brasil'].filter(Boolean).join(', ');
        if (!queryText || (!addrStreet && !addrHood && !cleanCep)) {
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

// Calcula uma janela de horário estimada de entrega/retirada a partir da hora do
// pedido + o texto configurado em cfg.time (ex: "40–60 min"). Se não conseguir
// extrair dois números do texto, devolve só o texto original como está.
function estimateDeliveryWindow(order, cfg) {
  const nums = String(cfg.time || '').match(/\d+/g);
  const created = new Date(order.createdAt);
  const fmt = (d) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  if (nums && nums.length >= 2) {
    const from = new Date(created.getTime() + parseInt(nums[0]) * 60000);
    const to = new Date(created.getTime() + parseInt(nums[nums.length - 1]) * 60000);
    return `${fmt(from)} – ${fmt(to)}`;
  }
  if (nums && nums.length === 1) {
    const to = new Date(created.getTime() + parseInt(nums[0]) * 60000);
    return `até ${fmt(to)}`;
  }
  return cfg.time || '—';
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
      const isCaixa = st === 'caixa';

      // Caixa: comprovante completo (todos os itens + dados do cliente + horário).
      // Cozinha/Sushibar/Bar: só os itens daquela estação + observações, sem dados pessoais.
      const items = isCaixa ? order.items : order.items.filter(i => (i.stations || []).includes(st));
      if (!items.length) return sendJSON(res, 200, { ok: true, printed: false, skipped: true, order, station: st });

      const deliveryWindow = estimateDeliveryWindow(order, cfg);
      const printerCfg = cfg.stations[st] || { method: 'navegador' };
      if (printerCfg.method === 'navegador') {
        // O navegador do cliente (painel) monta e imprime o ticket — servidor só confirma os dados.
        return sendJSON(res, 200, { ok: true, printed: false, order, station: st, method: 'navegador', deliveryWindow });
      }

      const lines = [];
      lines.push(ESC.center + ESC.boldOn + 'SHOGATSU' + ESC.boldOff + ESC.left);
      lines.push((printerCfg.label || st).toUpperCase() + (isCaixa ? ' - COMPROVANTE' : ' - VIA DE PRODUCAO'));
      lines.push('--------------------------------');
      lines.push('Pedido #' + order.id + '  ' + new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
      lines.push(order.mode === 'delivery' ? 'DELIVERY' : 'RETIRADA');

      if (isCaixa) {
        // ── Via do Caixa: dados completos do cliente + horário estimado ──
        lines.push('--------------------------------');
        lines.push('Cliente: ' + order.name);
        lines.push('Telefone: ' + order.phone);
        if (order.mode === 'delivery') lines.push('Endereco: ' + order.address);
        lines.push((order.mode === 'delivery' ? 'Previsao de entrega: ' : 'Previsao de retirada: ') + deliveryWindow);
        lines.push('--------------------------------');
        items.forEach(i => lines.push(`${i.qty}x ${i.name}   R$ ${(i.price * i.qty).toFixed(2)}`));
        if (order.obs) { lines.push('--------------------------------'); lines.push('Obs: ' + order.obs); }
        lines.push('--------------------------------');
        lines.push(`Subtotal: R$ ${order.subtotal.toFixed(2)}`);
        lines.push(`Entrega: R$ ${order.fee.toFixed(2)}`);
        if (order.discount > 0 || order.couponCode) {
          lines.push(`Cupom ${order.couponCode}: -R$ ${(order.discount || 0).toFixed(2)}`);
        }
        lines.push(ESC.boldOn + `TOTAL: R$ ${order.total.toFixed(2)}` + ESC.boldOff);
        lines.push('Pagamento: ' + order.payMethod + (order.troco ? ' (troco para ' + order.troco + ')' : ''));
      } else {
        // ── Vias de produção (cozinha/sushibar/bar): só pedido, itens e observações ──
        lines.push('--------------------------------');
        items.forEach(i => lines.push(`${i.qty}x ${i.name}`));
        if (order.obs) { lines.push('--------------------------------'); lines.push('Obs: ' + order.obs); }
      }
      const ticketText = buildTicketText(lines, cfg);

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
      ], cfg);
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

      const customers = readJSON(CUSTOMERS_FILE);
      let customer = findCustomer(customers, p);
      if (customer) return sendJSON(res, 409, { error: 'Já existe uma conta com esse telefone. Use "Entrar" ou "Esqueci minha senha".' });

      customer = {
        phone: p, name: String(name).trim().slice(0, 80),
        pinHash: hashPin(p, pin), createdAt: new Date().toISOString(),
        lastAddress: null, recovery: null
      };
      customers.push(customer);
      writeJSON(CUSTOMERS_FILE, customers);
      return sendJSON(res, 201, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: null } });
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
      return sendJSON(res, 200, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: customer.lastAddress, ...stats } });
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
  // ── POST /api/coupon/validate — cliente digita um cupom no checkout, servidor confere ──
  if (pathname === '/api/coupon/validate' && req.method === 'POST') {
    try {
      const { code, subtotal } = await readBody(req);
      const { cfg } = readConfig();
      const result = findValidCoupon(cfg, code, Number(subtotal) || 0);
      if (result.error) return sendJSON(res, 200, { valid: false, error: result.error });
      return sendJSON(res, 200, {
        valid: true,
        code: result.coupon.code,
        type: result.coupon.type,
        discount: result.discount,
        freeDelivery: result.freeDelivery,
        message: result.coupon.type === 'frete_gratis' ? 'Frete grátis aplicado! 🎉' : `Desconto de R$ ${result.discount.toFixed(2).replace('.', ',')} aplicado! 🎉`
      });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  if (pathname === '/api/orders' && req.method === 'POST') {
    try {
      const body = await readBody(req);
      const { cfg } = readConfig();
      if (!Number(cfg.open)) return sendJSON(res, 400, { error: 'Restaurante fechado no momento.' });
      if (!body.items || !body.items.length) return sendJSON(res, 400, { error: 'Carrinho vazio.' });

      // Recalcula o cupom no servidor (nunca confia no desconto que o cliente mandou),
      // pra evitar que alguém edite o total pelo navegador e finja um desconto maior.
      const subtotalNum = Number(body.subtotal) || 0;
      let appliedCoupon = null, discount = 0;
      const couponCodeInput = String(body.couponCode || '').trim();
      if (couponCodeInput) {
        const result = findValidCoupon(cfg, couponCodeInput, subtotalNum);
        if (result.coupon) { appliedCoupon = result.coupon; discount = result.discount || 0; }
      }
      const feeNum = appliedCoupon && appliedCoupon.type === 'frete_gratis' ? 0 : (Number(body.fee) || 0);
      const totalNum = Math.max(0, subtotalNum + feeNum - discount);

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
          const validStations = ['cozinha', 'sushibar', 'bar'];
          let stations = Array.isArray(i.stations) ? i.stations.filter(s => validStations.includes(s)) : [];
          if (!stations.length) stations = [validStations.includes(i.station) ? i.station : 'cozinha'];
          return {
            name: String(i.name || '').slice(0, 80),
            qty: Math.max(1, parseInt(i.qty) || 1),
            price: Number(i.price) || 0,
            stations: [...new Set(stations)]
          };
        }),
        obs: String(body.obs || '').slice(0, 300),
        payMethod: String(body.payMethod || '').slice(0, 20),
        troco: String(body.troco || '').slice(0, 20),
        subtotal: subtotalNum,
        fee: feeNum,
        couponCode: appliedCoupon ? appliedCoupon.code : '',
        discount,
        total: totalNum
      };
      orders.unshift(order);
      writeJSON(ORDERS_FILE, orders);

      // Contabiliza o uso do cupom (pra respeitar o limite de usos configurado)
      if (appliedCoupon) {
        const data = readConfig();
        const c = (data.cfg.coupons || []).find(x => String(x.code || '').toUpperCase() === appliedCoupon.code.toUpperCase());
        if (c) { c.usedCount = (c.usedCount || 0) + 1; writeJSON(CONFIG_FILE, data); }
      }

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

  // ── GET /api/public-stream — SSE público (site do cliente), avisa quando o cardápio/config muda ──
  if (pathname === '/api/public-stream' && req.method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write(': connected\n\n');
    publicSseClients.add(res);
    const keepAlive = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 25000);
    req.on('close', () => { clearInterval(keepAlive); publicSseClients.delete(res); });
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
