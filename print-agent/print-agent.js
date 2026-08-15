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
const os = require('os');
const http = require('http');
const https = require('https');
const crypto = require('crypto');
const { execFileSync } = require('child_process');
const { ThermalPrinter, PrinterTypes } = require('node-thermal-printer');

const CONFIG_PATH = path.join(__dirname, 'config.json');
const LOG_PATH = path.join(__dirname, 'print-agent.log');
const WINPRINT_HELPER_PATH = path.join(__dirname, 'winprint-helper.ps1');
const TEST_MODE = process.env.TEST_MODE === '1'; // não manda pra impressora de verdade, só mostra no log/console

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ Não encontrei config.json. Copie config.example.json pra config.json e preencha os dados antes de rodar.');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function log(line) {
  const stamp = new Date().toISOString();
  const msg = `[${stamp}] ${line}`;
  console.log(msg);
  try { fs.appendFileSync(LOG_PATH, msg + '\n'); } catch (e) { /* nunca deixa o log derrubar o agente */ }
}

// ─── Impressoras (v55: agora suporta MAIS DE UMA impressora no mesmo agente/computador —
// ex: uma na USB do balcão + uma de rede na cozinha + outra de rede no sushibar. Cada
// impressora cuida das vias (estações) que você atribuir a ela; o agente descobre sozinho
// pra qual impressora mandar cada via na hora de imprimir. Isso substitui a necessidade de
// rodar um agente por computador quando a loja tem mais de uma impressora — agora dá pra
// centralizar as três (USB + rede 1 + rede 2) num único agente, num único computador, desde
// que ele enxergue a rede das impressoras de rede e tenha a USB ligada nele.
//
// Formato novo do config.json:
//   "printers": [
//     { "label": "Caixa (USB)",      "type": "epson", "interface": "printer:NOME", "width": 42, "stations": ["caixa"] },
//     { "label": "Cozinha (Rede 1)", "type": "epson", "interface": "tcp://192.168.1.51:9100", "width": 48, "stations": ["cozinha"] },
//     { "label": "Sushibar (Rede 2)","type": "epson", "interface": "tcp://192.168.1.52:9100", "width": 48, "stations": ["sushibar","bar"] }
//   ]
//
// Continua funcionando com o config.json antigo (uma impressora só, campos soltos
// printerType/printerInterface/printerWidth/stations) — é convertido sozinho pro formato
// novo aqui embaixo, sem quebrar quem já tinha configurado do jeito anterior.
function loadPrinters() {
  if (Array.isArray(cfg.printers) && cfg.printers.length) {
    return cfg.printers.map(p => ({
      label: p.label || p.stations?.join(', ') || 'Impressora',
      type: p.type === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
      interface: p.interface,
      width: p.width || 42,
      stations: Array.isArray(p.stations) && p.stations.length ? p.stations : ['caixa']
    }));
  }
  // formato antigo (uma impressora só) — mantém compatibilidade
  return [{
    label: 'Impressora principal',
    type: cfg.printerType === 'star' ? PrinterTypes.STAR : PrinterTypes.EPSON,
    interface: cfg.printerInterface,
    width: cfg.printerWidth || 42,
    stations: Array.isArray(cfg.stations) && cfg.stations.length ? cfg.stations : ['caixa']
  }];
}
const PRINTERS = loadPrinters();
// v82: identificador único gerado a cada inicialização do agente — só serve pra distinguir
// "sinais de vida" (announce) de instâncias diferentes na tela do painel; não precisa persistir
// entre reinícios, um novo é gerado toda vez e o anterior simplesmente expira sozinho (90s) do
// lado do servidor.
const AGENT_ID = crypto.randomBytes(6).toString('hex');

