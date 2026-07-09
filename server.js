const jsonServer = require('json-server');
const cors = require('cors');
const crypto = require('crypto');

const server = jsonServer.create();
const router = jsonServer.router('db.json');
const middlewares = jsonServer.defaults();

const PORT = process.env.PORT || 3001;

// Helper: hash simples de senha (SHA-256)
function hashSenha(senha) {
  return crypto.createHash('sha256').update(senha).digest('hex');
}

// Helper: ler dados do banco em tempo real
function getDB() {
  return router.db.getState();
}

server.use(cors());
server.use(middlewares);
server.use(jsonServer.bodyParser);

// ─── ROTA: Cadastro de cliente ────────────────────────────────────────────────
// POST /clientes/cadastro
// Body: { nome, email, senha, telefone, endereco: { rua, numero, bairro, cidade, cep } }
server.post('/clientes/cadastro', (req, res) => {
  const { nome, email, senha, telefone, endereco } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, email e senha são obrigatórios.' });
  }

  const db = getDB();
  const jaExiste = db.customers.find(c => c.email === email);
  if (jaExiste) {
    return res.status(409).json({ erro: 'E-mail já cadastrado.' });
  }

  const novoCliente = {
    id: Date.now().toString(),
    nome,
    email,
    senha_hash: hashSenha(senha),
    telefone: telefone || '',
    endereco: endereco || {},
    criado_em: new Date().toISOString()
  };

  router.db.get('customers').push(novoCliente).write();
  const { senha_hash, ...clienteSemSenha } = novoCliente;
  res.status(201).json({ mensagem: 'Cliente cadastrado com sucesso!', cliente: clienteSemSenha });
});

// ─── ROTA: Login de cliente ───────────────────────────────────────────────────
// POST /clientes/login
// Body: { email, senha }
server.post('/clientes/login', (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
  }

  const db = getDB();
  const cliente = db.customers.find(c => c.email === email);

  if (!cliente || cliente.senha_hash !== hashSenha(senha)) {
    return res.status(401).json({ erro: 'E-mail ou senha inválidos.' });
  }

  const { senha_hash, ...clienteSemSenha } = cliente;
  res.json({ mensagem: 'Login realizado com sucesso!', cliente: clienteSemSenha });
});

// ─── ROTA: Atualizar dados do cliente ────────────────────────────────────────
// PUT /clientes/:id
// Body: { nome, telefone, endereco }  (senha opcional)
server.put('/clientes/:id', (req, res) => {
  const { id } = req.params;
  const { nome, telefone, endereco, senha_nova } = req.body;

  const db = getDB();
  const idx = db.customers.findIndex(c => c.id === id);
  if (idx === -1) {
    return res.status(404).json({ erro: 'Cliente não encontrado.' });
  }

  const atualizado = { ...db.customers[idx] };
  if (nome) atualizado.nome = nome;
  if (telefone) atualizado.telefone = telefone;
  if (endereco) atualizado.endereco = { ...atualizado.endereco, ...endereco };
  if (senha_nova) atualizado.senha_hash = hashSenha(senha_nova);
  atualizado.atualizado_em = new Date().toISOString();

  router.db.get('customers').nth(idx).assign(atualizado).write();
  const { senha_hash, ...clienteSemSenha } = atualizado;
  res.json({ mensagem: 'Dados atualizados com sucesso!', cliente: clienteSemSenha });
});

// ─── ROTA: Calcular taxa de entrega por CEP ───────────────────────────────────
// GET /entrega/taxa-cep?cep=28050000
server.get('/entrega/taxa-cep', (req, res) => {
  const { cep } = req.query;
  if (!cep) {
    return res.status(400).json({ erro: 'Informe o CEP.' });
  }

  const cepNumerico = cep.replace(/\D/g, '');
  const db = getDB();
  const settings = db.settings;

  const faixa = settings.delivery_rates_by_cep.find(
    f => cepNumerico >= f.cep_inicio && cepNumerico <= f.cep_fim
  );

  if (!faixa) {
    return res.status(404).json({ erro: 'CEP fora da área de entrega.' });
  }

  res.json({ cep: cepNumerico, taxa: faixa.fee, label: faixa.label });
});

// ─── ROTA: Calcular taxa de entrega por distância ────────────────────────────
// GET /entrega/taxa-distancia?km=7.5
server.get('/entrega/taxa-distancia', (req, res) => {
  const km = parseFloat(req.query.km);
  if (isNaN(km) || km < 0) {
    return res.status(400).json({ erro: 'Informe a distância em km.' });
  }

  const db = getDB();
  const settings = db.settings;

  const faixa = settings.delivery_rates_by_distance.find(
    f => km >= f.min_km && km < f.max_km
  );

  if (!faixa) {
    return res.status(404).json({ erro: 'Distância fora do alcance de entrega.' });
  }

  res.json({ km, taxa: faixa.fee });
});

// ─── ROTA: Configurações da loja ─────────────────────────────────────────────
// GET  /configuracoes       → retorna as configurações
// PUT  /configuracoes       → atualiza configurações
server.get('/configuracoes', (req, res) => {
  const db = getDB();
  res.json(db.settings);
});

server.put('/configuracoes', (req, res) => {
  const updates = req.body;
  const db = getDB();
  const novasConfig = { ...db.settings, ...updates };
  router.db.set('settings', novasConfig).write();
  res.json({ mensagem: 'Configurações salvas com sucesso!', settings: novasConfig });
});

// ─── Rotas padrão json-server (products, orders) ─────────────────────────────
server.use(router);

server.listen(PORT, () => {
  console.log(`✅ Shogatsu API rodando na porta ${PORT}`);
  console.log(`   Produtos:       GET  /products`);
  console.log(`   Pedidos:        GET/POST /orders`);
  console.log(`   Cadastro:       POST /clientes/cadastro`);
  console.log(`   Login:          POST /clientes/login`);
  console.log(`   Atualizar:      PUT  /clientes/:id`);
  console.log(`   Taxa por CEP:   GET  /entrega/taxa-cep?cep=28050000`);
  console.log(`   Taxa por km:    GET  /entrega/taxa-distancia?km=7.5`);
  console.log(`   Configurações:  GET/PUT /configuracoes`);
});
