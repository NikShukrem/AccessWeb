import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import bcryptjs from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { v4 as uuidv4 } from 'uuid';
import fs from 'fs';
import multer from 'multer';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from backend directory
try {
  const require = createRequire(import.meta.url);
  const dotenv = require('dotenv');
  dotenv.config({ path: join(__dirname, '../.env') });
} catch { /* dotenv optional */ }

// Prevent unhandled rejections from crashing the process
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err);
});

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || join(__dirname, '../data/accessweb.db');
const UPLOADS_DIR = join(__dirname, '../data/uploads');

let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = 'dev-only-change-me-set-JWT_SECRET-in-env';
  console.warn('WARNING: JWT_SECRET not set in environment. Using insecure default.');
}

const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(s => s.trim())
  : [
      'http://localhost:8080',
      'http://127.0.0.1:8080',
      'https://nikshukrem.github.io'    // GitHub Pages frontend
    ];

// Column whitelist per table — prevents SQL injection via column names from request body
const ALLOWED_COLUMNS = {
  acid: new Set([
    'acid', 'ais_number', 'initial_request_number', 'shipment_type',
    'shipper_id', 'shipper', 'supplier_id', 'supplier',
    'importer_name', 'registration_number', 'vat_number',
    'name', 'gw_kg', 'packages_qty', 'containers_qty',
    'transport_type', 'cargo_cost', 'currency', 'shipping_cost',
    'incoterms', 'departure_country', 'departure_port', 'delivery_place', 'arrival_place',
    'vessel', 'shipping_line', 'bol_number', 'bol_date', 'carrier', 'forwarder',
    'etd', 'eta', 'delivery_date', 'egypt_arrival_date',
    'release_request_date', 'release_curator', 'release_received_date',
    'do_released', 'import_mode',
    'dt_number', 'dt_date', 'dt_release_date', 'delivery_to_site_date', 'custom_status',
    'purpose', 'upo_curator_id', 'upo_curator',
    'invoice_uploaded', 'extended_to',
    'status', 'responsible_id', 'responsible',
    'notes', 'comment',
    'contract_id', 'contract_number'
  ]),
  contracts: new Set([
    'contract_number', 'type', 'counterparty_id', 'counterparty',
    'name', 'contract_date', 'validity_period',
    'ds_number', 'ds_date',
    'amount', 'amount_with_ds', 'currency', 'paid_amount',
    'route_to', 'procurement_type', 'lot_number',
    'status', 'currency_control', 'notes', 'link', 'limit_balance',
    'responsible_id', 'responsible'
  ]),
  contract_stages: new Set([
    'contract_id', 'stage_number', 'stage_name', 'substage_name',
    'responsible_id', 'responsible',
    'planned_date', 'actual_date',
    'status', 'notes', 'sort_order'
  ]),
  counterparties: new Set([
    'name', 'short_name', 'country', 'type',
    'registration_number', 'vat_number',
    'contact_person', 'email', 'phone', 'notes',
    'is_active'
  ]),
  ais_transactions: new Set([
    'date', 'number', 'expense_date', 'kti_date',
    'currency', 'amount', 'amount_usd',
    'organization',
    'counterparty', 'counterparty_short', 'counterparty_id',
    'contract_number', 'contract_date', 'contract_id',
    'project', 'status', 'cfo',
    'responsible', 'responsible_id',
    'urgent', 'acid_link', 'kti_id', 'ais_import_id'
  ]),
  acid_kti: new Set([
    'acid', 'kti_date', 'kti_number', 'contract_ds_number',
    'amount_usd', 'ais_number', 'notes'
  ]),
  ais_imports: new Set([
    'file_name', 'table_type', 'total_rows', 'imported_rows', 'skipped_rows',
    'errors', 'imported_by'
  ])
};

const VALID_TABLES = new Set([
  'acid', 'contracts', 'contract_stages',
  'counterparties', 'ais_transactions', 'acid_kti', 'ais_imports'
]);

let db = null;

// ============== APP SETUP ==============

const app = express();

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net"],
      scriptSrcAttr: ["'unsafe-inline'"], // allow onclick= handlers in HTML
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
    }
  }
}));

app.use(compression());

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (same-origin, mobile apps, curl)
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('CORS: origin not allowed'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: '10mb' }));

// Stricter rate limit for login attempts
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  message: { error: 'Слишком много попыток входа. Попробуйте через 15 минут.' },
  standardHeaders: true,
  legacyHeaders: false
});

// General API rate limit — 300 req/min is plenty for 10 concurrent users
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/auth/login', authLimiter);
app.use(apiLimiter);

app.get('/health', (req, res) => res.json({ ok: true }));

// index.html and sw.js must never be served from cache — clients must always get the latest version
app.get(['/sw.js'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(join(__dirname, '../../sw.js'));
});

app.get(['/', '/index.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(join(__dirname, '../../index.html'));
});

// Lightweight standalone page for the Egypt role — no charting/import libraries
app.get(['/egypt.html'], (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.sendFile(join(__dirname, '../../egypt.html'));
});

// ============== DB INIT ==============

async function initDB() {
  const dataDir = join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
  if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  }

  db = await open({ filename: DB_PATH, driver: sqlite3.Database });

  // WAL mode: allows concurrent reads alongside one writer — perfect for 10 users
  await db.exec('PRAGMA journal_mode=WAL');
  // Wait up to 5 seconds if DB is locked instead of failing immediately
  await db.exec('PRAGMA busy_timeout=5000');
  // NORMAL sync is safe with WAL and much faster than FULL
  await db.exec('PRAGMA synchronous=NORMAL');
  await db.exec('PRAGMA foreign_keys=ON');
  // Cache 8 MB in memory for faster reads
  await db.exec('PRAGMA cache_size=-8000');

  // Run migrations before schema so old tables are dropped/renamed first
  await runMigrations();

  const schema = fs.readFileSync(join(__dirname, '../data/schema.sql'), 'utf8');
  await db.exec(schema);

  // Seed default users if not present
  await seedUsers();

  console.log('Database ready:', DB_PATH);
}

