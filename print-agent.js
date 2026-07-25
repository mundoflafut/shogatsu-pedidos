// ═══════════════════════════════════════════════════════════
// SHOGATSU · Agente Local de Impressão Automática
// ═══════════════════════════════════════════════════════════
// Roda num computador DENTRO da loja, ligado (por rede ou USB) na impressora térmica.
// Fica escutando o servidor em tempo real e imprime sozinho assim que um pedido novo chega —
// sem abrir navegador, sem diálogo de impressão, sem PDF. Se a impressora falhar, registra
// o erro no arquivo de log e continua rodando (nunca trava o restante do sistema).
//
// Por quê isso roda separado do site? O site fica hospedado num servidor na nuvem (Render),
// que não tem nenhuma impressora física ligada nele — fisicamente impossível imprimir "no
// servidor" de verdade. Esse agente é a forma real de ter impressão 100% automática: ele é
// só mais um "cliente" do sistema (como o navegador do painel), só que ao invés de mostrar
// pedido na tela, manda direto pra impressora.
//
// Como usar:
//   1. npm install          (só nesta pasta print-agent/)
//   2. copie config.example.json pra config.json e preencha com seus dados
//   3. node print-agent.js
//   4. (opcional, recomendado) configure pra iniciar sozinho com o Windows/Linux — veja o README.md
// ═══════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

// Quando este arquivo roda dentro do .exe empacotado (pkg), __dirname aponta pra dentro do
// "snapshot" virtual do executável — não dá pra ler/escrever ali de verdade. Nesse caso, usamos
// a pasta onde o .exe está de verdade (process.execPath) pra encontrar o config.json e gravar o log.
const isPackaged = typeof process.pkg !== 'undefined';
const BASE_DIR = isPackaged ? path.dirname(process.execPath) : __dirname;

const CONFIG_PATH = path.join(BASE_DIR, 'config.json');
const LOG_PATH = path.join(BASE_DIR, 'print-agent.log');
const TEST_MODE = process.env.TEST_MODE === '1'; // não manda pra impressora de verdade, só mostra no log/console

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ Não encontrei config.json na mesma pasta do programa. Copie config.example.json pra config.json (na mesma pasta do .exe) e preencha os dados antes de rodar.');
  if (isPackaged) {
    console.error('Pressione ENTER pra fechar...');
    try { fs.readSync(0, Buffer.alloc(1), 0, 1); } catch (e) {}
  }
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  try { fs.appendFileSync(LOG_PATH, msg + '\n'); } catch (e) { /* nunca deixa o log derrubar o agente */ }
}

// ─── Impressora ───
function buildPrinter() {
  if (TEST_MODE) return null; // modo teste não precisa de impressora de verdade
  return new ThermalPrinter({
    type: cfg.printerType === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: cfg.printerInterface,          // ex: "tcp://192.168.1.50:9100" ou "printer:USB001" ou "/dev/usb/lp0"
    width: cfg.printerWidth || 42,
    removeSpecialCharacters: false,
    options: { timeout: 5000 }
  });
}

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');

function buildReceiptLines(order, storeName) {
  // Monta o texto do ticket de forma independente da biblioteca, pra poder logar em TEST_MODE
  // exatamente o que seria impresso, sem precisar de impressora real pra conferir o conteúdo.
  const lines = [];
  lines.push(`== ${storeName || 'PEDIDO'} ==`);
  lines.push(`Pedido: ${order.ticketNumber ? '#' + order.ticketNumber : order.id}`);
  lines.push(`Hora: ${new Date(order.createdAt).toLocaleString('pt-BR')}`);
  lines.push(`Cliente: ${order.name || '-'}`);
  if (order.phone) lines.push(`Telefone: ${order.phone}`);
  lines.push(`Modo: ${order.mode === 'delivery' ? 'Entrega' : 'Retirada'}`);
  if (order.mode === 'delivery' && order.address) lines.push(`Endereço: ${order.address}`);
  if (order.scheduledFor) lines.push(`Agendado para: ${new Date(order.scheduledFor).toLocaleString('pt-BR')}`);
  lines.push('---');
  (order.items || []).forEach(it => lines.push(`${it.qty}x ${it.name}`));
  lines.push('---');
  if (order.obs) lines.push(`Obs: ${order.obs}`);
  lines.push(`Pagamento: ${(order.payMethod || '-').toUpperCase()}${order.paid ? ' (PAGO)' : ''}`);
  lines.push(`TOTAL: ${money(order.total)}`);
  return lines;
}