// v90: "stationId" opcional no config.json — identifica A QUAL computador/estação este Agente
// pertence, pra ser cruzado com o stationId do Painel (localStorage, gerado no navegador —
// ver getOrCreateStationId() em painel.html) daquele MESMO computador. Quando configurado, o
// Agente só imprime enquanto o servidor confirmar que esse é o stationId da ESTAÇÃO ATIVA
// agora (ver isAuthorizedToPrint() abaixo) — evita 2 computadores (ex.: PC principal + PC
// reserva, cada um com seu próprio Painel+Agente) imprimindo o mesmo pedido ao mesmo tempo.
// Pra configurar: abra o Painel neste MESMO computador → Configurações → Central de Impressão
// → copie o código mostrado em "🖥️ Estação deste computador" e cole aqui em "stationId".
// Se deixar em branco (padrão), o Agente imprime exatamente como sempre imprimiu — sem
// nenhuma trava nova — pra não quebrar quem já está usando o sistema hoje com um Agente só.
const STATION_ID = cfg.stationId ? String(cfg.stationId).trim() || null : null;

function printerForStation(station) {
  return PRINTERS.find(p => p.stations.includes(station)) || null;
}

// v83.2 — CONTORNO PRA IMPRESSORA USB NO WINDOWS ("No driver set!" / npm 'printer' quebrado):
// o pacote nativo 'printer' (usado pelo node-thermal-printer pra falar com impressoras
// instaladas como "printer:NOME" no Windows) está abandonado e não compila mais em
// versões novas do Node sem Python + Visual Studio Build Tools instalados. Em vez de
// depender dele, pra impressoras "printer:NOME" a gente:
//   1. monta o ThermalPrinter com uma interface "tcp://" falsa, só pra ele aceitar
//      construir sem precisar de nenhum driver nativo (nunca chega a conectar nela de
//      verdade — não chamamos .execute() nesse caso);
//   2. usa .getBuffer() pra pegar os bytes ESC/POS já prontos, sem enviar a lugar nenhum;
//   3. manda esses bytes direto pra fila de impressão do Windows (RAW) via winspool.drv,
//      chamando um script PowerShell auxiliar (winprint-helper.ps1) — mesmo mecanismo que
//      o Bloco de Notas usa por baixo dos panos, sem precisar de nenhum pacote extra.
function isWindowsNamedPrinter(printerCfg) {
  return process.platform === 'win32' && /^printer:/i.test(printerCfg.interface || '');
}

function windowsPrinterName(printerCfg) {
  return printerCfg.interface.replace(/^printer:/i, '');
}

function sendRawBufferToWindowsPrinter(printerName, buffer) {
  if (!fs.existsSync(WINPRINT_HELPER_PATH)) {
    throw new Error(`winprint-helper.ps1 não encontrado em ${WINPRINT_HELPER_PATH} (deveria estar do lado do print-agent.js).`);
  }
  const tmpFile = path.join(os.tmpdir(), `shogatsu-print-${crypto.randomBytes(4).toString('hex')}.bin`);
  fs.writeFileSync(tmpFile, buffer);
  try {
    execFileSync('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass',
      '-File', WINPRINT_HELPER_PATH,
      '-PrinterName', printerName,
      '-FilePath', tmpFile
    ], { stdio: ['ignore', 'pipe', 'pipe'], timeout: 10000 });
  } finally {
    try { fs.unlinkSync(tmpFile); } catch (e) { /* arquivo temporário, sem problema se sobrar */ }
  }
}

function buildPrinter(printerCfg) {
  if (TEST_MODE) return null; // modo teste não precisa de impressora de verdade
  return new ThermalPrinter({
    type: printerCfg.type,
    // v83.2: pra impressora "printer:NOME" (USB/instalada no Windows), usamos uma interface
    // tcp:// de mentirinha só pra passar pela validação do construtor — os bytes nunca são
    // enviados por ela de verdade (ver sendRawBufferToWindowsPrinter acima). Pra impressora
    // de rede de verdade (tcp://IP:porta) ou Linux (/dev/...), continua igual a antes.
    interface: isWindowsNamedPrinter(printerCfg) ? 'tcp://127.0.0.1:9100' : printerCfg.interface,
    width: printerCfg.width,
    // v84.1 — sem isto, qualquer texto com acento (á, ã, ç, é...) quebrava a impressão com
    // "Encoding not recognized: 'undefined'", pois a biblioteca não sabia qual codificação
    // usar pra converter o texto pros bytes que a impressora entende. PC860_PORTUGUESE cobre
    // os acentos do português. Dá pra sobrescrever por impressora com "characterSet" no
    // config.json, se um dia precisar de outra (ex.: impressora antiga que só aceite outra).
    characterSet: printerCfg.characterSet || 'PC860_PORTUGUESE',
    removeSpecialCharacters: false,
    options: { timeout: 5000 }
  });
}

