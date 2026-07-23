import express from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import https from 'https';
import http from 'http';
import net from 'net';
import os from 'os';
import url from 'url';
import { createServer as createViteServer } from 'vite';

// Import local helper modules
import customerDB from './db';
import notifications from './notifications';

const app = express();
const PORT = 3000;

const DATA_DIR = path.join(process.cwd(), 'data');
const PUBLIC_DIR = path.join(process.cwd(), 'public');
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');

// Ensure directories and files exist
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// Load default menu
let DEFAULT_MENU: any[] = [];
try {
  const menuPath = fs.existsSync(path.join(process.cwd(), 'default-menu.json'))
    ? path.join(process.cwd(), 'default-menu.json')
    : path.join(DATA_DIR, 'default-menu.json');
  if (fs.existsSync(menuPath)) {
    DEFAULT_MENU = JSON.parse(fs.readFileSync(menuPath, 'utf8'));
  }
} catch (e) {
  console.error('Error loading default-menu.json', e);
}

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
    actionNovo: 'Aceitar Pedido',
    actionPrep: 'Marcar Pronto',
    actionPronto: 'Confirmar Entrega',
    colNovo: 'Novos',
    colPrep: 'Preparando',
    colPronto: 'Pronto',
    colEntregue: 'Entregue',
    btnCancel: 'Cancelar',
    btnPrint: 'Imprimir',
  },
  pixKey: '', pixName: 'Shogatsu Culinaria Oriental', pixCity: 'RIO DAS OSTRAS',
  printFont: 'Verdana, sans-serif',
  printSize: 20,
  printColor: '#000000',
  logoShape: 'retangular',
  logoSize: 40,
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
  feeBaseKm: 2,
  feeBaseValue: 8,
  feePerKm: 2.5,
  feeMaxKm: 12,
  feeRound: 0.5,
  feeZonesCep: [],
  feeZonesBairro: [],
  feeZoneFallback: 'padrao',
  coupons: [],
  nextTicketNumber: 1,
  sms: { accountSid: '', authToken: '', fromNumber: '' },
  vapid: { publicKey: '', privateKey: '' },
  reviewPrompt: 'O que você achou do seu pedido? Sua opinião ajuda muito a gente! 🍣',
  reviewPhrases: [
    'Comida deliciosa! 😋',
    'Entrega rápida! 🛵',
    'Atendimento excelente! ⭐',
    'Embalagem caprichada 📦',
    'Voltarei a pedir com certeza! 🙌'
  ],
  announcements: []
};

function safeWriteJSON(file: string, data: any) {
  try {
    const tmp = file + '.tmp';
    const bak = file + '.bak';
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmp, jsonStr, 'utf8');
    if (fs.existsSync(file)) {
      try { fs.copyFileSync(file, bak); } catch (e) {}
    }
    fs.renameSync(tmp, file);
  } catch (err) {
    console.error(`❌ safeWriteJSON error writing to ${file}:`, err);
    try { fs.writeFileSync(file, JSON.stringify(data, null, 2)); } catch (e) {}
  }
}

if (!fs.existsSync(CONFIG_FILE)) {
  safeWriteJSON(CONFIG_FILE, { cfg: DEFAULT_CFG, menu: DEFAULT_MENU });
}
if (!fs.existsSync(ORDERS_FILE)) safeWriteJSON(ORDERS_FILE, []);
if (!fs.existsSync(CUSTOMERS_FILE)) safeWriteJSON(CUSTOMERS_FILE, []);

function readJSON(file: string, fallback: any = []) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
    const bak = file + '.bak';
    if (fs.existsSync(bak)) {
      return JSON.parse(fs.readFileSync(bak, 'utf8'));
    }
    return fallback;
  } catch (e) {
    const bak = file + '.bak';
    if (fs.existsSync(bak)) {
      try { return JSON.parse(fs.readFileSync(bak, 'utf8')); } catch (e2) {}
    }
    return fallback;
  }
}

function writeJSON(file: string, data: any) {
  safeWriteJSON(file, data);
}

function isWithinSchedule(openTime: string, closeTime: string) {
  if (!openTime || !closeTime) return true;
  const nowStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const toMinutes = (t: string) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const nowMin = toMinutes(nowStr), openMin = toMinutes(openTime), closeMin = toMinutes(closeTime);
  if (openMin === closeMin) return true;
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin;
}

function normalizeMenu(menu: any[]) {
  const validStations = ['cozinha', 'sushibar', 'bar'];
  return (menu || []).map(sec => ({
    ...sec,
    items: (sec.items || []).map((it: any) => {
      const base = { station: 'cozinha', available: true, variants: [], ...it };
      let stations = Array.isArray(base.stations) ? base.stations.filter((s: string) => validStations.includes(s)) : [];
      if (!stations.length) stations = [validStations.includes(base.station) ? base.station : 'cozinha'];
      const { station, ...rest } = base;
      return { ...rest, stations: [...new Set(stations)] };
    })
  }));
}

function readConfig() {
  const data = readJSON(CONFIG_FILE, { cfg: DEFAULT_CFG, menu: DEFAULT_MENU });
  const cfg = {
    ...DEFAULT_CFG,
    ...data.cfg,
    stations: { ...DEFAULT_CFG.stations, ...(data.cfg?.stations || {}) },
    labels: { ...DEFAULT_CFG.labels, ...(data.cfg?.labels || {}) },
    uiFonts: { ...DEFAULT_CFG.uiFonts, ...(data.cfg?.uiFonts || {}) },
    theme: { ...DEFAULT_CFG.theme, ...(data.cfg?.theme || {}) },
    cancelReasons: data.cfg?.cancelReasons || DEFAULT_CFG.cancelReasons,
    slides: data.cfg?.slides || DEFAULT_CFG.slides,
    users: (Array.isArray(data.cfg?.users) && data.cfg.users.length) ? data.cfg.users : DEFAULT_CFG.users,
    sms: { ...DEFAULT_CFG.sms, ...(data.cfg?.sms || {}) },
    vapid: { ...DEFAULT_CFG.vapid, ...(data.cfg?.vapid || {}) },
    schedule: { ...DEFAULT_CFG.schedule, ...(data.cfg?.schedule || {}) }
  };
  if (cfg.schedule && cfg.schedule.enabled) {
    cfg.open = isWithinSchedule(cfg.schedule.openTime, cfg.schedule.closeTime) ? 1 : 0;
  }

  let menu = normalizeMenu(data.menu);
  if (!menu || menu.length === 0) {
    console.warn('⚠️ Menu in config.json was empty or missing. Recovering default-menu.json...');
    menu = normalizeMenu(DEFAULT_MENU);
    // Write back non-empty menu so config.json is auto-healed
    safeWriteJSON(CONFIG_FILE, { cfg, menu });
  }

  return { cfg, menu };
}

// Session store
const sessions = new Map<string, { expiresAt: number; role: string; username: string }>();
function newSession(role?: string, username?: string) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 12, role: role || 'admin', username: username || 'admin' });
  return token;
}
function getSession(token?: string) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) { if (token) sessions.delete(token); return null; }
  return s;
}
function checkAuth(token?: string) { return !!getSession(token); }