async function printOrder(order) {
  const lines = buildReceiptLines(order, cfg.storeName);

  if (TEST_MODE) {
    log(`🧪 [TEST_MODE] Imprimiria agora o pedido ${order.id}:\n   ` + lines.join('\n   '));
    return true;
  }

  const printer = buildPrinter();
  try {
    const connected = await printer.isPrinterConnected();
    if (!connected) throw new Error('Impressora não respondeu (verifique se está ligada e na mesma rede/USB).');

    printer.alignCenter();
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.println(cfg.storeName || 'PEDIDO');
    printer.bold(false);
    printer.setTextNormal();
    printer.println(order.ticketNumber ? `Pedido #${order.ticketNumber}` : order.id);
    printer.drawLine();

    printer.alignLeft();
    printer.println(`Hora: ${new Date(order.createdAt).toLocaleString('pt-BR')}`);
    printer.println(`Cliente: ${order.name || '-'}`);
    if (order.phone) printer.println(`Telefone: ${order.phone}`);
    printer.println(`Modo: ${order.mode === 'delivery' ? 'ENTREGA' : 'RETIRADA'}`);
    if (order.mode === 'delivery' && order.address) printer.println(`Endereço: ${order.address}`);
    if (order.scheduledFor) printer.println(`Agendado: ${new Date(order.scheduledFor).toLocaleString('pt-BR')}`);
    printer.drawLine();

    (order.items || []).forEach(it => {
      printer.bold(true);
      printer.println(`${it.qty}x ${it.name}`);
      printer.bold(false);
    });
    printer.drawLine();

    if (order.obs) { printer.println(`Obs: ${order.obs}`); printer.drawLine(); }

    printer.println(`Pagamento: ${(order.payMethod || '-').toUpperCase()}${order.paid ? ' (PAGO)' : ''}`);
    printer.setTextDoubleHeight();
    printer.bold(true);
    printer.leftRight('TOTAL', money(order.total));
    printer.bold(false);
    printer.setTextNormal();

    printer.newLine();
    printer.cut();

    await printer.execute();
    log(`✅ Pedido ${order.id} impresso com sucesso.`);
    return true;
  } catch (err) {
    log(`❌ Falha ao imprimir pedido ${order.id}: ${err.message}`);
    return false;
  }
}

// ─── Conexão com o servidor (login + escuta de eventos em tempo real) ───
let token = null;
let retryDelay = 2000; // cresce com backoff até um teto, evita martelar o servidor se ele cair

function request(method, urlStr, body) {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const lib = u.protocol === 'https:' ? https : http;
    const payload = body ? JSON.stringify(body) : null;
    const req = lib.request(u, {
      method,
      headers: { 'Content-Type': 'application/json', ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}) },
      timeout: 10000
    }, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: data ? JSON.parse(data) : null }); }
        catch (e) { resolve({ status: res.statusCode, data: null }); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (payload) req.write(payload);
    req.end();
  });
}

async function login() {
  const r = await request('POST', `${cfg.serverUrl}/api/login`, { username: cfg.username, password: cfg.password });
  if (r.status !== 200 || !r.data || !r.data.token) throw new Error('Login falhou — confira usuário/senha no config.json.');
  token = r.data.token;
  log(`🔑 Login OK (${cfg.username}).`);
}

function connectStream() {
  const u = new URL(`${cfg.serverUrl}/api/stream?token=${encodeURIComponent(token)}`);
  const lib = u.protocol === 'https:' ? https : http;
  log('📡 Conectando ao servidor em tempo real...');

  const req = lib.get(u, (res) => {
    if (res.statusCode !== 200) {
      log(`⚠️  Conexão recusada (status ${res.statusCode}). Tentando de novo em ${retryDelay / 1000}s...`);
      scheduleReconnect();
      return;
    }
    retryDelay = 2000; // conexão ok, reseta o backoff
    log('✅ Conectado — aguardando pedidos novos.');

    let buffer = '';
    res.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const parts = buffer.split('\n\n');
      buffer = parts.pop(); // sobra incompleta fica pro próximo pedaço
      for (const part of parts) {
        const eventLine = part.split('\n').find(l => l.startsWith('event:'));
        const dataLine = part.split('\n').find(l => l.startsWith('data:'));
        if (!eventLine || !dataLine) continue;
        const eventName = eventLine.slice(6).trim();
        if (eventName !== 'new-order') continue;
        try {
          const order = JSON.parse(dataLine.slice(5).trim());
          log(`🆕 Pedido novo recebido: ${order.id} (${order.name})`);
          printOrder(order);
        } catch (e) { log(`⚠️  Não consegui interpretar o pedido recebido: ${e.message}`); }
      }
    });
    res.on('end', () => { log('🔌 Conexão encerrada pelo servidor. Reconectando...'); scheduleReconnect(); });
    res.on('error', (e) => { log(`⚠️  Erro na conexão: ${e.message}. Reconectando...`); scheduleReconnect(); });
  });
  req.on('error', (e) => { log(`⚠️  Não consegui conectar: ${e.message}. Tentando de novo em ${retryDelay / 1000}s...`); scheduleReconnect(); });
}

function scheduleReconnect() {
  setTimeout(async () => {
    try { await login(); connectStream(); }
    catch (e) { log(`⚠️  ${e.message}`); scheduleReconnect(); }
  }, retryDelay);
  retryDelay = Math.min(retryDelay * 1.5, 60000); // backoff até no máx. 1 minuto entre tentativas
}

async function start() {
  log(`🍣 Agente de impressão iniciando${TEST_MODE ? ' (TEST_MODE — não vai imprimir de verdade)' : ''}...`);
  try {
    await login();
    connectStream();
  } catch (e) {
    log(`❌ ${e.message}`);
    scheduleReconnect();
  }
}

// Se rodando como .exe (duplo-clique), um erro não tratado normalmente fecharia a janela
// instantaneamente, sem dar tempo de ler o motivo. Aqui a gente registra o erro, avisa na tela,
// e mantém a janela aberta esperando o usuário apertar ENTER antes de fechar de verdade.
process.on('uncaughtException', (err) => {
  log(`❌ Erro inesperado: ${err.message}`);
  if (isPackaged) {
    console.error('\nO programa encontrou um erro e vai fechar. Detalhes acima e em print-agent.log.');
    console.error('Pressione ENTER pra fechar esta janela...');
    try { fs.readSync(0, Buffer.alloc(1), 0, 1); } catch (e) {}
  }
  process.exit(1);
});

start();
