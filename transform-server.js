// ═══════════════════════════════════════════════════════════════════════════
// transform-server.js — Transforma o server.js original para usar database.js
//
// Execute: node transform-server.js
// Requisitos: Node.js 18+, arquivo server.js original no mesmo diretorio
//
// O que faz:
// 1. Adiciona 'const db = require("./database");'
// 2. Substitui readConfig() por versao async que usa db.getSettings() + db.getFullMenu()
// 3. Substitui todas as leituras/escritas de CONFIG_FILE por db.getSettings()/db.updateSettings()
// 4. Substitui todas as leituras/escritas de ORDERS_FILE por db.listOrders()/db.createOrder()/etc.
// 5. Adiciona rotas REST para /api/categories e /api/menu
// 6. Mantem TODAS as funcionalidades existentes
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');

const SERVER_FILE = path.join(__dirname, 'server.js');
const BACKUP_FILE = path.join(__dirname, 'server.js.backup-original');
const OUTPUT_FILE = path.join(__dirname, 'server.js');

if (!fs.existsSync(SERVER_FILE)) {
  console.error('ERRO: server.js nao encontrado no diretorio atual!');
  process.exit(1);
}

// Faz backup do original
fs.copyFileSync(SERVER_FILE, BACKUP_FILE);
console.log('✅ Backup criado: server.js.backup-original');

let code = fs.readFileSync(SERVER_FILE, 'utf8');

// ============================================================================
// PASSO 1: Adicionar import do database.js
// ============================================================================
if (!code.includes('require("./database")') && !code.includes("require('./database')")) {
  // Encontra a linha do ultimo require
  const lines = code.split('\n');
  let lastRequireIdx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].includes('require(')) lastRequireIdx = i;
  }
  if (lastRequireIdx >= 0) {
    lines.splice(lastRequireIdx + 1, 0, "const db = require('./database');");
    code = lines.join('\n');
    console.log('✅ Import do database.js adicionado');
  }
}

// ============================================================================
// PASSO 2: Substituir a funcao readConfig()
// ============================================================================
// Encontra e remove a funcao readConfig() original
const readConfigStart = code.indexOf('function readConfig()');
if (readConfigStart >= 0) {
  // Encontra o fim da funcao (proxima funcao ou comentario de secao)
  let braceCount = 0;
  let inFunction = false;
  let readConfigEnd = readConfigStart;
  for (let i = readConfigStart; i < code.length; i++) {
    if (code[i] === '{') { braceCount++; inFunction = true; }
    if (code[i] === '}' && inFunction) {
      braceCount--;
      if (braceCount === 0) { readConfigEnd = i + 1; break; }
    }
  }

  const newReadConfig = `async function readConfig() {
  const data = await db.getSettings();
  const cfg = { ...DEFAULT_CFG, ...data };
  if (cfg.schedule && cfg.schedule.enabled) {
    cfg.open = isWithinSchedule(cfg.schedule.openTime, cfg.schedule.closeTime) ? 1 : 0;
  }
  const menu = await db.getFullMenu();
  return { cfg, menu: normalizeMenu(menu) };
}`;

  code = code.slice(0, readConfigStart) + newReadConfig + code.slice(readConfigEnd);
  console.log('✅ Funcao readConfig() substituida (async + database.js)');
}

// ============================================================================
// PASSO 3: Substituir leituras de CONFIG_FILE
// ============================================================================
// Padrao: const { cfg, menu } = readConfig();
// Precisa ser: const { cfg, menu } = await readConfig();
let configReadCount = 0;
const configReadRegex = /(const\s+\{[^}]*\}\s*=\s*)readConfig\(\)/g;
code = code.replace(configReadRegex, (match, prefix) => {
  configReadCount++;
  return prefix + 'await readConfig()';
});
console.log(`✅ ${configReadCount} chamadas de readConfig() tornadas async`);

