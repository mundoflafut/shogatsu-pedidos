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
const os = require('os');

const PORT = process.env.PORT || 3000;
// IMPORTANTE: por padrão os dados ficam numa pasta ao lado do server.js, que é APAGADA a cada novo
// deploy no Render (o disco do serviço web não é persistente). Pra não perder pedidos/clientes/
// configurações, configure um Disco Persistente no Render e aponte DATA_DIR pra ele (veja instruções
// no README.md, seção "Persistência de dados no Render").
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const PUBLIC_DIR = path.join(__dirname, 'public');
const UPLOADS_DIR = process.env.UPLOADS_DIR || path.join(PUBLIC_DIR, 'uploads');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const RESERVATIONS_FILE = path.join(DATA_DIR, 'reservations.json');
const PUSH_SUBS_FILE = path.join(DATA_DIR, 'push-subs.json');
const webpush = require('./webpush');

// ─── Config / Menu padrão (usados só na primeira execução) ───
const DEFAULT_CFG = {
  whats: '552227641333', storePhone: '(22) 2764-1333', fee: 8, min: 60,
  name: 'Shogatsu Culinária Oriental', days: 'Ter–Dom',
  time: '40–60 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras · CEP 22896-155',
  hours: '18h30–23h', open: 1,
  // ── Auto-abertura/fechamento por horário (se ativado, cfg.open passa a ser calculado sozinho) ──
  schedule: { enabled: false, openTime: '18:00', closeTime: '23:00' },
  adminPass: 'shogatsu2026',
  masterPass: 'shogatsuMaster2026',
  // ── Usuários do painel (login por usuário + senha, com nível de acesso) ──
  // master: acesso total, inclusive gerenciar outros usuários.
  // admin: acesso total ao painel, exceto gerenciar usuários.
  // vendas: só Dashboard, Pedidos e Kanban — pra quem só precisa bater pedido no balcão.
  users: [
    { username: 'master', password: 'shogatsuMaster2026', role: 'master' },
    { username: 'admin', password: 'shogatsu2026', role: 'admin' }
  ],
  logoUrl: '',
  print: 0,                     // 1 = imprime automaticamente as vias ao chegar um pedido novo
  sound: 1,                     // 1 = toca alerta sonoro ao chegar pedido novo
  labels: {                     // textos dos botões/status do painel, customizáveis pelo admin
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
  // ── Confirmação automática de PIX via gateway — OPCIONAL, exige conta própria e paga no provedor.
  // Sem isso configurado, o PIX continua funcionando exatamente como antes: QR/copia-e-cola com valor
  // exato, e a loja confere o recebimento manualmente (ou usa o botão "Marcar como pago" no painel).
  pixGateway: {
    enabled: false,
    provider: 'mercadopago', // por enquanto só Mercado Pago tem o webhook pronto abaixo
    accessToken: ''           // Access Token de produção da sua conta Mercado Pago
  },
  // ── Impressão do comprovante ──
  printFont: 'Verdana, sans-serif',      // 'monospace' | 'sans-serif' | 'serif' | outras opções na tela de config
  printSize: 20,                // tamanho da fonte em px
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
  coupons: [],                    // [{code, type:'percent'|'valor'|'frete_gratis', value, active, expiresAt, usageLimit, usedCount, minOrder}]
  // ── Fidelidade — cliente acumula pontos a cada pedido ENTREGUE e troca por desconto ──
  loyalty: {
    enabled: true,
    pointsPerReal: 1,     // pontos ganhos por R$1 do total do pedido (arredondado pra baixo)
    redeemPoints: 100,     // quantos pontos formam 1 "bloco" de resgate
    redeemValue: 10,       // quanto vale em R$ de desconto cada bloco de redeemPoints
    minOrderToRedeem: 0    // pedido mínimo (R$) pra poder usar pontos, 0 = sem mínimo
  },
  // ── Número da senha/pedido (1 a 200, cíclico) ──
  nextTicketNumber: 1,
  // ── SMS (envio de promoções pros clientes cadastrados) — usa a API da Twilio.
  // Precisa de conta própria em twilio.com (pago, mas barato); sem isso configurado, o envio simplesmente falha com aviso claro.
  sms: { accountSid: '', authToken: '', fromNumber: '', fromWhatsApp: '', notifyWhatsApp: false },
  // ── Avaliações — frase que aparece pro cliente depois que ele confirma que recebeu o pedido ──
  reviewPrompt: 'O que você achou do seu pedido? Sua opinião ajuda muito a gente! 🍣',
  reviewPhrases: [
    'Comida deliciosa! 😋',
    'Entrega rápida! 🛵',
    'Atendimento excelente! ⭐',
    'Embalagem caprichada 📦',
    'Voltarei a pedir com certeza! 🙌'
  ],
  // ── Anúncios/promoções — aparecem pra QUALQUER pessoa que abrir o cardápio, sem precisar de conta ──
  announcements: [],  // [{id, title, message, active, expiresAt}]
  // ── Notificações Push (promoções/cupons/novidades direto no navegador do cliente, de graça) ──
  // As chaves VAPID são geradas sozinhas na primeira vez que o servidor liga (ver bootstrap abaixo)
  // e ficam salvas aqui — não apague nem troque manualmente, ou as inscrições já feitas param de funcionar.
  vapid: { publicKey: '', privateKeyJwk: null, subject: 'mailto:contato@shogatsu.com.br' },
  // ── Reserva de Mesas ──
  reservations: { enabled: true, maxPeoplePerTable: 12, note: '' },
  // ── Agendamento de Pedidos (cliente escolhe um horário futuro pra retirada/entrega) ──
  scheduling: { enabled: true, minMinutesAhead: 60, maxDaysAhead: 7 }
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
if (!fs.existsSync(RESERVATIONS_FILE)) fs.writeFileSync(RESERVATIONS_FILE, '[]');
if (!fs.existsSync(PUSH_SUBS_FILE)) fs.writeFileSync(PUSH_SUBS_FILE, '[]');

// Gera as chaves VAPID (necessárias pra notificação push) na primeira vez que o servidor liga,
// e salva no config.json — depois disso nunca mais muda (senão as inscrições dos clientes quebram).
function ensureVapidKeys() {
  try {
    const data = readJSON(CONFIG_FILE);
    if (!data.cfg.vapid || !data.cfg.vapid.publicKey) {
      const keys = webpush.generateVapidKeys();
      data.cfg.vapid = { publicKey: keys.publicKey, privateKeyJwk: keys.privateKeyJwk, subject: (data.cfg.vapid && data.cfg.vapid.subject) || DEFAULT_CFG.vapid.subject };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2));
      console.log('🔔 Chaves VAPID geradas (primeira execução) — notificação push já pode ser usada.');
    }
  } catch (e) { console.error('⚠️  Não consegui gerar as chaves VAPID:', e.message); }
}
ensureVapidKeys();

function readJSON(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
  syncToSupabase(file, data); // fire-and-forget — nunca trava nem quebra a resposta ao usuário
}

// ═══════════════════════════════════════════════════════════
// SUPABASE — backup automático pra sobreviver a deploys no Render
// ═══════════════════════════════════════════════════════════
// O disco local (pasta data/) continua sendo usado pra tudo — é rápido e simples. O Supabase
// funciona como uma cópia de segurança: toda vez que orders.json/config.json/customers.json
// muda, mandamos uma cópia pra lá; e quando o servidor liga (ex: depois de um deploy que apagou
// o disco local), a gente PRIMEIRO tenta trazer de volta o que tiver salvo no Supabase antes de
// aceitar qualquer pedido novo.
// Configure em Environment no Render: SUPABASE_URL e SUPABASE_SERVICE_KEY (a "service_role key",
// não a "anon" — precisa de permissão de escrita). Sem essas duas variáveis, tudo funciona igual
// a antes, só sem o backup (o app nunca quebra por falta disso).
const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const SUPABASE_TABLE = process.env.SUPABASE_TABLE || 'shogatsu_kv';
const FILE_TO_KEY = { [ORDERS_FILE]: 'orders', [CONFIG_FILE]: 'config', [CUSTOMERS_FILE]: 'customers', [RESERVATIONS_FILE]: 'reservations', [PUSH_SUBS_FILE]: 'push_subs' };

