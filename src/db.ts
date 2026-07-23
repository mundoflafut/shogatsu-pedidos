import fs from 'fs';
import path from 'path';
import pg from 'pg';

const DATA_DIR = path.join(process.cwd(), 'data');
const CUSTOMERS_FILE = path.join(DATA_DIR, 'customers.json');
const CUSTOMERS_BAK = path.join(DATA_DIR, 'customers.json.bak');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let pool: any = null;
const { Pool } = pg || {};

if (process.env.DATABASE_URL && Pool) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
  } catch (err) {
    console.error('⚠️ Error initializing Postgres pool:', err);
  }
}

export const useDB = !!pool;

function safeWriteJSON(filePath: string, data: any) {
  try {
    const tmpPath = filePath + '.tmp';
    const bakPath = filePath + '.bak';
    const jsonStr = JSON.stringify(data, null, 2);
    fs.writeFileSync(tmpPath, jsonStr, 'utf8');
    if (fs.existsSync(filePath)) {
      try { fs.copyFileSync(filePath, bakPath); } catch (e) {}
    }
    fs.renameSync(tmpPath, filePath);
  } catch (err) {
    console.error(`❌ Error writing atomic JSON to ${filePath}:`, err);
  }
}

function readLocalCustomers(): any[] {
  try {
    if (fs.existsSync(CUSTOMERS_FILE)) {
      return JSON.parse(fs.readFileSync(CUSTOMERS_FILE, 'utf8')) || [];
    }
    if (fs.existsSync(CUSTOMERS_BAK)) {
      return JSON.parse(fs.readFileSync(CUSTOMERS_BAK, 'utf8')) || [];
    }
    return [];
  } catch (e) {
    if (fs.existsSync(CUSTOMERS_BAK)) {
      try { return JSON.parse(fs.readFileSync(CUSTOMERS_BAK, 'utf8')) || []; } catch (e2) {}
    }
    return [];
  }
}

function writeLocalCustomers(arr: any[]) {
  safeWriteJSON(CUSTOMERS_FILE, arr);
}