const ROLE_RANK: Record<string, number> = { vendas: 1, admin: 2, master: 3 };
function requireRole(token?: string, minRole: string = 'vendas') {
  const s = getSession(token);
  if (!s) return false;
  return (ROLE_RANK[s.role] || 0) >= (ROLE_RANK[minRole] || 99);
}

function normalizePhone(phone: any) { return String(phone || '').replace(/\D/g, ''); }
function hashPin(phone: string, pin: string | number) {
  return crypto.createHash('sha256').update(normalizePhone(phone) + ':' + String(pin) + ':shogatsu-salt').digest('hex');
}
function customerStats(phone: string, orders: any[]) {
  const p = normalizePhone(phone);
  const mine = orders.filter(o => normalizePhone(o.phone) === p && o.status !== 'cancelado');
  return {
    orderCount: mine.length,
    lastOrderAt: mine.length ? mine[0].createdAt : null
  };
}

// SSE broadcasting
const sseClients = new Set<express.Response>();
function broadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) { try { res.write(payload); } catch (e) {} }
}

const publicSseClients = new Set<express.Response>();
function publicBroadcast(event: string, data: any) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of publicSseClients) { try { res.write(payload); } catch (e) {} }
}

function httpsGetJSON(urlStr: string, headers: any = {}, timeoutMs = 6000): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(urlStr, { headers }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if ((res.statusCode || 0) < 200 || (res.statusCode || 0) >= 300) {
          return reject(new Error('HTTP ' + res.statusCode));
        }
        try { resolve(JSON.parse(body)); } catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => { req.destroy(new Error('timeout')); });
  });
}

async function lookupCEP(cep: string) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (clean.length !== 8) return null;
  const data = await httpsGetJSON(`https://viacep.com.br/ws/${clean}/json/`);
  if (!data || data.erro) return null;
  return { street: data.logradouro || '', hood: data.bairro || '', city: data.localidade || '', uf: data.uf || '' };
}

async function geocodeAddress(addressText: string) {
  const q = encodeURIComponent(addressText);
  const data = await httpsGetJSON(
    `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`,
    { 'User-Agent': 'ShogatsuPedidosOnline/1.0' }
  );
  if (!Array.isArray(data) || !data.length) return null;
  return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
}