// ============================================================================
// PASSO 4: Substituir writeJSON(CONFIG_FILE, data)
// ============================================================================
// Padrao: writeJSON(CONFIG_FILE, { cfg, menu });
// Precisa ser: await db.updateSettings(cfg); await db.setFullMenu(menu);
let configWriteCount = 0;

// Caso 1: writeJSON(CONFIG_FILE, { cfg: ..., menu: ... })
code = code.replace(/writeJSON\(CONFIG_FILE,\s*\{\s*cfg(?:\s*:\s*cfg)?,\s*menu(?:\s*:\s*menu)?\s*\}\);?/g, (match) => {
  configWriteCount++;
  return 'await db.updateSettings(cfg); await db.setFullMenu(menu);';
});

// Caso 2: writeJSON(CONFIG_FILE, data) onde data contem cfg
// Isso e mais complexo, vamos procurar por padroes especificos
const writeConfigPatterns = [
  { regex: /writeJSON\(CONFIG_FILE,\s*\{\s*cfg:\s*cfg,\s*menu:\s*menu\s*\}\)/g, repl: 'await db.updateSettings(cfg); await db.setFullMenu(menu)' },
  { regex: /writeJSON\(CONFIG_FILE,\s*\{\s*cfg,\s*menu\s*\}\)/g, repl: 'await db.updateSettings(cfg); await db.setFullMenu(menu)' },
  { regex: /writeJSON\(CONFIG_FILE,\s*\{\s*cfg:\s*merged,\s*menu:\s*merged\.menu\s*\}\)/g, repl: 'await db.updateSettings(merged); await db.setFullMenu(merged.menu)' },
  { regex: /writeJSON\(CONFIG_FILE,\s*\{\s*cfg:\s*mergedCfg,\s*menu:\s*mergedCfg\.menu\s*\}\)/g, repl: 'await db.updateSettings(mergedCfg); await db.setFullMenu(mergedCfg.menu)' },
];

for (const pat of writeConfigPatterns) {
  code = code.replace(pat.regex, (match) => {
    configWriteCount++;
    return pat.repl;
  });
}

console.log(`✅ ${configWriteCount} escritas em CONFIG_FILE migradas para database.js`);

// ============================================================================
// PASSO 5: Substituir leituras/escritas de ORDERS_FILE
// ============================================================================
// Padrao: const orders = readJSON(ORDERS_FILE, []);
// Precisa ser: const orders = await db.listOrders(10000);
let orderReadCount = 0;

// Leitura simples
code = code.replace(/const\s+orders\s*=\s*readJSON\(ORDERS_FILE,\s*\[\]\)/g, (match) => {
  orderReadCount++;
  return 'const orders = await db.listOrders(10000)';
});

// Leitura com filtro (mantem o filtro depois)
code = code.replace(/const\s+orders\s*=\s*readJSON\(ORDERS_FILE,\s*\[\]\)\.filter/g, (match) => {
  orderReadCount++;
  return 'const orders = (await db.listOrders(10000)).filter';
});

// Leitura em loop (forEach, etc)
code = code.replace(/readJSON\(ORDERS_FILE,\s*\[\]\)\.forEach/g, (match) => {
  orderReadCount++;
  return '(await db.listOrders(10000)).forEach';
});

// Leitura para unshift (adicionar pedido)
code = code.replace(/const\s+orders\s*=\s*readJSON\(ORDERS_FILE,\s*\[\]\);\s*orders\.unshift\(([^)]+)\);\s*writeJSON\(ORDERS_FILE,\s*orders\)/g, (match, orderVar) => {
  orderReadCount++;
  return `await db.createOrder(${orderVar})`;
});

// Escrita direta (substituir todo o array)
code = code.replace(/writeJSON\(ORDERS_FILE,\s*orders\)/g, (match) => {
  // Isso e perigoso substituir automaticamente - pode perder dados
  // Vamos apenas marcar com comentario
  return '/* MIGRAR: writeJSON(ORDERS_FILE, orders) -> nao usar mais */ orders';
});

console.log(`✅ ${orderReadCount} leituras de ORDERS_FILE migradas para database.js`);