function supabaseRequest(method, subpath, body) {
  return new Promise((resolve, reject) => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return reject(new Error('Supabase não configurado'));
    const payload = body ? JSON.stringify(body) : null;
    const u = new URL(`${SUPABASE_URL}/rest/v1/${subpath}`);
    const req = https.request(u, {
      method,
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': method === 'POST' ? 'resolution=merge-duplicates,return=minimal' : 'return=representation',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {})
      },
      timeout: 8000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          try { resolve(data ? JSON.parse(data) : null); } catch (e) { resolve(null); }
        } else reject(new Error(`Supabase HTTP ${res.statusCode}: ${data.slice(0, 300)}`));
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

function syncToSupabase(file, data) {
  const key = FILE_TO_KEY[file];
  if (!key || !SUPABASE_URL || !SUPABASE_KEY) return;
  supabaseRequest('POST', `${SUPABASE_TABLE}?on_conflict=key`, { key, value: data, updated_at: new Date().toISOString() })
    .catch(err => console.error(`⚠️  Falha ao sincronizar "${key}" com o Supabase:`, err.message));
}

// Roda uma vez, ao ligar o servidor: se tiver Supabase configurado, traz de volta o último
// estado salvo (útil logo depois de um deploy que apagou o disco local do Render).
async function restoreFromSupabase() {
  if (!SUPABASE_URL || !SUPABASE_KEY) return;
  console.log('☁️  Verificando backup no Supabase...');
  await Promise.allSettled(Object.entries(FILE_TO_KEY).map(async ([file, key]) => {
    try {
      const rows = await supabaseRequest('GET', `${SUPABASE_TABLE}?key=eq.${key}&select=value`);
      if (rows && rows[0] && rows[0].value !== undefined) {
        fs.writeFileSync(file, JSON.stringify(rows[0].value, null, 2));
        console.log(`   ✓ "${key}" restaurado do Supabase`);
      }
    } catch (err) {
      console.error(`   ⚠️  Não consegui restaurar "${key}" do Supabase:`, err.message);
    }
  }));
}

// Confere se o horário atual está dentro da janela configurada (ex: 18:00–23:00).
// Usa sempre o horário de Brasília, independente de em qual fuso o servidor
// esteja rodando de verdade (isso evita o bug clássico de "abriu 3h errado"
// quando o servidor roda em UTC, como costuma acontecer em hospedagem na nuvem).
// Lida com horários que passam da meia-noite (ex: 18:00–02:00).
function isWithinSchedule(openTime, closeTime) {
  if (!openTime || !closeTime) return true;
  const nowStr = new Date().toLocaleTimeString('en-GB', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });
  const toMinutes = (t) => { const [h, m] = String(t).split(':').map(Number); return (h || 0) * 60 + (m || 0); };
  const nowMin = toMinutes(nowStr), openMin = toMinutes(openTime), closeMin = toMinutes(closeTime);
  if (openMin === closeMin) return true; // aberto 24h
  if (openMin < closeMin) return nowMin >= openMin && nowMin < closeMin;
  return nowMin >= openMin || nowMin < closeMin; // passa da meia-noite
}

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
    slides: data.cfg.slides || DEFAULT_CFG.slides,
    users: (Array.isArray(data.cfg.users) && data.cfg.users.length) ? data.cfg.users : DEFAULT_CFG.users,
    sms: { ...DEFAULT_CFG.sms, ...(data.cfg.sms || {}) },
    schedule: { ...DEFAULT_CFG.schedule, ...(data.cfg.schedule || {}) },
    vapid: { ...DEFAULT_CFG.vapid, ...(data.cfg.vapid || {}) },
    reservations: { ...DEFAULT_CFG.reservations, ...(data.cfg.reservations || {}) },
    scheduling: { ...DEFAULT_CFG.scheduling, ...(data.cfg.scheduling || {}) }
  };
  // Se a auto-programação de horário estiver ativada, o status aberto/fechado
  // passa a ser calculado sozinho a partir do horário configurado — o toggle
  // manual do painel deixa de valer enquanto isso estiver ligado.
  if (cfg.schedule && cfg.schedule.enabled) {
    cfg.open = isWithinSchedule(cfg.schedule.openTime, cfg.schedule.closeTime) ? 1 : 0;
  }
  return { cfg, menu: normalizeMenu(data.menu) };
}

// ─── Sessões admin (em memória) ───
const sessions = new Map(); // token -> { expiresAt, role, username }
function newSession(role, username) {
  const token = crypto.randomBytes(24).toString('hex');
  sessions.set(token, { expiresAt: Date.now() + 1000 * 60 * 60 * 12, role: role || 'admin', username: username || 'admin' }); // 12h
  return token;
}
function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expiresAt < Date.now()) { sessions.delete(token); return null; }
  return s;
}
function checkAuth(token) { return !!getSession(token); }
// master > admin > vendas — checa se a sessão tem o nível mínimo pedido
const ROLE_RANK = { vendas: 1, admin: 2, master: 3 };
function requireRole(token, minRole) {
  const s = getSession(token);
  if (!s) return false;
  return (ROLE_RANK[s.role] || 0) >= (ROLE_RANK[minRole] || 99);
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

// Saldo de pontos de fidelidade: soma o que foi GANHO em pedidos já entregues menos o que
// já foi GASTO em resgates (contando só pedidos não-cancelados, pra pedido cancelado devolver
// os pontos usados nele automaticamente). Calculado ao vivo — não existe um "contador" salvo em
// lugar nenhum, então nunca fica dessincronizado do histórico real de pedidos.
function loyaltyBalance(phone, orders, cfg) {
  const p = normalizePhone(phone);
  const mine = orders.filter(o => normalizePhone(o.phone) === p && o.status !== 'cancelado');
  const earned = mine.filter(o => o.status === 'entregue').reduce((s, o) => s + (Number(o.pointsEarned) || 0), 0);
  const redeemed = mine.reduce((s, o) => s + (Number(o.pointsRedeemed) || 0), 0);
  return { earned, redeemed, balance: Math.max(0, earned - redeemed) };
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

// Endereço em texto → { lat, lng } via Nominatim/OpenStreetMap (gratuito, sem chave).
// IPs de servidores na nuvem (Render, etc.) costumam ser compartilhados por muitos outros
// projetos batendo no mesmo serviço gratuito, então de vez em quando ele responde "429 - limite
// de requisições" mesmo sem essa loja ter abusado. Por isso, tenta de novo uma vez, esperando
// um pouco (respeitando a política de no máx. 1 requisição/segundo do próprio Nominatim).
async function geocodeAddress(addressText, isRetry) {
  const q = encodeURIComponent(addressText);
  try {
    const data = await httpsGetJSON(
      `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`,
      { 'User-Agent': 'ShogatsuPedidosOnline/1.0 (contato via painel do restaurante)' },
      10000
    );
    if (!Array.isArray(data) || !data.length) return null;
    return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon), label: data[0].display_name };
  } catch (e) {
    if (!isRetry && /HTTP 429/.test(e.message)) {
      await new Promise(r => setTimeout(r, 1500));
      return geocodeAddress(addressText, true);
    }
    throw e;
  }
}