const money = (n) => 'R$ ' + Number(n || 0).toFixed(2).replace('.', ',');
// v84 — mesma correção do server.js/painel.html ("pagamento deve aparecer como pagamento na
// entrega"): PIX é pago antes, mas dinheiro/crédito/débito num pedido delivery são cobrados
// só na entrega — a via do caixa impressa aqui (agente local) precisa deixar isso claro pro
// motoboy/caixa, não só mostrar a forma escolhida.
const PAY_METHOD_LABELS = { pix: 'PIX', credito: 'CARTAO DE CREDITO', debito: 'CARTAO DE DEBITO', dinheiro: 'DINHEIRO' };
function payMethodTicketLabel(order) {
  const base = PAY_METHOD_LABELS[order.payMethod] || (order.payMethod || '-').toUpperCase();
  if (!order.payMethod || order.payMethod === 'pix') return base;
  return base + (order.mode === 'delivery' ? ' (PAGAMENTO NA ENTREGA)' : ' (PAGAMENTO NA RETIRADA)');
}
// v55: quais vias esse agente é responsável por imprimir — agora é a UNIÃO das vias de
// TODAS as impressoras configuradas acima (antes era uma lista solta em cfg.stations).
const MY_STATIONS = [...new Set(PRINTERS.flatMap(p => p.stations))];
const STATION_LABELS = { caixa: 'Caixa', cozinha: 'Cozinha', sushibar: 'Sushibar', bar: 'Bar' };

// v46: layout igual ao das outras vias do sistema (painel.html/server.js) — cabeçalho
// centralizado, blocos com título, "TOTAL" em destaque na via do caixa, e "ITENS
// DA <SETOR>" + espaço de observações nas vias de produção (cozinha/sushibar/bar).
function printStationTicket(printer, order, station, storeName) {
  const isCaixa = station === 'caixa';
  const items = isCaixa ? (order.items || []) : (order.items || []).filter(i => (i.stations || []).includes(station));
  if (!items.length) return false; // essa via não tem nada desse pedido — não desperdiça papel

  printer.alignCenter();
  printer.bold(true); printer.setTextDoubleHeight();
  printer.println((storeName || 'SHOGATSU').toUpperCase());
  printer.setTextNormal(); printer.bold(false);
  printer.println('CULINARIA ORIENTAL');
  printer.drawLine();

  if (isCaixa) {
    printer.println('COMPROVANTE');
    printer.alignLeft();
    printer.println(order.ticketNumber ? `Pedido Nº ${order.ticketNumber}` : `Pedido #${order.id}`);
    printer.println(`Hora: ${new Date(order.createdAt).toLocaleString('pt-BR')}`);
    printer.println(order.mode === 'delivery' ? 'ENTREGA (DELIVERY)' : 'RETIRADA');
    printer.drawLine();
    printer.bold(true); printer.println('CLIENTE'); printer.bold(false);
    printer.drawLine();
    printer.println(order.name || '-');
    if (order.phone) printer.println('Tel: ' + order.phone);
    if (order.mode === 'delivery' && order.address) printer.println('End: ' + order.address);
    if (order.scheduledFor) printer.println('Agendado: ' + new Date(order.scheduledFor).toLocaleString('pt-BR'));
    printer.drawLine();
    printer.bold(true); printer.println('ITENS'); printer.bold(false);
    printer.drawLine();
    items.forEach(it => { printer.bold(true); printer.leftRight(`${it.qty}x ${it.name}`, money(it.price * it.qty)); printer.bold(false); });
    if (order.obs) { printer.drawLine(); printer.println('Obs: ' + order.obs); }
    printer.drawLine();
    printer.println(`Pagamento: ${payMethodTicketLabel(order)}${order.paid ? ' (PAGO)' : ''}`);
    printer.setTextDoubleHeight(); printer.bold(true);
    printer.leftRight('TOTAL', money(order.total));
    printer.bold(false); printer.setTextNormal();
  } else {
    printer.println((STATION_LABELS[station] || station).toUpperCase());
    printer.println('VIA DE PRODUCAO');
    printer.alignLeft();
    printer.println((order.ticketNumber ? `Pedido Nº ${order.ticketNumber}` : `Pedido #${order.id}`) + `  Ref.: #${String(order.id).slice(-11).toUpperCase()}`);
    printer.println(order.mode === 'delivery' ? 'DELIVERY' : 'RETIRADA');
    printer.drawLine();
    printer.bold(true); printer.println('ITENS DA ' + (STATION_LABELS[station] || station).toUpperCase()); printer.bold(false);
    printer.drawLine();
    items.forEach(it => printer.println('* ' + it.qty + 'x ' + it.name));
    printer.drawLine();
    printer.println('Observacoes:');
    if (order.obs) printer.println(order.obs);
    else { printer.println('_______________________________'); printer.println('_______________________________'); }
  }
  printer.newLine();
  printer.cut();
  return true;
}