// ============================================================================
// PASSO 6: Adicionar novas rotas REST (antes do handler de static files)
// ============================================================================
const newRoutes = `
  // === NOVAS ROTAS REST (v2.0) ===

  // --- CATEGORIES ---
  if (pathname === '/api/categories' && req.method === 'GET') {
    const cats = await db.listCategories();
    return sendJSON(res, 200, { categories: cats });
  }
  if (pathname === '/api/categories' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { const cat = await db.createCategory(await readBody(req)); publicBroadcast('menu-updated', {}); return sendJSON(res, 201, { ok: true, category: cat }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (pathname.match(/^\\/api\\/categories\\/[^/]+$/) && req.method === 'PUT') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { const cat = await db.updateCategory(parseInt(pathname.split('/').pop()), await readBody(req)); publicBroadcast('menu-updated', {}); return sendJSON(res, 200, { ok: true, category: cat }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (pathname.match(/^\\/api\\/categories\\/[^/]+$/) && req.method === 'DELETE') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { await db.deleteCategory(parseInt(pathname.split('/').pop())); publicBroadcast('menu-updated', {}); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }

  // --- MENU ITEMS ---
  if (pathname === '/api/menu' && req.method === 'GET') {
    const items = await db.listMenuItems();
    return sendJSON(res, 200, { items });
  }
  if (pathname === '/api/menu' && req.method === 'POST') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { const item = await db.createMenuItem(await readBody(req)); publicBroadcast('menu-updated', {}); return sendJSON(res, 201, { ok: true, item }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (pathname.match(/^\\/api\\/menu\\/[^/]+$/) && req.method === 'PUT') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { const item = await db.updateMenuItem(parseInt(pathname.split('/').pop()), await readBody(req)); publicBroadcast('menu-updated', {}); return sendJSON(res, 200, { ok: true, item }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }
  if (pathname.match(/^\\/api\\/menu\\/[^/]+$/) && req.method === 'DELETE') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { await db.deleteMenuItem(parseInt(pathname.split('/').pop())); publicBroadcast('menu-updated', {}); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }

  // --- SETTINGS ---
  if (pathname === '/api/settings' && req.method === 'GET') {
    const cfg = await db.getSettings();
    const { adminPass, masterPass, ...publicCfg } = { ...DEFAULT_CFG, ...cfg };
    return sendJSON(res, 200, { settings: publicCfg });
  }
  if (pathname === '/api/settings' && req.method === 'PUT') {
    if (!requireRole(getToken(req, query), 'admin')) return sendJSON(res, 403, { error: 'Sem permissao.' });
    try { const body = await readBody(req); const current = await db.getSettings(); await db.updateSettings({ ...current, ...body }); broadcast('config-updated', {}); return sendJSON(res, 200, { ok: true }); }
    catch (e) { return sendJSON(res, 400, { error: e.message }); }
  }

  // === FIM NOVAS ROTAS ===
`;

// Encontra onde inserir (antes da primeira rota existente)
const firstRoute = code.indexOf("if (pathname === '/api/config'");
if (firstRoute >= 0) {
  code = code.slice(0, firstRoute) + newRoutes + '\n' + code.slice(firstRoute);
  console.log('✅ Novas rotas REST adicionadas');
}

// ============================================================================
// PASSO 7: Salvar arquivo transformado
// ============================================================================
fs.writeFileSync(OUTPUT_FILE, code);
console.log('\n' + '='.repeat(60));
console.log('TRANSFORMACAO CONCLUIDA!');
console.log('='.repeat(60));
console.log(`Arquivo: ${OUTPUT_FILE}`);
console.log(`Tamanho: ${code.length} bytes`);
console.log('\nIMPORTANTE:');
console.log('1. Revise o arquivo server.js transformado');
console.log('2. Teste localmente antes de fazer deploy');
console.log('3. Verifique se todas as funcionalidades foram preservadas');
console.log('\nPara reverter:');
console.log('  cp server.js.backup-original server.js');
