// ═══════════════════════════════════════════════════════════
// db.js — Armazenamento de clientes em Postgres (Render/Neon/Supabase)
//
// Se a variável de ambiente DATABASE_URL estiver configurada, os dados de
// clientes passam a ser lidos/gravados direto num banco Postgres de verdade,
// que sobrevive a reinícios do servidor (diferente do arquivo customers.json,
// que mora no disco temporário do Render e some a cada reinício no plano
// gratuito).
//
// Se DATABASE_URL não estiver configurada, o sistema continua funcionando
// exatamente como antes, usando o arquivo customers.json — pra não quebrar
// quem ainda não configurou o banco.
// ═══════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

const CUSTOMERS_FILE = path.join(__dirname, 'data', 'customers.json');

let pool = null;
let Pool = null;
try { ({ Pool } = require('pg')); } catch (e) { /* pacote 'pg' não instalado — tudo bem, cai pro modo arquivo */ }

if (process.env.DATABASE_URL && Pool) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Render/Neon/Supabase pedem SSL, mas com certificado que o driver não
    // valida por padrão — isso é normal pra esses provedores, não é falha
    // de segurança da sua parte.
    ssl: { rejectUnauthorized: false }
  });
}

const useDB = !!pool;

function readLocalCustomers() {
  try { return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8')); } catch (e) { return []; }
}
function writeLocalCustomers(arr) {
  fs.writeFileSync(CUSTOMERS_FILE, JSON.stringify(arr, null, 2));
}

// Cria a tabela se ainda não existir, e migra o customers.json local pra
// dentro do banco automaticamente — só na primeira vez (se a tabela já tiver
// dados, não mexe em nada, pra nunca sobrescrever com dados desatualizados).
async function initSchema() {
  if (!useDB) return;
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
      phone         TEXT PRIMARY KEY,
      name          TEXT NOT NULL,
      pin_hash      TEXT NOT NULL,
      last_address  TEXT DEFAULT '',
      recovery      JSONB DEFAULT NULL,
      created_at    TIMESTAMPTZ DEFAULT now()
    )
  `);

  const { rows } = await pool.query('SELECT count(*)::int AS n FROM customers');
  if (rows[0].n === 0) {
    const local = readLocalCustomers();
    if (local.length) {
      for (const c of local) {
        await pool.query(
          `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING`,
          [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || new Date().toISOString()]
        );
      }
      console.log(`✅ Migrados ${local.length} cliente(s) do customers.json pro banco Postgres.`);
    }
  }
}

function rowToCustomer(row) {
  if (!row) return null;
  return {
    phone: row.phone,
    name: row.name,
    pinHash: row.pin_hash,
    lastAddress: row.last_address || '',
    recovery: row.recovery || null,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function normalizePhone(phone) { return String(phone || '').replace(/\D/g, ''); }

async function findCustomerByPhone(phone) {
  const p = normalizePhone(phone);
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM customers WHERE phone=$1', [p]);
    return rowToCustomer(rows[0]);
  }
  const customers = readLocalCustomers();
  return customers.find(c => c.phone === p) || null;
}

async function createCustomer(c) {
  const record = { ...c, phone: normalizePhone(c.phone) };
  if (useDB) {
    await pool.query(
      `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
       VALUES ($1,$2,$3,$4,$5,$6)`,
      [record.phone, record.name, record.pinHash, record.lastAddress || '', record.recovery ? JSON.stringify(record.recovery) : null, record.createdAt || new Date().toISOString()]
    );
    return record;
  }
  const customers = readLocalCustomers();
  customers.push(record);
  writeLocalCustomers(customers);
  return record;
}

// Atualiza só os campos passados (name, pinHash, lastAddress, recovery).
async function updateCustomer(phone, fields) {
  const p = normalizePhone(phone);
  if (useDB) {
    const cols = { name: 'name', pinHash: 'pin_hash', lastAddress: 'last_address', recovery: 'recovery' };
    const sets = [], vals = [];
    let i = 1;
    for (const key of Object.keys(fields)) {
      if (!cols[key]) continue;
      sets.push(`${cols[key]}=$${i++}`);
      vals.push(key === 'recovery' ? (fields[key] ? JSON.stringify(fields[key]) : null) : fields[key]);
    }
    if (!sets.length) return;
    vals.push(p);
    await pool.query(`UPDATE customers SET ${sets.join(', ')} WHERE phone=$${i}`, vals);
    return;
  }
  const customers = readLocalCustomers();
  const c = customers.find(x => x.phone === p);
  if (c) { Object.assign(c, fields); writeLocalCustomers(customers); }
}

async function listCustomers() {
  if (useDB) {
    const { rows } = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
    return rows.map(rowToCustomer);
  }
  return readLocalCustomers();
}

// Usado pelo recurso de restaurar backup — substitui TODOS os clientes de uma vez.
async function replaceAllCustomers(arr) {
  if (useDB) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('DELETE FROM customers');
      for (const c of arr) {
        await client.query(
          `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING`,
          [c.phone, c.name, c.pinHash, c.lastAddress || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || new Date().toISOString()]
        );
      }
      await client.query('COMMIT');
    } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    return;
  }
  writeLocalCustomers(arr);
}

module.exports = {
  useDB,
  initSchema,
  findCustomerByPhone,
  createCustomer,
  updateCustomer,
  listCustomers,
  replaceAllCustomers
};