// v54: extraído de dentro de printOrder() pra poder imprimir UMA via específica sob
// demanda (reimpressão manual pedida do painel, de celular ou PC — ver evento
// "print-order" mais abaixo), sem precisar reimprimir todas as vias desse agente de novo.
// v55: agora escolhe AUTOMATICAMENTE qual impressora física usar (USB, Rede 1, Rede 2...)
// de acordo com qual delas cuida dessa via — cada comanda sai na impressora certa, no
// local certo, mesmo com várias impressoras diferentes no mesmo agente.
// v60: avisa o servidor se a impressão dessa via deu certo ou não — é isso que faz o aviso
// "🖨 Impresso!"/"⚠️ Falhou" aparecer de volta em quem clicou em Imprimir, mesmo de outro
// aparelho (celular usado como controle remoto pro PC ligado na impressora). Se essa chamada
// falhar (sem internet, servidor fora do ar), o agente já registrou tudo no log local — não
// tenta de novo pra não atrasar a próxima impressão.
async function reportPrintResult(order, station, ok, error) {
  try {
    await request('POST', `${cfg.serverUrl}/api/print-ack`, { orderId: order.id, station, ok, error: error || null });
  } catch (e) { log(`⚠️  Não consegui avisar o servidor sobre o resultado da via "${station}" (${ok ? 'sucesso' : 'falha'}): ${e.message}`); }
}

async function printSingleStation(order, station) {
  const printerCfg = printerForStation(station);
  if (!printerCfg) { const msg = `Nenhuma impressora configurada pra via "${station}"`; log(`⚠️  ${msg} — nada impresso (confira "printers" no config.json).`); return { ok:false, error: msg }; }
  if (TEST_MODE) {
    log(`🧪 [TEST_MODE] Imprimiria agora o pedido ${order.id} na via: ${station} (impressora: ${printerCfg.label})`);
    return { ok:true };
  }
  const printer = buildPrinter(printerCfg);
  const isWinPrinter = isWindowsNamedPrinter(printerCfg);
  try {
    if (!isWinPrinter) {
      // Impressora de rede/serial de verdade — mantém a checagem original.
      const connected = await printer.isPrinterConnected();
      if (!connected) throw new Error(`Impressora "${printerCfg.label}" não respondeu (verifique se está ligada e na mesma rede/USB).`);
    }
    const hadItems = printStationTicket(printer, order, station, cfg.storeName);
    if (!hadItems) { log(`ℹ️  Pedido ${order.id} — via "${station}" sem itens dessa via, nada impresso.`); return { ok:true, skipped:true }; }
    if (isWinPrinter) {
      // v83.2: pega os bytes ESC/POS prontos e manda pra fila de impressão do Windows,
      // sem depender do pacote nativo 'printer' (ver buildPrinter acima pra explicação).
      const buffer = printer.getBuffer();
      sendRawBufferToWindowsPrinter(windowsPrinterName(printerCfg), buffer);
    } else {
      await printer.execute();
    }
    log(`✅ Pedido ${order.id} — via "${station}" impressa com sucesso na impressora "${printerCfg.label}".`);
    return { ok:true };
  } catch (err) {
    log(`❌ Falha ao imprimir pedido ${order.id} (via "${station}", impressora "${printerCfg.label}"): ${err.message}`);
    return { ok:false, error: err.message };
  }
}