async function reverseGeocode(lat: number, lng: number) {
  const data = await httpsGetJSON(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
    { 'User-Agent': 'ShogatsuPedidosOnline/1.0' }
  );
  if (!data || !data.address) return null;
  const a = data.address;
  return {
    cep: (a.postcode || '').replace(/\D/g, ''),
    street: a.road || '',
    number: a.house_number || '',
    hood: a.suburb || a.neighbourhood || a.city_district || '',
    city: a.city || a.town || a.municipality || '',
    uf: a.state_code || (a.state ? a.state.slice(0, 2).toUpperCase() : '')
  };
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371;
  const toRad = (d: number) => d * Math.PI / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcFeeByDistance(cfg: any, distanceKm: number) {
  const baseKm = Number(cfg.feeBaseKm) || 0;
  const extraKm = Math.max(0, distanceKm - baseKm);
  let fee = (Number(cfg.feeBaseValue) || 0) + extraKm * (Number(cfg.feePerKm) || 0);
  const round = Number(cfg.feeRound) || 0;
  if (round > 0) fee = Math.ceil(fee / round) * round;
  return Math.round(fee * 100) / 100;
}

function normalizeText(s: string) {
  return String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function matchCepZone(cep: string, zones: any[]) {
  const clean = String(cep || '').replace(/\D/g, '');
  if (!clean || !Array.isArray(zones) || !zones.length) return null;
  const withPrefix = zones.map(z => ({ ...z, p: String(z.prefix || '').replace(/\D/g, '') })).filter(z => z.p);
  const sorted = withPrefix.sort((a, b) => b.p.length - a.p.length);
  return sorted.find(z => clean.startsWith(z.p)) || null;
}

function matchBairroZone(hood: string, zones: any[]) {
  const h = normalizeText(hood);
  if (!h || !Array.isArray(zones) || !zones.length) return null;
  const exact = zones.find(z => normalizeText(z.bairro) === h);
  if (exact) return exact;
  return zones.find(z => {
    const zb = normalizeText(z.bairro);
    return zb && (h.includes(zb) || zb.includes(h));
  }) || null;
}

function findValidCoupon(cfg: any, code: string, subtotal: number) {
  const c = String(code || '').trim().toUpperCase();
  if (!c) return { error: 'Informe um cupom.' };
  const coupon = (cfg.coupons || []).find((x: any) => String(x.code || '').toUpperCase() === c);
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

function sendSMS(toPhone: string, body: string, smsCfg: any) {
  return new Promise((resolve, reject) => {
    if (!smsCfg.accountSid || !smsCfg.authToken || !smsCfg.fromNumber) {
      return reject(new Error('SMS não configurado. Cadastre sua conta Twilio em Configurações → SMS.'));
    }
    const to = String(toPhone || '').replace(/\D/g, '');
    if (!to) return reject(new Error('Número de telefone inválido.'));
    const params = new url.URLSearchParams({ To: '+55' + to, From: smsCfg.fromNumber, Body: body }).toString();
    const auth = Buffer.from(`${smsCfg.accountSid}:${smsCfg.authToken}`).toString('base64');
    const req = https.request({
      hostname: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${smsCfg.accountSid}/Messages.json`,
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(params)
      },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if ((res.statusCode || 0) >= 200 && (res.statusCode || 0) < 300) resolve(true);
        else { try { reject(new Error(JSON.parse(data).message || 'Falha ao enviar SMS.')); } catch (e) { reject(new Error('Falha ao enviar SMS.')); } }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tempo esgotado ao tentar enviar SMS.')); });
    req.write(params);
    req.end();
  });
}

const ESC = {
  init: '\x1B\x40',
  boldOn: '\x1B\x45\x01', boldOff: '\x1B\x45\x00',
  center: '\x1B\x61\x01', left: '\x1B\x61\x00',
  doubleOn: '\x1D\x21\x11', doubleOff: '\x1D\x21\x00',
  cut: '\x1D\x56\x01',
  feed: '\n\n\n'
};

function buildTicketText(lines: string[], cfg: any) {
  const big = cfg && Number(cfg.printSize) >= 18;
  const body = big ? ESC.doubleOn + lines.join('\n') + ESC.doubleOff : lines.join('\n');
  return ESC.init + body + ESC.feed + ESC.cut;
}

function sendNetworkPrint(ip: string, port: number, text: string) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ host: ip, port: port || 9100, timeout: 5000 }, () => {
      socket.write(Buffer.from(text, 'binary'), () => socket.end());
    });
    socket.on('close', () => resolve(true));
    socket.on('timeout', () => { socket.destroy(); reject(new Error('timeout ao conectar na impressora')); });
    socket.on('error', reject);
  });
}

function sendUSBPrint(devicePath: string, text: string) {
  return new Promise((resolve, reject) => {
    fs.writeFile(devicePath, Buffer.from(text, 'binary'), (err) => {
      if (err) return reject(err);
      resolve(true);
    });
  });
}

function crc16(payload: string) {
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
function tlv(id: string, value: string) {
  const len = value.length.toString().padStart(2, '0');
  return `${id}${len}${value}`;
}
function sanitizePix(str: string, max: number) {
  return (str || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .toUpperCase().slice(0, max) || 'NA';
}
function buildPixPayload({ pixKey, merchantName, merchantCity, amount, txid }: any) {
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

function getTokenFromReq(req: express.Request) {
  const h = req.headers['authorization'];
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  return (req.query.token as string) || null;
}

// Enable JSON parsing middleware with increased payload limit for image uploads
app.use(express.json({ limit: '15mb' }));

// Static uploads serving
app.use('/uploads', express.static(UPLOADS_DIR));

// ─── API ROUTES ───

app.get('/api/admin/system-health', async (req, res) => {
  try {
    const { cfg, menu } = readConfig();
    const orders = readJSON(ORDERS_FILE, []);
    const customers = await customerDB.listCustomers();
    const itemCount = (menu || []).reduce((acc: number, cat: any) => acc + (cat.items || []).length, 0);

    res.json({
      status: 'ok',
      database: customerDB.useDB ? 'Postgres/Supabase Connected' : 'Local JSON File Mode',
      counts: {
        categories: (menu || []).length,
        menuItems: itemCount,
        orders: orders.length,
        customers: customers.length
      },
      backupStatus: {
        configBak: fs.existsSync(CONFIG_FILE + '.bak'),
        ordersBak: fs.existsSync(ORDERS_FILE + '.bak'),
        customersBak: fs.existsSync(CUSTOMERS_FILE + '.bak')
      },
      timestamp: new Date().toISOString()
    });
  } catch (e: any) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

app.get('/api/config', (req, res) => {
  const { cfg, menu } = readConfig();
  const { adminPass, masterPass, ...publicCfg } = cfg;
  res.json({ cfg: publicCfg, menu });
});

app.post('/api/config', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) {
    return res.status(403).json({ error: 'Seu usuário não tem permissão pra alterar configurações/cardápio.' });
  }
  const body = req.body;
  const current = readConfig();

  let targetMenu = body.menu;
  if (Array.isArray(targetMenu) && targetMenu.length === 0 && current.menu && current.menu.length > 0) {
    console.warn('⚠️ Prevented clearing menu with empty array via POST /api/config');
    targetMenu = current.menu;
  } else if (!targetMenu || !Array.isArray(targetMenu) || targetMenu.length === 0) {
    targetMenu = current.menu;
  }

  const merged = {
    cfg: {
      ...current.cfg, ...body.cfg,
      adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass,
      stations: { ...current.cfg.stations, ...(body.cfg?.stations || {}) },
      labels: { ...current.cfg.labels, ...(body.cfg?.labels || {}) },
      uiFonts: { ...current.cfg.uiFonts, ...(body.cfg?.uiFonts || {}) },
      theme: { ...current.cfg.theme, ...(body.cfg?.theme || {}) },
      sms: { ...current.cfg.sms, ...(body.cfg?.sms || {}) },
      vapid: { ...current.cfg.vapid, ...(body.cfg?.vapid || {}) },
      schedule: { ...current.cfg.schedule, ...(body.cfg?.schedule || {}) }
    },
    menu: targetMenu
  };

  writeJSON(CONFIG_FILE, merged);

  // Also maintain default-menu backup if valid
  if (Array.isArray(targetMenu) && targetMenu.length > 0) {
    safeWriteJSON(path.join(DATA_DIR, 'default-menu.json'), targetMenu);
  }

  notifications.configurarVapid(merged.cfg);
  broadcast('config-updated', {});
  publicBroadcast('menu-updated', {});
  res.json({ ok: true });
});

app.post('/api/change-password', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { which, current: curPass, next } = req.body;
  const field = which === 'master' ? 'masterPass' : 'adminPass';
  const data = readConfig();
  if (curPass !== data.cfg[field]) return res.status(403).json({ error: 'senha atual incorreta' });
  if (!next || next.length < 4) return res.status(400).json({ error: 'nova senha muito curta (mín. 4 caracteres)' });
  data.cfg[field] = next;
  writeJSON(CONFIG_FILE, data);
  res.json({ ok: true });
});

app.post('/api/admin/send-promo-sms', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão pra enviar SMS.' });
  const { phones, message } = req.body;
  const { cfg } = readConfig();
  const msg = String(message || '').slice(0, 300).trim();
  if (!msg) return res.status(400).json({ error: 'Digite a mensagem.' });
  const list = Array.isArray(phones) ? phones.slice(0, 200) : [];
  if (!list.length) return res.status(400).json({ error: 'Selecione pelo menos um cliente.' });
  const results = { sent: 0, failed: 0, errors: [] as string[] };
  for (const phone of list) {
    try { await sendSMS(phone, msg, cfg.sms); results.sent++; }
    catch (e: any) { results.failed++; if (results.errors.length < 3) results.errors.push(e.message); }
  }
  res.json({ ok: true, ...results });
});

app.post('/api/admin/vapid/generate', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'sem permissão' });
  try {
    const keys = notifications.gerarChavesVapid();
    res.json({ ok: true, publicKey: keys.publicKey, privateKey: keys.privateKey });
  } catch (e: any) { res.status(400).json({ error: e.message }); }
});

app.get('/api/push/vapid-public-key', (req, res) => {
  const { cfg } = readConfig();
  notifications.configurarVapid(cfg);
  res.json({ publicKey: (cfg.vapid && cfg.vapid.publicKey) || '', disponivel: notifications.webpushDisponivel() });
});

app.post('/api/push/subscribe', (req, res) => {
  const { phone, subscription } = req.body;
  if (!phone || !subscription || !subscription.endpoint) return res.status(400).json({ error: 'dados de inscrição inválidos' });
  notifications.saveSubscription(phone, subscription);
  res.json({ ok: true });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const { endpoint } = req.body;
  if (endpoint) notifications.removeSubscription(endpoint);
  res.json({ ok: true });
});

app.get('/api/admin/campaigns', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  res.json(notifications.readCampaigns());
});

app.patch('/api/admin/campaigns/messages/:id', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const id = req.params.id;
  const { active } = req.body;
  const data = notifications.readCampaigns();
  const msg = data.mensagens.find((m: any) => m.id === id);
  if (!msg) return res.status(404).json({ error: 'mensagem não encontrada' });
  msg.active = !!active;
  notifications.writeCampaigns(data);
  res.json({ ok: true, mensagem: msg });
});

app.get('/api/admin/campaigns/schedule', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const data = notifications.readCampaigns();
  res.json({ horarios: data.horarios });
});

app.post('/api/admin/campaigns/schedule', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'sem permissão' });
  const { horarios } = req.body;
  const validos = (Array.isArray(horarios) ? horarios : []).filter((h) => /^([01]\d|2[0-3]):[0-5]\d$/.test(h));
  if (!validos.length) return res.status(400).json({ error: 'informe ao menos um horário válido (HH:MM)' });
  const data = notifications.readCampaigns();
  data.horarios = validos;
  notifications.writeCampaigns(data);
  res.json({ ok: true, horarios: validos });
});

app.post('/api/admin/campaigns/send-now', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'sem permissão' });
  try {
    const resultado = await notifications.dispararProximaCampanha();
    res.json({ ok: true, ...resultado });
  } catch (e: any) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/users', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'master')) return res.status(403).json({ error: 'Só o usuário master pode gerenciar usuários.' });
  const { cfg } = readConfig();
  res.json({ users: (cfg.users || []).map((u: any) => ({ username: u.username, role: u.role })) });
});

app.post('/api/admin/users', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'master')) return res.status(403).json({ error: 'Só o usuário master pode gerenciar usuários.' });
  const { username, password, role } = req.body;
  const uname = String(username || '').trim().toLowerCase();
  if (!uname || uname.length < 3) return res.status(400).json({ error: 'Usuário precisa ter pelo menos 3 caracteres.' });
  if (!['master', 'admin', 'vendas'].includes(role)) return res.status(400).json({ error: 'Nível de acesso inválido.' });
  const data = readConfig();
  const existing = data.cfg.users.find((u: any) => String(u.username || '').toLowerCase() === uname);
  if (existing) {
    existing.role = role;
    if (password) existing.password = password;
  } else {
    if (!password || password.length < 4) return res.status(400).json({ error: 'Senha precisa ter pelo menos 4 caracteres.' });
    data.cfg.users.push({ username: uname, password, role });
  }
  writeJSON(CONFIG_FILE, data);
  res.json({ ok: true, users: data.cfg.users.map((u: any) => ({ username: u.username, role: u.role })) });
});

app.delete('/api/admin/users/:uname', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'master')) return res.status(403).json({ error: 'Só o usuário master pode gerenciar usuários.' });
  const uname = decodeURIComponent(req.params.uname || '').toLowerCase();
  const data = readConfig();
  const target = data.cfg.users.find((u: any) => String(u.username || '').toLowerCase() === uname);
  if (!target) return res.status(404).json({ error: 'Usuário não encontrado.' });
  if (target.role === 'master' && data.cfg.users.filter((u: any) => u.role === 'master').length <= 1) {
    return res.status(400).json({ error: 'Precisa existir pelo menos um usuário master.' });
  }
  data.cfg.users = data.cfg.users.filter((u: any) => String(u.username || '').toLowerCase() !== uname);
  writeJSON(CONFIG_FILE, data);
  res.json({ ok: true });
});

app.post('/api/upload', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { dataUrl } = req.body;
  const m = /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,(.+)$/i.exec(dataUrl || '');
  if (!m) return res.status(400).json({ error: 'Formato inválido. Use PNG, JPG, WEBP, GIF ou SVG.' });
  let ext = m[1].toLowerCase();
  if (ext === 'jpeg') ext = 'jpg';
  if (ext === 'svg+xml') ext = 'svg';
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length > 10 * 1024 * 1024) return res.status(400).json({ error: 'Imagem muito grande (máx. 10MB).' });
  const filename = crypto.randomBytes(8).toString('hex') + '.' + ext;
  fs.writeFileSync(path.join(UPLOADS_DIR, filename), buffer);
  res.json({ url: '/uploads/' + filename });
});

app.post('/api/orders/purge', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { masterPass, beforeDate } = req.body;
  const data = readConfig();
  if (masterPass !== data.cfg.masterPass) return res.status(403).json({ error: 'Senha master incorreta.' });
  if (!beforeDate) return res.status(400).json({ error: 'Informe a data limite.' });
  const cutoff = new Date(beforeDate).getTime();
  let orders = readJSON(ORDERS_FILE, []);
  const before = orders.length;
  orders = orders.filter((o: any) => new Date(o.createdAt).getTime() >= cutoff);
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true, deleted: before - orders.length });
});

app.get('/api/reports', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const orders = readJSON(ORDERS_FILE, []);
  const from = req.query.from ? new Date(req.query.from + 'T00:00:00').getTime() : 0;
  const to = req.query.to ? new Date(req.query.to + 'T23:59:59').getTime() : Infinity;
  const filtered = orders.filter((o: any) => {
    const t = new Date(o.createdAt).getTime();
    return t >= from && t <= to && o.status !== 'cancelado';
  });
  const totalOrders = filtered.length;
  const totalRevenue = filtered.reduce((s: number, o: any) => s + Number(o.total || 0), 0);
  const avgTicket = totalOrders ? totalRevenue / totalOrders : 0;
  const byPayMethod: Record<string, number> = {}, byDayMap: Record<string, any> = {}, itemsMap: Record<string, any> = {};
  filtered.forEach((o: any) => {
    byPayMethod[o.payMethod] = (byPayMethod[o.payMethod] || 0) + Number(o.total || 0);
    const day = o.createdAt.slice(0, 10);
    if (!byDayMap[day]) byDayMap[day] = { date: day, revenue: 0, orders: 0 };
    byDayMap[day].revenue += Number(o.total || 0);
    byDayMap[day].orders++;
    (o.items || []).forEach((i: any) => {
      if (!itemsMap[i.name]) itemsMap[i.name] = { name: i.name, qty: 0, revenue: 0 };
      itemsMap[i.name].qty += i.qty;
      itemsMap[i.name].revenue += i.price * i.qty;
    });
  });
  const topItems = Object.values(itemsMap).sort((a: any, b: any) => b.qty - a.qty).slice(0, 15);
  const byDay = Object.values(byDayMap).sort((a: any, b: any) => a.date.localeCompare(b.date));
  res.json({ totalOrders, totalRevenue, avgTicket, byPayMethod, byDay, topItems });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const { cfg } = readConfig();
  const uname = String(username || '').trim().toLowerCase();

  if (uname) {
    const user = (cfg.users || []).find((u: any) => String(u.username || '').toLowerCase() === uname);
    if (user && password === user.password) {
      return res.json({ token: newSession(user.role, user.username), role: user.role, username: user.username });
    }
    return res.status(401).json({ error: 'Usuário ou senha incorretos.' });
  }

  if (password === cfg.adminPass) return res.json({ token: newSession('admin', 'admin'), role: 'admin', username: 'admin' });
  if (password === cfg.masterPass) return res.json({ token: newSession('master', 'master'), role: 'master', username: 'master' });
  res.status(401).json({ error: 'senha incorreta' });
});

app.post('/api/pix', (req, res) => {
  const { amount, txid } = req.body;
  const { cfg } = readConfig();
  if (!cfg.pixKey) return res.status(400).json({ error: 'PIX não configurado pelo restaurante' });
  const payload = buildPixPayload({
    pixKey: cfg.pixKey, merchantName: cfg.pixName, merchantCity: cfg.pixCity, amount, txid
  });
  const qrImg = `https://api.qrserver.com/v1/create-qr-code/?size=260x260&data=${encodeURIComponent(payload || '')}`;
  res.json({ payload, qrImg });
});

app.get('/api/cep/:cep', async (req, res) => {
  const cep = req.params.cep;
  try {
    const addr = await lookupCEP(cep);
    if (!addr) return res.json({ ok: false, error: 'CEP não encontrado.' });
    res.json({ ok: true, ...addr });
  } catch (e) { res.json({ ok: false, error: 'Não foi possível buscar esse CEP agora.' }); }
});

app.post('/api/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.body;
  if (typeof lat !== 'number' || typeof lng !== 'number') return res.status(400).json({ error: 'Coordenadas inválidas.' });
  try {
    const addr = await reverseGeocode(lat, lng);
    if (!addr) return res.json({ ok: false, error: 'Não conseguimos identificar seu endereço. Preencha manualmente.' });
    res.json({ ok: true, ...addr });
  } catch (e) { res.json({ ok: false, error: 'Não conseguimos identificar seu endereço. Preencha manualmente.' }); }
});

app.post('/api/delivery-fee', async (req, res) => {
  const { cep, street, hood, city, uf } = req.body;
  const { cfg } = readConfig();
  const cleanCep = String(cep || '').replace(/\D/g, '');

  if (cfg.feeMode === 'cep') {
    if (!cleanCep) return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
    const match = matchCepZone(cleanCep, cfg.feeZonesCep);
    if (match) return res.json({ fee: Number(match.fee) || 0, mode: 'cep', zoneLabel: match.label || match.prefix, distanceKm: null });
    if (cfg.feeZoneFallback === 'bloqueado') {
      return res.json({ error: 'fora_area', message: `Esse CEP ainda não está na nossa área de entrega.` });
    }
    return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
  }

  if (cfg.feeMode === 'bairro') {
    let addrHood = String(hood || '').trim();
    if (!addrHood && cleanCep) {
      try { const viacep = await lookupCEP(cleanCep); if (viacep) addrHood = viacep.hood; } catch (e) {}
    }
    if (!addrHood) return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
    const match = matchBairroZone(addrHood, cfg.feeZonesBairro);
    if (match) return res.json({ fee: Number(match.fee) || 0, mode: 'bairro', zoneLabel: match.bairro, distanceKm: null });
    if (cfg.feeZoneFallback === 'bloqueado') {
      return res.json({ error: 'fora_area', message: `Ainda não entregamos no bairro "${addrHood}".` });
    }
    return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
  }

  if (cfg.feeMode !== 'distancia' || !cfg.storeLat || !cfg.storeLng) {
    return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo', distanceKm: null });
  }

  try {
    let addrStreet = String(street || '').trim();
    let addrHood = String(hood || '').trim();
    let addrCity = String(city || '').trim();
    let addrUf = String(uf || '').trim();

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
      return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
    }

    const geo = await geocodeAddress(queryText);
    if (!geo) {
      return res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
    }

    const distanceKm = haversineKm(Number(cfg.storeLat), Number(cfg.storeLng), geo.lat, geo.lng);
    const maxKm = Number(cfg.feeMaxKm) || 0;
    if (maxKm > 0 && distanceKm > maxKm) {
      return res.json({ error: 'fora_area', distanceKm: Math.round(distanceKm * 10) / 10, maxKm });
    }

    const fee = calcFeeByDistance(cfg, distanceKm);
    res.json({ fee, mode: 'distancia', distanceKm: Math.round(distanceKm * 10) / 10 });
  } catch (geoErr) {
    res.json({ fee: Number(cfg.fee) || 0, mode: 'fixo_fallback', distanceKm: null });
  }
});

app.get('/api/admin/detect-usb-printers', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão.' });
  const candidates: string[] = [];
  try {
    ['/dev/usb', '/dev'].forEach(dir => {
      if (fs.existsSync(dir)) {
        fs.readdirSync(dir).forEach(f => {
          if (/^(lp\d+|ttyUSB\d+)$/.test(f)) candidates.push(path.join(dir, f));
        });
      }
    });
  } catch (e) {}
  res.json({
    found: candidates,
    note: candidates.length ? null : 'Nenhuma impressora USB encontrada.'
  });
});

app.get('/api/admin/detect-network-printers', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão.' });
  const nets = os.networkInterfaces();
  let base: string | null = null;
  Object.values(nets).flat().forEach(n => {
    if (n && n.family === 'IPv4' && !n.internal && n.address.startsWith('192.168.')) {
      base = n.address.split('.').slice(0, 3).join('.');
    }
  });
  if (!base) {
    return res.json({ found: [], note: 'Não foi possível identificar uma rede local Wi-Fi a partir deste servidor.' });
  }
  const tryPort = (ip: string) => new Promise((resolve) => {
    const socket = net.createConnection({ host: ip, port: 9100, timeout: 400 }, () => { socket.destroy(); resolve(ip); });
    socket.on('error', () => resolve(null));
    socket.on('timeout', () => { socket.destroy(); resolve(null); });
  });
  const results = await Promise.all(Array.from({ length: 254 }, (_, i) => tryPort(`${base}.${i + 1}`)));
  const found = results.filter(Boolean);
  res.json({ found, note: found.length ? null : `Nenhuma impressora respondendo na porta 9100 dentro de ${base}.0/24.` });
});

app.post('/api/admin/geocode-store', async (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const body = req.body;
  const data = readConfig();
  const address = String(body.address || data.cfg.addr || '').trim();
  if (!address) return res.status(400).json({ error: 'Informe o endereço do restaurante.' });
  try {
    const geo = await geocodeAddress(address + ', Brasil');
    if (!geo) return res.status(404).json({ error: 'Não conseguimos localizar esse endereço. Tente descrevê-lo de outro jeito.' });
    data.cfg.storeLat = geo.lat;
    data.cfg.storeLng = geo.lng;
    writeJSON(CONFIG_FILE, data);
    res.json({ lat: geo.lat, lng: geo.lng, label: geo.label });
  } catch (e) { res.status(500).json({ error: 'Erro ao localizar endereço.' }); }
});

app.get('/api/admin/backup', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão pra exportar dados.' });
  const format = req.query.format || 'json';
  const type = req.query.type || '';
  const stamp = new Date().toISOString().slice(0, 10);

  const csvEscape = (v: any) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  const sendFile = (filename: string, contentType: string, body: string) => {
    res.setHeader('Content-Type', contentType + '; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(body);
  };

  if (format === 'csv' && type === 'clientes') {
    const customers = await customerDB.listCustomers();
    const rows = [['Nome', 'Telefone', 'Cadastrado em', 'Último Endereço'].join(',')]
      .concat(customers.map((c: any) => [csvEscape(c.name), csvEscape(c.phone), csvEscape(c.createdAt), csvEscape(c.lastAddress || '')].join(',')));
    return sendFile(`clientes-${stamp}.csv`, 'text/csv', '\uFEFF' + rows.join('\r\n'));
  }

  if (format === 'csv' && type === 'pedidos') {
    const orders = readJSON(ORDERS_FILE, []);
    const rows = [['Pedido', 'Data', 'Status', 'Cliente', 'Modo', 'Itens', 'Subtotal', 'Taxa', 'Desconto', 'Total', 'Pagamento'].join(',')]
      .concat(orders.map((o: any) => [
        csvEscape(o.id), csvEscape(o.createdAt), csvEscape(o.status), csvEscape(o.name), csvEscape(o.mode),
        csvEscape((o.items || []).map((i: any) => `${i.qty}x ${i.name}`).join(' | ')),
        csvEscape(o.subtotal), csvEscape(o.fee), csvEscape(o.discount || 0), csvEscape(o.total), csvEscape(o.payMethod)
      ].join(',')));
    return sendFile(`pedidos-${stamp}.csv`, 'text/csv', '\uFEFF' + rows.join('\r\n'));
  }

  if (format === 'txt' && type === 'cardapio') {
    const { menu } = readConfig();
    const lines = ['CARDÁPIO — exportado em ' + new Date().toLocaleString('pt-BR'), ''];
    menu.forEach((sec: any) => {
      lines.push('═'.repeat(40));
      lines.push((sec.icon || '') + ' ' + sec.title.toUpperCase());
      lines.push('═'.repeat(40));
      sec.items.forEach((it: any) => {
        lines.push(`- ${it.name} ......... R$ ${Number(it.price).toFixed(2)}`);
        if (it.desc) lines.push(`  ${it.desc}`);
        if (it.available === false) lines.push('  [ESGOTADO]');
      });
      lines.push('');
    });
    return sendFile(`cardapio-${stamp}.txt`, 'text/plain', lines.join('\n'));
  }

  const data = readConfig();
  const orders = readJSON(ORDERS_FILE, []);
  const customers = await customerDB.listCustomers();
  const backup = { exportedAt: new Date().toISOString(), version: 1, cfg: data.cfg, menu: data.menu, orders, customers };
  sendFile(`shogatsu-backup-${stamp}.json`, 'application/json', JSON.stringify(backup, null, 2));
});

app.post('/api/admin/restore', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'master')) return res.status(403).json({ error: 'Só o usuário master pode restaurar um backup.' });
  try {
    const body = req.body;
    if (!body || body.version !== 1 || !body.cfg || !body.menu) {
      return res.status(400).json({ error: 'Arquivo de backup inválido.' });
    }
    const current = readConfig();
    writeJSON(CONFIG_FILE, {
      cfg: { ...current.cfg, ...body.cfg, adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass },
      menu: body.menu
    });
    if (Array.isArray(body.orders)) writeJSON(ORDERS_FILE, body.orders);
    if (Array.isArray(body.customers)) await customerDB.replaceAllCustomers(body.customers);
    publicBroadcast('menu-updated', {});
    res.json({
      ok: true,
      restored: { pedidos: (body.orders || []).length, clientes: (body.customers || []).length, categorias: (body.menu || []).length }
    });
  } catch (e) { res.status(400).json({ error: 'Não foi possível ler esse arquivo de backup.' }); }
});