async function runMigrations() {
  // Check whether we need to migrate from the old Cyrillic-column schema to the
  // new normalized English-column schema. The presence of the "counterparties"
  // table is the migration-version marker.
  const hasNewSchema = await db.get(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='counterparties'"
  );

  if (!hasNewSchema) {
    console.log('Migration: upgrading to v3.1 normalized schema…');

    // Drop old tables in reverse-dependency order so FK constraints do not block
    await db.exec('PRAGMA foreign_keys=OFF');

    const oldTables = [
      'notifications',
      'finance',
      'contract_stages',
      'acid',
      'contracts',
      'users',         // will be recreated by schema.sql — no data to preserve yet
    ];

    for (const t of oldTables) {
      await db.exec(`DROP TABLE IF EXISTS "${t}"`);
      console.log(`Migration: dropped old table "${t}"`);
    }

    await db.exec('PRAGMA foreign_keys=ON');
    console.log('Migration: old tables dropped, new schema will be applied by schema.sql');
  }

  // Rename the generic "Директор" placeholder to an actual person's name on already-seeded installs
  const hasUsersTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='users'");
  if (hasUsersTable) {
    await db.run(
      "UPDATE users SET name = 'Соколова Виктория Андреевна' WHERE login = 'director' AND name = 'Директор'"
    );
  }

  // The notifications table predates the tasks feature — its entity_type CHECK constraint
  // doesn't allow 'task' on installs that already had the table, so every task notification
  // insert has been silently failing. Rebuild the table with the updated constraint.
  const notifTable = await db.get("SELECT sql FROM sqlite_master WHERE type='table' AND name='notifications'");
  if (notifTable && !notifTable.sql.includes("'task'")) {
    console.log('Migration: rebuilding notifications table to allow entity_type=task...');
    await db.exec('PRAGMA foreign_keys=OFF');
    await db.exec(`
      CREATE TABLE notifications_new (
        id TEXT PRIMARY KEY,
        user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
        title TEXT,
        message TEXT,
        type TEXT DEFAULT 'info' CHECK(type IN ('info','warning','error','success')),
        entity_type TEXT CHECK(entity_type IN ('contract','cargo','transaction','stage','task')),
        entity_id TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await db.exec('INSERT INTO notifications_new SELECT * FROM notifications');
    await db.exec('DROP TABLE notifications');
    await db.exec('ALTER TABLE notifications_new RENAME TO notifications');
    await db.exec('PRAGMA foreign_keys=ON');
    console.log('Migration: notifications table rebuilt.');
  }

  // Add the forwarder (экспедитор) column to acid on installs that predate it
  const hasAcidTable = await db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='acid'");
  if (hasAcidTable) {
    const acidColumns = await db.all('PRAGMA table_info(acid)');
    if (!acidColumns.some(c => c.name === 'forwarder')) {
      await db.exec('ALTER TABLE acid ADD COLUMN forwarder TEXT');
      console.log('Migration: added acid.forwarder column.');
    }
  }
}

async function seedUsers() {
  const admin = await db.get("SELECT id FROM users WHERE login = 'admin'");
  if (!admin) {
    const hash = await bcryptjs.hash('admin123', 10);
    await db.run(
      `INSERT INTO users (id, login, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'admin', hash, 'Администратор', 'admin']
    );
    console.log('Default admin user created');
  }

  const egypt = await db.get("SELECT id FROM users WHERE login = 'egypt'");
  if (!egypt) {
    const hash = await bcryptjs.hash('egypt2024', 10);
    await db.run(
      `INSERT INTO users (id, login, password_hash, name, role, is_egypt_mode) VALUES (?, ?, ?, ?, ?, ?)`,
      [uuidv4(), 'egypt', hash, 'Сотрудник (Египет)', 'egypt', 1]
    );
    console.log('Egypt user created (login: egypt / egypt2024)');
  }

  const coreUsers = [
    { login: 'director',    password: 'director123',  name: 'Соколова Виктория Андреевна', role: 'director' },
    { login: 'logistics',   password: 'logistics123', name: 'Логистическая поддержка',  role: 'logistics_support' },
    { login: 'analytics',   password: 'analytics123', name: 'Информационная аналитика', role: 'info_analytics' },
    { login: 'oplogistics', password: 'oplog123',     name: 'Оперативная логистика',    role: 'operational_logistics' },
  ];

  for (const u of coreUsers) {
    const exists = await db.get('SELECT id FROM users WHERE login = ?', u.login);
    if (!exists) {
      const hash = await bcryptjs.hash(u.password, 10);
      await db.run(
        `INSERT INTO users (id, login, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
        [uuidv4(), u.login, hash, u.name, u.role]
      );
      console.log(`User created: ${u.login} / ${u.password} (${u.role})`);
    }
  }

  // Demo/test employees — optional. Delete backend/seed/ to stop provisioning these.
  try {
    const { default: demoEmployees } = await import('../seed/demoEmployees.js');
    for (const u of demoEmployees) {
      const exists = await db.get('SELECT id FROM users WHERE login = ?', u.login);
      if (!exists) {
        const hash = await bcryptjs.hash(u.password, 10);
        await db.run(
          `INSERT INTO users (id, login, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
          [uuidv4(), u.login, hash, u.name, u.role]
        );
        console.log(`Demo user created: ${u.login} / ${u.password} (${u.role})`);
      }
    }
  } catch {
    // backend/seed/demoEmployees.js not present — demo employees intentionally skipped
  }
}

// ============== MIDDLEWARE ==============

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Токен недействителен или истёк' });
  }
}

// Role-based access control
// tables: '*' = all tables, array = whitelist of allowed tables
// write:  true = all tables, array = only listed tables, false = read-only
// import: true = all tables, array = only listed tables, false = not allowed
// delete: true = allowed, false = not allowed (only admin)
const ROLE_PERMISSIONS = {
  admin: {
    tables: '*',
    write: true,
    import: true,
    delete: true
  },
  director: {
    tables: '*',
    write: true,
    import: false,
    delete: false
  },
  logistics_support: {
    tables: ['contracts', 'contract_stages', 'counterparties', 'ais_transactions', 'acid', 'acid_kti'],
    write: ['contracts', 'contract_stages', 'counterparties', 'ais_transactions'],
    import: ['ais_transactions'],
    delete: false
  },
  info_analytics: {
    tables: '*',
    write: ['acid', 'contracts', 'contract_stages', 'counterparties', 'ais_transactions', 'acid_kti'],
    import: true,
    delete: false
  },
  operational_logistics: {
    tables: ['acid', 'acid_kti', 'contracts', 'ais_transactions', 'counterparties'],
    write: ['acid', 'acid_kti'],
    import: ['acid', 'acid_kti'],
    delete: false
  },
  egypt: {
    tables: ['acid'],
    write: ['acid'],
    import: ['acid'],
    delete: ['acid']
  },
};