// v55: imprime TODAS as vias desse pedido de uma vez, cada uma na sua impressora — é o que
// dá o efeito de "um clique só (ou automático) manda tudo pro lugar certo": a via do caixa
// sai na impressora do caixa, a da cozinha na da cozinha, etc., mesmo sendo impressoras
// físicas diferentes (USB + rede 1 + rede 2), tudo dentro da mesma chamada.
// v82 — BUG CORRIGIDO ("não dá pra saber por que a impressão automática falhou, sem abrir o
// log no computador da loja"): até aqui, só a impressão SOB DEMANDA (clique manual em
// Imprimir/Reimprimir, via printOnDemand) avisava o servidor do resultado — a impressão
// AUTOMÁTICA (disparada sozinha ao chegar um pedido novo, que é o caminho usado 99% do tempo)
// nunca chamava reportPrintResult(), então uma falha aqui (impressora desligada, IP errado,
// papel preso) só aparecia no print-agent.log local, invisível pro admin no painel. Agora
// avisa o servidor em AMBOS os casos — as falhas passam a aparecer em Configurações → 🖨
// Central de Impressão → "Últimas falhas de impressão".
async function printOrder(order) {
  if (TEST_MODE) {
    log(`🧪 [TEST_MODE] Imprimiria agora o pedido ${order.id} nas vias: ${MY_STATIONS.join(', ')}`);
    return true;
  }
  // v90: só imprime automaticamente se este computador for a Estação Ativa de Impressão
  // agora (quando "stationId" está configurado — ver isAuthorizedToPrint() acima). Evita
  // duplicar comanda quando existe mais de um Agente instalado (ex.: PC principal + PC
  // reserva) rodando ao mesmo tempo.
  if (!isAuthorizedToPrint()) {
    log(`⛔ Impressão automática do pedido ${order.id} BLOQUEADA — este computador (estação "${STATION_ID}") não é a Estação Ativa de Impressão agora (o Painel está aberto/conectado em outro computador).`);
    return false;
  }
  let anyPrinted = false;
  for (const station of MY_STATIONS) {
    const r = await printSingleStation(order, station);
    if (r.ok && !r.skipped) anyPrinted = true;
    if (!r.skipped) await reportPrintResult(order, station, r.ok, r.error);
  }
  return anyPrinted;
}

// v54: reimpressão/impressão sob demanda de UMA via, pedida manualmente do painel (botão
// "🖨 Imprimir/Reimprimir") — pode partir de QUALQUER aparelho logado (celular ou PC), o
// servidor só repassa o pedido por SSE e este agente (ligado na impressora física) executa.
// Só imprime se a via pedida for uma das que ESTE agente cuida (evita duplicar quando tem
// mais de um agente rodando, cada um numa impressora/estação diferente).
// v60: agora também avisa o servidor do resultado (sucesso/falha) — é o que fecha o ciclo do
// "celular como controle remoto": tocou em Imprimir no celular, o PC imprime, e a confirmação
// (ou o erro) volta pra tela de quem clicou, em tempo real.
async function printOnDemand(order, station) {
  if (!MY_STATIONS.includes(station)) return;
  // v90: mesma trava da impressão automática (ver printOrder acima) — um clique manual de
  // "Imprimir"/"Reimprimir" partido de qualquer aparelho só é executado por este Agente se
  // este computador for a Estação Ativa agora.
  if (!isAuthorizedToPrint()) {
    log(`⛔ Impressão sob demanda da via "${station}" BLOQUEADA — este computador (estação "${STATION_ID}") não é a Estação Ativa de Impressão agora.`);
    await reportPrintResult(order, station, false, 'Estação não autorizada a imprimir agora (o Painel ativo está em outro computador).');
    return;
  }
  log(`🖨️  Impressão sob demanda pedida pra via "${station}" — pedido ${order.id} (${order.name || 'sem nome'}).`);
  const r = await printSingleStation(order, station);
  await reportPrintResult(order, station, r.ok, r.error);
}

