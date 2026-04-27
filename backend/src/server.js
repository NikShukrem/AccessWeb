import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { createServer } from 'http';
import { WebSocketServer } from 'ws';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = Number(process.env.PORT || 8080);
const JWT_SECRET = process.env.JWT_SECRET || 'change_me';
const DB_PATH = process.env.DB_PATH || './data/accessweb.db';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const NODE_ENV = process.env.NODE_ENV || 'development';

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

// Static files - serve frontend
app.use(express.static(join(__dirname, '../../')));

// CORS Configuration
app.use(cors({ origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN.split(',') }));
app.use(express.json({ limit: '2mb' }));

let db;

// WebSocket client registry - stores connected users
const wsClients = new Map(); // Map<userId, Set<WebSocket>>

const ROLE = {
  ADMIN: 'admin',
  CONTRACTS: 'contracts',
  FINANCE: 'finance'
};

// ============== HELPERS ==============

function createToken(user) {
  return jwt.sign({ id: user.id, login: user.login, role: user.role, name: user.name }, JWT_SECRET, { expiresIn: '12h' });
}

function auth(req, res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function allow(allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

function wsAuth(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function nowIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toNum(value, fallback = 0) {
  const n = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : fallback;
}

function normalizeState(value) {
  return String(value || '').trim().toLowerCase();
}

// Broadcast update to all connected clients
function broadcastUpdate(type, data) {
  const message = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
  
  for (const clientSet of wsClients.values()) {
    for (const ws of clientSet) {
      if (ws.readyState === 1) { // WebSocket.OPEN
        ws.send(message);
      }
    }
  }
}

// ============== DATABASE ==============

async function ensureSchema() {
  await db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','contracts','finance')),
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acid (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kti_number TEXT,
      name TEXT,
      status TEXT,
      amount REAL DEFAULT 0,
      created_date TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT,
      contract_name TEXT,
      stage TEXT,
      amount REAL DEFAULT 0,
      due_date TEXT,
      responsible TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS finance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      operation_date TEXT,
      description TEXT,
      amount_rub REAL DEFAULT 0,
      amount_usd REAL DEFAULT 0,
      rate REAL DEFAULT 0,
      state TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
}

async function ensureUsers() {
  const users = [
    { login: 'admin', password: 'admin123', role: ROLE.ADMIN, name: 'Администратор' },
    { login: 'contracts', password: 'contracts123', role: ROLE.CONTRACTS, name: 'Договоры' },
    { login: 'finance', password: 'finance123', role: ROLE.FINANCE, name: 'Финансы' }
  ];

  for (const u of users) {
    const existing = await db.get('SELECT id FROM users WHERE login = ?', u.login);
    if (!existing) {
      const hash = await bcrypt.hash(u.password, 10);
      await db.run(
        'INSERT INTO users (login, name, role, password_hash) VALUES (?, ?, ?, ?)',
        u.login,
        u.name,
        u.role,
        hash
      );
    }
  }
}

async function ensureSeedData() {
  const row = await db.get('SELECT COUNT(*) as c FROM acid');
  if ((row?.c || 0) > 0) return;

  const statuses = ['Новая', 'В процессе', 'Готова', 'Доставлена'];
  const stages = ['Подготовка', 'Согласование', 'Исполнение', 'Завершена'];
  const companies = ['ООО Логистика Pro', 'ЗАО Global Trading', 'АО Export Plus', 'ООО Cargo World'];

  for (let i = 1; i <= 40; i += 1) {
    const kti = `КТИ-${String(i).padStart(5, '0')}`;
    const createdDate = new Date(Date.now() - Math.random() * 120 * 86400000).toISOString().slice(0, 10);
    const amount = Number((Math.random() * 100000 + 15000).toFixed(2));

    const acidPayload = {
      'Номер КТИ': kti,
      'Наименование': `Грузоперевозка ${i}`,
      'Статус': statuses[Math.floor(Math.random() * statuses.length)],
      'Стоимость Груза': amount,
      'Дата создания': createdDate
    };

    await db.run(
      `INSERT INTO acid (kti_number, name, status, amount, created_date, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      kti,
      acidPayload['Наименование'],
      acidPayload['Статус'],
      amount,
      createdDate,
      JSON.stringify(acidPayload)
    );

    const due = new Date(Date.now() + (Math.random() * 80 - 25) * 86400000).toISOString().slice(0, 10);
    const contractAmount = Number((Math.random() * 300000 + 20000).toFixed(2));
    const contractPayload = {
      'Номер': `DOG-${String(i).padStart(4, '0')}`,
      'Предмет': `Договор поставки ${i}`,
      'Стадия договора': stages[Math.floor(Math.random() * stages.length)],
      'Сумма оплаты': contractAmount,
      'Срок стадии': due,
      'Ответственный стадии': companies[Math.floor(Math.random() * companies.length)]
    };

    await db.run(
      `INSERT INTO contracts (contract_number, contract_name, stage, amount, due_date, responsible, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      contractPayload['Номер'],
      contractPayload['Предмет'],
      contractPayload['Стадия договора'],
      contractAmount,
      due,
      contractPayload['Ответственный стадии'],
      JSON.stringify(contractPayload)
    );

    const opDate = new Date(Date.now() - Math.random() * 120 * 86400000).toISOString().slice(0, 10);
    const amountRub = Number((Math.random() * 800000 + 30000).toFixed(2));
    const amountUsd = Number((amountRub / 95).toFixed(2));
    const states = ['План', 'Оплачено', 'Ожидание'];
    const state = states[Math.floor(Math.random() * states.length)];

    const financePayload = {
      'Дата расхода': opDate,
      'Описание': `Платеж ${i}`,
      'Сумма (RUB)': amountRub,
      'Перевод в USD': amountUsd,
      'Состояние': state
    };

    await db.run(
      `INSERT INTO finance (operation_date, description, amount_rub, amount_usd, rate, state, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      opDate,
      financePayload['Описание'],
      amountRub,
      amountUsd,
      95,
      state,
      JSON.stringify(financePayload)
    );
  }
}

function parsePayload(row) {
  try {
    return JSON.parse(row.payload_json || '{}');
  } catch {
    return {};
  }
}

function buildAcidRecord(row) {
  return { id: row.id, ...parsePayload(row) };
}

function buildContractRecord(row) {
  return { id: row.id, ...parsePayload(row) };
}

function buildFinanceRecord(row) {
  return { id: row.id, ...parsePayload(row) };
}

async function listRows(table, mapper) {
  const rows = await db.all(`SELECT * FROM ${table} ORDER BY id DESC`);
  return rows.map(mapper);
}

// ============== REST API ==============

app.get('/api/health', async (_req, res) => {
  const users = await db.get('SELECT COUNT(*) as c FROM users');
  res.json({ ok: true, service: 'accessweb-backend', users: users?.c || 0, ts: new Date().toISOString() });
});

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'login and password are required' });

  const user = await db.get('SELECT * FROM users WHERE login = ?', login);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const ok = await bcrypt.compare(password, user.password_hash);
  if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

  const token = createToken(user);
  res.json({ token, user: { id: user.id, login: user.login, role: user.role, name: user.name } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.get('SELECT id, login, name, role FROM users WHERE id = ?', req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({ user });
});

app.get('/api/users', auth, allow([ROLE.ADMIN]), async (_req, res) => {
  const users = await db.all('SELECT id, login, name, role, created_at FROM users ORDER BY id');
  res.json({ users });
});

app.put('/api/users/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isFinite(id)) return res.status(400).json({ error: 'Invalid id' });

  const current = await db.get('SELECT * FROM users WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'User not found' });

  const role = req.body.role || current.role;
  const name = req.body.name || current.name;
  if (![ROLE.ADMIN, ROLE.CONTRACTS, ROLE.FINANCE].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  await db.run('UPDATE users SET role = ?, name = ? WHERE id = ?', role, name, id);
  const user = await db.get('SELECT id, login, name, role FROM users WHERE id = ?', id);
  res.json({ user });
});

// ACID endpoints
app.get('/api/acid', auth, allow([ROLE.ADMIN, ROLE.CONTRACTS, ROLE.FINANCE]), async (_req, res) => {
  const records = await listRows('acid', buildAcidRecord);
  res.json({ records });
});

app.post('/api/acid', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const payload = req.body?.payload || {};
  const kti = payload['Номер КТИ'] || payload['омер Т'] || '';
  const name = payload['Наименование'] || payload['Название'] || payload['азвание'] || '';
  const status = payload['Статус'] || '';
  const amount = toNum(payload['Стоимость Груза'] ?? payload['Сумма']);
  const createdDate = payload['Дата создания'] || nowIsoDate();

  const result = await db.run(
    `INSERT INTO acid (kti_number, name, status, amount, created_date, payload_json)
     VALUES (?, ?, ?, ?, ?, ?)`,
    kti,
    name,
    status,
    amount,
    createdDate,
    JSON.stringify(payload)
  );

  const row = await db.get('SELECT * FROM acid WHERE id = ?', result.lastID);
  const record = buildAcidRecord(row);
  
  // Broadcast to all connected clients
  broadcastUpdate('acid_created', record);
  
  res.status(201).json({ record });
});

app.put('/api/acid/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM acid WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  const payload = req.body?.payload || parsePayload(current);
  const kti = payload['Номер КТИ'] || payload['омер Т'] || current.kti_number || '';
  const name = payload['Наименование'] || payload['Название'] || payload['азвание'] || current.name || '';
  const status = payload['Статус'] || current.status || '';
  const amount = toNum(payload['Стоимость Груза'] ?? payload['Сумма'], current.amount || 0);
  const createdDate = payload['Дата создания'] || current.created_date || nowIsoDate();

  await db.run(
    `UPDATE acid
     SET kti_number = ?, name = ?, status = ?, amount = ?, created_date = ?, payload_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
    kti,
    name,
    status,
    amount,
    createdDate,
    JSON.stringify(payload),
    id
  );

  const row = await db.get('SELECT * FROM acid WHERE id = ?', id);
  const record = buildAcidRecord(row);
  
  // Broadcast to all connected clients
  broadcastUpdate('acid_updated', record);
  
  res.json({ record });
});

app.delete('/api/acid/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM acid WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  await db.run('DELETE FROM acid WHERE id = ?', id);
  
  // Broadcast to all connected clients
  broadcastUpdate('acid_deleted', { id });
  
  res.json({ success: true });
});

// Contracts endpoints
app.get('/api/contracts', auth, allow([ROLE.ADMIN, ROLE.CONTRACTS]), async (_req, res) => {
  const records = await listRows('contracts', buildContractRecord);
  res.json({ records });
});

app.post('/api/contracts', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const payload = req.body?.payload || {};
  const number = payload['Номер'] || payload['омер Т'] || '';
  const name = payload['Предмет'] || payload['Название договора'] || payload['азвание договора'] || '';
  const stage = payload['Стадия договора'] || payload['Стадия'] || '';
  const amount = toNum(payload['Сумма оплаты'] ?? payload['Сумма']);
  const due = payload['Срок стадии'] || payload['Срок'] || nowIsoDate();
  const responsible = payload['Ответственный стадии'] || payload['тветственный'] || '';

  const result = await db.run(
    `INSERT INTO contracts (contract_number, contract_name, stage, amount, due_date, responsible, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    number,
    name,
    stage,
    amount,
    due,
    responsible,
    JSON.stringify(payload)
  );

  const row = await db.get('SELECT * FROM contracts WHERE id = ?', result.lastID);
  const record = buildContractRecord(row);
  
  broadcastUpdate('contracts_created', record);
  
  res.status(201).json({ record });
});

app.put('/api/contracts/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM contracts WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  const payload = req.body?.payload || parsePayload(current);
  const number = payload['Номер'] || payload['омер Т'] || current.contract_number || '';
  const name = payload['Предмет'] || payload['Название договора'] || payload['азвание договора'] || current.contract_name || '';
  const stage = payload['Стадия договора'] || payload['Стадия'] || current.stage || '';
  const amount = toNum(payload['Сумма оплаты'] ?? payload['Сумма'], current.amount || 0);
  const due = payload['Срок стадии'] || payload['Срок'] || current.due_date || nowIsoDate();
  const responsible = payload['Ответственный стадии'] || payload['тветственный'] || current.responsible || '';

  await db.run(
    `UPDATE contracts
     SET contract_number = ?, contract_name = ?, stage = ?, amount = ?, due_date = ?, responsible = ?, payload_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
    number,
    name,
    stage,
    amount,
    due,
    responsible,
    JSON.stringify(payload),
    id
  );

  const row = await db.get('SELECT * FROM contracts WHERE id = ?', id);
  const record = buildContractRecord(row);
  
  broadcastUpdate('contracts_updated', record);
  
  res.json({ record });
});

app.delete('/api/contracts/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM contracts WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  await db.run('DELETE FROM contracts WHERE id = ?', id);
  
  broadcastUpdate('contracts_deleted', { id });
  
  res.json({ success: true });
});

// Finance endpoints
app.get('/api/finance', auth, allow([ROLE.ADMIN, ROLE.FINANCE]), async (_req, res) => {
  const records = await listRows('finance', buildFinanceRecord);
  res.json({ records });
});

app.post('/api/finance', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const payload = req.body?.payload || {};
  const operationDate = payload['Дата расхода'] || payload['Дата'] || payload['ата операции'] || nowIsoDate();
  const description = payload['Описание'] || payload['писание'] || '';
  const amountRub = toNum(payload['Сумма (RUB)'] ?? payload['Сумма']);
  const amountUsd = toNum(payload['Перевод в USD'] ?? payload['Сумма (USD)']);
  const rate = toNum(payload['Курс'] ?? payload['урс'], 0);
  const state = payload['Состояние'] || payload['Статус'] || 'План';

  const result = await db.run(
    `INSERT INTO finance (operation_date, description, amount_rub, amount_usd, rate, state, payload_json)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    operationDate,
    description,
    amountRub,
    amountUsd,
    rate,
    state,
    JSON.stringify(payload)
  );

  const row = await db.get('SELECT * FROM finance WHERE id = ?', result.lastID);
  const record = buildFinanceRecord(row);
  
  broadcastUpdate('finance_created', record);
  
  res.status(201).json({ record });
});

app.put('/api/finance/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM finance WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  const payload = req.body?.payload || parsePayload(current);
  const operationDate = payload['Дата расхода'] || payload['Дата'] || payload['ата операции'] || current.operation_date || nowIsoDate();
  const description = payload['Описание'] || payload['писание'] || current.description || '';
  const amountRub = toNum(payload['Сумма (RUB)'] ?? payload['Сумма'], current.amount_rub || 0);
  const amountUsd = toNum(payload['Перевод в USD'] ?? payload['Сумма (USD)'], current.amount_usd || 0);
  const rate = toNum(payload['Курс'] ?? payload['урс'], current.rate || 0);
  const state = payload['Состояние'] || payload['Статус'] || current.state || 'План';

  await db.run(
    `UPDATE finance
     SET operation_date = ?, description = ?, amount_rub = ?, amount_usd = ?, rate = ?, state = ?, payload_json = ?, updated_at = datetime('now')
     WHERE id = ?`,
    operationDate,
    description,
    amountRub,
    amountUsd,
    rate,
    state,
    JSON.stringify(payload),
    id
  );

  const row = await db.get('SELECT * FROM finance WHERE id = ?', id);
  const record = buildFinanceRecord(row);
  
  broadcastUpdate('finance_updated', record);
  
  res.json({ record });
});

app.delete('/api/finance/:id', auth, allow([ROLE.ADMIN]), async (req, res) => {
  const id = Number(req.params.id);
  const current = await db.get('SELECT * FROM finance WHERE id = ?', id);
  if (!current) return res.status(404).json({ error: 'Record not found' });

  await db.run('DELETE FROM finance WHERE id = ?', id);
  
  broadcastUpdate('finance_deleted', { id });
  
  res.json({ success: true });
});

app.get('/api/dashboard/stats', auth, allow([ROLE.ADMIN, ROLE.CONTRACTS, ROLE.FINANCE]), async (_req, res) => {
  const acid = await db.get('SELECT COUNT(*) as c FROM acid');
  const contracts = await db.get('SELECT COUNT(*) as c FROM contracts');
  const finance = await db.get('SELECT COUNT(*) as c FROM finance');
  const overdue = await db.get(
    `SELECT COUNT(*) as c FROM contracts
     WHERE date(due_date) < date('now')`
  );

  res.json({
    acidCount: acid?.c || 0,
    contractsCount: contracts?.c || 0,
    financeCount: finance?.c || 0,
    overdueCount: overdue?.c || 0
  });
});

app.get('/api/dashboard/finance-trends', auth, allow([ROLE.ADMIN, ROLE.CONTRACTS, ROLE.FINANCE]), async (req, res) => {
  const months = Math.max(3, Math.min(24, Number(req.query.months || 12)));
  const rows = await db.all(
    `SELECT operation_date, amount_usd, state FROM finance
     WHERE date(operation_date) >= date('now', ?)
     ORDER BY operation_date ASC`,
    `-${months} months`
  );

  const buckets = new Map();
  for (const row of rows) {
    if (!row.operation_date) continue;
    const key = String(row.operation_date).slice(0, 7);
    if (!buckets.has(key)) {
      buckets.set(key, { month: key, debtUsd: 0, paymentsUsd: 0, servicesUsd: 0 });
    }

    const item = buckets.get(key);
    const usd = Number(row.amount_usd || 0);
    const state = normalizeState(row.state);

    item.servicesUsd += usd;
    if (['оплачено', 'paid', 'payment'].includes(state)) item.paymentsUsd += usd;
    if (['ожидание', 'план', 'debt', 'pending', 'plan'].includes(state)) item.debtUsd += usd;
  }

  const trend = Array.from(buckets.values()).sort((a, b) => a.month.localeCompare(b.month));
  res.json({ trend });
});

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============== WEBSOCKET ==============

wss.on('connection', (ws, req) => {
  const clientId = uuidv4();
  let user = null;

  // Handle incoming messages
  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);

      if (message.type === 'auth') {
        // Authenticate WebSocket connection
        user = wsAuth(message.token);
        if (!user) {
          ws.send(JSON.stringify({ type: 'auth_failed', error: 'Invalid token' }));
          ws.close();
          return;
        }

        // Register client
        if (!wsClients.has(user.id)) {
          wsClients.set(user.id, new Set());
        }
        wsClients.get(user.id).add(ws);

        ws.send(JSON.stringify({ 
          type: 'auth_success', 
          user: { id: user.id, login: user.login, role: user.role } 
        }));

        console.log(`✅ User ${user.login} connected via WebSocket`);
      }
    } catch (err) {
      console.error('WebSocket message error:', err);
    }
  });

  ws.on('close', () => {
    if (user && wsClients.has(user.id)) {
      wsClients.get(user.id).delete(ws);
      if (wsClients.get(user.id).size === 0) {
        wsClients.delete(user.id);
      }
      console.log(`🔌 User ${user?.login} disconnected`);
    }
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

// ============== STARTUP ==============

async function start() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await ensureSchema();
  await ensureUsers();
  await ensureSeedData();

  httpServer.listen(PORT, () => {
    console.log(`✅ AccessWeb backend running on http://localhost:${PORT}`);
    console.log(`🔌 WebSocket server available at ws://localhost:${PORT}/ws`);
    console.log(`📊 API documentation: http://localhost:${PORT}/api/*`);
  });
}

start().catch((e) => {
  console.error('❌ Failed to start backend', e);
  process.exit(1);
});