// Geocodificação reversa: lat/lng (do GPS do navegador do cliente) -> endereço.
// Usada pelo botão "usar minha localização" no checkout, pra preencher CEP/rua/bairro sozinho.
async function reverseGeocode(lat, lng) {
  const data = await httpsGetJSON(
    `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1`,
    { 'User-Agent': 'ShogatsuPedidosOnline/1.0 (contato via painel do restaurante)' }
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


// Envia WhatsApp via Twilio (usa a MESMA conta/API do SMS acima — Twilio manda WhatsApp e SMS pelo
// mesmo endpoint, só muda o prefixo "whatsapp:" nos números "De" e "Para"). Precisa de um número
// habilitado para WhatsApp na conta Twilio (sandbox pra testar, ou número aprovado em produção).
// Isso é OPCIONAL: sem essa conta configurada, o painel ainda oferece o botão manual de WhatsApp
// (abre wa.me com a mensagem pronta, sem custo nenhum, só que exige 1 clique de quem está no painel).
function sendWhatsApp(toPhone, body, smsCfg) {
  return new Promise((resolve, reject) => {
    if (!smsCfg.accountSid || !smsCfg.authToken || !smsCfg.fromWhatsApp) {
      return reject(new Error('WhatsApp automático não configurado.'));
    }
    const to = String(toPhone || '').replace(/\D/g, '');
    if (!to) return reject(new Error('Número de telefone inválido.'));
    const params = new url.URLSearchParams({ To: 'whatsapp:+55' + to, From: 'whatsapp:' + smsCfg.fromWhatsApp, Body: body }).toString();
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
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else { try { reject(new Error(JSON.parse(data).message || 'Falha ao enviar WhatsApp.')); } catch (e) { reject(new Error('Falha ao enviar WhatsApp.')); } }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tempo esgotado ao tentar enviar WhatsApp.')); });
    req.write(params);
    req.end();
  });
}

// Textos automáticos por status — usados no WhatsApp automático (se configurado)
const WHATSAPP_STATUS_MESSAGES = {
  preparando: (o, cfg) => `🍣 *${cfg.name}*\nOi ${o.name}! Seu pedido foi *aceito* e já está sendo preparado. Previsão: ${cfg.time}.`,
  saiu: (o, cfg) => o.mode === 'delivery'
    ? `🛵 *${cfg.name}*\nSeu pedido saiu para entrega! Chega até você em instantes.`
    : `🏪 *${cfg.name}*\nSeu pedido está *pronto* para retirada no restaurante!`,
  entregue: (o, cfg) => `✅ *${cfg.name}*\nPedido entregue! Obrigado pela preferência 🙏${o.pointsEarned ? ` Você ganhou ${o.pointsEarned} pontos de fidelidade.` : ''}`,
  cancelado: (o, cfg) => `⛔ *${cfg.name}*\nSeu pedido foi cancelado. Motivo: ${o.cancelReason || 'não informado'}. Qualquer dúvida, chama a gente!`
};
// v27: mesmas mensagens de status, só que pra notificação push (title/body curtos, sem markdown)
const PUSH_STATUS_MESSAGES = {
  preparando: (o, cfg) => ({ title: cfg.name, body: `Seu pedido foi aceito e já está sendo preparado. Previsão: ${cfg.time}.` }),
  saiu: (o, cfg) => ({ title: cfg.name, body: o.mode === 'delivery' ? '🛵 Seu pedido saiu para entrega!' : '🏪 Seu pedido está pronto para retirada!' }),
  entregue: (o, cfg) => ({ title: cfg.name, body: '✅ Pedido entregue! Obrigado pela preferência.' }),
  cancelado: (o, cfg) => ({ title: cfg.name, body: `⛔ Seu pedido foi cancelado. Motivo: ${o.cancelReason || 'não informado'}.` })
};
// Usa https puro (sem dependências) fazendo POST form-urlencoded com Basic Auth.
function sendSMS(toPhone, body, smsCfg) {
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
        if (res.statusCode >= 200 && res.statusCode < 300) resolve(true);
        else { try { reject(new Error(JSON.parse(data).message || 'Falha ao enviar SMS.')); } catch (e) { reject(new Error('Falha ao enviar SMS.')); } }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Tempo esgotado ao tentar enviar SMS.')); });
    req.write(params);
    req.end();
  });
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
  // Uploads (logo, fotos de prato) podem morar fora de public/ quando configurados num disco
  // persistente (UPLOADS_DIR via variável de ambiente) — por isso tem rota própria aqui.
  if (pathname.startsWith('/uploads/')) {
    const uploadPath = path.join(UPLOADS_DIR, pathname.slice('/uploads/'.length));
    if (!uploadPath.startsWith(UPLOADS_DIR)) { res.writeHead(403); return res.end('Forbidden'); }
    return fs.readFile(uploadPath, (err, data) => {
      if (err) { res.writeHead(404); return res.end('Not found'); }
      const ext = path.extname(uploadPath);
      res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
      res.end(data);
    });
  }
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
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra alterar configurações/cardápio.' });
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
          theme: { ...current.cfg.theme, ...(body.cfg && body.cfg.theme || {}) },
          sms: { ...current.cfg.sms, ...(body.cfg && body.cfg.sms || {}) },
          schedule: { ...current.cfg.schedule, ...(body.cfg && body.cfg.schedule || {}) }
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

  // ── Gerenciamento de usuários do painel (só o usuário master pode mexer) ──
  // ── GET /api/admin/customers — lista clientes cadastrados com estatísticas (painel, promoções por SMS) ──
  if (pathname === '/api/admin/customers' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra ver os clientes.' });
    const { cfg } = readConfig();
    const customers = readJSON(CUSTOMERS_FILE);
    const orders = readJSON(ORDERS_FILE);
    const list = customers.map(c => ({
      phone: c.phone, name: c.name, createdAt: c.createdAt, lastAddress: c.lastAddress,
      hasPendingRecovery: !!(c.recovery && !c.recovery.approved),
      ...customerStats(c.phone, orders),
      loyaltyPoints: loyaltyBalance(c.phone, orders, cfg).balance
    })).sort((a, b) => b.orderCount - a.orderCount);
    return sendJSON(res, 200, { customers: list });
  }


  if (pathname === '/api/admin/send-promo-sms' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra enviar SMS.' });
    try {
      const { phones, message } = await readBody(req);
      const { cfg } = readConfig();
      const msg = String(message || '').slice(0, 300).trim();
      if (!msg) return sendJSON(res, 400, { error: 'Digite a mensagem.' });
      const list = Array.isArray(phones) ? phones.slice(0, 200) : [];
      if (!list.length) return sendJSON(res, 400, { error: 'Selecione pelo menos um cliente.' });
      const results = { sent: 0, failed: 0, errors: [] };
      for (const phone of list) {
        try { await sendSMS(phone, msg, cfg.sms); results.sent++; }
        catch (e) { results.failed++; if (results.errors.length < 3) results.errors.push(e.message); }
      }
      return sendJSON(res, 200, { ok: true, ...results });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  if (pathname === '/api/admin/users' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'master')) return sendJSON(res, 403, { error: 'Só o usuário master pode gerenciar usuários.' });
    const { cfg } = readConfig();
    return sendJSON(res, 200, { users: (cfg.users || []).map(u => ({ username: u.username, role: u.role })) });
  }
  if (pathname === '/api/admin/users' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'master')) return sendJSON(res, 403, { error: 'Só o usuário master pode gerenciar usuários.' });
    try {
      const { username, password, role } = await readBody(req);
      const uname = String(username || '').trim().toLowerCase();
      if (!uname || uname.length < 3) return sendJSON(res, 400, { error: 'Usuário precisa ter pelo menos 3 caracteres.' });
      if (!['master', 'admin', 'vendas'].includes(role)) return sendJSON(res, 400, { error: 'Nível de acesso inválido.' });
      const data = readConfig();
      const existing = data.cfg.users.find(u => String(u.username || '').toLowerCase() === uname);
      if (existing) {
        existing.role = role;
        if (password) existing.password = password; // só troca a senha se veio uma nova
      } else {
        if (!password || password.length < 4) return sendJSON(res, 400, { error: 'Senha precisa ter pelo menos 4 caracteres.' });
        data.cfg.users.push({ username: uname, password, role });
      }
      writeJSON(CONFIG_FILE, data);
      return sendJSON(res, 200, { ok: true, users: data.cfg.users.map(u => ({ username: u.username, role: u.role })) });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  if (pathname.startsWith('/api/admin/users/') && req.method === 'DELETE') {
    if (!requireRole(getToken(req, query), 'master')) return sendJSON(res, 403, { error: 'Só o usuário master pode gerenciar usuários.' });
    const uname = decodeURIComponent(pathname.split('/').pop() || '').toLowerCase();
    const data = readConfig();
    const target = data.cfg.users.find(u => String(u.username || '').toLowerCase() === uname);
    if (!target) return sendJSON(res, 404, { error: 'Usuário não encontrado.' });
    if (target.role === 'master' && data.cfg.users.filter(u => u.role === 'master').length <= 1) {
      return sendJSON(res, 400, { error: 'Precisa existir pelo menos um usuário master.' });
    }
    data.cfg.users = data.cfg.users.filter(u => String(u.username || '').toLowerCase() !== uname);
    writeJSON(CONFIG_FILE, data);
    return sendJSON(res, 200, { ok: true });
  }


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

  // ── POST /api/login — autenticação do painel (usuário + senha, com nível de acesso) ──
  if (pathname === '/api/login' && req.method === 'POST') {
    try {
      const { username, password } = await readBody(req);
      const { cfg } = readConfig();
      const uname = String(username || '').trim().toLowerCase();

      if (uname) {
        const user = (cfg.users || []).find(u => String(u.username || '').toLowerCase() === uname);
        if (user && password === user.password) {
          return sendJSON(res, 200, { token: newSession(user.role, user.username), role: user.role, username: user.username });
        }
        return sendJSON(res, 401, { error: 'Usuário ou senha incorretos.' });
      }

      // Compatibilidade: login sem usuário (só senha) continua funcionando como antes.
      if (password === cfg.adminPass) return sendJSON(res, 200, { token: newSession('admin', 'admin'), role: 'admin', username: 'admin' });
      if (password === cfg.masterPass) return sendJSON(res, 200, { token: newSession('master', 'master'), role: 'master', username: 'master' });
      return sendJSON(res, 401, { error: 'senha incorreta' });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── POST /api/pix — gera o copia-e-cola para um valor ──
  // ── POST /api/orders/:id/mark-paid — restaurante confirma manualmente que o PIX caiu (painel, requer auth) ──
  // Essa é a forma mais simples e recomendada: funciona sempre, sem depender de nenhuma conta de gateway.
  if (pathname.match(/^\/api\/orders\/[^/]+\/mark-paid$/) && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const id = pathname.split('/')[3];
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
    order.paid = true; order.paidAt = new Date().toISOString(); order.paidVia = 'manual';
    writeJSON(ORDERS_FILE, orders);
    broadcast('order-updated', order);
    return sendJSON(res, 200, { ok: true, order });
  }

  // ── POST /api/webhook/pix — confirmação automática (OPCIONAL, exige conta própria no Mercado Pago) ──
  // Como configurar: 1) gere um Access Token de PRODUÇÃO na sua conta Mercado Pago e cole em
  // Configurações → PIX → "Confirmação automática"; 2) na sua conta Mercado Pago, cadastre esta URL
  // completa (ex: https://seusite.com/api/webhook/pix) como webhook de pagamentos; 3) ao criar a
  // cobrança PIX pelo painel/checkout do Mercado Pago, use o ID do pedido (mostrado no painel, ex:
  // SGMRXXPU8H) como "external_reference" da cobrança — é assim que este servidor sabe qual pedido
  // marcar como pago quando a notificação chegar.
  // Segurança: o corpo do webhook NUNCA é confiado diretamente (qualquer um poderia forjar uma
  // requisição pra essa URL) — sempre confirmamos consultando a própria API do Mercado Pago com o
  // Access Token, e só marcamos como pago se o status vier "approved" de lá.
  if (pathname === '/api/webhook/pix' && req.method === 'POST') {
    try {
      const { cfg } = readConfig();
      const gw = cfg.pixGateway || {};
      if (!gw.enabled || !gw.accessToken) return sendJSON(res, 200, { ok: true }); // ignora silenciosamente se não configurado
      const body = await readBody(req);
      const paymentId = body?.data?.id || body?.id;
      if (!paymentId) return sendJSON(res, 200, { ok: true });
      const payment = await httpsGetJSON(`https://api.mercadopago.com/v1/payments/${paymentId}`, {
        Authorization: `Bearer ${gw.accessToken}`
      });
      if (payment && payment.status === 'approved' && payment.external_reference) {
        const orders = readJSON(ORDERS_FILE);
        const order = orders.find(o => o.id === payment.external_reference);
        if (order && !order.paid) {
          order.paid = true; order.paidAt = new Date().toISOString(); order.paidVia = 'gateway';
          writeJSON(ORDERS_FILE, orders);
          broadcast('order-updated', order);
        }
      }
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 200, { ok: true }); } // webhook sempre responde 200 (padrão do provedor), erro só fica no log
  }

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
  // ── GET /api/cep/:cep — busca endereço pelo CEP (autopreenchimento no checkout) ──
  if (pathname.match(/^\/api\/cep\/[^/]+$/) && req.method === 'GET') {
    const cep = pathname.split('/').pop();
    try {
      const addr = await lookupCEP(cep);
      if (!addr) return sendJSON(res, 200, { ok: false, error: 'CEP não encontrado.' });
      return sendJSON(res, 200, { ok: true, ...addr });
    } catch (e) { return sendJSON(res, 200, { ok: false, error: 'Não foi possível buscar esse CEP agora.' }); }
  }

  // ── POST /api/reverse-geocode — usado pelo botão "usar minha localização" no checkout ──
  if (pathname === '/api/reverse-geocode' && req.method === 'POST') {
    try {
      const { lat, lng } = await readBody(req);
      if (typeof lat !== 'number' || typeof lng !== 'number') return sendJSON(res, 400, { error: 'Coordenadas inválidas.' });
      const addr = await reverseGeocode(lat, lng);
      if (!addr) return sendJSON(res, 200, { ok: false, error: 'Não conseguimos identificar seu endereço. Preencha manualmente.' });
      return sendJSON(res, 200, { ok: true, ...addr });
    } catch (e) { return sendJSON(res, 200, { ok: false, error: 'Não conseguimos identificar seu endereço. Preencha manualmente.' }); }
  }

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

  // ── GET /api/admin/detect-usb-printers — procura impressoras USB conectadas ──
  // IMPORTANTE: só encontra algo se o server.js estiver rodando na MESMA máquina
  // física ligada na impressora (ex: um PC/Raspberry Pi no balcão). Rodando no
  // Render (nuvem), nunca vai achar nada — a impressora não está fisicamente
  // conectada ao servidor na nuvem.
  if (pathname === '/api/admin/detect-usb-printers' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão.' });
    const candidates = [];
    try {
      ['/dev/usb', '/dev'].forEach(dir => {
        if (fs.existsSync(dir)) {
          fs.readdirSync(dir).forEach(f => {
            if (/^(lp\d+|ttyUSB\d+)$/.test(f)) candidates.push(path.join(dir, f));
          });
        }
      });
    } catch (e) {}
    return sendJSON(res, 200, {
      found: candidates,
      note: candidates.length
        ? null
        : 'Nenhuma impressora USB encontrada. Se o servidor estiver rodando na nuvem (Render), isso é esperado — a busca só funciona quando o servidor roda no mesmo computador físico ligado na impressora.'
    });
  }

  // ── GET /api/admin/detect-network-printers — varre a rede LOCAL DO SERVIDOR por impressoras ──
  // MESMA RESSALVA: procura na rede de quem está rodando o server.js. No Render,
  // isso é a rede interna da nuvem — nunca vai enxergar o Wi-Fi do restaurante.
  // Só é útil de verdade se o servidor rodar localmente, na mesma rede da impressora.
  if (pathname === '/api/admin/detect-network-printers' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão.' });
    const nets = os.networkInterfaces();
    let base = null;
    Object.values(nets).flat().forEach(n => {
      if (n && n.family === 'IPv4' && !n.internal && n.address.startsWith('192.168.')) {
        base = n.address.split('.').slice(0, 3).join('.');
      }
    });
    if (!base) {
      return sendJSON(res, 200, { found: [], note: 'Não foi possível identificar uma rede local Wi-Fi a partir deste servidor — normal se ele estiver rodando na nuvem (Render).' });
    }
    const tryPort = (ip) => new Promise((resolve) => {
      const socket = net.createConnection({ host: ip, port: 9100, timeout: 400 }, () => { socket.destroy(); resolve(ip); });
      socket.on('error', () => resolve(null));
      socket.on('timeout', () => { socket.destroy(); resolve(null); });
    });
    const results = await Promise.all(Array.from({ length: 254 }, (_, i) => tryPort(`${base}.${i + 1}`)));
    const found = results.filter(Boolean);
    return sendJSON(res, 200, { found, note: found.length ? null : `Nenhuma impressora respondendo na porta 9100 dentro de ${base}.0/24.` });
  }


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
    } catch (e) {
      console.error('❌ Falha ao geocodificar endereço da loja:', e.message);
      return sendJSON(res, 500, { error: 'Não conseguimos falar com o serviço de mapas agora (' + e.message + '). Tente de novo em alguns segundos — se persistir, o endereço pode estar descrevendo o lugar de um jeito que o serviço não reconhece.' });
    }
  }

  // ── GET /api/admin/backup — exporta os dados em vários formatos de arquivo ──
  // ?format=json  -> backup completo (config + pedidos + clientes), pra restaurar depois
  // ?format=csv&type=clientes|pedidos -> planilha simples (abre no Excel/Sheets)
  // ?format=txt&type=cardapio -> cardápio em texto simples, fácil de ler/imprimir
  if (pathname === '/api/admin/backup' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra exportar dados.' });
    const format = query.format || 'json';
    const type = query.type || '';
    const stamp = new Date().toISOString().slice(0, 10);

    const csvEscape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
    const sendFile = (filename, contentType, body) => {
      res.writeHead(200, {
        'Content-Type': contentType + '; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`
      });
      res.end(body);
    };

    if (format === 'csv' && type === 'clientes') {
      const customers = readJSON(CUSTOMERS_FILE);
      const rows = [['Nome', 'Telefone', 'Cadastrado em', 'Último Endereço'].join(',')]
        .concat(customers.map(c => [csvEscape(c.name), csvEscape(c.phone), csvEscape(c.createdAt), csvEscape(c.lastAddress || '')].join(',')));
      return sendFile(`clientes-${stamp}.csv`, 'text/csv', '\uFEFF' + rows.join('\r\n'));
    }

    if (format === 'csv' && type === 'pedidos') {
      const orders = readJSON(ORDERS_FILE);
      const rows = [['Pedido', 'Data', 'Status', 'Cliente', 'Modo', 'Itens', 'Subtotal', 'Taxa', 'Desconto', 'Total', 'Pagamento'].join(',')]
        .concat(orders.map(o => [
          csvEscape(o.id), csvEscape(o.createdAt), csvEscape(o.status), csvEscape(o.name), csvEscape(o.mode),
          csvEscape((o.items || []).map(i => `${i.qty}x ${i.name}`).join(' | ')),
          csvEscape(o.subtotal), csvEscape(o.fee), csvEscape(o.discount || 0), csvEscape(o.total), csvEscape(o.payMethod)
        ].join(',')));
      return sendFile(`pedidos-${stamp}.csv`, 'text/csv', '\uFEFF' + rows.join('\r\n'));
    }

    if (format === 'txt' && type === 'cardapio') {
      const { menu } = readConfig();
      const lines = ['CARDÁPIO — exportado em ' + new Date().toLocaleString('pt-BR'), ''];
      menu.forEach(sec => {
        lines.push('═'.repeat(40));
        lines.push((sec.icon || '') + ' ' + sec.title.toUpperCase());
        lines.push('═'.repeat(40));
        sec.items.forEach(it => {
          lines.push(`- ${it.name} ......... R$ ${Number(it.price).toFixed(2)}`);
          if (it.desc) lines.push(`  ${it.desc}`);
          if (it.available === false) lines.push('  [ESGOTADO]');
        });
        lines.push('');
      });
      return sendFile(`cardapio-${stamp}.txt`, 'text/plain', lines.join('\n'));
    }

    // formato padrão: backup completo em JSON, pra restaurar depois se precisar
    const data = readConfig();
    const orders = readJSON(ORDERS_FILE);
    const customers = readJSON(CUSTOMERS_FILE);
    const backup = { exportedAt: new Date().toISOString(), version: 1, cfg: data.cfg, menu: data.menu, orders, customers };
    return sendFile(`shogatsu-backup-${stamp}.json`, 'application/json', JSON.stringify(backup, null, 2));
  }

  // ── POST /api/admin/restore — restaura um backup completo exportado antes ──
  // Sobrescreve config, cardápio, pedidos e clientes atuais — usar com cuidado.
  if (pathname === '/api/admin/restore' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'master')) return sendJSON(res, 403, { error: 'Só o usuário master pode restaurar um backup.' });
    try {
      const body = await readBody(req);
      if (!body || body.version !== 1 || !body.cfg || !body.menu) {
        return sendJSON(res, 400, { error: 'Arquivo de backup inválido ou de uma versão não reconhecida.' });
      }
      const current = readConfig();
      writeJSON(CONFIG_FILE, {
        cfg: { ...current.cfg, ...body.cfg, adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass },
        menu: body.menu
      });
      if (Array.isArray(body.orders)) writeJSON(ORDERS_FILE, body.orders);
      if (Array.isArray(body.customers)) writeJSON(CUSTOMERS_FILE, body.customers);
      publicBroadcast('menu-updated', {});
      return sendJSON(res, 200, {
        ok: true,
        restored: { pedidos: (body.orders || []).length, clientes: (body.customers || []).length, categorias: (body.menu || []).length }
      });
    } catch (e) { return sendJSON(res, 400, { error: 'Não foi possível ler esse arquivo de backup.' }); }
  }