function estimateDeliveryWindow(order: any, cfg: any) {
  const nums = String(cfg.time || '').match(/\d+/g);
  const created = new Date(order.createdAt);
  const fmt = (d: Date) => d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
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

app.post('/api/print', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { orderId, station } = req.body;
  const st = ['cozinha', 'sushibar', 'bar', 'caixa'].includes(station) ? station : null;
  if (!st) return res.status(400).json({ error: 'Via inválida.' });
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === orderId);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado.' });
  const { cfg } = readConfig();
  const isCaixa = st === 'caixa';

  const items = isCaixa ? order.items : order.items.filter((i: any) => (i.stations || []).includes(st));
  if (!items.length) return res.json({ ok: true, printed: false, skipped: true, order, station: st });

  const deliveryWindow = estimateDeliveryWindow(order, cfg);
  const printerCfg = cfg.stations[st] || { method: 'navegador' };
  if (printerCfg.method === 'navegador') {
    return res.json({ ok: true, printed: false, order, station: st, method: 'navegador', deliveryWindow });
  }

  const lines: string[] = [];
  lines.push(ESC.center + ESC.boldOn + (cfg.name || 'SHOGATSU').toUpperCase() + ESC.boldOff + ESC.left);
  lines.push((printerCfg.label || st).toUpperCase() + (isCaixa ? ' - COMPROVANTE' : ' - VIA DE PRODUCAO'));
  lines.push('--------------------------------');
  if (order.ticketNumber) lines.push(ESC.center + ESC.boldOn + ESC.doubleOn + 'Nº ' + order.ticketNumber + ESC.doubleOff + ESC.boldOff + ESC.left);
  lines.push((order.ticketNumber ? 'ref. #' + order.id : 'Pedido #' + order.id) + '  ' + new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
  lines.push(order.mode === 'delivery' ? 'DELIVERY' : 'RETIRADA');

  if (isCaixa) {
    lines.push('--------------------------------');
    lines.push('Cliente: ' + order.name);
    lines.push('Telefone: ' + order.phone);
    if (order.mode === 'delivery') lines.push('Endereco: ' + order.address);
    lines.push((order.mode === 'delivery' ? 'Previsao de entrega: ' : 'Previsao de retirada: ') + deliveryWindow);
    lines.push('--------------------------------');
    items.forEach((i: any) => lines.push(`${i.qty}x ${i.name}   R$ ${(i.price * i.qty).toFixed(2)}`));
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
    lines.push('--------------------------------');
    items.forEach((i: any) => lines.push(`${i.qty}x ${i.name}`));
    if (order.obs) { lines.push('--------------------------------'); lines.push('Obs: ' + order.obs); }
  }
  const ticketText = buildTicketText(lines, cfg);

  if (printerCfg.method === 'rede') {
    if (!printerCfg.ip) return res.status(400).json({ error: `Impressora de rede da via "${st}" sem IP.` });
    sendNetworkPrint(printerCfg.ip, printerCfg.port, ticketText)
      .then(() => res.json({ ok: true, printed: true, order, station: st, method: printerCfg.method }))
      .catch((e: any) => res.status(502).json({ error: e.message }));
  } else if (printerCfg.method === 'usb') {
    if (!printerCfg.device) return res.status(400).json({ error: `Caminho USB da via "${st}" não configurado.` });
    sendUSBPrint(printerCfg.device, ticketText)
      .then(() => res.json({ ok: true, printed: true, order, station: st, method: printerCfg.method }))
      .catch((e: any) => res.status(502).json({ error: e.message }));
  }
});