function checkAccess(req, res, next) {
  const role = req.user.role;
  const table = req.params.table;
  const perm = ROLE_PERMISSIONS[role];

  if (!perm) return res.status(403).json({ error: 'Роль не найдена' });

  // Table access check
  if (table && perm.tables !== '*' && !perm.tables.includes(table)) {
    return res.status(403).json({ error: 'Нет доступа к этой таблице' });
  }

  const isWrite = ['POST', 'PUT', 'PATCH'].includes(req.method);
  const isDelete = req.method === 'DELETE';

  if (isDelete) {
    if (perm.delete === false) {
      return res.status(403).json({ error: 'Удаление запрещено для вашей роли' });
    }
    if (Array.isArray(perm.delete) && table && !perm.delete.includes(table)) {
      return res.status(403).json({ error: 'Удаление в эту таблицу запрещено' });
    }
  }

  if (isWrite) {
    if (perm.write === false) return res.status(403).json({ error: 'Только чтение' });
    if (Array.isArray(perm.write) && table && !perm.write.includes(table)) {
      return res.status(403).json({ error: 'Нет прав на запись в эту таблицу' });
    }
  }

  next();
}

function checkImport(req, res, next) {
  const role = req.user.role;
  const table = req.params.table;
  const perm = ROLE_PERMISSIONS[role];

  if (!perm) return res.status(403).json({ error: 'Роль не найдена' });

  if (perm.import === false) return res.status(403).json({ error: 'Импорт запрещён' });
  if (Array.isArray(perm.import) && !perm.import.includes(table)) {
    return res.status(403).json({ error: 'Импорт в эту таблицу запрещён' });
  }

  next();
}

function canReadTable(role, table) {
  const perm = ROLE_PERMISSIONS[role];
  if (!perm) return false;
  return perm.tables === '*' || perm.tables.includes(table);
}

function canWriteTable(role, table) {
  if (!canReadTable(role, table)) return false;
  const perm = ROLE_PERMISSIONS[role];
  return perm.write === true || (Array.isArray(perm.write) && perm.write.includes(table));
}

function canDeleteTable(role, table) {
  if (!canReadTable(role, table)) return false;
  const perm = ROLE_PERMISSIONS[role];
  return perm.delete === true || (Array.isArray(perm.delete) && perm.delete.includes(table));
}

function sanitizeColumns(table, data) {
  const allowed = ALLOWED_COLUMNS[table];
  if (!allowed) return {};
  return Object.fromEntries(
    Object.entries(data)
      .filter(([k]) => allowed.has(k))
      // Empty text inputs arrive as '' — treat as "not set" so optional
      // foreign-key columns (e.g. acid_link) don't fail FK constraints.
      .map(([k, v]) => [k, v === '' ? null : v])
  );
}

const NUMERIC_FIELDS = {
  acid:             new Set(['gw_kg','packages_qty','containers_qty','cargo_cost','shipping_cost','invoice_uploaded']),
  contracts:        new Set(['amount','amount_with_ds','paid_amount','limit_balance']),
  ais_transactions: new Set(['amount','amount_usd','urgent']),
  acid_kti:         new Set(['amount_usd']),
};

function castNumericFields(table, data) {
  const fields = NUMERIC_FIELDS[table];
  if (!fields) return data;
  const result = { ...data };
  for (const [k, v] of Object.entries(result)) {
    if (fields.has(k) && v !== '' && v !== null && v !== undefined) {
      const n = Number(v);
      if (!isNaN(n)) result[k] = n;
      else delete result[k]; // drop non-numeric strings for numeric columns
    }
  }
  return result;
}

// The field that best identifies a row to a human reading the audit log
const RECORD_LABEL_FIELD = {
  acid: 'acid',
  contracts: 'contract_number',
  contract_stages: 'stage_name',
  counterparties: 'name',
  ais_transactions: 'number',
  acid_kti: 'kti_number',
  ais_imports: 'file_name',
};