// pedido + o texto configurado em cfg.time (ex: "40–60 min"). Se não conseguir
// extrair dois números do texto, devolve só o texto original como está.
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
      lines.push(ESC.center + ESC.boldOn + (cfg.name || 'SHOGATSU').toUpperCase() + ESC.boldOff + ESC.left);
      lines.push((printerCfg.label || st).toUpperCase() + (isCaixa ? ' - COMPROVANTE' : ' - VIA DE PRODUCAO'));
      lines.push('--------------------------------');
      if (order.ticketNumber) lines.push(ESC.center + ESC.boldOn + ESC.doubleOn + 'Nº ' + order.ticketNumber + ESC.doubleOff + ESC.boldOff + ESC.left);
      lines.push((order.ticketNumber ? 'ref. #' + order.id : 'Pedido #' + order.id) + '  ' + new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
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
      const { cfg } = readConfig();
      const loyalty = loyaltyBalance(p, orders, cfg);
      return sendJSON(res, 200, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: customer.lastAddress, ...stats, loyaltyPoints: loyalty.balance } });
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

  // ── GET /api/admin/customers/orders?phone=... — histórico de pedidos de um cliente ──
  if (pathname === '/api/admin/customers/orders' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const p = normalizePhone(query.phone);
    const orders = readJSON(ORDERS_FILE).filter(o => normalizePhone(o.phone) === p);
    return sendJSON(res, 200, { orders });
  }

  // ── GET /api/loyalty?phone=... — saldo de pontos de fidelidade do cliente (público, mesmo padrão de identificação por telefone já usado no resto do app) ──
  if (pathname === '/api/loyalty' && req.method === 'GET') {
    const { cfg } = readConfig();
    const phone = query.phone || '';
    if (!cfg.loyalty || !cfg.loyalty.enabled) return sendJSON(res, 200, { enabled: false });
    const orders = readJSON(ORDERS_FILE);
    const bal = loyaltyBalance(phone, orders, cfg);
    return sendJSON(res, 200, { enabled: true, ...bal, config: cfg.loyalty });
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

  // ── GET /api/customer/orders?phone=...&pin=... — o PRÓPRIO cliente vê seu histórico de pedidos
  // (usado na tela "Minha Conta"). Exige telefone + senha (mesma checagem do login) — não é público
  // como o /api/loyalty, porque o histórico expõe endereço e itens comprados.
  if (pathname === '/api/customer/orders' && req.method === 'GET') {
    const p = normalizePhone(query.phone);
    const customers = readJSON(CUSTOMERS_FILE);
    const customer = findCustomer(customers, p);
    if (!customer || customer.pinHash !== hashPin(p, query.pin)) return sendJSON(res, 401, { error: 'Não autorizado.' });
    const orders = readJSON(ORDERS_FILE).filter(o => normalizePhone(o.phone) === p)
      .map(o => ({ id: o.id, ticketNumber: o.ticketNumber, createdAt: o.createdAt, status: o.status, items: o.items, total: o.total, mode: o.mode, payMethod: o.payMethod }));
    return sendJSON(res, 200, { orders });
  }

  // ── POST /api/customer/update — cliente edita o próprio cadastro (nome / endereço salvo) ──
  if (pathname === '/api/customer/update' && req.method === 'POST') {
    try {
      const { phone, pin, name, lastAddress } = await readBody(req);
      const p = normalizePhone(phone);
      const customers = readJSON(CUSTOMERS_FILE);
      const customer = findCustomer(customers, p);
      if (!customer || customer.pinHash !== hashPin(p, pin)) return sendJSON(res, 401, { error: 'Não autorizado.' });
      if (name && name.trim()) customer.name = String(name).trim().slice(0, 80);
      if (lastAddress !== undefined) customer.lastAddress = lastAddress ? String(lastAddress).slice(0, 200) : customer.lastAddress;
      writeJSON(CUSTOMERS_FILE, customers);
      return sendJSON(res, 200, { ok: true, customer: { phone: customer.phone, name: customer.name, lastAddress: customer.lastAddress } });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ═══════════════════════════════════════════
  // NOTIFICAÇÕES PUSH (promoções/cupons/novidades) — VAPID + Web Push nativo, sem custo
  // ═══════════════════════════════════════════
  // ── GET /api/push/vapid-public-key — chave pública que o navegador do cliente precisa pra se inscrever ──
  if (pathname === '/api/push/vapid-public-key' && req.method === 'GET') {
    const { cfg } = readConfig();
    return sendJSON(res, 200, { publicKey: cfg.vapid.publicKey });
  }
  // ── POST /api/push/subscribe — navegador do cliente se inscreve (telefone é opcional, usado pra segmentar) ──
  if (pathname === '/api/push/subscribe' && req.method === 'POST') {
    try {
      const { subscription, phone } = await readBody(req);
      if (!subscription || !subscription.endpoint || !subscription.keys) return sendJSON(res, 400, { error: 'Inscrição inválida.' });
      const subs = readJSON(PUSH_SUBS_FILE);
      const existing = subs.findIndex(s => s.endpoint === subscription.endpoint);
      const entry = { endpoint: subscription.endpoint, keys: subscription.keys, phone: phone ? normalizePhone(phone) : '', createdAt: new Date().toISOString() };
      if (existing === -1) subs.push(entry); else subs[existing] = entry;
      writeJSON(PUSH_SUBS_FILE, subs);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── POST /api/push/unsubscribe ──
  if (pathname === '/api/push/unsubscribe' && req.method === 'POST') {
    try {
      const { endpoint } = await readBody(req);
      const subs = readJSON(PUSH_SUBS_FILE).filter(s => s.endpoint !== endpoint);
      writeJSON(PUSH_SUBS_FILE, subs);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── GET /api/admin/push-subscribers — quantos clientes têm push ativo (pra mostrar no painel) ──
  if (pathname === '/api/admin/push-subscribers' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissão.' });
    const subs = readJSON(PUSH_SUBS_FILE);
    return sendJSON(res, 200, { total: subs.length, withPhone: subs.filter(s => s.phone).length });
  }
  // ── POST /api/admin/send-push — envia campanha push segmentada (todos, ou só telefones escolhidos) ──
  if (pathname === '/api/admin/send-push' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra enviar notificações.' });
    try {
      const { phones, title, message, url: targetUrl } = await readBody(req);
      const { cfg } = readConfig();
      if (!cfg.vapid || !cfg.vapid.publicKey || !cfg.vapid.privateKeyJwk) return sendJSON(res, 400, { error: 'Chaves VAPID ainda não configuradas — reinicie o servidor.' });
      const msg = String(message || '').slice(0, 200).trim();
      const ttl = String(title || cfg.name || 'Shogatsu').slice(0, 80).trim();
      if (!msg) return sendJSON(res, 400, { error: 'Digite a mensagem.' });
      let subs = readJSON(PUSH_SUBS_FILE);
      const segment = Array.isArray(phones) && phones.length ? new Set(phones.map(normalizePhone)) : null;
      const targets = segment ? subs.filter(s => segment.has(s.phone)) : subs;
      if (!targets.length) return sendJSON(res, 400, { error: 'Nenhum inscrito encontrado pra esse envio.' });
      const payload = { title: ttl, body: msg, url: targetUrl || '/', icon: '/icon-192.png' };
      const results = { sent: 0, failed: 0, errors: [] };
      const expiredEndpoints = [];
      for (const sub of targets) {
        const r = await webpush.sendWebPush(sub, payload, cfg.vapid, cfg.vapid.subject);
        if (r.ok) results.sent++;
        else { results.failed++; if (results.errors.length < 3) results.errors.push(`HTTP ${r.status || 0}`); if (r.expired) expiredEndpoints.push(sub.endpoint); }
      }
      if (expiredEndpoints.length) {
        subs = subs.filter(s => !expiredEndpoints.includes(s.endpoint));
        writeJSON(PUSH_SUBS_FILE, subs);
      }
      return sendJSON(res, 200, { ok: true, ...results, total: targets.length });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ═══════════════════════════════════════════
  // RESERVA DE MESAS
  // ═══════════════════════════════════════════
  // ── POST /api/reservations — cliente pede uma reserva (fica pendente até a loja confirmar) ──
  if (pathname === '/api/reservations' && req.method === 'POST') {
    try {
      const { cfg } = readConfig();
      if (!cfg.reservations || !cfg.reservations.enabled) return sendJSON(res, 400, { error: 'Reserva de mesas está desativada no momento.' });
      const body = await readBody(req);
      const name = String(body.name || '').trim().slice(0, 80);
      const phone = String(body.phone || '').trim().slice(0, 30);
      const people = Math.max(1, parseInt(body.people) || 0);
      const date = String(body.date || '').slice(0, 10);
      const time = String(body.time || '').slice(0, 5);
      if (!name || !phone) return sendJSON(res, 400, { error: 'Informe nome e telefone.' });
      if (!date || !time) return sendJSON(res, 400, { error: 'Escolha data e horário.' });
      if (!people) return sendJSON(res, 400, { error: 'Informe quantas pessoas.' });
      const maxP = Number(cfg.reservations.maxPeoplePerTable) || 12;
      if (people > maxP) return sendJSON(res, 400, { error: `Pra grupos maiores que ${maxP} pessoas, fale direto com a loja pelo WhatsApp.` });
      const list = readJSON(RESERVATIONS_FILE);
      const reservation = {
        id: 'RS' + Date.now().toString(36).toUpperCase(),
        createdAt: new Date().toISOString(),
        status: 'pendente', // pendente → confirmada / recusada / cancelada
        name, phone, people, date, time,
        notes: String(body.notes || '').slice(0, 200)
      };
      list.unshift(reservation);
      writeJSON(RESERVATIONS_FILE, list);
      return sendJSON(res, 201, { ok: true, reservation });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── GET /api/reservations — painel lista as reservas ──
  if (pathname === '/api/reservations' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    return sendJSON(res, 200, { reservations: readJSON(RESERVATIONS_FILE) });
  }
  // ── POST /api/reservations/:id/status — painel confirma/recusa/cancela uma reserva ──
  if (pathname.match(/^\/api\/reservations\/[^/]+\/status$/) && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const id = decodeURIComponent(pathname.split('/')[3]);
      const { status } = await readBody(req);
      if (!['pendente', 'confirmada', 'recusada', 'cancelada'].includes(status)) return sendJSON(res, 400, { error: 'Status inválido.' });
      const list = readJSON(RESERVATIONS_FILE);
      const r = list.find(x => x.id === id);
      if (!r) return sendJSON(res, 404, { error: 'Reserva não encontrada.' });
      r.status = status;
      writeJSON(RESERVATIONS_FILE, list);
      return sendJSON(res, 200, { ok: true, reservation: r });
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
      const { cfg, menu } = readConfig();
      if (!Number(cfg.open)) return sendJSON(res, 400, { error: 'Restaurante fechado no momento.' });
      if (!body.items || !body.items.length) return sendJSON(res, 400, { error: 'Carrinho vazio.' });

      // BUG DE SEGURANÇA CORRIGIDO: o servidor aceitava sem checar nenhuma o preço de cada item
      // exatamente como o navegador do cliente mandava — bastava editar a requisição (ex: pelo
      // DevTools) pra "pagar" qualquer prato a R$0,01. Agora todo preço é comparado contra o menor
      // preço realmente cadastrado no cardápio (contando variações/combos, que somam ao preço base);
      // preços zerados, negativos ou abaixo do mínimo possível do cardápio derrubam o pedido.
      const allMenuPrices = [];
      (menu || []).forEach(cat => (cat.items || []).forEach(it => {
        allMenuPrices.push(Number(it.price) || 0);
        (it.variantGroups || []).forEach(g => (g.options || []).forEach(o => {
          if (Number(o.priceDelta) < 0) allMenuPrices.push((Number(it.price) || 0) + Number(o.priceDelta));
        }));
      }));
      const minMenuPrice = allMenuPrices.length ? Math.min(...allMenuPrices.filter(p => p > 0)) : 0;
      for (const it of body.items) {
        const p = Number(it.price);
        if (!(p > 0) || (minMenuPrice > 0 && p < minMenuPrice - 0.01)) {
          return sendJSON(res, 400, { error: `Preço inválido para "${String(it.name || 'item').slice(0, 80)}". Atualize a página e tente novamente.` });
        }
      }

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

      // Resgate de pontos de fidelidade — nunca confia no valor de desconto que o cliente mandou,
      // recalcula o saldo real de pontos no servidor a partir do histórico de pedidos.
      let pointsRedeemed = 0, pointsDiscount = 0;
      const loyaltyCfg = cfg.loyalty || {};
      const requestedPoints = Math.max(0, parseInt(body.redeemPoints) || 0);
      if (loyaltyCfg.enabled && requestedPoints > 0 && String(body.phone || '').trim()) {
        const ordersNow = readJSON(ORDERS_FILE);
        const bal = loyaltyBalance(body.phone, ordersNow, cfg);
        const usablePoints = Math.min(requestedPoints, bal.balance);
        const blocks = Math.floor(usablePoints / (loyaltyCfg.redeemPoints || 100));
        if (blocks > 0 && subtotalNum >= (Number(loyaltyCfg.minOrderToRedeem) || 0)) {
          pointsRedeemed = blocks * (loyaltyCfg.redeemPoints || 100);
          pointsDiscount = blocks * (Number(loyaltyCfg.redeemValue) || 0);
        }
      }

      const totalNum = Math.max(0, subtotalNum + feeNum - discount - pointsDiscount);
      const pointsEarned = loyaltyCfg.enabled ? Math.floor(totalNum * (Number(loyaltyCfg.pointsPerReal) || 0)) : 0;

      const orders = readJSON(ORDERS_FILE);
      const order = {
        id: 'SG' + Date.now().toString(36).toUpperCase(),
        ticketNumber: null, // só é atribuído quando a loja ACEITA o pedido (veja PATCH /api/orders/:id)
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
        // v26: agendamento — cliente escolhe um horário futuro pra retirada/entrega em vez de "o quanto antes".
        // Validado contra a janela configurada (mínimo de antecedência e máximo de dias); fora da janela, ignora
        // o agendamento e o pedido segue como "o quanto antes" (nunca bloqueia o pedido por causa disso).
        scheduledFor: (() => {
          if (!body.scheduledFor) return null;
          const d = new Date(body.scheduledFor);
          if (isNaN(d.getTime())) return null;
          const sc = cfg.scheduling || {};
          const minAt = Date.now() + (Number(sc.minMinutesAhead) || 0) * 60000;
          const maxAt = Date.now() + (Number(sc.maxDaysAhead) || 7) * 86400000;
          if (d.getTime() < minAt || d.getTime() > maxAt) return null;
          return d.toISOString();
        })(),
        payMethod: String(body.payMethod || '').slice(0, 20),
        troco: String(body.troco || '').slice(0, 20),
        subtotal: subtotalNum,
        fee: feeNum,
        couponCode: appliedCoupon ? appliedCoupon.code : '',
        discount,
        pointsRedeemed,
        pointsDiscount,
        pointsEarned,
        total: totalNum,
        // v22: status de pagamento — 'pix' pode ser confirmado automaticamente (gateway) ou manualmente
        // (botão no painel); outras formas de pagamento (dinheiro/cartão na entrega) começam já "pagas"
        // do ponto de vista do fluxo, já que são conferidas na hora da entrega, não antes.
        paid: body.payMethod !== 'pix',
        paidAt: null,
        paidVia: null,
        // v27: coordenadas do endereço de entrega, pra mostrar no mapa da tela de acompanhamento.
        // Busca melhor-esforço — se a geocodificação falhar (endereço incompleto, serviço fora do ar),
        // o pedido segue normal, só sem o marcador do cliente no mapa.
        customerLat: null,
        customerLng: null
      };
      if (order.mode === 'delivery' && order.address) {
        try {
          const geo = await geocodeAddress(order.address + ', Brasil');
          if (geo) { order.customerLat = geo.lat; order.customerLng = geo.lng; }
        } catch (e) { /* mapa fica sem o marcador do cliente, sem afetar o pedido */ }
      }
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
      const { status, fee, cancelReason, cancelledBy, ticketNumber, courierName } = await readBody(req);
      const valid = ['novo', 'preparando', 'saiu', 'entregue', 'cancelado'];
      if (!valid.includes(status)) return sendJSON(res, 400, { error: 'status inválido' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
      const statusChanged = order.status !== status;
      order.status = status;
      // v27: nome do entregador (opcional) — aparece pro cliente na tela de acompanhamento quando o pedido sai.
      if (courierName !== undefined) order.courierName = String(courierName || '').slice(0, 60) || null;
      if (ticketNumber !== undefined && ticketNumber !== null && ticketNumber !== '') {
        const n = parseInt(ticketNumber);
        if (n >= 1 && n <= 200) {
          // Não deixa dois pedidos AINDA EM ANDAMENTO usarem o mesmo número — evita
          // confusão na hora de chamar ("Pedido nº 12!") com dois pedidos diferentes.
          // Pedidos já entregues/cancelados liberam o número de novo pra reuso normal do ciclo.
          const conflict = orders.find(o => o.id !== id && o.ticketNumber === n && !['entregue', 'cancelado'].includes(o.status));
          if (conflict) {
            return sendJSON(res, 400, { error: `O número ${n} já está sendo usado pelo pedido em andamento ${conflict.id}. Escolha outro número.` });
          }
          order.ticketNumber = n;
        }
      } else if (status === 'preparando' && !order.ticketNumber) {
        // Loja aceitou o pedido sem escolher um número manualmente — atribui o próximo da fila (1 a 200, cíclico),
        // pulando qualquer número que já esteja em uso por outro pedido ainda em andamento.
        const cfgData = readConfig();
        let next = Number(cfgData.cfg.nextTicketNumber) >= 1 && Number(cfgData.cfg.nextTicketNumber) <= 200 ? Number(cfgData.cfg.nextTicketNumber) : 1;
        const activeNumbers = new Set(orders.filter(o => o.id !== id && o.ticketNumber && !['entregue', 'cancelado'].includes(o.status)).map(o => o.ticketNumber));
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

      // v21: notificação automática de WhatsApp (se configurado) — não bloqueia a resposta ao painel;
      // se falhar (conta Twilio não configurada, número inválido, etc.) só ignora, sem quebrar nada.
      const notifCfg = readConfig().cfg;
      if (notifCfg.sms && notifCfg.sms.notifyWhatsApp && WHATSAPP_STATUS_MESSAGES[order.status] && order.phone) {
        const msg = WHATSAPP_STATUS_MESSAGES[order.status](order, notifCfg);
        sendWhatsApp(order.phone, msg, notifCfg.sms).catch(() => {});
      }
      // v27: notificação push automática quando o status muda (independente do WhatsApp) —
      // só alcança quem ativou notificações E tem o telefone vinculado à inscrição.
      if (statusChanged && PUSH_STATUS_MESSAGES[order.status] && order.phone && notifCfg.vapid && notifCfg.vapid.publicKey) {
        (async () => {
          try {
            const p = normalizePhone(order.phone);
            const subs = readJSON(PUSH_SUBS_FILE).filter(s => s.phone === p);
            if (!subs.length) return;
            const { title, body } = PUSH_STATUS_MESSAGES[order.status](order, notifCfg);
            const payload = { title, body, url: '/?track=' + order.id, icon: '/icon-192.png' };
            for (const sub of subs) await webpush.sendWebPush(sub, payload, notifCfg.vapid, notifCfg.vapid.subject);
          } catch (e) { /* nunca deve derrubar a atualização do pedido por causa disso */ }
        })();
      }

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

  // ── POST /api/orders/:id/received — cliente confirma que recebeu o pedido ──
  if (pathname.match(/^\/api\/orders\/[^/]+\/received$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
    order.receivedByCustomer = true;
    order.receivedAt = new Date().toISOString();
    writeJSON(ORDERS_FILE, orders);
    return sendJSON(res, 200, { ok: true });
  }

  // ── POST /api/orders/:id/review — cliente avalia o pedido (1 a 5 estrelas + comentário) ──
  if (pathname.match(/^\/api\/orders\/[^/]+\/review$/) && req.method === 'POST') {
    const id = pathname.split('/')[3];
    try {
      const { stars, comment } = await readBody(req);
      const n = parseInt(stars);
      if (!(n >= 1 && n <= 5)) return sendJSON(res, 400, { error: 'A avaliação precisa ser de 1 a 5 estrelas.' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
      if (order.review) return sendJSON(res, 400, { error: 'Esse pedido já foi avaliado.' });
      order.review = { stars: n, comment: String(comment || '').slice(0, 400), createdAt: new Date().toISOString(), hidden: false };
      writeJSON(ORDERS_FILE, orders);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/reviews — avaliações públicas e visíveis, pra mostrar no site ──
  if (pathname === '/api/reviews' && req.method === 'GET') {
    const orders = readJSON(ORDERS_FILE);
    const reviews = orders
      .filter(o => o.review && !o.review.hidden)
      .map(o => ({
        name: String(o.name || 'Cliente').trim().split(' ')[0], // só o primeiro nome, por privacidade
        stars: o.review.stars,
        comment: o.review.comment,
        createdAt: o.review.createdAt
      }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 50);
    const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.stars, 0) / reviews.length) * 10) / 10 : null;
    return sendJSON(res, 200, { reviews, average: avg, count: reviews.length });
  }

  // ── GET /api/admin/reviews — todas as avaliações (inclusive ocultas), pra moderação ──
  if (pathname === '/api/admin/reviews' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra ver as avaliações.' });
    const orders = readJSON(ORDERS_FILE);
    const reviews = orders
      .filter(o => o.review)
      .map(o => ({ orderId: o.id, ticketNumber: o.ticketNumber, name: o.name, ...o.review }))
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return sendJSON(res, 200, { reviews });
  }

  // ── PATCH /api/admin/reviews/:orderId — oculta ou reexibe uma avaliação ──
  if (pathname.match(/^\/api\/admin\/reviews\/[^/]+$/) && req.method === 'PATCH') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra moderar avaliações.' });
    const orderId = pathname.split('/').pop();
    try {
      const { hidden } = await readBody(req);
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === orderId);
      if (!order || !order.review) return sendJSON(res, 404, { error: 'Avaliação não encontrada.' });
      order.review.hidden = !!hidden;
      writeJSON(ORDERS_FILE, orders);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
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

restoreFromSupabase().finally(() => {
  server.listen(PORT, () => {
    console.log(`🍣 Shogatsu rodando em http://localhost:${PORT}`);
    console.log(`   Painel da cozinha: http://localhost:${PORT}/painel.html`);
  });
});