app.post('/api/print-test', async (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { station } = req.body;
  const { cfg } = readConfig();
  const printerCfg = cfg.stations[station];
  if (!printerCfg) return res.status(400).json({ error: 'Via inválida.' });
  if (printerCfg.method === 'navegador') return res.json({ ok: true, method: 'navegador' });
  const text = buildTicketText([
    ESC.center + ESC.boldOn + 'TESTE DE IMPRESSAO' + ESC.boldOff + ESC.left,
    'Via: ' + (printerCfg.label || station),
    new Date().toLocaleString('pt-BR')
  ], cfg);
  try {
    if (printerCfg.method === 'rede') {
      if (!printerCfg.ip) return res.status(400).json({ error: 'Informe o IP da impressora.' });
      await sendNetworkPrint(printerCfg.ip, printerCfg.port, text);
    } else if (printerCfg.method === 'usb') {
      if (!printerCfg.device) return res.status(400).json({ error: 'Informe o caminho do dispositivo USB.' });
      await sendUSBPrint(printerCfg.device, text);
    }
    res.json({ ok: true, printed: true });
  } catch (e: any) { res.status(502).json({ error: e.message }); }
});

app.post('/api/customer/register', async (req, res) => {
  const { phone, name, pin } = req.body;
  const p = normalizePhone(phone);
  if (p.length < 10) return res.status(400).json({ error: 'Telefone inválido.' });
  if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'A senha precisa ter exatamente 4 dígitos.' });
  if (!name || !name.trim()) return res.status(400).json({ error: 'Informe seu nome.' });

  const customer0 = await customerDB.findCustomerByPhone(p);
  if (customer0) return res.status(409).json({ error: 'Já existe uma conta com esse telefone. Use "Entrar" ou "Esqueci minha senha".' });

  const customer = {
    phone: p, name: String(name).trim().slice(0, 80),
    pinHash: hashPin(p, pin), createdAt: new Date().toISOString(),
    lastAddress: '', recovery: null
  };
  await customerDB.createCustomer(customer);
  res.status(201).json({ ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: '' } });
});