// Records every create/update/delete/upload/download so who-did-what-when can be
// reconstructed later. Never throws — a logging failure must not block the
// actual operation it's describing.
async function logAudit(req, action, table, recordId, { changes, label } = {}) {
  try {
    await db.run(
      `INSERT INTO audit_log (id, user_id, user_name, user_role, action, table_name, record_id, record_label, changes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        req.user?.id || null,
        req.user?.name || null,
        req.user?.role || null,
        action,
        table,
        recordId || null,
        label || null,
        changes ? JSON.stringify(changes) : null
      ]
    );
  } catch (err) {
    console.error('Audit log write failed:', err);
  }
}

// ============== AUTH ==============

app.post('/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;
    if (!login || !password) {
      return res.status(400).json({ error: 'Введите логин и пароль' });
    }

    const user = await db.get('SELECT * FROM users WHERE login = ?', [login.trim()]);
    if (!user) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const isValid = await bcryptjs.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Неверный логин или пароль' });

    const payload = {
      id: user.id,
      login: user.login,
      name: user.name,
      role: user.role,
      is_egypt_mode: Boolean(user.is_egypt_mode)
    };

    const token = jwt.sign(payload, JWT_SECRET, { expiresIn: '12h' });

    res.json({
      token,
      user: { ...payload }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/auth/refresh', auth, (req, res) => {
  const { id, login, name, role, is_egypt_mode } = req.user;
  const token = jwt.sign({ id, login, name, role, is_egypt_mode }, JWT_SECRET, { expiresIn: '12h' });
  res.json({ token });
});

app.get('/auth/me', auth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, login, name, role, department, is_egypt_mode FROM users WHERE id = ?',
      [req.user.id]
    );
    if (!user) return res.status(404).json({ error: 'Пользователь не найден' });
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== DASHBOARD ==============

app.get('/dashboard', auth, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const role  = req.user.role;
    const perm  = ROLE_PERMISSIONS[role] || {};

    // Determine what this role can see on the dashboard
    const canSeeContracts     = perm.tables === '*' || (Array.isArray(perm.tables) && perm.tables.includes('contracts'));
    const canSeeTransactions  = perm.tables === '*' || (Array.isArray(perm.tables) && perm.tables.includes('ais_transactions'));

    const cargoStatsPromise = db.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) AS in_transit,
        SUM(CASE WHEN status = 'customs'    THEN 1 ELSE 0 END) AS customs,
        SUM(CASE WHEN status = 'delivered'  THEN 1 ELSE 0 END) AS delivered,
        SUM(CASE WHEN eta < ? AND status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS overdue
      FROM acid
    `, [today]);

    const recentCargosPromise = db.all(`SELECT * FROM acid ORDER BY created_at DESC LIMIT 5`);

    const contractStatsPromise = canSeeContracts ? db.get(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'active'  THEN 1 ELSE 0 END) AS active,
        SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) AS expired,
        COALESCE(SUM(amount), 0)        AS total_amount,
        COALESCE(SUM(paid_amount), 0)   AS total_paid,
        COALESCE(SUM(limit_balance), 0) AS limit_balance_sum
      FROM contracts
    `) : Promise.resolve(null);

    const transactionStatsPromise = canSeeTransactions ? db.get(`
      SELECT
        COALESCE(SUM(amount_usd), 0)                                               AS total_usd,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_usd ELSE 0 END), 0)  AS pending_usd,
        SUM(CASE WHEN urgent = 1 THEN 1 ELSE 0 END)                                AS urgent_count
      FROM ais_transactions
    `) : Promise.resolve(null);

    const overdueStagesPromise = canSeeContracts ? db.all(`
      SELECT c.contract_number, cs.stage_name, cs.planned_date, cs.responsible,
        CAST(julianday(?) - julianday(cs.planned_date) AS INTEGER) AS days_overdue
      FROM contract_stages cs
      JOIN contracts c ON c.id = cs.contract_id
      WHERE cs.status NOT IN ('completed')
        AND cs.planned_date < ? AND cs.planned_date IS NOT NULL AND cs.planned_date != ''
      ORDER BY cs.planned_date ASC LIMIT 5
    `, [today, today]) : Promise.resolve([]);

    const [cargoStats, recentCargos, contractStats, transactionStats, overdueStages] = await Promise.all([
      cargoStatsPromise, recentCargosPromise, contractStatsPromise, transactionStatsPromise, overdueStagesPromise
    ]);

    res.json({
      contracts: contractStats ? {
        total:             contractStats.total             || 0,
        active:            contractStats.active            || 0,
        expired:           contractStats.expired           || 0,
        total_amount:      contractStats.total_amount      || 0,
        total_paid:        contractStats.total_paid        || 0,
        limit_balance_sum: contractStats.limit_balance_sum || 0
      } : null,
      cargo: {
        total:      cargoStats.total      || 0,
        in_transit: cargoStats.in_transit || 0,
        customs:    cargoStats.customs    || 0,
        delivered:  cargoStats.delivered  || 0,
        overdue:    cargoStats.overdue    || 0
      },
      transactions: transactionStats ? {
        total_usd:    transactionStats.total_usd    || 0,
        pending_usd:  transactionStats.pending_usd  || 0,
        urgent_count: transactionStats.urgent_count || 0
      } : null,
      overdue_stages: overdueStages,
      recent_cargos:  recentCargos
    });
  } catch (err) {
    console.error('Dashboard error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== USERS (for task assignment) ==============

const MANAGER_ROLES = new Set(['admin', 'director']);
function isManager(role) { return MANAGER_ROLES.has(role); }

app.get('/users', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    const rows = await db.all(
      'SELECT id, login, name, role, department FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    console.error('Users list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== AUDIT LOG ==============

app.get('/audit-log', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });

    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const offset = parseInt(req.query.offset) || 0;
    const { table, user_id, action } = req.query;

    const conditions = [];
    const params = [];
    if (table)   { conditions.push('table_name = ?'); params.push(table); }
    if (user_id) { conditions.push('user_id = ?');    params.push(user_id); }
    if (action)  { conditions.push('action = ?');     params.push(action); }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const rows = await db.all(
      `SELECT * FROM audit_log ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limit, offset]
    );
    res.json(rows);
  } catch (err) {
    console.error('Audit log list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== NOTIFICATIONS ==============

app.get('/notifications', auth, async (req, res) => {
  try {
    const rows = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50',
      [req.user.id]
    );
    const { unread } = await db.get(
      'SELECT COUNT(*) AS unread FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ notifications: rows, unread });
  } catch (err) {
    console.error('Notifications list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/notifications/:id/read', auth, async (req, res) => {
  try {
    await db.run(
      'UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?',
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Notification read error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.patch('/notifications/read-all', auth, async (req, res) => {
  try {
    await db.run(
      'UPDATE notifications SET is_read = 1 WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Notifications read-all error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== TASKS (manager CRM: assignment & control) ==============

const TASK_STATUSES = new Set(['new', 'in_progress', 'review', 'done', 'cancelled']);
const TASK_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent']);

async function canAccessTask(userId, role, task) {
  if (isManager(role)) return true;
  return task.assigned_to === userId || task.assigned_by === userId;
}

async function notifyUser(userId, title, message, taskId, type = 'info') {
  if (!userId) return;
  try {
    await db.run(
      `INSERT INTO notifications (id, user_id, title, message, type, entity_type, entity_id)
       VALUES (?, ?, ?, ?, ?, 'task', ?)`,
      [uuidv4(), userId, title, message, type, taskId]
    );
  } catch (err) { console.error('Notification insert error:', err.message); }
}

// List tasks — managers see everything (optionally filtered), others only their own
app.get('/tasks', auth, async (req, res) => {
  try {
    const { status, priority, assigned_to, overdue } = req.query;
    const where = [];
    const params = [];

    if (isManager(req.user.role)) {
      if (assigned_to) { where.push('assigned_to = ?'); params.push(assigned_to); }
    } else {
      where.push('(assigned_to = ? OR assigned_by = ?)');
      params.push(req.user.id, req.user.id);
    }
    if (status && TASK_STATUSES.has(status)) { where.push('status = ?'); params.push(status); }
    if (priority && TASK_PRIORITIES.has(priority)) { where.push('priority = ?'); params.push(priority); }
    if (overdue === '1') {
      where.push("due_date < ? AND due_date IS NOT NULL AND due_date != '' AND status NOT IN ('done','cancelled')");
      params.push(new Date().toISOString().slice(0, 10));
    }

    const sql = `SELECT * FROM tasks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY
      CASE status WHEN 'new' THEN 0 WHEN 'in_progress' THEN 1 WHEN 'review' THEN 2 WHEN 'done' THEN 3 ELSE 4 END,
      CASE priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END,
      due_date IS NULL, due_date ASC`;

    const rows = await db.all(sql, params);
    res.json(rows);
  } catch (err) {
    console.error('Tasks list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Per-employee stats — managers only
app.get('/tasks/stats', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Нет доступа' });
    const today = new Date().toISOString().slice(0, 10);

    const rows = await db.all(`
      SELECT
        u.id, u.name, u.role,
        COUNT(t.id) AS total,
        SUM(CASE WHEN t.status = 'new' THEN 1 ELSE 0 END) AS new_count,
        SUM(CASE WHEN t.status = 'in_progress' THEN 1 ELSE 0 END) AS in_progress_count,
        SUM(CASE WHEN t.status = 'review' THEN 1 ELSE 0 END) AS review_count,
        SUM(CASE WHEN t.status = 'done' THEN 1 ELSE 0 END) AS done_count,
        SUM(CASE WHEN t.status NOT IN ('done','cancelled') AND t.due_date IS NOT NULL
                   AND t.due_date != '' AND t.due_date < ? THEN 1 ELSE 0 END) AS overdue_count
      FROM users u
      LEFT JOIN tasks t ON t.assigned_to = u.id
      GROUP BY u.id
      HAVING total > 0
      ORDER BY overdue_count DESC, total DESC
    `, [today]);

    res.json(rows);
  } catch (err) {
    console.error('Task stats error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Task detail — includes comments and checklist
app.get('/tasks/:id', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }
    const comments = await db.all(
      'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC', [req.params.id]
    );
    const checklist = await db.all(
      'SELECT * FROM task_checklist WHERE task_id = ? ORDER BY sort_order ASC, created_at ASC', [req.params.id]
    );
    res.json({ ...task, comments, checklist });
  } catch (err) {
    console.error('Task detail error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Create task — managers only
app.post('/tasks', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Только руководитель может назначать задачи' });

    const { title, description, assigned_to, priority, due_date, entity_type, entity_id, entity_label } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Укажите название задачи' });
    if (!assigned_to) return res.status(400).json({ error: 'Укажите исполнителя' });

    const assignee = await db.get('SELECT id, name FROM users WHERE id = ?', [assigned_to]);
    if (!assignee) return res.status(400).json({ error: 'Исполнитель не найден' });

    const id = uuidv4();
    await db.run(
      `INSERT INTO tasks (id, title, description, assigned_to, assigned_to_name, assigned_by, assigned_by_name,
                           priority, status, due_date, entity_type, entity_id, entity_label)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, ?, ?, ?)`,
      [
        id, String(title).trim(), description || null, assignee.id, assignee.name,
        req.user.id, req.user.name,
        TASK_PRIORITIES.has(priority) ? priority : 'medium',
        due_date || null,
        entity_type || null, entity_id || null, entity_label || null
      ]
    );

    await notifyUser(assignee.id, 'Новая задача', `Вам назначена задача: ${String(title).trim()}`, id);
    res.json({ id });
  } catch (err) {
    console.error('Task create error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Full edit (reassign, priority, due date, description) — managers only
app.put('/tasks/:id', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Только руководитель может редактировать задачу' });

    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });

    const { title, description, assigned_to, priority, status, due_date, entity_type, entity_id, entity_label } = req.body;

    let assignedTo = task.assigned_to, assignedToName = task.assigned_to_name;
    if (assigned_to && assigned_to !== task.assigned_to) {
      const assignee = await db.get('SELECT id, name FROM users WHERE id = ?', [assigned_to]);
      if (!assignee) return res.status(400).json({ error: 'Исполнитель не найден' });
      assignedTo = assignee.id; assignedToName = assignee.name;
    }

    const newStatus = TASK_STATUSES.has(status) ? status : task.status;
    const completedAt = (newStatus === 'done' && task.status !== 'done')
      ? new Date().toISOString()
      : (newStatus !== 'done' ? null : task.completed_at);

    await db.run(
      `UPDATE tasks SET title = ?, description = ?, assigned_to = ?, assigned_to_name = ?,
                         priority = ?, status = ?, due_date = ?,
                         entity_type = ?, entity_id = ?, entity_label = ?,
                         completed_at = ?, updated_at = CURRENT_TIMESTAMP
       WHERE id = ?`,
      [
        title ? String(title).trim() : task.title,
        description !== undefined ? description : task.description,
        assignedTo, assignedToName,
        TASK_PRIORITIES.has(priority) ? priority : task.priority,
        newStatus,
        due_date !== undefined ? due_date : task.due_date,
        entity_type !== undefined ? entity_type : task.entity_type,
        entity_id !== undefined ? entity_id : task.entity_id,
        entity_label !== undefined ? entity_label : task.entity_label,
        completedAt,
        req.params.id
      ]
    );

    if (assignedTo !== task.assigned_to) {
      await notifyUser(assignedTo, 'Задача переназначена', `Вам назначена задача: ${title || task.title}`, req.params.id);
    }

    res.json({ id: req.params.id });
  } catch (err) {
    console.error('Task update error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Change status — assignee, assigner, or manager
app.patch('/tasks/:id/status', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }

    const { status } = req.body;
    if (!TASK_STATUSES.has(status)) return res.status(400).json({ error: 'Неверный статус' });

    const completedAt = (status === 'done' && task.status !== 'done')
      ? new Date().toISOString()
      : (status !== 'done' ? null : task.completed_at);

    await db.run(
      `UPDATE tasks SET status = ?, completed_at = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, completedAt, req.params.id]
    );

    if (task.assigned_by && task.assigned_by !== req.user.id) {
      await notifyUser(task.assigned_by, 'Статус задачи изменён', `«${task.title}» → ${status}`, req.params.id);
    }

    res.json({ id: req.params.id, status });
  } catch (err) {
    console.error('Task status error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Delete task — managers only
app.delete('/tasks/:id', auth, async (req, res) => {
  try {
    if (!isManager(req.user.role)) return res.status(403).json({ error: 'Только руководитель может удалять задачи' });
    await db.run('DELETE FROM tasks WHERE id = ?', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Task delete error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Comments
app.get('/tasks/:id/comments', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT id, assigned_to, assigned_by FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }
    const comments = await db.all(
      'SELECT * FROM task_comments WHERE task_id = ? ORDER BY created_at ASC', [req.params.id]
    );
    res.json(comments);
  } catch (err) {
    console.error('Comments list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/tasks/:id/comments', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }

    const { message } = req.body;
    if (!message || !String(message).trim()) return res.status(400).json({ error: 'Пустой комментарий' });

    const id = uuidv4();
    await db.run(
      `INSERT INTO task_comments (id, task_id, author_id, author_name, message)
       VALUES (?, ?, ?, ?, ?)`,
      [id, req.params.id, req.user.id, req.user.name, String(message).trim()]
    );

    const notifyTarget = req.user.id === task.assigned_to ? task.assigned_by : task.assigned_to;
    if (notifyTarget) {
      await notifyUser(notifyTarget, 'Новый комментарий', `«${task.title}»: ${String(message).trim().slice(0, 100)}`, req.params.id);
    }

    res.json({ id });
  } catch (err) {
    console.error('Comment create error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// Checklist (subtasks)
app.post('/tasks/:id/checklist', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }

    const { title } = req.body;
    if (!title || !String(title).trim()) return res.status(400).json({ error: 'Укажите название пункта' });

    const { maxOrder } = await db.get(
      'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM task_checklist WHERE task_id = ?', [req.params.id]
    );

    const id = uuidv4();
    await db.run(
      `INSERT INTO task_checklist (id, task_id, title, sort_order) VALUES (?, ?, ?, ?)`,
      [id, req.params.id, String(title).trim(), maxOrder + 1]
    );
    res.json({ id });
  } catch (err) {
    console.error('Checklist create error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/tasks/:id/checklist/:itemId', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }
    const { is_done } = req.body;
    await db.run(
      'UPDATE task_checklist SET is_done = ? WHERE id = ? AND task_id = ?',
      [is_done ? 1 : 0, req.params.itemId, req.params.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Checklist update error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/tasks/:id/checklist/:itemId', auth, async (req, res) => {
  try {
    const task = await db.get('SELECT * FROM tasks WHERE id = ?', [req.params.id]);
    if (!task) return res.status(404).json({ error: 'Задача не найдена' });
    if (!(await canAccessTask(req.user.id, req.user.role, task))) {
      return res.status(403).json({ error: 'Нет доступа к этой задаче' });
    }
    await db.run('DELETE FROM task_checklist WHERE id = ? AND task_id = ?', [req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Checklist delete error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== ATTACHMENTS (files on contracts / transactions) ==============

const ENTITY_TABLE_MAP = { contract: 'contracts', transaction: 'ais_transactions' };
const ATTACHMENT_CATEGORIES = new Set(['contract_scan', 'invoice', 'waybill', 'acceptance_act', 'other']);
const ALLOWED_ATTACHMENT_EXT = new Set(['.pdf', '.doc', '.docx', '.jpg', '.jpeg', '.png']);

const attachmentStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = (file.originalname.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    cb(null, `${uuidv4()}${ext}`);
  }
});

const uploadAttachment = multer({
  storage: attachmentStorage,
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const ext = (file.originalname.match(/\.[^.]+$/) || [''])[0].toLowerCase();
    if (!ALLOWED_ATTACHMENT_EXT.has(ext)) {
      return cb(new Error('Недопустимый тип файла. Разрешены: PDF, DOC, DOCX, JPG, PNG'));
    }
    cb(null, true);
  }
});

app.get('/attachments', auth, async (req, res) => {
  try {
    const { entity_type, entity_id } = req.query;
    const table = ENTITY_TABLE_MAP[entity_type];
    if (!table) return res.status(400).json({ error: 'Неверный тип сущности' });
    if (!entity_id) return res.status(400).json({ error: 'Не указан entity_id' });
    if (!canReadTable(req.user.role, table)) return res.status(403).json({ error: 'Нет доступа' });

    const rows = await db.all(
      'SELECT id, entity_type, entity_id, category, original_name, mime_type, size_bytes, uploaded_by_name, created_at FROM attachments WHERE entity_type = ? AND entity_id = ? ORDER BY created_at DESC',
      [entity_type, entity_id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Attachments list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/attachments', auth, (req, res) => {
  uploadAttachment.single('file')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message || 'Ошибка загрузки файла' });
    try {
      const { entity_type, entity_id, category } = req.body;
      const table = ENTITY_TABLE_MAP[entity_type];
      const cleanup = () => fs.unlink(req.file?.path || '', () => {});

      if (!req.file) return res.status(400).json({ error: 'Файл не получен' });
      if (!table) { cleanup(); return res.status(400).json({ error: 'Неверный тип сущности' }); }
      if (!entity_id) { cleanup(); return res.status(400).json({ error: 'Не указан entity_id' }); }
      if (!canWriteTable(req.user.role, table)) { cleanup(); return res.status(403).json({ error: 'Нет прав на прикрепление файлов' }); }

      const entityRow = await db.get(`SELECT id FROM ${table} WHERE id = ?`, [entity_id]);
      if (!entityRow) { cleanup(); return res.status(404).json({ error: 'Запись не найдена' }); }

      const id = uuidv4();
      const finalCategory = ATTACHMENT_CATEGORIES.has(category) ? category : 'other';
      await db.run(
        `INSERT INTO attachments (id, entity_type, entity_id, category, stored_name, original_name, mime_type, size_bytes, uploaded_by, uploaded_by_name)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, entity_type, entity_id, finalCategory, req.file.filename, req.file.originalname, req.file.mimetype, req.file.size, req.user.id, req.user.name]
      );
      logAudit(req, 'upload', 'attachments', id, {
        label: req.file.originalname,
        changes: { entity_type, entity_id, category: finalCategory, original_name: req.file.originalname }
      });
      res.json({ id });
    } catch (err) {
      console.error('Attachment upload error:', err);
      res.status(500).json({ error: 'Ошибка сервера' });
    }
  });
});

app.get('/attachments/:id/download', auth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Файл не найден' });
    const table = ENTITY_TABLE_MAP[row.entity_type];
    if (!canReadTable(req.user.role, table)) return res.status(403).json({ error: 'Нет доступа' });

    const filePath = join(UPLOADS_DIR, row.stored_name);
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'Файл отсутствует на диске' });
    res.download(filePath, row.original_name);
  } catch (err) {
    console.error('Attachment download error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/attachments/:id', auth, async (req, res) => {
  try {
    const row = await db.get('SELECT * FROM attachments WHERE id = ?', [req.params.id]);
    if (!row) return res.status(404).json({ error: 'Файл не найден' });
    const table = ENTITY_TABLE_MAP[row.entity_type];
    const isOwner = row.uploaded_by === req.user.id;
    if (!isOwner && !canDeleteTable(req.user.role, table)) {
      return res.status(403).json({ error: 'Нет прав на удаление этого файла' });
    }

    await db.run('DELETE FROM attachments WHERE id = ?', [req.params.id]);
    fs.unlink(join(UPLOADS_DIR, row.stored_name), () => {});
    logAudit(req, 'delete', 'attachments', row.id, {
      label: row.original_name,
      changes: { entity_type: row.entity_type, entity_id: row.entity_id, original_name: row.original_name }
    });
    res.json({ success: true });
  } catch (err) {
    console.error('Attachment delete error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== LINKED TRANSACTIONS (drill-down from ACID / contracts to счета) ==============

app.get('/acid/:id/transactions', auth, async (req, res) => {
  try {
    if (!canReadTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет доступа' });
    const acidRow = await db.get('SELECT acid FROM acid WHERE id = ?', [req.params.id]);
    if (!acidRow) return res.status(404).json({ error: 'Груз не найден' });
    const rows = await db.all(
      'SELECT * FROM ais_transactions WHERE acid_link = ? ORDER BY date DESC',
      [acidRow.acid]
    );
    res.json(rows);
  } catch (err) {
    console.error('Acid transactions list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.get('/contracts/:id/transactions', auth, async (req, res) => {
  try {
    if (!canReadTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет доступа' });
    const contractRow = await db.get('SELECT id FROM contracts WHERE id = ?', [req.params.id]);
    if (!contractRow) return res.status(404).json({ error: 'Договор не найден' });
    const rows = await db.all(
      'SELECT * FROM ais_transactions WHERE contract_id = ? ORDER BY date DESC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Contract transactions list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== TRANSACTION ITEMS (nomenclature within a счёт) ==============

app.get('/ais_transactions/:id/items', auth, async (req, res) => {
  try {
    if (!canReadTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет доступа' });
    const rows = await db.all(
      'SELECT * FROM transaction_items WHERE transaction_id = ? ORDER BY sort_order ASC, created_at ASC',
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    console.error('Transaction items list error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/ais_transactions/:id/items', auth, async (req, res) => {
  try {
    if (!canWriteTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет прав' });
    const tx = await db.get('SELECT id FROM ais_transactions WHERE id = ?', [req.params.id]);
    if (!tx) return res.status(404).json({ error: 'Транзакция не найдена' });

    const { name, sku, unit, quantity, unit_price, notes } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: 'Укажите название позиции' });

    const qty = Number(quantity) || 1;
    const price = Number(unit_price) || 0;
    const { maxOrder } = await db.get(
      'SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM transaction_items WHERE transaction_id = ?', [req.params.id]
    );

    const id = uuidv4();
    await db.run(
      `INSERT INTO transaction_items (id, transaction_id, name, sku, unit, quantity, unit_price, amount, notes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, req.params.id, String(name).trim(), sku || null, unit || 'шт', qty, price, qty * price, notes || null, maxOrder + 1]
    );
    res.json({ id });
  } catch (err) {
    console.error('Transaction item create error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/ais_transactions/:id/items/:itemId', auth, async (req, res) => {
  try {
    if (!canWriteTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет прав' });
    const item = await db.get('SELECT * FROM transaction_items WHERE id = ? AND transaction_id = ?', [req.params.itemId, req.params.id]);
    if (!item) return res.status(404).json({ error: 'Позиция не найдена' });

    const { name, sku, unit, quantity, unit_price, notes } = req.body;
    const qty = quantity !== undefined ? Number(quantity) || 0 : item.quantity;
    const price = unit_price !== undefined ? Number(unit_price) || 0 : item.unit_price;

    await db.run(
      `UPDATE transaction_items SET name = ?, sku = ?, unit = ?, quantity = ?, unit_price = ?, amount = ?, notes = ?
       WHERE id = ?`,
      [
        name ? String(name).trim() : item.name,
        sku !== undefined ? sku : item.sku,
        unit || item.unit,
        qty, price, qty * price,
        notes !== undefined ? notes : item.notes,
        req.params.itemId
      ]
    );
    res.json({ id: req.params.itemId });
  } catch (err) {
    console.error('Transaction item update error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/ais_transactions/:id/items/:itemId', auth, async (req, res) => {
  try {
    if (!canWriteTable(req.user.role, 'ais_transactions')) return res.status(403).json({ error: 'Нет прав' });
    await db.run('DELETE FROM transaction_items WHERE id = ? AND transaction_id = ?', [req.params.itemId, req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Transaction item delete error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== CRUD ==============

app.get('/:table', auth, checkAccess, async (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Неверная таблица' });

    const limit = Math.min(parseInt(req.query.limit) || 500, 2000);
    const offset = parseInt(req.query.offset) || 0;

    const rows = await db.all(`SELECT * FROM ${table} LIMIT ? OFFSET ?`, [limit, offset]);
    res.json(rows);
  } catch (err) {
    console.error('GET error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.post('/:table', auth, checkAccess, async (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Неверная таблица' });

    let data = castNumericFields(table, sanitizeColumns(table, req.body));

    // Auto-compute limit_balance for contracts
    if (table === 'contracts') {
      const base = parseFloat(data.amount_with_ds ?? data.amount ?? 0) || 0;
      const paid = parseFloat(data.paid_amount ?? 0) || 0;
      data.limit_balance = Math.max(0, base - paid);
    }

    // A счёт linked to an ACID must belong to that ACID's own contract —
    // otherwise "ACID -> договор -> счета" and "ACID -> счета" disagree.
    if (table === 'ais_transactions' && data.acid_link) {
      const acidRow = await db.get('SELECT contract_id, contract_number FROM acid WHERE acid = ?', [data.acid_link]);
      if (acidRow) {
        data.contract_id = acidRow.contract_id;
        data.contract_number = acidRow.contract_number;
      }
    }

    const columns = Object.keys(data);
    if (columns.length === 0) return res.status(400).json({ error: 'Нет допустимых полей' });

    const id = uuidv4();
    const placeholders = Array(columns.length + 1).fill('?').join(',');
    const columnsList = ['id', ...columns].join(',');

    await db.run(
      `INSERT INTO ${table} (${columnsList}) VALUES (${placeholders})`,
      [id, ...columns.map(k => data[k])]
    );

    logAudit(req, 'create', table, id, { changes: data, label: data[RECORD_LABEL_FIELD[table]] });

    res.json({ id });
  } catch (err) {
    if (err.message?.includes('UNIQUE constraint')) {
      return res.status(409).json({ error: 'Запись уже существует' });
    }
    console.error('POST error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.put('/:table/:id', auth, checkAccess, async (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Неверная таблица' });

    // Optimistic locking: client sends _version (= updated_at when record was loaded)
    const clientVersion = req.body._version;
    const body = { ...req.body };
    delete body._version;

    let data = castNumericFields(table, sanitizeColumns(table, body));

    // Auto-compute limit_balance for contracts
    if (table === 'contracts') {
      const current = await db.get(`SELECT amount, amount_with_ds, paid_amount FROM contracts WHERE id = ?`, [id]);
      const base = parseFloat(data.amount_with_ds ?? current?.amount_with_ds ?? data.amount ?? current?.amount ?? 0) || 0;
      const paid = parseFloat(data.paid_amount ?? current?.paid_amount ?? 0) || 0;
      data.limit_balance = Math.max(0, base - paid);
    }

    // Keep a счёт's contract in sync with its linked ACID's own contract (see POST handler)
    if (table === 'ais_transactions') {
      const acidLink = data.acid_link !== undefined
        ? data.acid_link
        : (await db.get('SELECT acid_link FROM ais_transactions WHERE id = ?', [id]))?.acid_link;
      if (acidLink) {
        const acidRow = await db.get('SELECT contract_id, contract_number FROM acid WHERE acid = ?', [acidLink]);
        if (acidRow) {
          data.contract_id = acidRow.contract_id;
          data.contract_number = acidRow.contract_number;
        }
      }
    }

    const columns = Object.keys(data);
    if (columns.length === 0) return res.status(400).json({ error: 'Нет допустимых полей' });

    // If version provided, check it matches current updated_at
    if (clientVersion) {
      const current = await db.get(`SELECT updated_at FROM ${table} WHERE id = ?`, [id]);
      if (current && current.updated_at !== clientVersion) {
        const fresh = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
        return res.status(409).json({
          error: 'Запись была изменена другим пользователем. Данные обновлены.',
          current: fresh
        });
      }
    }

    const updates = columns.map(k => `${k} = ?`).join(', ');
    await db.run(
      `UPDATE ${table} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...columns.map(k => data[k]), id]
    );

    const labelField = RECORD_LABEL_FIELD[table];
    const label = labelField
      ? data[labelField] ?? (await db.get(`SELECT ${labelField} FROM ${table} WHERE id = ?`, [id]))?.[labelField]
      : null;
    logAudit(req, 'update', table, id, { changes: data, label });

    res.json({ id });
  } catch (err) {
    console.error('PUT error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

app.delete('/:table/:id', auth, checkAccess, async (req, res) => {
  try {
    const { table, id } = req.params;
    if (!VALID_TABLES.has(table)) return res.status(400).json({ error: 'Неверная таблица' });

    const before = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);

    const labelField = RECORD_LABEL_FIELD[table];
    logAudit(req, 'delete', table, id, { changes: before, label: before?.[labelField] });

    res.json({ success: true });
  } catch (err) {
    console.error('DELETE error:', err);
    res.status(500).json({ error: 'Ошибка сервера' });
  }
});

// ============== BATCH IMPORT ==============
// Single HTTP request for the entire file — critical for slow Egypt internet

app.post('/import/:table', auth, checkImport, async (req, res) => {
  try {
    const { table } = req.params;
    if (!VALID_TABLES.has(table) || table === 'contract_stages') {
      return res.status(400).json({ error: 'Неверная таблица' });
    }

    const { rows } = req.body;
    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'rows должен быть непустым массивом' });
    }
    if (rows.length > 5000) {
      return res.status(400).json({ error: 'Максимум 5000 строк за раз' });
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    // Wrap in transaction for atomicity and 10-50x speed improvement
    await db.exec('BEGIN TRANSACTION');
    try {
      for (const rawRow of rows) {
        const data = sanitizeColumns(table, rawRow);
        const columns = Object.keys(data);
        if (columns.length === 0) { skipped++; continue; }

        const id = uuidv4();
        const placeholders = Array(columns.length + 1).fill('?').join(',');
        const columnsList = ['id', ...columns].join(',');

        try {
          const result = await db.run(
            `INSERT OR IGNORE INTO ${table} (${columnsList}) VALUES (${placeholders})`,
            [id, ...columns.map(k => data[k])]
          );
          if (result.changes > 0) imported++; else skipped++;
        } catch (rowErr) {
          errors.push(rowErr.message);
          skipped++;
        }
      }
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }

    // Log import to ais_imports
    try {
      await db.run(
        `INSERT INTO ais_imports (id, table_type, total_rows, imported_rows, skipped_rows, errors, imported_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          uuidv4(),
          table === 'ais_transactions' ? 'transactions' : table,
          rows.length,
          imported,
          skipped,
          errors.length > 0 ? JSON.stringify(errors) : null,
          req.user.id
        ]
      );
    } catch {
      // Non-fatal: import already committed, just log silently
    }

    res.json({ imported, skipped, errors: errors.slice(0, 20) });
  } catch (err) {
    console.error('Import error:', err);
    res.status(500).json({ error: 'Ошибка импорта' });
  }
});

// ============== ERROR MIDDLEWARE ==============

// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Express error:', err);
  res.status(500).json({ error: 'Внутренняя ошибка сервера' });
});

// ============== STARTUP ==============

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Roles: admin/admin123 (full access), egypt/egypt2024 (ACID full CRUD)`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