function rowToCustomer(row: any) {
  if (!row) return null;
  return {
    phone: row.phone,
    name: row.name,
    pinHash: row.pin_hash,
    lastAddress: row.last_address || '',
    recovery: typeof row.recovery === 'string' ? JSON.parse(row.recovery) : (row.recovery || null),
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function normalizePhone(phone: any) { return String(phone || '').replace(/\D/g, ''); }

export async function initSchema() {
  if (!useDB) return;
  try {
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

    // Bi-directional sync on startup
    const local = readLocalCustomers();
    const { rows: dbRows } = await pool.query('SELECT * FROM customers');
    const dbCustomers = dbRows.map(rowToCustomer);

    const mergedMap = new Map<string, any>();
    local.forEach(c => { if (c.phone) mergedMap.set(normalizePhone(c.phone), { ...c, phone: normalizePhone(c.phone) }); });
    dbCustomers.forEach(c => { if (c.phone) mergedMap.set(normalizePhone(c.phone), { ...c, phone: normalizePhone(c.phone) }); });

    const mergedList = Array.from(mergedMap.values());
    writeLocalCustomers(mergedList);

    for (const c of mergedList) {
      await pool.query(
        `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO UPDATE SET
           name = EXCLUDED.name,
           pin_hash = EXCLUDED.pin_hash,
           last_address = COALESCE(EXCLUDED.last_address, customers.last_address),
           recovery = COALESCE(EXCLUDED.recovery, customers.recovery)`,
        [
          c.phone,
          c.name,
          c.pinHash || c.pin_hash,
          c.lastAddress || c.last_address || '',
          c.recovery ? JSON.stringify(c.recovery) : null,
          c.createdAt || new Date().toISOString()
        ]
      );
    }
    console.log(`✅ Customer DB synced: ${mergedList.length} total customer(s) confirmed.`);
  } catch (err) {
    console.error('❌ Error initializing Postgres customers schema:', err);
  }
}

export async function findCustomerByPhone(phone: string) {
  const p = normalizePhone(phone);
  if (!p) return null;
  if (useDB) {
    try {
      const { rows } = await pool.query('SELECT * FROM customers WHERE phone=$1', [p]);
      if (rows && rows.length > 0) return rowToCustomer(rows[0]);
    } catch (e) {
      console.error('⚠️ DB findCustomerByPhone error, falling back to local storage:', e);
    }
  }
  const customers = readLocalCustomers();
  return customers.find((c: any) => normalizePhone(c.phone) === p) || null;
}

export async function createCustomer(c: any) {
  const record = {
    phone: normalizePhone(c.phone),
    name: String(c.name || '').trim(),
    pinHash: c.pinHash,
    lastAddress: c.lastAddress || '',
    recovery: c.recovery || null,
    createdAt: c.createdAt || new Date().toISOString()
  };

  // Always write locally
  const customers = readLocalCustomers();
  const existingIdx = customers.findIndex((x: any) => normalizePhone(x.phone) === record.phone);
  if (existingIdx >= 0) {
    customers[existingIdx] = { ...customers[existingIdx], ...record };
  } else {
    customers.push(record);
  }
  writeLocalCustomers(customers);

  if (useDB) {
    try {
      await pool.query(
        `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (phone) DO UPDATE SET
           name = EXCLUDED.name,
           pin_hash = EXCLUDED.pin_hash,
           last_address = EXCLUDED.last_address,
           recovery = EXCLUDED.recovery`,
        [record.phone, record.name, record.pinHash, record.lastAddress, record.recovery ? JSON.stringify(record.recovery) : null, record.createdAt]
      );
    } catch (e) {
      console.error('⚠️ Error writing customer to DB:', e);
    }
  }

  return record;
}

export async function updateCustomer(phone: string, fields: any) {
  const p = normalizePhone(phone);
  if (!p) return;

  // Always update local file
  const customers = readLocalCustomers();
  const c = customers.find((x: any) => normalizePhone(x.phone) === p);
  if (c) {
    Object.assign(c, fields);
    writeLocalCustomers(customers);
  }

  if (useDB) {
    try {
      const cols: Record<string, string> = { name: 'name', pinHash: 'pin_hash', lastAddress: 'last_address', recovery: 'recovery' };
      const sets: string[] = [], vals: any[] = [];
      let i = 1;
      for (const key of Object.keys(fields)) {
        if (!cols[key]) continue;
        sets.push(`${cols[key]}=$${i++}`);
        vals.push(key === 'recovery' ? (fields[key] ? JSON.stringify(fields[key]) : null) : fields[key]);
      }
      if (sets.length) {
        vals.push(p);
        await pool.query(`UPDATE customers SET ${sets.join(', ')} WHERE phone=$${i}`, vals);
      }
    } catch (e) {
      console.error('⚠️ Error updating customer in DB:', e);
    }
  }
}

export async function listCustomers() {
  if (useDB) {
    try {
      const { rows } = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
      if (rows && rows.length > 0) {
        const list = rows.map(rowToCustomer);
        // keep local file refreshed
        writeLocalCustomers(list);
        return list;
      }
    } catch (e) {
      console.error('⚠️ Error listing customers from DB, falling back to local file:', e);
    }
  }
  return readLocalCustomers();
}

export async function replaceAllCustomers(arr: any[]) {
  const normalized = (arr || []).map(c => ({
    ...c,
    phone: normalizePhone(c.phone)
  }));
  writeLocalCustomers(normalized);

  if (useDB) {
    try {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('DELETE FROM customers');
        for (const c of normalized) {
          await client.query(
            `INSERT INTO customers (phone, name, pin_hash, last_address, recovery, created_at)
             VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (phone) DO NOTHING`,
            [c.phone, c.name, c.pinHash || c.pin_hash, c.lastAddress || c.last_address || '', c.recovery ? JSON.stringify(c.recovery) : null, c.createdAt || new Date().toISOString()]
          );
        }
        await client.query('COMMIT');
      } catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    } catch (e) {
      console.error('⚠️ Error replacing all customers in DB:', e);
    }
  }
}

export default {
  useDB,
  initSchema,
  findCustomerByPhone,
  createCustomer,
  updateCustomer,
  listCustomers,
  replaceAllCustomers
};