app.post('/api/customer/login', async (req, res) => {
  const { phone, pin } = req.body;
  const p = normalizePhone(phone);
  const customer = await customerDB.findCustomerByPhone(p);
  if (!customer || customer.pinHash !== hashPin(p, pin)) return res.status(401).json({ error: 'Telefone ou senha incorretos.' });
  const orders = readJSON(ORDERS_FILE, []);
  const stats = customerStats(p, orders);
  res.json({ ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: customer.lastAddress, ...stats } });
});

app.post('/api/customer/recovery-request', async (req, res) => {
  const { phone } = req.body;
  const p = normalizePhone(phone);
  const customer = await customerDB.findCustomerByPhone(p);
  if (!customer) return res.status(404).json({ error: 'Não existe conta com esse telefone.' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  await customerDB.updateCustomer(p, { recovery: { code, requestedAt: new Date().toISOString(), approved: false } });

  const { cfg } = readConfig();
  const waText = `Olá! Quero recuperar minha senha do Shogatsu.\nMeu telefone: ${customer.phone}\nCódigo: ${code}`;
  const waUrl = `https://wa.me/${cfg.whats}?text=${encodeURIComponent(waText)}`;
  res.json({ ok: true, code, waUrl });
});

app.post('/api/customer/recovery-set-pin', async (req, res) => {
  const { phone, code, newPin } = req.body;
  const p = normalizePhone(phone);
  if (!/^\d{4}$/.test(String(newPin || ''))) return res.status(400).json({ error: 'A nova senha precisa ter exatamente 4 dígitos.' });
  const customer = await customerDB.findCustomerByPhone(p);
  if (!customer || !customer.recovery || customer.recovery.code !== String(code)) {
    return res.status(400).json({ error: 'Código inválido.' });
  }
  if (!customer.recovery.approved) {
    return res.status(403).json({ error: 'Ainda aguardando a confirmação da loja pelo WhatsApp.' });
  }
  await customerDB.updateCustomer(p, { pinHash: hashPin(p, newPin), recovery: null });
  res.json({ ok: true });
});

app.get('/api/admin/customers', async (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão pra ver os clientes.' });
  const customers = await customerDB.listCustomers();
  const orders = readJSON(ORDERS_FILE, []);
  const list = customers.map((c: any) => ({
    phone: c.phone, name: c.name, createdAt: c.createdAt, lastAddress: c.lastAddress,
    hasPendingRecovery: !!(c.recovery && !c.recovery.approved),
    ...customerStats(c.phone, orders)
  })).sort((a: any, b: any) => b.orderCount - a.orderCount);
  res.json({ customers: list });
});

app.get('/api/admin/customers/orders', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const p = normalizePhone(req.query.phone);
  const orders = readJSON(ORDERS_FILE, []).filter((o: any) => normalizePhone(o.phone) === p);
  res.json({ orders });
});

app.post('/api/admin/customers/recovery-approve', async (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const { phone } = req.body;
  const p = normalizePhone(phone);
  const customer = await customerDB.findCustomerByPhone(p);
  if (!customer || !customer.recovery) return res.status(404).json({ error: 'Nenhuma recuperação pendente pra esse telefone.' });
  customer.recovery.approved = true;
  await customerDB.updateCustomer(p, { recovery: customer.recovery });
  res.json({ ok: true });
});

app.post('/api/coupon/validate', (req, res) => {
  const { code, subtotal } = req.body;
  const { cfg } = readConfig();
  const result = findValidCoupon(cfg, code, Number(subtotal) || 0);
  if (result.error) return res.json({ valid: false, error: result.error });
  res.json({
    valid: true,
    code: result.coupon.code,
    type: result.coupon.type,
    discount: result.discount,
    freeDelivery: result.freeDelivery,
    message: result.coupon.type === 'frete_gratis' ? 'Frete grátis aplicado! 🎉' : `Desconto de R$ ${(result.discount || 0).toFixed(2).replace('.', ',')} aplicado! 🎉`
  });
});

app.post('/api/orders', async (req, res) => {
  const body = req.body;
  const { cfg } = readConfig();
  if (!Number(cfg.open)) return res.status(400).json({ error: 'Restaurante fechado no momento.' });
  if (!body.items || !body.items.length) return res.status(400).json({ error: 'Carrinho vazio.' });

  const subtotalNum = Number(body.subtotal) || 0;
  let appliedCoupon = null, discount = 0;
  const couponCodeInput = String(body.couponCode || '').trim();
  if (couponCodeInput) {
    const result = findValidCoupon(cfg, couponCodeInput, subtotalNum);
    if (result.coupon) { appliedCoupon = result.coupon; discount = result.discount || 0; }
  }
  const feeNum = appliedCoupon && appliedCoupon.type === 'frete_gratis' ? 0 : (Number(body.fee) || 0);
  const totalNum = Math.max(0, subtotalNum + feeNum - discount);

  const orders = readJSON(ORDERS_FILE, []);
  const order = {
    id: 'SG' + Date.now().toString(36).toUpperCase(),
    ticketNumber: null as number | null,
    createdAt: new Date().toISOString(),
    status: 'novo',
    mode: body.mode === 'retirada' ? 'retirada' : 'delivery',
    name: String(body.name || '').slice(0, 80),
    phone: String(body.phone || '').slice(0, 30),
    address: String(body.address || '').slice(0, 200),
    items: (body.items || []).slice(0, 60).map((i: any) => {
      const validStations = ['cozinha', 'sushibar', 'bar'];
      let stations = Array.isArray(i.stations) ? i.stations.filter((s: string) => validStations.includes(s)) : [];
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

  if (appliedCoupon) {
    const data = readConfig();
    const c = (data.cfg.coupons || []).find((x: any) => String(x.code || '').toUpperCase() === appliedCoupon.code.toUpperCase());
    if (c) { c.usedCount = (c.usedCount || 0) + 1; writeJSON(CONFIG_FILE, data); }
  }

  if (order.mode === 'delivery') {
    const normPhone = normalizePhone(order.phone);
    const customer = await customerDB.findCustomerByPhone(normPhone);
    if (customer) await customerDB.updateCustomer(normPhone, { lastAddress: order.address });
  }

  broadcast('new-order', order);

  if (order.phone) {
    notifications.dispatchToCustomer(
      order.phone,
      { title: '🍣 Pedido recebido!', body: `Recebemos seu pedido ${order.id}. Total: R$ ${order.total.toFixed(2)}. Já estamos preparando!` },
      { permitirSmsFallback: true, smsCfg: cfg.sms, sendSMSFn: sendSMS }
    ).catch(() => {});
  }

  res.status(201).json({ ok: true, order });
});

app.get('/api/orders', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  res.json(readJSON(ORDERS_FILE, []));
});

app.patch('/api/orders/:id', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).json({ error: 'unauthorized' });
  const id = req.params.id;
  const { status, fee, cancelReason, cancelledBy, ticketNumber } = req.body;
  const valid = ['novo', 'preparando', 'saiu', 'entregue', 'cancelado'];
  if (!valid.includes(status)) return res.status(400).json({ error: 'status inválido' });
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === id);
  if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
  order.status = status;

  if (ticketNumber !== undefined && ticketNumber !== null && ticketNumber !== '') {
    const n = parseInt(ticketNumber);
    if (n >= 1 && n <= 200) {
      const conflict = orders.find((o: any) => o.id !== id && o.ticketNumber === n && !['entregue', 'cancelado'].includes(o.status));
      if (conflict) {
        return res.status(400).json({ error: `O número ${n} já está sendo usado pelo pedido em andamento ${conflict.id}.` });
      }
      order.ticketNumber = n;
    }
  } else if (status === 'preparando' && !order.ticketNumber) {
    const cfgData = readConfig();
    let next = Number(cfgData.cfg.nextTicketNumber) >= 1 && Number(cfgData.cfg.nextTicketNumber) <= 200 ? Number(cfgData.cfg.nextTicketNumber) : 1;
    const activeNumbers = new Set(orders.filter((o: any) => o.id !== id && o.ticketNumber && !['entregue', 'cancelado'].includes(o.status)).map((o: any) => o.ticketNumber));
    for (let i = 0; i < 200 && activeNumbers.has(next); i++) next = next >= 200 ? 1 : next + 1;
    order.ticketNumber = next;
    cfgData.cfg.nextTicketNumber = next >= 200 ? 1 : next + 1;
    writeJSON(CONFIG_FILE, cfgData);
  }

  if (status === 'cancelado') {
    order.cancelReason = String(cancelReason || '').slice(0, 200) || 'Não informado';
    order.cancelledBy = ['loja', 'cliente'].includes(cancelledBy) ? cancelledBy : 'loja';
  }
  if (fee !== undefined && fee !== null && fee !== '') {
    order.fee = Number(fee) || 0;
    order.total = Math.max(0, Number(order.subtotal || 0) + order.fee - Number(order.discount || 0));
  }
  writeJSON(ORDERS_FILE, orders);
  broadcast('order-updated', order);

  if (order.phone && ['preparando', 'saiu'].includes(status)) {
    const { cfg } = readConfig();
    const textos: Record<string, string> = {
      preparando: `👨‍🍳 Seu pedido ${order.id} entrou em preparo!`,
      saiu: order.mode === 'retirada'
        ? `✅ Seu pedido ${order.id} está pronto para retirada!`
        : `🛵 Seu pedido ${order.id} saiu para entrega!`,
    };
    notifications.dispatchToCustomer(
      order.phone,
      { title: '🍣 Shogatsu', body: textos[status] },
      { permitirSmsFallback: true, smsCfg: cfg.sms, sendSMSFn: sendSMS }
    ).catch(() => {});
  }

  res.json({ ok: true, order });
});

