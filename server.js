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
const COURIERS_FILE = path.join(DATA_DIR, 'couriers.json'); // v32: pré-cadastro de motoboys
// v43: Shogatsu Custos, antes um programa separado, agora integrado direto no painel —
// mesma pasta de dados, mesmo login, mesma sessão.
const INGREDIENTES_FILE = path.join(DATA_DIR, 'ingredientes.json');
const FICHAS_TECNICAS_FILE = path.join(DATA_DIR, 'fichas-tecnicas.json');
const CUSTOS_CONFIG_FILE = path.join(DATA_DIR, 'custos-config.json');
const DELETE_LOG_FILE = path.join(DATA_DIR, 'delete-log.json'); // v32: histórico de exclusões de pedidos
const webpush = require('./webpush');

// ═══════════════════════════════════════════════════════════
// v44: VERSÃO DE BUILD — sistema de atualização automática
// A cada deploy (Render/GitHub) o processo do Node sobe do zero, então calcular a versão UMA
// VEZ aqui no boot já basta: ela muda sozinha a cada novo deploy, sem precisar de nenhum passo
// manual. Prioridade: commit do Git (Render expõe automaticamente em RENDER_GIT_COMMIT; local
// tentamos ler via `git rev-parse` como fallback) > pacote + horário de início do processo.
// Isso NÃO mexe em login, pedidos, cardápio nem nada que já funciona — é só uma etiqueta pro
// front-end saber quando existe uma versão mais nova publicada (ver GET /api/version abaixo e
// public/version-check.js).
function computeBuildVersion() {
  const commit = process.env.RENDER_GIT_COMMIT || process.env.GIT_COMMIT || process.env.SOURCE_VERSION;
  if (commit) return commit.slice(0, 12);
  try {
    const { execSync } = require('child_process');
    const out = execSync('git rev-parse --short=12 HEAD', { cwd: __dirname, timeout: 2000 }).toString().trim();
    if (out) return out;
  } catch (e) { /* sem git disponível (ex: build sem .git) — usa o fallback abaixo */ }
  return 'boot-' + Date.now();
}
const BUILD_COMMIT = computeBuildVersion();
const BUILD_STARTED_AT = new Date().toISOString();
let PKG_VERSION = '1.0.0';
try { PKG_VERSION = require('./package.json').version || PKG_VERSION; } catch (e) { /* mantém o padrão acima */ }
// Formato "AAAA.MM.DD.HHmm-commit" — fácil de ler num log e ainda assim único por deploy.
const APP_VERSION = new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{4})(\d{2})(\d{2})(\d{4})$/, '$1.$2.$3.$4') + '-' + BUILD_COMMIT;

