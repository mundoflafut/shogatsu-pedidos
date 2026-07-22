// ═══════════════════════════════════════════════════════════
// notifications.js — Disparo de mensagens unificado ao sistema Shogatsu
//
// Canal gratuito: Web Push (PWA já instalado no celular/PC do cliente —
// usa a biblioteca 'web-push', com chaves VAPID geradas uma única vez).
// Canal pago (fallback): SMS via Twilio, reaproveitando a MESMA conta
// que já existe em Configurações → SMS (cfg.sms).
//
// Se o pacote 'web-push' não estiver instalado, o sistema não quebra:
// o push simplesmente fica indisponível e cai direto pro SMS (se
// configurado) ou é ignorado silenciosamente.
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push-subs.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* não instalado — push fica indisponível, sem quebrar o resto */ }

function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file, data) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

// ─── Bootstrap dos arquivos desta feature ───
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUBS_FILE)) writeJSON(SUBS_FILE, []);

// 20 mensagens pré-programadas para o Shogatsu (restaurante japonês).
// `active` é a pré-configuração: só mensagens ativas entram no rodízio
// do disparo automático. Editável pelo painel via /api/admin/campaigns.
const DEFAULT_CAMPANHAS = {
  horarios: ['11:00', '15:30', '19:00'], // pré-configuração: vezes por dia que dispara sozinho
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

function readCampaigns() {
  const saved = readJSON(CAMPAIGNS_FILE, null);
  if (!saved) { writeJSON(CAMPAIGNS_FILE, DEFAULT_CAMPANHAS); return { ...DEFAULT_CAMPANHAS }; }
  // preenche com defaults quaisquer campos novos, sem apagar o que já foi configurado
  return { ...DEFAULT_CAMPANHAS, ...saved, mensagens: saved.mensagens || DEFAULT_CAMPANHAS.mensagens };
}
function writeCampaigns(data) { writeJSON(CAMPAIGNS_FILE, data); }

// ─── Assinaturas de Web Push (uma por dispositivo/navegador do cliente) ───
function readSubs() { return readJSON(SUBS_FILE, []); }
function writeSubs(arr) { writeJSON(SUBS_FILE, arr); }

function saveSubscription(phone, subscription) {
  const subs = readSubs();
  const normPhone = String(phone || '').replace(/\D/g, '');
  const filtered = subs.filter((s) => s.endpoint !== subscription.endpoint);
  filtered.push({ phone: normPhone, endpoint: subscription.endpoint, subscription, createdAt: new Date().toISOString() });
  writeSubs(filtered);
}

function removeSubscription(endpoint) {
  writeSubs(readSubs().filter((s) => s.endpoint !== endpoint));
}

function subsByPhone(phone) {
  const normPhone = String(phone || '').replace(/\D/g, '');
  return readSubs().filter((s) => s.phone === normPhone);
}

// ─── VAPID (identidade do servidor pra Web Push) ───
// Gere uma vez com: node -e "console.log(require('web-push').generateVAPIDKeys())"
// e cole as chaves em Configurações → Notificações (cfg.vapid), ou nas
// variáveis de ambiente VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
function configurarVapid(cfg) {
  if (!webpush) return false;
  const pub = (cfg.vapid && cfg.vapid.publicKey) || process.env.VAPID_PUBLIC_KEY;
  const priv = (cfg.vapid && cfg.vapid.privateKey) || process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  webpush.setVapidDetails('mailto:contato@shogatsu.com.br', pub, priv);
  return true;
}

// ─── Envio via push (gratuito) ───
async function enviarPush(subscriptionEntry, payload) {
  if (!webpush) throw new Error('web-push não instalado');
  try {
    await webpush.sendNotification(subscriptionEntry.subscription, JSON.stringify(payload));
    return true;
  } catch (err) {
    // 410/404 = inscrição expirada/inválida - remove pra não tentar de novo
    if (err.statusCode === 410 || err.statusCode === 404) removeSubscription(subscriptionEntry.endpoint);
    throw err;
  }
}

/**
 * Dispara uma mensagem para um cliente (por telefone), tentando primeiro
 * TODOS os dispositivos com push cadastrados (gratuito) e só usando SMS
 * (pago) como fallback se nenhum push for entregue e `permitirSmsFallback`
 * for true.
 *
 * @param {string} phone
 * @param {{title: string, body: string}} payload
 * @param {object} opts - { permitirSmsFallback, smsCfg, sendSMSFn }
 */
async function dispatchToCustomer(phone, payload, opts = {}) {
  const { permitirSmsFallback = false, smsCfg, sendSMSFn } = opts;
  const inscricoes = subsByPhone(phone);
  let algumPushEntregue = false;

  for (const sub of inscricoes) {
    try {
      await enviarPush(sub, payload);
      algumPushEntregue = true;
    } catch (e) { /* tenta o próximo dispositivo */ }
  }

  if (algumPushEntregue) return { canal: 'push', custo: 0 };

  if (permitirSmsFallback && sendSMSFn && smsCfg) {
    try {
      await sendSMSFn(phone, payload.body, smsCfg);
      return { canal: 'sms', custo: null }; // custo real depende do plano Twilio do restaurante
    } catch (e) {
      return { canal: null, erro: e.message };
    }
  }

  return { canal: null, erro: 'sem push cadastrado e sem fallback pago habilitado' };
}

/**
 * Dispara a próxima mensagem ativa (em rodízio) pra TODOS os clientes com
 * push cadastrado. Usado pelo agendador automático (algumas vezes por dia).
 * Campanhas promocionais NÃO usam fallback pago por padrão (evita custo
 * inesperado de SMS em massa) - só entregam a quem já tem push ativo.
 */
async function dispararProximaCampanha() {
  const data = readCampaigns();
  const ativas = data.mensagens.filter((m) => m.active);
  if (!ativas.length) return { disparado: false, motivo: 'nenhuma mensagem ativa' };

  const msg = ativas[data.ponteiroRodizio % ativas.length];
  data.ponteiroRodizio = (data.ponteiroRodizio + 1) % ativas.length;
  writeCampaigns(data);

  const telefones = [...new Set(readSubs().map((s) => s.phone))];
  let entregues = 0;
  for (const phone of telefones) {
    const r = await dispatchToCustomer(phone, { title: '🍣 Shogatsu', body: msg.texto }, { permitirSmsFallback: false });
    if (r.canal) entregues++;
  }

  return { disparado: true, mensagem: msg.titulo, destinatarios: telefones.length, entregues };
}

function gerarChavesVapid() {
  if (!webpush) throw new Error('Pacote "web-push" não instalado no servidor. Rode: npm install web-push');
  return webpush.generateVAPIDKeys();
}

module.exports = {
  configurarVapid,
  gerarChavesVapid,
  saveSubscription,
  removeSubscription,
  subsByPhone,
  dispatchToCustomer,
  dispararProximaCampanha,
  readCampaigns,
  writeCampaigns,
  webpushDisponivel: () => !!webpush,
};