app.get('/api/track/:id', (req, res) => {
  const id = req.params.id;
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === id);
  if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
  const { name, phone, address, ...rest } = order;
  res.json(rest);
});

app.post('/api/orders/:id/received', (req, res) => {
  const id = req.params.id;
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === id);
  if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
  order.receivedByCustomer = true;
  order.receivedAt = new Date().toISOString();
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true });
});

app.post('/api/orders/:id/review', (req, res) => {
  const id = req.params.id;
  const { stars, comment } = req.body;
  const n = parseInt(stars);
  if (!(n >= 1 && n <= 5)) return res.status(400).json({ error: 'A avaliação precisa ser de 1 a 5 estrelas.' });
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === id);
  if (!order) return res.status(404).json({ error: 'pedido não encontrado' });
  if (order.review) return res.status(400).json({ error: 'Esse pedido já foi avaliado.' });
  order.review = { stars: n, comment: String(comment || '').slice(0, 400), createdAt: new Date().toISOString(), hidden: false };
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true });
});

app.get('/api/reviews', (req, res) => {
  const orders = readJSON(ORDERS_FILE, []);
  const reviews = orders
    .filter((o: any) => o.review && !o.review.hidden)
    .map((o: any) => ({
      name: String(o.name || 'Cliente').trim().split(' ')[0],
      stars: o.review.stars,
      comment: o.review.comment,
      createdAt: o.review.createdAt
    }))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 50);
  const avg = reviews.length ? Math.round((reviews.reduce((s: number, r: any) => s + r.stars, 0) / reviews.length) * 10) / 10 : null;
  res.json({ reviews, average: avg, count: reviews.length });
});