// ─── Config / Menu padrão (usados só na primeira execução) ───
const DEFAULT_CFG = {
  whats: '552227641333', storePhone: '(22) 2764-1333', fee: 8, min: 60,
  name: 'Shogatsu Culinária Oriental', days: 'Ter–Dom',
  time: '40–60 min', timeRetirada: '20–30 min', addr: 'Av. Gov. Roberto Silveira, 109 · Costazul · Rio das Ostras · CEP 22896-155',
  hours: '18h30–23h', open: 1,
  // ── Auto-abertura/fechamento por horário (se ativado, cfg.open passa a ser calculado sozinho) ──
  schedule: { enabled: false, openTime: '18:00', closeTime: '23:00' },
  // v45: horário POR DIA DA SEMANA — usado pra validar agendamento de delivery e reservas
  // (avisa "fechado" no dia certo, e trava o relógio dentro do horário de funcionamento
  // daquele dia). Índice 0 = domingo, 1 = segunda... igual Date.prototype.getDay(). Por
  // padrão segue o texto "Ter–Dom" que já existia (fechado só na segunda), com o mesmo
  // horário de cfg.schedule pros dias abertos — o admin pode customizar dia a dia depois.
  weekSchedule: [
    { open: true, openTime: '18:00', closeTime: '23:00' },  // domingo
    { open: false, openTime: '18:00', closeTime: '23:00' }, // segunda
    { open: true, openTime: '18:00', closeTime: '23:00' },  // terça
    { open: true, openTime: '18:00', closeTime: '23:00' },  // quarta
    { open: true, openTime: '18:00', closeTime: '23:00' },  // quinta
    { open: true, openTime: '18:00', closeTime: '23:00' },  // sexta
    { open: true, openTime: '18:00', closeTime: '23:00' }   // sábado
  ],
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
  customerAlertSound: 'classico', // som tocado no app do cliente a cada aviso (classico|suave|dupla|sino|oriental)
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
  dishPhotoSize: 80,             // v33: tamanho (px) da foto do prato pro cliente
  menuFontScale: 1,              // v33: escala da fonte do cardápio (0.85 a 1.3)
  // ── Impressoras por estação (vias separadas) ──
  // prepTime = tempo médio de preparo dessa estação, em minutos, usado para calcular
  // a previsão de saída automática na comanda (Entrada + prepTime = Previsão de saída).
  stations: {
    caixa:     { label: 'Caixa',     icon: '🧾', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 0, active: true },
    cozinha:   { label: 'Cozinha',   icon: '🍳', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 20, active: true },
    sushibar:  { label: 'Sushibar',  icon: '🍣', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 15, active: true },
    bar:       { label: 'Bar',       icon: '🍹', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 8, active: true },
    delivery:  { label: 'Delivery',  icon: '🛵', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 0, active: true },
    expedicao: { label: 'Expedição', icon: '📦', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 5, active: true }
    // v46: método "automatica" — imprime sozinho, sem abrir navegador nem pedir confirmação,
    // através do Agente Local de Impressão (print-agent/), que roda num computador dentro da
    // loja ligado na impressora. Ver POST /api/print abaixo e print-agent/print-agent.js.
    // v49: estações agora são totalmente dinâmicas — o admin pode criar/renomear/excluir vias
    // próprias além destas 6 padrão (📠 Estações de Impressão, em Editar Cardápio, e Configurações
    // → 📠 Impressoras por Estação). Qualquer chave nova aqui é preservada normalmente pelo
    // resto do sistema (ver readConfig/normalizeMenu/POST /api/config/POST /api/print abaixo).
    // v50: campo "active" — desativar uma estação (impressora quebrada, fechada por um tempo,
    // etc.) sem precisar excluir a via nem desmarcar ela de todos os itens. Enquanto active for
    // false, POST /api/print pula essa via de propósito (nem tenta imprimir, sem erro nenhum).
  },
  // v49: estação padrão usada quando um item do cardápio não tem NENHUMA estação marcada —
  // configurável em Configurações → 📠 Impressoras por Estação.
  defaultStation: 'cozinha',
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
  scheduling: { enabled: true, minMinutesAhead: 60, maxDaysAhead: 7 },
  // ── v47: Splash Screen Premium — sequência de fotos em tela cheia ao abrir o app, com
  // animação suave (zoom/fade/parallax), configurável pelo painel (Configurações → Splash). ──
  splash: { enabled: false, durationSeconds: 3, transition: 'zoom', photos: [] },
  // ── Cardápio do Rodízio Popular (página pública cardapio-rodizio-popular.html) — v39:
  // antes esses dados ficavam fixos dentro do próprio HTML; agora vêm daqui, editáveis pela
  // aba "🔗 QR Code & Links" do painel, sem precisar mexer em nenhum arquivo.
  rodizioPopular: {
    phrases: [
      'Sushi à vontade. Sabor sem limites.',
      'Aqui o rodízio é show — e o camarão é liberado.',
      'Cada peça, uma experiência. Cada mesa, um banquete.',
      'Temaki, sashimi, grelhados... e o refri é por nossa conta.',
      'Sabor japonês de verdade, no seu ritmo, sem pressa.'
    ],
    heroPhoto: '',
    priceGroups: [
      { label: 'Terça, Quarta e Quinta', cash: 'R$ 59,99', card: 'R$ 79,99' },
      { label: 'Sexta, Sábado e Domingo', cash: 'R$ 64,99', card: 'R$ 84,99' }
    ],
    priceNote: 'Valores válidos a partir das <b>18:30</b>.',
    highlights: [
      { icon: '🥤', label: 'Refrigerante Liberado' },
      { icon: '🥢', label: 'Temaki' },
      { icon: '🍤', label: 'Camarão ao Alho e Óleo' },
      { icon: '🍄', label: 'Shimeji' }
    ],
    gallery: [{ photo: '' }, { photo: '' }, { photo: '' }, { photo: '' }, { photo: '' }, { photo: '' }],
    categories: [
      { icon: '🍙', title: 'Hossomaki', items: ['Haddock Maki', 'Filadélfia', 'Kani Maki', 'Salmão Maki', 'Tartare Skin', 'Tekka Maki', 'Tartare de Salmão', 'Goiabada com Fruta do Dia', 'Camarão Grelhado', 'Tilápia com Geleia'] },
      { icon: '🍱', title: 'Uramakis', items: ['Salmão', 'Filadélfia Roll', 'Skin Roll', 'Atum', 'Califórnia', 'Haddock', 'Joy Salmão'] },
      { icon: '🍣', title: 'Sushis Diversos', items: ['Sushi Salmão', 'Sushi de Peixe Branco', 'Sushi Skin'] },
      { icon: '🥢', title: 'Temakis Tradicionais', items: ['Temaki Filadélfia', 'Temaki Hot Filadélfia'] },
      { icon: '✨', title: 'Especiais', items: ['Ceviche do Dia', 'Sunomono com Kani', 'Skin de Salmão com Cebolinha'] },
      { icon: '🍤', title: 'Fritos — Empanados', items: ['Peixe do Dia na Crosta de Ervas', 'Lula Milanesa (Dorê)', 'Frango Milanesa', 'Bolinho de Salmão', { name: 'Salmão Especial', sub: 'sob consulta' }, 'Frango Recheado Especial', 'Harumaki de Camarão', 'Harumaki de Frango', 'Harumaki de Legumes', 'Harumaki de Queijo e Presunto'] },
      { icon: '🔥', title: 'Grelhados', items: ['Lula ao Alho e Óleo', 'Camarão ao Alho e Óleo', 'Yakisoba Misto (Filé Mignon e Frango)', { name: 'Shimeji na Manteiga', sub: 'sob consulta' }, 'Filé Mignon Suíno Agridoce'] },
      { icon: '🍰', title: 'Sobremesas', items: ['Harumaki Romeu e Julieta', 'Harumaki Doce de Leite com Ameixa', 'Harumaki de Chocolate com Banana', 'Banana Empanada com Chocolate'] }
    ],
    address: 'Av. Gov. Roberto Silveira, 109 — Costa Azul, Rio das Ostras',
    whatsapp: '552227641333',
    instagram: 'shogatsurestaurante',
    deliveryUrl: '/',
    wasteNote: 'Taxa de desperdício: valor da peça do cardápio. Evite desperdício pra podermos manter nossa promoção e sempre atender melhor!',
    // v51: fontes/tamanhos ajustáveis pela aba de edição — sem isso, mudar a "cara" da página
    // exigia mexer direto no CSS do arquivo. accentColor troca a cor de destaque (preços,
    // ícones, bordas); headingFont/bodyFont trocam a família tipográfica; fontScale ajusta o
    // tamanho geral do texto (1 = padrão, 0.9 = menor, 1.15 = maior).
    theme: { headingFont: 'serif', bodyFont: 'sans-serif', accentColor: '#c9a24a', fontScale: 1 }
  }
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
if (!fs.existsSync(COURIERS_FILE)) fs.writeFileSync(COURIERS_FILE, '[]');
if (!fs.existsSync(INGREDIENTES_FILE)) fs.writeFileSync(INGREDIENTES_FILE, '[]');
if (!fs.existsSync(FICHAS_TECNICAS_FILE)) fs.writeFileSync(FICHAS_TECNICAS_FILE, '[]');
if (!fs.existsSync(CUSTOS_CONFIG_FILE)) fs.writeFileSync(CUSTOS_CONFIG_FILE, JSON.stringify({ diasParaDesatualizado: 21, margemPadrao: 65 }, null, 2));
if (!fs.existsSync(DELETE_LOG_FILE)) fs.writeFileSync(DELETE_LOG_FILE, '[]');

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
const FILE_TO_KEY = { [ORDERS_FILE]: 'orders', [CONFIG_FILE]: 'config', [CUSTOMERS_FILE]: 'customers', [RESERVATIONS_FILE]: 'reservations', [PUSH_SUBS_FILE]: 'push_subs', [COURIERS_FILE]: 'couriers', [DELETE_LOG_FILE]: 'delete_log', [INGREDIENTES_FILE]: 'ingredientes', [FICHAS_TECNICAS_FILE]: 'fichas_tecnicas', [CUSTOS_CONFIG_FILE]: 'custos_config' };

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
  let data = readJSON(CONFIG_FILE);
  // Blindagem: versões antigas tinham um bug em que alguns endpoints (geocode-by-cep,
  // geocode-store) gravavam o objeto de config "cru" no lugar de { cfg, menu }.
  // Se isso já aconteceu (arquivo local ou backup do Supabase corrompido dessa forma),
  // data.cfg viria undefined e derrubava o servidor inteiro. Aqui a gente detecta esse
  // formato antigo e se recupera sozinho, sem precisar mexer no arquivo na mão.
  if (!data || typeof data !== 'object') {
    data = { cfg: DEFAULT_CFG, menu: DEFAULT_MENU };
  } else if (!data.cfg) {
    data = { cfg: data, menu: DEFAULT_MENU };
  }
  const cfg = {
    ...DEFAULT_CFG,
    ...data.cfg,
    // v49 — BUG CORRIGIDO ("impressora não imprime" em vias novas): antes só as 4 chaves de
    // DEFAULT_CFG.stations sobreviviam a essa leitura — qualquer estação nova criada pelo admin
    // (ex: uma via customizada, ou mesmo "delivery"/"expedicao" adicionadas nesta versão) era
    // APAGADA sozinha no próximo carregamento, porque esse merge só olhava pras chaves padrão.
    // Agora a lista de chaves é a UNIÃO entre as padrão e as que já estão salvas — nenhuma
    // estação criada pelo admin some mais.
    stations: (() => {
      const saved = (data.cfg && data.cfg.stations) || {};
      const keys = new Set([...Object.keys(DEFAULT_CFG.stations), ...Object.keys(saved)]);
      const shape = { label: '', icon: '📠', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 15 };
      return Object.fromEntries([...keys].map(st => [st, {
        ...shape, label: st,
        ...(DEFAULT_CFG.stations[st] || {}),
        ...(saved[st] || {})
      }]));
    })(),
    labels: { ...DEFAULT_CFG.labels, ...(data.cfg.labels || {}) },
    uiFonts: { ...DEFAULT_CFG.uiFonts, ...(data.cfg.uiFonts || {}) },
    theme: { ...DEFAULT_CFG.theme, ...(data.cfg.theme || {}) },
    cancelReasons: data.cfg.cancelReasons || DEFAULT_CFG.cancelReasons,
    slides: data.cfg.slides || DEFAULT_CFG.slides,
    users: (Array.isArray(data.cfg.users) && data.cfg.users.length) ? data.cfg.users : DEFAULT_CFG.users,
    sms: { ...DEFAULT_CFG.sms, ...(data.cfg.sms || {}) },
    schedule: { ...DEFAULT_CFG.schedule, ...(data.cfg.schedule || {}) },
    weekSchedule: Array.isArray(data.cfg.weekSchedule) && data.cfg.weekSchedule.length === 7
      ? DEFAULT_CFG.weekSchedule.map((d, i) => ({ ...d, ...(data.cfg.weekSchedule[i] || {}) }))
      : DEFAULT_CFG.weekSchedule,
    vapid: { ...DEFAULT_CFG.vapid, ...(data.cfg.vapid || {}) },
    reservations: { ...DEFAULT_CFG.reservations, ...(data.cfg.reservations || {}) },
    scheduling: { ...DEFAULT_CFG.scheduling, ...(data.cfg.scheduling || {}) },
    rodizioPopular: { ...DEFAULT_CFG.rodizioPopular, ...(data.cfg.rodizioPopular || {}) },
    splash: { ...DEFAULT_CFG.splash, ...(data.cfg.splash || {}), photos: Array.isArray(data.cfg.splash && data.cfg.splash.photos) ? data.cfg.splash.photos : DEFAULT_CFG.splash.photos }
  };
  // Se a auto-programação de horário estiver ativada, o status aberto/fechado
  // passa a ser calculado sozinho a partir do horário configurado — o toggle
  // manual do painel deixa de valer enquanto isso estiver ligado.
  if (cfg.schedule && cfg.schedule.enabled) {
    cfg.open = isWithinSchedule(cfg.schedule.openTime, cfg.schedule.closeTime) ? 1 : 0;
  }
  return { cfg, menu: normalizeMenu(data.menu, Object.keys(cfg.stations), cfg.defaultStation) };
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
      // Nominatim bloqueou — tenta um provedor DIFERENTE (Photon, também gratuito e sem chave,
      // mas com infraestrutura própria, então não sofre do mesmo bloqueio de IP compartilhado).
      try {
        const alt = await httpsGetJSON(
          `https://photon.komoot.io/api/?limit=1&q=${q}`,
          { 'User-Agent': 'ShogatsuPedidosOnline/1.0 (contato via painel do restaurante)' },
          10000
        );
        const feat = alt && alt.features && alt.features[0];
        if (feat && feat.geometry && feat.geometry.coordinates) {
          const [lng, lat] = feat.geometry.coordinates;
          const p = feat.properties || {};
          const label = [p.name, p.street, p.city, p.state].filter(Boolean).join(', ');
          return { lat, lng, label };
        }
      } catch (e2) { /* os dois provedores falharam — segue pro erro normal abaixo */ }
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
// v43: a via de impressão passou a ser escolhida por categoria (não item por item), então um
// item sem "stations" próprio agora herda da categoria — e só cai pra "cozinha" se nem a
// categoria tiver nada definido. Itens que já tinham uma via própria salva continuam com ela,
// sem mudar nada de repente pra quem já configurou antes.
// v49: `validStations` agora vem de fora (chaves reais de cfg.stations, incluindo qualquer via
// customizada que o admin tenha criado) em vez de uma lista fixa de 3 — antes, itens marcados
// pra uma estação nova (delivery, expedição, ou qualquer via customizada) tinham a marcação
// APAGADA sozinha aqui, e caíam de volta pra "cozinha" sem explicação nenhuma.
function normalizeMenu(menu, validStations, defaultStation) {
  validStations = (Array.isArray(validStations) && validStations.length)
    ? validStations
    : ['caixa', 'cozinha', 'sushibar', 'bar', 'delivery', 'expedicao'];
  const fallback = (defaultStation && validStations.includes(defaultStation))
    ? defaultStation
    : (validStations.includes('cozinha') ? 'cozinha' : validStations[0]);
  return (menu || []).map(sec => {
    let catStations = Array.isArray(sec.stations) ? sec.stations.filter(s => validStations.includes(s)) : [];
    if (!catStations.length) catStations = [fallback];
    return {
      ...sec,
      stations: catStations,
      items: (sec.items || []).map(it => {
        const base = { station: fallback, available: true, variants: [], ...it };
        let stations = Array.isArray(base.stations) ? base.stations.filter(s => validStations.includes(s)) : [];
        if (!stations.length) stations = catStations;
        const { station, ...rest } = base;
        return { ...rest, stations: [...new Set(stations)] };
      })
    };
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
function readBody(req, maxBytes = 10e6) {
  // BUG CORRIGIDO (v42 — "caixa de fotos bugada"): quando o corpo passava do limite, o
  // código só chamava req.destroy() e nunca resolvia nem rejeitava a Promise — o
  // navegador ficava esperando pra sempre (a foto travava em "Enviando..." sem erro
  // nenhum). Agora rejeita explicitamente, então o endpoint sempre responde algo, e
  // o limite subiu de 8MB pra 10MB pra caber uma imagem de 4MB convertida em base64
  // (que fica ~33% maior) com folga.
  return new Promise((resolve, reject) => {
    let chunks = '';
    let tooLarge = false;
    req.on('data', c => {
      if (tooLarge) return;
      chunks += c;
      if (chunks.length > maxBytes) {
        tooLarge = true;
        reject(new Error('payload muito grande'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (tooLarge) return;
      try { resolve(chunks ? JSON.parse(chunks) : {}); } catch (e) { reject(e); }
    });
    req.on('error', (e) => { if (!tooLarge) reject(e); });
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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
  // v53: faltavam jpg/webp (fotos de prato/splash ficavam sem Content-Type correto) e os
  // formatos de vídeo usados pelas novas "Live Photo" da Splash Screen — sem isso o
  // navegador (principalmente Safari/iOS) recusa tocar o vídeo inline.
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime'
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
    // v44 — sistema de atualização automática: HTML e o próprio Service Worker nunca podem
    // ficar em cache do navegador (senão o cliente trava numa versão antiga sem saber); ícones,
    // manifest e demais estáticos raramente mudam, então ficam com cache longo — o SW já cuida
    // de invalidar sozinho quando a versão muda (ver public/sw.js e public/version-check.js).
    const isHtml = ext === '.html';
    const isSw = pathname === '/sw.js';
    const cacheControl = (isHtml || isSw)
      ? 'no-cache, no-store, must-revalidate'
      : 'public, max-age=31536000, immutable';
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': cacheControl });
    res.end(data);
  });
}

// ═══════════════════════════════════════════════════════════
// SERVIDOR
// ═══════════════════════════════════════════════════════════
const server = http.createServer(async (req, res) => {
  // v39: `url.parse()` está deprecated no Node (DEP0169) — trocado pela WHATWG URL API.
  // `query` continua sendo um objeto simples { chave: valor }, igual antes, pra não precisar
  // mexer em nenhum lugar do código que já usa `query.algumaCoisa`.
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsed.pathname;
  const query = Object.fromEntries(parsed.searchParams);

  if (req.method === 'OPTIONS') { return sendJSON(res, 204, {}); }

  // ── GET /api/version — usado pelo front-end (public/version-check.js) pra saber se existe
  // uma versão mais nova publicada e, se sim, atualizar sozinho sem o cliente precisar limpar
  // cache/histórico ou reinstalar nada. Não exige login — é só uma etiqueta pública. ──
  if (pathname === '/api/version' && req.method === 'GET') {
    return sendJSON(res, 200, { version: APP_VERSION, build: BUILD_COMMIT, startedAt: BUILD_STARTED_AT, pkg: PKG_VERSION });
  }

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
      // v49 — BUG CORRIGIDO ("excluir estação não excluía de verdade"): o merge antigo só
      // ACRESCENTAVA chaves em cfg.stations (spread de current + spread do que veio no body),
      // então uma estação removida no painel (apagada do objeto antes de enviar) reaparecia
      // sozinha aqui porque ainda existia em `current.cfg.stations`. Agora, sempre que o body
      // manda um objeto `stations` explícito, ele é tratado como a lista COMPLETA e definitiva
      // (substitui, não acrescenta) — é exatamente como o painel já trabalha (edita o cfg.stations
      // inteiro em memória e manda tudo de uma vez em "Salvar Tudo"/Configurações).
      const stationsProvided = body.cfg && body.cfg.stations && typeof body.cfg.stations === 'object';
      const stationsSrc = stationsProvided ? body.cfg.stations : current.cfg.stations;
      const stationShape = { label: '', icon: '📠', method: 'navegador', ip: '', port: 9100, device: '', prepTime: 15 };
      const mergedStations = Object.fromEntries(Object.keys(stationsSrc).map(k => [k, {
        ...stationShape, label: k,
        ...(current.cfg.stations[k] || {}),
        ...(stationsSrc[k] || {})
      }]));
      // Se alguma estação foi excluída, tira a referência dela de todas as categorias/itens do
      // cardápio também — senão o item continuava "marcado" pra uma via que não existe mais.
      const validStationKeys = Object.keys(mergedStations);
      const menuBeforeNormalize = body.menu || current.menu;
      const merged = {
        cfg: {
          ...current.cfg, ...body.cfg,
          adminPass: current.cfg.adminPass, masterPass: current.cfg.masterPass,
          stations: mergedStations,
          labels: { ...current.cfg.labels, ...(body.cfg && body.cfg.labels || {}) },
          uiFonts: { ...current.cfg.uiFonts, ...(body.cfg && body.cfg.uiFonts || {}) },
          theme: { ...current.cfg.theme, ...(body.cfg && body.cfg.theme || {}) },
          sms: { ...current.cfg.sms, ...(body.cfg && body.cfg.sms || {}) },
          schedule: { ...current.cfg.schedule, ...(body.cfg && body.cfg.schedule || {}) },
          weekSchedule: (Array.isArray(body.cfg && body.cfg.weekSchedule) && body.cfg.weekSchedule.length === 7)
            ? current.cfg.weekSchedule.map((d, i) => ({ ...d, ...(body.cfg.weekSchedule[i] || {}) }))
            : current.cfg.weekSchedule,
          rodizioPopular: { ...current.cfg.rodizioPopular, ...(body.cfg && body.cfg.rodizioPopular || {}) },
          splash: {
            ...current.cfg.splash,
            ...(body.cfg && body.cfg.splash || {}),
            photos: Array.isArray(body.cfg && body.cfg.splash && body.cfg.splash.photos) ? body.cfg.splash.photos : current.cfg.splash.photos
          }
        },
        menu: normalizeMenu(menuBeforeNormalize, validStationKeys, (body.cfg && body.cfg.defaultStation) || current.cfg.defaultStation)
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
  // ── GET /api/admin/customer-lookup?phone=... — v47: usado pela tela de Novo Pedido Manual
  // pra preencher nome/endereço/CEP sozinho quando o telefone já é de um cliente conhecido, sem
  // precisar redigitar tudo de novo. Primeiro tenta o cadastro (customers.json); se o cliente
  // nunca criou conta mas já tem pedido anterior, usa os dados do pedido mais recente dele. ──
  if (pathname === '/api/admin/customer-lookup' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'vendas')) return sendJSON(res, 403, { error: 'Sem permissão.' });
    const phone = normalizePhone(query.phone || '');
    if (!phone) return sendJSON(res, 200, { found: false });
    const customers = readJSON(CUSTOMERS_FILE);
    const cust = findCustomer(customers, phone);
    const orders = readJSON(ORDERS_FILE).filter(o => normalizePhone(o.phone) === phone).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    const lastOrder = orders[0];
    if (!cust && !lastOrder) return sendJSON(res, 200, { found: false });
    return sendJSON(res, 200, {
      found: true,
      name: (cust && cust.name) || (lastOrder && lastOrder.name) || '',
      address: (cust && cust.lastAddress) || (lastOrder && lastOrder.mode === 'delivery' ? lastOrder.address : '') || '',
      ordersCount: orders.length
    });
  }

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

  // ═══════════════════════════════════════════════════════════
  // MOTOBOYS (v32) — pré-cadastro de entregadores, pra agilizar a hora de
  // marcar "saiu para entrega" sem precisar digitar o nome toda vez.
  // ═══════════════════════════════════════════════════════════
  // ── GET /api/admin/couriers — lista motoboys cadastrados ──
  if (pathname === '/api/admin/couriers' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra ver os motoboys.' });
    return sendJSON(res, 200, { couriers: readJSON(COURIERS_FILE) });
  }
  // ── POST /api/admin/couriers — cadastra um novo motoboy ──
  if (pathname === '/api/admin/couriers' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra cadastrar motoboys.' });
    try {
      const { name, phone, plate, notes, photo } = await readBody(req);
      const nm = String(name || '').trim();
      if (!nm || nm.length < 2) return sendJSON(res, 400, { error: 'Digite o nome do motoboy.' });
      const couriers = readJSON(COURIERS_FILE);
      const courier = {
        id: 'MB' + Date.now().toString(36).toUpperCase(),
        name: nm,
        phone: String(phone || '').replace(/\D/g, ''),
        plate: String(plate || '').trim().toUpperCase(),
        notes: String(notes || '').trim().slice(0, 200),
        photo: String(photo || '').trim(), // v50: foto do motoboy (upload via /api/upload)
        active: true,
        createdAt: new Date().toISOString()
      };
      couriers.unshift(courier);
      writeJSON(COURIERS_FILE, couriers);
      return sendJSON(res, 201, { ok: true, courier, couriers });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── PATCH /api/admin/couriers/:id — edita dados ou ativa/desativa um motoboy ──
  if (pathname.match(/^\/api\/admin\/couriers\/[^/]+$/) && req.method === 'PATCH') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra editar motoboys.' });
    try {
      const id = decodeURIComponent(pathname.split('/').pop());
      const body = await readBody(req);
      const couriers = readJSON(COURIERS_FILE);
      const courier = couriers.find(c => c.id === id);
      if (!courier) return sendJSON(res, 404, { error: 'Motoboy não encontrado.' });
      if (body.name !== undefined) courier.name = String(body.name).trim();
      if (body.phone !== undefined) courier.phone = String(body.phone).replace(/\D/g, '');
      if (body.plate !== undefined) courier.plate = String(body.plate).trim().toUpperCase();
      if (body.notes !== undefined) courier.notes = String(body.notes).trim().slice(0, 200);
      if (body.photo !== undefined) courier.photo = String(body.photo).trim(); // v50
      if (body.active !== undefined) courier.active = !!body.active;
      writeJSON(COURIERS_FILE, couriers);
      return sendJSON(res, 200, { ok: true, courier, couriers });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── DELETE /api/admin/couriers/:id — remove um motoboy do cadastro ──
  if (pathname.match(/^\/api\/admin\/couriers\/[^/]+$/) && req.method === 'DELETE') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Seu usuário não tem permissão pra remover motoboys.' });
    const id = decodeURIComponent(pathname.split('/').pop());
    let couriers = readJSON(COURIERS_FILE);
    const existed = couriers.some(c => c.id === id);
    if (!existed) return sendJSON(res, 404, { error: 'Motoboy não encontrado.' });
    couriers = couriers.filter(c => c.id !== id);
    writeJSON(COURIERS_FILE, couriers);
    return sendJSON(res, 200, { ok: true, couriers });
  }


  if (pathname === '/api/upload' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { dataUrl } = await readBody(req, 21e6);
      // v53: além de imagem, agora também aceita vídeo curto — usado nas "Live Photo" da
      // Splash Screen (foto "viva" tocando em loop, mudo). Vídeo tem um limite maior (15MB)
      // porque pesa naturalmente mais que uma foto comprimida.
      const mImg = /^data:image\/(png|jpe?g|webp);base64,(.+)$/i.exec(dataUrl || '');
      const mVideo = /^data:video\/(mp4|webm|quicktime);base64,(.+)$/i.exec(dataUrl || '');
      if (!mImg && !mVideo) return sendJSON(res, 400, { error: 'Formato inválido. Use PNG, JPG, WEBP (foto) ou MP4/WEBM/MOV (Live Photo).' });
      const m = mImg || mVideo;
      let ext = m[1].toLowerCase();
      if (ext === 'jpeg') ext = 'jpg';
      else if (ext === 'quicktime') ext = 'mov';
      const buffer = Buffer.from(m[2], 'base64');
      const maxBytes = mVideo ? 15 * 1024 * 1024 : 4 * 1024 * 1024;
      if (buffer.length > maxBytes) return sendJSON(res, 400, { error: mVideo ? 'Vídeo muito grande (máx. 15MB).' : 'Imagem muito grande (máx. 4MB).' });
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


  // ── POST /api/admin/geocode-by-cep — localiza a loja a partir do CEP, usando a BrasilAPI
  // (serviço brasileiro, com infraestrutura própria — não sofre do bloqueio de IP compartilhado
  // que o Nominatim às vezes aplica em servidores como o Render). Quando a BrasilAPI já tem a
  // coordenada cadastrada pro CEP, usa direto; senão, monta o endereço a partir do CEP e cai no
  // mesmo fluxo de geocodificação por texto (Nominatim → Photon) como último recurso. ──
  if (pathname === '/api/admin/geocode-by-cep' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      const cep = String(body.cep || '').replace(/\D/g, '');
      if (cep.length !== 8) return sendJSON(res, 400, { error: 'Digite um CEP válido, com 8 dígitos (ex: 28890-000).' });

      let cepData = null;
      try {
        cepData = await httpsGetJSON(`https://brasilapi.com.br/api/cep/v2/${cep}`, {}, 8000);
      } catch (e) {
        console.error('⚠️  BrasilAPI não respondeu pro CEP', cep, ':', e.message);
      }
      if (!cepData) return sendJSON(res, 404, { error: 'CEP não encontrado. Confira se digitou certo, ou use o campo de coordenadas manuais abaixo.' });

      // A BrasilAPI às vezes já vem com a coordenada pronta pra esse CEP — o caminho mais rápido e confiável
      const coords = cepData.location && cepData.location.coordinates;
      if (coords && coords.latitude && coords.longitude) {
        const cepFull = readConfig();
        cepFull.cfg.storeLat = parseFloat(coords.latitude);
        cepFull.cfg.storeLng = parseFloat(coords.longitude);
        writeJSON(CONFIG_FILE, cepFull);
        const cfg = cepFull.cfg;
        return sendJSON(res, 200, {
          lat: cfg.storeLat, lng: cfg.storeLng,
          label: [cepData.street, cepData.neighborhood, cepData.city, cepData.state].filter(Boolean).join(', '),
          source: 'brasilapi-direto'
        });
      }

      // Sem coordenada pronta: monta o endereço a partir do que o CEP devolveu e tenta geocodificar o texto
      const addressFromCep = [cepData.street, cepData.neighborhood, cepData.city, cepData.state, 'Brasil'].filter(Boolean).join(', ');
      const geo = await geocodeAddress(addressFromCep);
      if (!geo) return sendJSON(res, 404, { error: `Achamos o endereço do CEP (${addressFromCep}), mas não conseguimos converter em coordenadas agora. Use o campo de coordenadas manuais abaixo.` });
      const geoFull = readConfig();
      geoFull.cfg.storeLat = geo.lat; geoFull.cfg.storeLng = geo.lng;
      writeJSON(CONFIG_FILE, geoFull);
      return sendJSON(res, 200, { lat: geo.lat, lng: geo.lng, label: geo.label || addressFromCep, source: 'geocoded' });
    } catch (e) {
      console.error('❌ Falha ao geocodificar por CEP:', e.message);
      return sendJSON(res, 500, { error: 'Não conseguimos processar esse CEP agora. Use o campo de coordenadas manuais abaixo.' });
    }
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
      const isBlocked = /HTTP 429/.test(e.message);
      return sendJSON(res, 500, {
        error: isBlocked
          ? 'O serviço gratuito de mapas está limitando as requisições vindas deste servidor no momento (isso é comum em hospedagens compartilhadas como o Render, e pode continuar acontecendo). Em vez de ficar tentando de novo, digite as coordenadas manualmente no campo ao lado — pegue elas no Google Maps: clique com o botão direito no local exato da loja e copie os dois números que aparecem.'
          : 'Não conseguimos falar com o serviço de mapas agora (' + e.message + '). Digite as coordenadas manualmente no campo ao lado, ou tente de novo em alguns instantes.'
      });
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
  // v34: BUG CORRIGIDO — retirada usava a mesma estimativa de tempo do delivery, mesmo sendo
  // bem mais rápida na prática. Agora cada modo tem seu próprio texto configurável.
  const timeText = order.mode === 'retirada' ? (cfg.timeRetirada || cfg.time) : cfg.time;
  const nums = String(timeText || '').match(/\d+/g);
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
  return timeText || '—';
}

  // ── POST /api/print — imprime a via de uma estação para um pedido ──
  if (pathname === '/api/print' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { orderId, station } = await readBody(req);
      const { cfg } = readConfig();
      // v49 — BUG CORRIGIDO ("impressora não imprime" em vias novas): essa checagem só aceitava
      // as 4 vias originais — qualquer via nova (delivery, expedição, ou uma via customizada
      // criada pelo admin) caía nesse "Via inválida" e nunca imprimia nada, mesmo com tudo
      // configurado certinho em Estações de Impressão. Agora aceita qualquer via que exista de
      // fato em cfg.stations.
      const st = Object.keys(cfg.stations || {}).includes(station) ? station : null;
      if (!st) return sendJSON(res, 400, { error: 'Via inválida.' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === orderId);
      if (!order) return sendJSON(res, 404, { error: 'Pedido não encontrado.' });
      const isCaixa = st === 'caixa';

      // v50: via desativada (Configurações → 📠 Impressoras por Estação → impressora
      // temporariamente fora do ar) — pula de propósito, sem tentar imprimir e sem erro. Igual
      // ao caso de "sem itens pra essa via", só que por escolha do admin em vez de automático.
      if (cfg.stations[st] && cfg.stations[st].active === false) {
        return sendJSON(res, 200, { ok: true, printed: false, skipped: true, disabled: true, order, station: st });
      }

      // Caixa: comprovante completo (todos os itens + dados do cliente + horário).
      // Cozinha/Sushibar/Bar: só os itens daquela estação + observações, sem dados pessoais.
      const items = isCaixa ? order.items : order.items.filter(i => (i.stations || []).includes(st));
      if (!items.length) return sendJSON(res, 200, { ok: true, printed: false, skipped: true, order, station: st });

      const deliveryWindow = estimateDeliveryWindow(order, cfg);
      let printerCfg = cfg.stations[st] || { method: 'navegador' };
      // v39 (pedido novo): se a via não tem impressora própria configurada (USB/rede), em vez
      // de falhar, imprime na MESMA impressora USB/rede já configurada pro Caixa — assim uma
      // única impressora física dá conta de todas as vias até que cada uma ganhe a sua.
      let usedCaixaFallback = false;
      const missingOwnPrinter = !isCaixa && (
        (printerCfg.method === 'usb' && !printerCfg.device) ||
        (printerCfg.method === 'rede' && !printerCfg.ip)
      );
      if (missingOwnPrinter) {
        const caixaCfg = cfg.stations.caixa;
        const caixaReady = caixaCfg && ((caixaCfg.method === 'usb' && caixaCfg.device) || (caixaCfg.method === 'rede' && caixaCfg.ip));
        if (caixaReady) { printerCfg = caixaCfg; usedCaixaFallback = true; }
      }
      if (printerCfg.method === 'navegador') {
        // O navegador do cliente (painel) monta e imprime o ticket — servidor só confirma os dados.
        return sendJSON(res, 200, { ok: true, printed: false, order, station: st, method: 'navegador', deliveryWindow });
      }
      // v46 — BUG CORRIGIDO ("impressora deve imprimir automaticamente sem navegar sem
      // confirmação"): a raiz do problema é que um navegador NUNCA consegue mandar pra
      // impressora sem abrir alguma janela e pedir confirmação — isso é uma trava de
      // segurança do próprio navegador, nenhum código de site consegue contornar isso sozinho.
      // A única forma real de "imprime sozinho, sem clicar em nada" é ter um programinha rodando
      // no computador da loja que fala direto com a impressora — é o que o método "Automática"
      // faz: delega pro Agente Local de Impressão (print-agent/), que já está escutando os
      // pedidos novos em tempo real e imprime sozinho, sem qualquer participação do navegador.
      if (printerCfg.method === 'automatica') {
        // v54 — BUG CORRIGIDO ("imprimir via celular não chega na impressora do PC"): até
        // aqui, clicar em "🖨 Imprimir" (seja de novo, seja reimprimindo) numa via
        // Automática só devolvia `delegated:true` pro navegador SEM avisar o Agente Local
        // de verdade — o agente só imprimia pedido novo automaticamente na hora da criação
        // (evento "new-order"); qualquer clique manual depois disso (do celular, do PC, de
        // qualquer painel logado) não tinha efeito nenhum na impressora, mesmo mostrando um
        // aviso de "enviado". Agora todo clique manual manda um evento "print-order" por SSE
        // pra TODOS os clientes conectados (painel no PC, painel no celular, Agente Local) —
        // é assim que "celular manda, impressora do PC obedece" funciona de verdade: o
        // servidor é o intermediário, o Agente Local (rodando no PC ligado na impressora)
        // escuta esse evento e imprime na hora, não importa de qual aparelho o pedido partiu.
        broadcast('print-order', { order, station: st });
        return sendJSON(res, 200, { ok: true, printed: false, delegated: true, order, station: st, method: 'automatica' });
      }

      // v44: layout ESC/POS redesenhado — cabeçalho centralizado, blocos com título
      // (CLIENTE/ITENS/RESUMO no comprovante; HORÁRIOS/ITENS na via de produção), valores
      // alinhados à direita (padStart até 32 colunas = largura útil de 58/80mm), TOTAL em
      // destaque. Sem emoji no ESC/POS puro (impressora térmica não garante suporte a eles);
      // o emoji fica só na via impressa pelo navegador (openBrowserTicket, no painel.html).
      const HR = '--------------------------------';
      const HR2 = '================================';
      const money = v => 'R$ ' + Number(v || 0).toFixed(2).replace('.', ',');
      const rightAlignRow = (label, value) => {
        const pad = Math.max(1, 32 - label.length - value.length);
        return label + ' '.repeat(pad) + value;
      };
      const refShort = String(order.id || '').slice(-11).toUpperCase();
      const lines = [];
      lines.push(ESC.center + ESC.boldOn + (cfg.name || 'SHOGATSU').toUpperCase() + ESC.boldOff);
      lines.push((cfg.tagline || 'CULINARIA ORIENTAL').toUpperCase() + ESC.left);
      lines.push(HR2);

      if (isCaixa) {
        // ── Via do Caixa: comprovante completo (dados do cliente + horário estimado) ──
        lines.push(ESC.center + 'COMPROVANTE' + ESC.left);
        lines.push((order.ticketNumber ? 'Pedido Nº ' + order.ticketNumber : 'Pedido #' + order.id));
        lines.push('Data: ' + new Date(order.createdAt).toLocaleDateString('pt-BR'));
        lines.push('Hora: ' + new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
        lines.push('Ref.: #' + refShort);
        lines.push(order.mode === 'delivery' ? 'ENTREGA (DELIVERY)' : 'RETIRADA');
        lines.push(HR);
        lines.push(ESC.boldOn + 'CLIENTE' + ESC.boldOff);
        lines.push(HR);
        lines.push(order.name);
        lines.push('Tel: ' + order.phone);
        if (order.mode === 'delivery') lines.push('End: ' + order.address);
        lines.push((order.mode === 'delivery' ? 'Previsao: ' : 'Previsao retirada: ') + deliveryWindow);
        lines.push(HR);
        lines.push(ESC.boldOn + 'ITENS' + ESC.boldOff);
        lines.push(HR);
        items.forEach(i => lines.push(rightAlignRow(`${i.qty}x ${i.name}`, money(i.price * i.qty))));
        if (order.obs) { lines.push(HR); lines.push('Obs: ' + order.obs); }
        lines.push(HR);
        lines.push(ESC.boldOn + 'RESUMO' + ESC.boldOff);
        lines.push(HR);
        lines.push(rightAlignRow('Subtotal', money(order.subtotal)));
        lines.push(rightAlignRow('Entrega', money(order.fee)));
        if (order.discount > 0 || order.couponCode) {
          lines.push(rightAlignRow(`Cupom ${order.couponCode}`, '-' + money(order.discount || 0)));
        }
        lines.push(HR);
        lines.push(ESC.boldOn + ESC.doubleOn + rightAlignRow('TOTAL', money(order.total)) + ESC.doubleOff + ESC.boldOff);
        lines.push(HR2);
        lines.push('Pagamento: ' + order.payMethod + (order.troco ? ' (troco para ' + order.troco + ')' : ''));
        lines.push(ESC.center + 'Obrigado pela preferencia!' + ESC.left);
        if (cfg.siteUrl) lines.push(ESC.center + cfg.siteUrl + ESC.left);
      } else {
        // ── Vias de produção (cozinha/sushibar/bar): layout idêntico entre as três vias ──
        // v40: previsão de saída automática = Entrada + tempo de preparo configurado pra essa estação.
        const prepMin = Number((cfg.stations[st] && cfg.stations[st].prepTime)) || 15;
        const entrada = new Date(order.createdAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const saidaPrevista = new Date(new Date(order.createdAt).getTime() + prepMin * 60000)
          .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        lines.push(ESC.center + ESC.boldOn + ((cfg.stations[st] && cfg.stations[st].label) || st).toUpperCase() + ESC.boldOff);
        lines.push('VIA DE PRODUCAO' + ESC.left);
        lines.push(HR);
        lines.push((order.ticketNumber ? 'Pedido Nº ' + order.ticketNumber : 'Pedido #' + order.id) + '  Ref.: #' + refShort);
        lines.push(order.mode === 'delivery' ? 'DELIVERY' : 'RETIRADA');
        lines.push(HR);
        lines.push(ESC.boldOn + 'HORARIOS' + ESC.boldOff);
        lines.push(HR);
        lines.push(rightAlignRow('Entrada:', entrada));
        lines.push(rightAlignRow('Saida Prevista:', saidaPrevista));
        lines.push(HR);
        lines.push(ESC.boldOn + ('ITENS DA ' + (((cfg.stations[st] && cfg.stations[st].label) || st).toUpperCase())) + ESC.boldOff);
        lines.push(HR);
        items.forEach(i => lines.push('* ' + i.qty + 'x ' + i.name));
        lines.push(HR);
        lines.push('Observacoes:');
        if (order.obs) lines.push(order.obs);
        else { lines.push('_______________________________'); lines.push('_______________________________'); }
      }
      lines.push(HR2);
      const ticketText = buildTicketText(lines, cfg);

      try {
        if (printerCfg.method === 'rede') {
          if (!printerCfg.ip) return sendJSON(res, 400, { error: `Impressora de rede da via "${st}" sem IP configurado.` });
          await sendNetworkPrint(printerCfg.ip, printerCfg.port, ticketText);
        } else if (printerCfg.method === 'usb') {
          if (!printerCfg.device) return sendJSON(res, 400, { error: `Caminho do dispositivo USB da via "${st}" não configurado.` });
          await sendUSBPrint(printerCfg.device, ticketText);
        }
        return sendJSON(res, 200, { ok: true, printed: true, order, station: st, method: printerCfg.method, usedCaixaFallback });
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
      if (printerCfg.active === false) return sendJSON(res, 400, { error: 'Essa via está desativada — ative em Configurações → 📠 Impressoras por Estação pra poder testar.' });
      if (printerCfg.method === 'navegador') return sendJSON(res, 200, { ok: true, method: 'navegador' });
      const text = buildTicketText([
        ESC.center + ESC.boldOn + 'TESTE DE IMPRESSAO' + ESC.boldOff + ESC.left,
        'Via: ' + (printerCfg.label || station),
        new Date().toLocaleString('pt-BR')
      ], cfg);
      if (printerCfg.method === 'automatica') {
        // v46: não tem como o servidor (na nuvem) mandar isso direto pra impressora — quem
        // imprime é o Agente Local, que fica escutando esse evento também (junto com
        // "new-order") e imprime sozinho assim que o administrador clica em "Testar".
        broadcast('print-test', { station, text, label: printerCfg.label || station });
        return sendJSON(res, 200, { ok: true, method: 'automatica', delegated: true });
      }
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
      const { phones, title, message, url: targetUrl, image, sound } = await readBody(req);
      const { cfg } = readConfig();
      if (!cfg.vapid || !cfg.vapid.publicKey || !cfg.vapid.privateKeyJwk) return sendJSON(res, 400, { error: 'Chaves VAPID ainda não configuradas — reinicie o servidor.' });
      const msg = String(message || '').slice(0, 200).trim();
      const ttl = String(title || cfg.name || 'Shogatsu').slice(0, 80).trim();
      if (!msg) return sendJSON(res, 400, { error: 'Digite a mensagem.' });
      let subs = readJSON(PUSH_SUBS_FILE);
      const segment = Array.isArray(phones) && phones.length ? new Set(phones.map(normalizePhone)) : null;
      const targets = segment ? subs.filter(s => segment.has(s.phone)) : subs;
      if (!targets.length) return sendJSON(res, 400, { error: 'Nenhum inscrito encontrado pra esse envio.' });
      // v47 — BUG CORRIGIDO: o formulário de campanha (painel.html) já mandava "image" e
      // "sound" desde a v45, mas esse endpoint nunca lia esses campos do corpo da requisição —
      // então toda notificação saía sem banner e sem o sinal pra tocar o sino oriental,
      // mesmo quando o admin preenchia a imagem. Agora repassa os dois pro payload de verdade.
      const payload = { title: ttl, body: msg, url: targetUrl || '/', icon: '/icon-192.png', image: image || undefined, sound: sound || 'oriental', tag: 'shogatsu-campanha-' + Date.now() };
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
  // CUSTOS — cadastro de ingredientes e ficha técnica (v43: integrado no painel,
  // antes era o programa separado "shogatsu-custos")
  // ═══════════════════════════════════════════
  const CUSTOS_STATIONS = ['kg', 'g', 'l', 'ml', 'un'];
  const CUSTOS_FATOR = { kg: { kg: 1, g: 1000 }, g: { g: 1, kg: 0.001 }, l: { l: 1, ml: 1000 }, ml: { ml: 1, l: 0.001 }, un: { un: 1 } };
  function custosDefaultConfig() { return { diasParaDesatualizado: 21, margemPadrao: 65 }; }
  function custoDoItem(ingrediente, quantidade, unidadeUsada) {
    const un = ingrediente.unidade;
    const usada = unidadeUsada || un;
    if (un === usada) return ingrediente.precoUnitario * quantidade;
    const tabela = CUSTOS_FATOR[un];
    if (tabela && tabela[usada] !== undefined) return ingrediente.precoUnitario * (quantidade / tabela[usada]);
    return ingrediente.precoUnitario * quantidade;
  }
  function calcularFichaTecnica(ficha, ingredientesPorId, custosCfg) {
    let custoTotal = 0, temIngredienteFaltando = false, temPrecoDefasado = false;
    const limiteMs = (custosCfg.diasParaDesatualizado || 21) * 86400000;
    const agora = Date.now();
    const itensCalculados = (ficha.itens || []).map(item => {
      const ing = ingredientesPorId[item.ingredienteId];
      if (!ing) { temIngredienteFaltando = true; return { ...item, custo: 0, erro: 'ingrediente não encontrado' }; }
      const custo = custoDoItem(ing, Number(item.quantidade) || 0, item.unidade);
      custoTotal += custo;
      const desatualizado = agora - new Date(ing.atualizadoEm).getTime() > limiteMs;
      if (desatualizado) temPrecoDefasado = true;
      return { ...item, nomeIngrediente: ing.nome, unidadeIngrediente: ing.unidade, precoUnitarioIngrediente: ing.precoUnitario, custo: Math.round(custo * 100) / 100, desatualizado };
    });
    const rendimento = Number(ficha.rendimento) || 1;
    const custoPorPorcao = custoTotal / rendimento;
    const margem = (ficha.margemDesejada !== undefined && ficha.margemDesejada !== null && ficha.margemDesejada !== '') ? Number(ficha.margemDesejada) : (custosCfg.margemPadrao || 65);
    const margemFrac = Math.min(Math.max(margem, 0), 95) / 100;
    const precoSugerido = margemFrac < 1 ? custoPorPorcao / (1 - margemFrac) : custoPorPorcao;
    let cmv = null;
    if (ficha.precoVendaAtual && Number(ficha.precoVendaAtual) > 0) cmv = (custoPorPorcao / Number(ficha.precoVendaAtual)) * 100;
    return {
      ...ficha, itensCalculados,
      custoTotal: Math.round(custoTotal * 100) / 100,
      custoPorPorcao: Math.round(custoPorPorcao * 100) / 100,
      precoSugerido: Math.round(precoSugerido * 100) / 100,
      cmvPercentual: cmv !== null ? Math.round(cmv * 10) / 10 : null,
      temIngredienteFaltando, temPrecoDefasado
    };
  }

  // ── GET /api/custos/ingredientes ──
  if (pathname === '/api/custos/ingredientes' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const lista = readJSON(INGREDIENTES_FILE, []);
    const cfg = readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig());
    const limiteMs = (cfg.diasParaDesatualizado || 21) * 86400000;
    const agora = Date.now();
    return sendJSON(res, 200, lista.map(i => ({ ...i, desatualizado: agora - new Date(i.atualizadoEm).getTime() > limiteMs })));
  }
  // ── POST /api/custos/ingredientes ──
  if (pathname === '/api/custos/ingredientes' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      if (!body.nome || !body.unidade || body.precoUnitario === undefined) return sendJSON(res, 400, { error: 'nome, unidade e precoUnitario são obrigatórios' });
      if (!CUSTOS_STATIONS.includes(body.unidade)) return sendJSON(res, 400, { error: 'Unidade inválida.' });
      const lista = readJSON(INGREDIENTES_FILE, []);
      const novo = {
        id: crypto.randomBytes(8).toString('hex'),
        nome: String(body.nome).trim().slice(0, 120),
        categoria: body.categoria ? String(body.categoria).trim().slice(0, 60) : 'Geral',
        unidade: body.unidade,
        precoUnitario: Number(body.precoUnitario) || 0,
        atualizadoEm: new Date().toISOString(),
        referenciaWeb: false,
        fornecedor: body.fornecedor ? String(body.fornecedor).trim().slice(0, 120) : '',
      };
      lista.push(novo);
      writeJSON(INGREDIENTES_FILE, lista);
      return sendJSON(res, 201, novo);
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  const custosIngMatch = pathname.match(/^\/api\/custos\/ingredientes\/([^/]+)$/);
  if (custosIngMatch && req.method === 'PUT') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const id = custosIngMatch[1];
      const body = await readBody(req);
      const lista = readJSON(INGREDIENTES_FILE, []);
      const idx = lista.findIndex(i => i.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Ingrediente não encontrado.' });
      const antigo = lista[idx];
      const precoMudou = body.precoUnitario !== undefined && Number(body.precoUnitario) !== antigo.precoUnitario;
      lista[idx] = {
        ...antigo, ...body,
        precoUnitario: body.precoUnitario !== undefined ? Number(body.precoUnitario) : antigo.precoUnitario,
        atualizadoEm: precoMudou ? new Date().toISOString() : antigo.atualizadoEm,
        referenciaWeb: precoMudou ? false : antigo.referenciaWeb,
      };
      writeJSON(INGREDIENTES_FILE, lista);
      return sendJSON(res, 200, lista[idx]);
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── DELETE /api/custos/ingredientes/:id ──
  if (custosIngMatch && req.method === 'DELETE') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const id = custosIngMatch[1];
    let lista = readJSON(INGREDIENTES_FILE, []);
    const antes = lista.length;
    lista = lista.filter(i => i.id !== id);
    writeJSON(INGREDIENTES_FILE, lista);
    return sendJSON(res, 200, { removido: antes !== lista.length });
  }

  // ── GET /api/custos/fichas ──
  if (pathname === '/api/custos/fichas' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const fichas = readJSON(FICHAS_TECNICAS_FILE, []);
    const ingredientes = readJSON(INGREDIENTES_FILE, []);
    const cfg = readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig());
    const porId = Object.fromEntries(ingredientes.map(i => [i.id, i]));
    return sendJSON(res, 200, fichas.map(f => calcularFichaTecnica(f, porId, cfg)));
  }
  // ── POST /api/custos/fichas ──
  if (pathname === '/api/custos/fichas' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      if (!body.nome) return sendJSON(res, 400, { error: 'nome é obrigatório' });
      const fichas = readJSON(FICHAS_TECNICAS_FILE, []);
      const nova = {
        id: crypto.randomBytes(8).toString('hex'),
        nome: String(body.nome).trim().slice(0, 120),
        categoria: body.categoria ? String(body.categoria).trim().slice(0, 60) : '',
        rendimento: Number(body.rendimento) || 1,
        margemDesejada: body.margemDesejada ?? null,
        precoVendaAtual: body.precoVendaAtual ?? null,
        itens: Array.isArray(body.itens) ? body.itens : [],
      };
      fichas.push(nova);
      writeJSON(FICHAS_TECNICAS_FILE, fichas);
      const ingredientes = readJSON(INGREDIENTES_FILE, []);
      const cfg = readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig());
      return sendJSON(res, 201, calcularFichaTecnica(nova, Object.fromEntries(ingredientes.map(i => [i.id, i])), cfg));
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── PUT /api/custos/fichas/:id ──
  const custosFichaMatch = pathname.match(/^\/api\/custos\/fichas\/([^/]+)$/);
  if (custosFichaMatch && req.method === 'PUT') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const id = custosFichaMatch[1];
      const body = await readBody(req);
      const fichas = readJSON(FICHAS_TECNICAS_FILE, []);
      const idx = fichas.findIndex(f => f.id === id);
      if (idx === -1) return sendJSON(res, 404, { error: 'Ficha não encontrada.' });
      fichas[idx] = { ...fichas[idx], ...body, id };
      writeJSON(FICHAS_TECNICAS_FILE, fichas);
      const ingredientes = readJSON(INGREDIENTES_FILE, []);
      const cfg = readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig());
      return sendJSON(res, 200, calcularFichaTecnica(fichas[idx], Object.fromEntries(ingredientes.map(i => [i.id, i])), cfg));
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── DELETE /api/custos/fichas/:id ──
  if (custosFichaMatch && req.method === 'DELETE') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    const id = custosFichaMatch[1];
    let fichas = readJSON(FICHAS_TECNICAS_FILE, []);
    const antes = fichas.length;
    fichas = fichas.filter(f => f.id !== id);
    writeJSON(FICHAS_TECNICAS_FILE, fichas);
    return sendJSON(res, 200, { removido: antes !== fichas.length });
  }

  // ── GET/PUT /api/custos/config ──
  if (pathname === '/api/custos/config' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    return sendJSON(res, 200, readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig()));
  }
  if (pathname === '/api/custos/config' && req.method === 'PUT') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const body = await readBody(req);
      const novo = { ...readJSON(CUSTOS_CONFIG_FILE, custosDefaultConfig()), ...body };
      writeJSON(CUSTOS_CONFIG_FILE, novo);
      return sendJSON(res, 200, novo);
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── POST /api/custos/importar-cardapio — cria 1 ficha em branco por prato do cardápio atual ──
  if (pathname === '/api/custos/importar-cardapio' && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const { cfg, menu } = readConfig();
      const fichas = readJSON(FICHAS_TECNICAS_FILE, []);
      const existentes = new Set(fichas.map(f => f.nome));
      let criadas = 0;
      for (const categoria of menu || []) {
        for (const item of categoria.items || []) {
          if (existentes.has(item.name)) continue;
          fichas.push({ id: crypto.randomBytes(8).toString('hex'), nome: item.name, categoria: categoria.title, rendimento: 1, margemDesejada: null, precoVendaAtual: item.price, itens: [] });
          existentes.add(item.name);
          criadas++;
        }
      }
      writeJSON(FICHAS_TECNICAS_FILE, fichas);
      return sendJSON(res, 200, { ok: true, criadas });
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
        notes: String(body.notes || '').slice(0, 200),
        storeReply: '' // v33: mensagem da loja pro cliente (aparece na tela de acompanhamento)
      };
      list.unshift(reservation);
      writeJSON(RESERVATIONS_FILE, list);
      broadcast('new-reservation', reservation); // v39: avisa o painel em tempo real (som + toast), igual já acontece com pedido novo
      return sendJSON(res, 201, { ok: true, reservation });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── GET /api/reservations — painel lista as reservas ──
  if (pathname === '/api/reservations' && req.method === 'GET') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    return sendJSON(res, 200, { reservations: readJSON(RESERVATIONS_FILE) });
  }
  // ── GET /api/track-reservation/:id — cliente acompanha status da própria reserva (público, v33) ──
  if (pathname.startsWith('/api/track-reservation/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.split('/').pop());
    const list = readJSON(RESERVATIONS_FILE);
    const r = list.find(x => x.id === id);
    if (!r) return sendJSON(res, 404, { error: 'Reserva não encontrada.' });
    const { phone, ...rest } = r; // não expõe o telefone de novo
    return sendJSON(res, 200, rest);
  }
  // ── POST /api/reservations/:id/status — painel confirma/recusa/cancela uma reserva ──
  if (pathname.match(/^\/api\/reservations\/[^/]+\/status$/) && req.method === 'POST') {
    if (!checkAuth(getToken(req, query))) return sendJSON(res, 401, { error: 'unauthorized' });
    try {
      const id = decodeURIComponent(pathname.split('/')[3]);
      const { status, reply } = await readBody(req);
      if (!['pendente', 'confirmada', 'recusada', 'cancelada'].includes(status)) return sendJSON(res, 400, { error: 'Status inválido.' });
      const list = readJSON(RESERVATIONS_FILE);
      const r = list.find(x => x.id === id);
      if (!r) return sendJSON(res, 404, { error: 'Reserva não encontrada.' });
      r.status = status;
      if (reply !== undefined) r.storeReply = String(reply).slice(0, 300); // v33: resposta da loja pro cliente
      writeJSON(RESERVATIONS_FILE, list);
      publicBroadcast('reservation-updated', { id }); // v33: avisa a tela do cliente em tempo real
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
          // v49 — BUG CORRIGIDO ("impressora não imprime"): essa lista só aceitava 3 vias
          // (cozinha/sushibar/bar) — um item marcado pra "delivery", "expedição" ou uma via
          // customizada tinha a marcação APAGADA bem aqui, no exato instante em que o pedido
          // era criado, e caía sempre em "cozinha" sem aviso nenhum. Agora usa as vias reais
          // configuradas no sistema (cfg.stations), então qualquer via nova funciona de verdade.
          const validStations = Object.keys(cfg.stations || {});
          const fallbackStation = cfg.defaultStation && validStations.includes(cfg.defaultStation) ? cfg.defaultStation : 'cozinha';
          let stations = Array.isArray(i.stations) ? i.stations.filter(s => validStations.includes(s)) : [];
          if (!stations.length) stations = [validStations.includes(i.station) ? i.station : fallbackStation];
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
        customerLng: null,
        // v34: localização ao vivo do motoboy durante a entrega (rastreamento pro cliente).
        // Só é preenchida enquanto status === 'saiu' — ver /api/courier/location e /api/track.
        courierLat: null,
        courierLng: null,
        courierLocationAt: null
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
      // v34: guarda quando o pedido foi de fato entregue — sem isso não dá pra calcular o
      // tempo médio real (o dashboard só mostrava o texto configurado, não um cálculo de verdade).
      if (status === 'entregue' && !order.deliveredAt) {
        order.deliveredAt = new Date().toISOString();
      }
      // v34: entrega encerrada (entregue ou cancelada) — apaga a última posição do motoboy.
      // Não é só esconder na resposta: some do registro mesmo, pra não ficar guardado sem necessidade.
      if (['entregue', 'cancelado'].includes(status)) {
        order.courierLat = null;
        order.courierLng = null;
        order.courierLocationAt = null;
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

  // ── DELETE /api/admin/orders/:id — remove um pedido DEFINITIVAMENTE do sistema (v32/v33) ──
  // Diferente do cancelamento (que só muda o status e mantém o pedido no histórico), isso apaga
  // o registro por completo. v33: restrito só ao usuário MASTER, e exige especificamente a
  // SENHA MASTER de novo (não aceita senha de admin comum nem de usuário qualquer), mesmo com a
  // sessão já logada. Guarda tudo num histórico separado (data/delete-log.json).
  if (pathname.match(/^\/api\/admin\/orders\/[^/]+$/) && req.method === 'DELETE') {
    const session = getSession(getToken(req, query));
    if (!session || (ROLE_RANK[session.role] || 0) < ROLE_RANK.master) {
      return sendJSON(res, 403, { error: 'Somente o usuário MASTER pode excluir pedidos do sistema.' });
    }
    try {
      const id = decodeURIComponent(pathname.split('/').pop());
      const { password } = await readBody(req);
      const { cfg } = readConfig();

      // v33: confere especificamente a SENHA MASTER de novo (reautenticação), não aceita mais
      // senha de admin comum nem de outros usuários.
      const passOk = !!password && password === cfg.masterPass;
      if (!passOk) {
        return sendJSON(res, 403, { error: '❌ Senha inválida. Pedido não foi removido.' });
      }

      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'Pedido não encontrado.' });

      const remaining = orders.filter(o => o.id !== id);
      writeJSON(ORDERS_FILE, remaining);

      const log = readJSON(DELETE_LOG_FILE);
      log.unshift({
        orderId: id,
        orderSummary: { name: order.name, total: order.total, status: order.status, createdAt: order.createdAt },
        deletedAt: new Date().toISOString(),
        deletedBy: session.username,
        deletedByRole: session.role
      });
      writeJSON(DELETE_LOG_FILE, log.slice(0, 500)); // mantém só as 500 exclusões mais recentes

      broadcast('order-deleted', { id });
      return sendJSON(res, 200, { ok: true, message: '✅ Pedido removido do sistema com sucesso.' });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/admin/delete-log — histórico de exclusões de pedidos (só master) ──
  if (pathname === '/api/admin/delete-log' && req.method === 'GET') {
    if (!requireRole(getToken(req, query), 'master')) return sendJSON(res, 403, { error: 'Só o usuário master pode ver o histórico de exclusões.' });
    return sendJSON(res, 200, { log: readJSON(DELETE_LOG_FILE) });
  }

  // ═══════════════════════════════════════════════════════════
  // RESET DE DADOS (v34) — Configurações → ⚠️ Zona de Perigo.
  // Só master, sempre com reautenticação por senha master, sempre registrado no histórico
  // de auditoria (o mesmo delete-log.json usado pra exclusão de pedidos).
  // ═══════════════════════════════════════════════════════════
  // ── POST /api/admin/reset-menu — restaura o cardápio pro padrão de fábrica ──
  if (pathname === '/api/admin/reset-menu' && req.method === 'POST') {
    const session = getSession(getToken(req, query));
    if (!session || (ROLE_RANK[session.role] || 0) < ROLE_RANK.master) {
      return sendJSON(res, 403, { error: 'Somente o usuário MASTER pode restaurar o cardápio.' });
    }
    try {
      const { password } = await readBody(req);
      const { cfg } = readConfig();
      if (!password || password !== cfg.masterPass) return sendJSON(res, 403, { error: '❌ Senha inválida. Cardápio não foi restaurado.' });
      const data = readConfig();
      data.menu = JSON.parse(JSON.stringify(DEFAULT_MENU)); // cópia limpa, sem referenciar o objeto original
      writeJSON(CONFIG_FILE, data);
      const log = readJSON(DELETE_LOG_FILE);
      log.unshift({ action: 'reset-menu', deletedAt: new Date().toISOString(), deletedBy: session.username, deletedByRole: session.role });
      writeJSON(DELETE_LOG_FILE, log.slice(0, 500));
      publicBroadcast('menu-updated', {});
      return sendJSON(res, 200, { ok: true, message: '✅ Cardápio restaurado para o padrão de fábrica.' });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── POST /api/admin/reset-orders — apaga TODO o histórico de pedidos ──
  if (pathname === '/api/admin/reset-orders' && req.method === 'POST') {
    const session = getSession(getToken(req, query));
    if (!session || (ROLE_RANK[session.role] || 0) < ROLE_RANK.master) {
      return sendJSON(res, 403, { error: 'Somente o usuário MASTER pode apagar o histórico de pedidos.' });
    }
    try {
      const { password } = await readBody(req);
      const { cfg } = readConfig();
      if (!password || password !== cfg.masterPass) return sendJSON(res, 403, { error: '❌ Senha inválida. Histórico não foi apagado.' });
      const countBefore = readJSON(ORDERS_FILE).length;
      writeJSON(ORDERS_FILE, []);
      const log = readJSON(DELETE_LOG_FILE);
      log.unshift({ action: 'reset-orders', ordersRemoved: countBefore, deletedAt: new Date().toISOString(), deletedBy: session.username, deletedByRole: session.role });
      writeJSON(DELETE_LOG_FILE, log.slice(0, 500));
      broadcast('order-updated', {});
      return sendJSON(res, 200, { ok: true, message: `✅ Histórico apagado (${countBefore} pedido(s) removido(s)).` });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }
  // ── POST /api/admin/reset-reservations — apaga TODO o histórico de reservas de mesa (v35) ──
  if (pathname === '/api/admin/reset-reservations' && req.method === 'POST') {
    const session = getSession(getToken(req, query));
    if (!session || (ROLE_RANK[session.role] || 0) < ROLE_RANK.master) {
      return sendJSON(res, 403, { error: 'Somente o usuário MASTER pode apagar o histórico de reservas.' });
    }
    try {
      const { password } = await readBody(req);
      const { cfg } = readConfig();
      if (!password || password !== cfg.masterPass) return sendJSON(res, 403, { error: '❌ Senha inválida. Histórico não foi apagado.' });
      const countBefore = readJSON(RESERVATIONS_FILE).length;
      writeJSON(RESERVATIONS_FILE, []);
      const log = readJSON(DELETE_LOG_FILE);
      log.unshift({ action: 'reset-reservations', reservationsRemoved: countBefore, deletedAt: new Date().toISOString(), deletedBy: session.username, deletedByRole: session.role });
      writeJSON(DELETE_LOG_FILE, log.slice(0, 500));
      return sendJSON(res, 200, { ok: true, message: `✅ Histórico de reservas apagado (${countBefore} reserva(s) removida(s)).` });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }


  if (pathname.startsWith('/api/track/') && req.method === 'GET') {
    const id = pathname.split('/').pop();
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
    const { name, phone, address, ...rest } = order;
    // v34: a localização do motoboy só é exposta pro cliente enquanto o pedido está
    // "saiu para entrega" — antes disso (ainda não saiu) ou depois (já entregue/cancelado),
    // não faz sentido mostrar e o motoboy não deve continuar rastreável.
    if (order.status !== 'saiu') { rest.courierLat = null; rest.courierLng = null; rest.courierLocationAt = null; }
    return sendJSON(res, 200, rest); // não expõe dados pessoais de novo, só status/itens/valores
  }

  // ── POST /api/courier/location/:id — o motoboy manda a posição do GPS enquanto entrega (v34) ──
  // Sem login: o próprio id do pedido funciona como o "convite" (igual o /api/track já faz).
  // Só aceita e só grava enquanto o pedido está "saiu" — fora dessa janela, recusa.
  if (pathname.startsWith('/api/courier/location/') && req.method === 'POST') {
    const id = decodeURIComponent(pathname.split('/').pop());
    try {
      const { lat, lng } = await readBody(req);
      const latNum = Number(lat), lngNum = Number(lng);
      if (!isFinite(latNum) || !isFinite(lngNum)) return sendJSON(res, 400, { error: 'coordenadas inválidas' });
      const orders = readJSON(ORDERS_FILE);
      const order = orders.find(o => o.id === id);
      if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
      if (order.status !== 'saiu') {
        // Entrega já terminou (ou ainda nem saiu) — avisa o app do motoboy pra ele parar de mandar.
        return sendJSON(res, 200, { ok: false, ended: true, status: order.status });
      }
      order.courierLat = latNum;
      order.courierLng = lngNum;
      order.courierLocationAt = new Date().toISOString();
      writeJSON(ORDERS_FILE, orders);
      broadcast('order-updated', order);
      return sendJSON(res, 200, { ok: true });
    } catch (e) { return sendJSON(res, 400, { error: 'invalid body' }); }
  }

  // ── GET /api/courier/order/:id — o app do motoboy usa isso pra saber o endereço da entrega (v34) ──
  // Só devolve os dados enquanto o pedido está em andamento (preparando ou saiu); depois de
  // entregue/cancelado, devolve só um aviso — o motoboy não continua vendo endereço de entregas antigas.
  if (pathname.startsWith('/api/courier/order/') && req.method === 'GET') {
    const id = decodeURIComponent(pathname.split('/').pop());
    const orders = readJSON(ORDERS_FILE);
    const order = orders.find(o => o.id === id);
    if (!order) return sendJSON(res, 404, { error: 'pedido não encontrado' });
    if (!['preparando', 'saiu'].includes(order.status)) {
      return sendJSON(res, 200, { ended: true, status: order.status });
    }
    return sendJSON(res, 200, {
      ended: false,
      id: order.id,
      ticketNumber: order.ticketNumber,
      status: order.status,
      mode: order.mode,
      name: order.name,
      phone: order.phone,
      address: order.address,
      obs: order.obs || ''
    });
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
    // v45: antes essa confirmação só ficava salva no pedido, sem avisar ninguém — a equipe só
    // ficava sabendo se abrisse o pedido manualmente. Agora avisa o painel na hora (toast).
    broadcast('order-updated', order);
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
