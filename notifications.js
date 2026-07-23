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
//
// Assinaturas de push e campanhas pré-programadas são lidas/gravadas
// exclusivamente via database.js (PostgreSQL) — nada aqui usa mais
// push-subs.json ou campaigns.json.
// ═══════════════════════════════════════════════════════════
const db = require('./database');

let webpush = null;
try { webpush = require('web-push'); } catch (e) { /* não instalado — push fica indisponível, sem quebrar o resto */ }

// ─── Campanhas pré-programadas ───
async function readCampaigns() { return db.getCampaigns(); }
async function writeCampaigns(data) { return db.saveCampaigns(data); }

// ─── Assinaturas de Web Push (uma por dispositivo/navegador do cliente) ───
async function saveSubscription(phone, subscription) { return db.addPushSubscription(phone, subscription); }
async function removeSubscription(endpoint) { return db.removePushSubscription(endpoint); }
async function subsByPhone(phone) { return db.pushSubscriptionsByPhone(phone); }

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
    if (err.statusCode === 410 || err.statusCode === 404) await removeSubscription(subscriptionEntry.endpoint);
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
  const inscricoes = await subsByPhone(phone);
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
  const data = await readCampaigns();
  const ativas = data.mensagens.filter((m) => m.active);
  if (!ativas.length) return { disparado: false, motivo: 'nenhuma mensagem ativa' };

  const msg = ativas[data.ponteiroRodizio % ativas.length];
  data.ponteiroRodizio = (data.ponteiroRodizio + 1) % ativas.length;
  await writeCampaigns(data);

  const telefones = await db.allPushPhones();
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