app.get('/api/admin/reviews', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão pra ver as avaliações.' });
  const orders = readJSON(ORDERS_FILE, []);
  const reviews = orders
    .filter((o: any) => o.review)
    .map((o: any) => ({ orderId: o.id, ticketNumber: o.ticketNumber, name: o.name, ...o.review }))
    .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  res.json({ reviews });
});

app.patch('/api/admin/reviews/:orderId', (req, res) => {
  if (!requireRole(getTokenFromReq(req), 'admin')) return res.status(403).json({ error: 'Seu usuário não tem permissão pra moderar avaliações.' });
  const orderId = req.params.orderId;
  const { hidden } = req.body;
  const orders = readJSON(ORDERS_FILE, []);
  const order = orders.find((o: any) => o.id === orderId);
  if (!order || !order.review) return res.status(404).json({ error: 'Avaliação não encontrada.' });
  order.review.hidden = !!hidden;
  writeJSON(ORDERS_FILE, orders);
  res.json({ ok: true });
});

app.get('/api/stream', (req, res) => {
  if (!checkAuth(getTokenFromReq(req))) return res.status(401).end();
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
});

app.get('/api/public-stream', (req, res) => {
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
});

// Start Express server and Vite integration
async function start() {
  await customerDB.initSchema();
  if (customerDB.useDB) console.log('🗄️ Conectado ao Postgres');
  else console.log('📄 Utilizando armazenamento local JSON');

  const { cfg } = readConfig();
  notifications.configurarVapid(cfg);

  // Auto notification schedule check
  let ultimoMinutoDisparado: string | null = null;
  setInterval(async () => {
    const agora = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
    if (agora === ultimoMinutoDisparado) return;
    const { horarios } = notifications.readCampaigns();
    if (horarios.includes(agora)) {
      ultimoMinutoDisparado = agora;
      try {
        const r = await notifications.dispararProximaCampanha();
        console.log('[campanhas]', r.disparado ? `disparada "${r.mensagem}"` : `nada disparado (${r.motivo})`);
      } catch (e: any) { console.error('[campanhas] erro:', e.message); }
    }
  }, 60 * 1000);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`🍣 Shogatsu rodando na porta ${PORT}`);
  });
}

start();