// v46: teste de impressão pedido pelo painel ("🖨 Testar" numa via com método Automática) —
// imprime só se essa via for uma das que ESTE agente cuida (evita confusão quando tem mais de
// um agente rodando, cada um numa impressora diferente).
// v55: também escolhe a impressora certa (USB/Rede 1/Rede 2) pra essa via automaticamente.
async function printTestTicket(payload) {
  if (!MY_STATIONS.includes(payload.station)) return;
  const printerCfg = printerForStation(payload.station);
  if (!printerCfg) { log(`⚠️  Nenhuma impressora configurada pra via "${payload.station}" — teste não enviado.`); return; }
  if (TEST_MODE) { log(`🧪 [TEST_MODE] Teste de impressão pra via "${payload.station}" (impressora: ${printerCfg.label}):\n   ` + String(payload.text || '').split('\n').join('\n   ')); return; }
  const printer = buildPrinter(printerCfg);
  const isWinPrinter = isWindowsNamedPrinter(printerCfg);
  try {
    if (!isWinPrinter) {
      const connected = await printer.isPrinterConnected();
      if (!connected) throw new Error(`Impressora "${printerCfg.label}" não respondeu.`);
    }
    printer.alignCenter(); printer.bold(true);
    printer.println('TESTE DE IMPRESSAO');
    printer.bold(false);
    printer.println('Via: ' + (payload.label || payload.station));
    printer.println('Impressora: ' + printerCfg.label);
    printer.println(new Date().toLocaleString('pt-BR'));
    printer.newLine(); printer.cut();
    if (isWinPrinter) {
      sendRawBufferToWindowsPrinter(windowsPrinterName(printerCfg), printer.getBuffer());
    } else {
      await printer.execute();
    }
    log(`✅ Teste de impressão da via "${payload.station}" concluído na impressora "${printerCfg.label}".`);
  } catch (err) {
    log(`❌ Falha no teste de impressão (via "${payload.station}", impressora "${printerCfg.label}"): ${err.message}`);
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
  announcePresence();
  startStationStatusPolling();
}

// v82: avisa o servidor "estou vivo" logo após logar, e de novo a cada ~45s enquanto o agente
// estiver rodando — é o que faz o painel (Central de Impressão) mostrar "✅ Agente conectado"
// ou "❌ Nenhum agente conectado" em tempo real, em vez do admin ter que adivinhar olhando só
// pro resultado (ou a falta dele) na impressora física.
let announceTimer = null;
async function announcePresence() {
  try {
    await request('POST', `${cfg.serverUrl}/api/print-agent/announce?token=${encodeURIComponent(token)}`, {
      agentId: AGENT_ID,
      printers: PRINTERS.map(p => ({ label: p.label, stations: p.stations }))
    });
  } catch (e) { /* se falhar, o painel simplesmente mostra "offline" até o próximo aviso — não trava nada aqui */ }
  clearTimeout(announceTimer);
  announceTimer = setTimeout(announcePresence, 45000);
}

// v90: Estação Ativa de Impressão — só consultada quando "stationId" está configurado no
// config.json (ver STATION_ID acima). Guarda o ÚLTIMO status conhecido do servidor (quem é a
// estação ativa agora) num cache local, atualizado a cada STATION_STATUS_POLL_MS — assim a
// checagem em isAuthorizedToPrint() (chamada em CADA impressão) é instantânea, sem esperar
// nenhuma requisição de rede na hora de imprimir.
let stationStatus = null; // { active, activeStationId, activeLabel, checkedAt }
let stationStatusTimer = null;
const STATION_STATUS_POLL_MS = 8000;
async function refreshStationStatus() {
  if (!STATION_ID || !token) return;
  try {
    const r = await request('GET', `${cfg.serverUrl}/api/print-station/status?token=${encodeURIComponent(token)}`);
    if (r.status === 200 && r.data) stationStatus = { ...r.data, checkedAt: Date.now() };
  } catch (e) { /* mantém o último status conhecido; se ficar velho demais, isAuthorizedToPrint() já bloqueia por segurança */ }
}
function startStationStatusPolling() {
  if (!STATION_ID) return; // sem stationId configurado = modo compatível/legado, nunca consulta
  refreshStationStatus();
  clearInterval(stationStatusTimer);
  stationStatusTimer = setInterval(refreshStationStatus, STATION_STATUS_POLL_MS);
}

// v90: decide se ESTE Agente está autorizado a imprimir AGORA.
//   • Sem "stationId" no config.json (padrão) → sempre autorizado, exatamente como sempre
//     funcionou (modo compatível/legado — não quebra ninguém que já usa o sistema hoje).
//   • Com "stationId" configurado → só autorizado se o servidor confirmou, recentemente, que
//     esse é o stationId da estação ATIVA agora (Painel aberto/conectado NESTE computador).
//     Se o último status conhecido estiver velho demais (internet caiu, servidor fora do ar),
//     prefere BLOQUEAR a arriscar imprimir em duplicidade — a impressão automática desse
//     pedido específico fica pendente até a conexão voltar (o pedido continua salvo
//     normalmente, só a via automática desse Agente é que não sai até confirmar de novo).
function isAuthorizedToPrint() {
  if (!STATION_ID) return true;
  if (!stationStatus) return false;
  const age = Date.now() - stationStatus.checkedAt;
  if (age > STATION_STATUS_POLL_MS * 3) return false;
  return !!stationStatus.active && stationStatus.activeStationId === STATION_ID;
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
        if (eventName === 'new-order') {
          try {
            const order = JSON.parse(dataLine.slice(5).trim());
            log(`🆕 Pedido novo recebido: ${order.id} (${order.name})`);
            printOrder(order);
          } catch (e) { log(`⚠️  Não consegui interpretar o pedido recebido: ${e.message}`); }
        } else if (eventName === 'print-test') {
          // v46: teste de impressão sob demanda, disparado pelo botão "🖨 Testar" no painel
          // quando a via está configurada como "Automática".
          try {
            const payload = JSON.parse(dataLine.slice(5).trim());
            log(`🧪 Teste de impressão recebido pra via "${payload.station}".`);
            printTestTicket(payload);
          } catch (e) { log(`⚠️  Não consegui interpretar o teste de impressão: ${e.message}`); }
        } else if (eventName === 'print-order') {
          // v54: impressão/reimpressão manual pedida pelo botão "🖨 Imprimir" do painel —
          // pode ter partido de um celular ou de um PC, tanto faz: o servidor só repassa,
          // este agente (ligado na impressora de verdade) é quem executa.
          try {
            const payload = JSON.parse(dataLine.slice(5).trim());
            printOnDemand(payload.order, payload.station);
          } catch (e) { log(`⚠️  Não consegui interpretar o pedido de impressão manual: ${e.message}`); }
        }
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
  log(`🖨️  ${PRINTERS.length} impressora(s) configurada(s):`);
  PRINTERS.forEach(p => log(`   • ${p.label} → vias: ${p.stations.join(', ')} (${p.interface})`));
  try {
    await login();
    connectStream();
  } catch (e) {
    log(`❌ ${e.message}`);
    scheduleReconnect();
  }
}

start();
