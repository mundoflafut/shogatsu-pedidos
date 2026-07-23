import fs from 'fs';
import path from 'path';
import webpush from 'web-push';

const DATA_DIR = path.join(process.cwd(), 'data');
const SUBS_FILE = path.join(DATA_DIR, 'push-subs.json');
const CAMPAIGNS_FILE = path.join(DATA_DIR, 'campaigns.json');

function readJSON(file: string, fallback: any) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch (e) { return fallback; }
}
function writeJSON(file: string, data: any) { fs.writeFileSync(file, JSON.stringify(data, null, 2)); }

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(SUBS_FILE)) writeJSON(SUBS_FILE, []);

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

export function readCampaigns() {
  const saved = readJSON(CAMPAIGNS_FILE, null);
  if (!saved) { writeJSON(CAMPAIGNS_FILE, DEFAULT_CAMPANHAS); return { ...DEFAULT_CAMPANHAS }; }
  return { ...DEFAULT_CAMPANHAS, ...saved, mensagens: saved.mensagens || DEFAULT_CAMPANHAS.mensagens };
}
export function writeCampaigns(data: any) { writeJSON(CAMPAIGNS_FILE, data); }

export function readSubs() { return readJSON(SUBS_FILE, []); }
export function writeSubs(arr: any[]) { writeJSON(SUBS_FILE, arr); }

export function saveSubscription(phone: string, subscription: any) {
  const subs = readSubs();
  const normPhone = String(phone || '').replace(/\D/g, '');
  const filtered = subs.filter((s: any) => s.endpoint !== subscription.endpoint);
  filtered.push({ phone: normPhone, endpoint: subscription.endpoint, subscription, createdAt: new Date().toISOString() });
  writeSubs(filtered);
}

export function removeSubscription(endpoint: string) {
  writeSubs(readSubs().filter((s: any) => s.endpoint !== endpoint));
}

export function subsByPhone(phone: string) {
  const normPhone = String(phone || '').replace(/\D/g, '');
  return readSubs().filter((s: any) => s.phone === normPhone);
}

export function configurarVapid(cfg: any) {
  if (!webpush) return false;
  const pub = (cfg.vapid && cfg.vapid.publicKey) || process.env.VAPID_PUBLIC_KEY;
  const priv = (cfg.vapid && cfg.vapid.privateKey) || process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  try {
    webpush.setVapidDetails('mailto:contato@shogatsu.com.br', pub, priv);
    return true;
  } catch (e) {
    return false;
  }
}

export async function enviarPush(subscriptionEntry: any, payload: any) {
  if (!webpush) throw new Error('web-push não instalado');
  try {
    await webpush.sendNotification(subscriptionEntry.subscription, JSON.stringify(payload));
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) removeSubscription(subscriptionEntry.endpoint);
    throw err;
  }
}

export async function dispatchToCustomer(phone: string, payload: any, opts: any = {}) {
  const { permitirSmsFallback = false, smsCfg, sendSMSFn } = opts;
  const inscricoes = subsByPhone(phone);
  let algumPushEntregue = false;

  for (const sub of inscricoes) {
    try {
      await enviarPush(sub, payload);
      algumPushEntregue = true;
    } catch (e) { /* tenta o próximo */ }
  }

  if (algumPushEntregue) return { canal: 'push', custo: 0 };

  if (permitirSmsFallback && sendSMSFn && smsCfg) {
    try {
      await sendSMSFn(phone, payload.body, smsCfg);
      return { canal: 'sms', custo: null };
    } catch (e: any) {
      return { canal: null, erro: e.message };
    }
  }

  return { canal: null, erro: 'sem push cadastrado' };
}

export async function dispararProximaCampanha() {
  const data = readCampaigns();
  const ativas = data.mensagens.filter((m: any) => m.active);
  if (!ativas.length) return { disparado: false, motivo: 'nenhuma mensagem ativa' };

  const msg = ativas[data.ponteiroRodizio % ativas.length];
  data.ponteiroRodizio = (data.ponteiroRodizio + 1) % ativas.length;
  writeCampaigns(data);

  const telefones = Array.from(new Set(readSubs().map((s: any) => String(s.phone)))) as string[];
  let entregues = 0;
  for (const phone of telefones) {
    const r = await dispatchToCustomer(phone, { title: '🍣 Shogatsu', body: msg.texto }, { permitirSmsFallback: false });
    if (r.canal) entregues++;
  }

  return { disparado: true, mensagem: msg.titulo, destinatarios: telefones.length, entregues };
}

export function gerarChavesVapid() {
  if (!webpush) throw new Error('Pacote "web-push" não instalado');
  return webpush.generateVAPIDKeys();
}

export function webpushDisponivel() {
  return !!webpush;
}

export default {
  configurarVapid,
  gerarChavesVapid,
  saveSubscription,
  removeSubscription,
  subsByPhone,
  dispatchToCustomer,
  dispararProximaCampanha,
  readCampaigns,
  writeCampaigns,
  webpushDisponivel
};
