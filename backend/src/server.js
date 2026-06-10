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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const PORT = process.env.PORT || 8080;
const DB_PATH = process.env.DB_PATH || join(__dirname, '../data/accessweb.db');

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
    'vessel', 'shipping_line', 'bol_number', 'bol_date', 'carrier',
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

app.use(express.static(join(__dirname, '../../')));

// ============== DB INIT ==============

async function initDB() {
  const dataDir = join(__dirname, '../data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
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

  const defaultUsers = [
    { login: 'director',    password: 'director123',  name: 'Директор',                 role: 'director' },
    { login: 'logistics',   password: 'logistics123', name: 'Логистическая поддержка',  role: 'logistics_support' },
    { login: 'analytics',   password: 'analytics123', name: 'Информационная аналитика', role: 'info_analytics' },
    { login: 'oplogistics', password: 'oplog123',     name: 'Оперативная логистика',    role: 'operational_logistics' },
  ];

  for (const u of defaultUsers) {
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

function sanitizeColumns(table, data) {
  const allowed = ALLOWED_COLUMNS[table];
  if (!allowed) return {};
  return Object.fromEntries(
    Object.entries(data).filter(([k]) => allowed.has(k))
  );
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
    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    const [
      contractStats,
      cargoStats,
      transactionStats,
      overdueStages,
      recentCargos
    ] = await Promise.all([
      // Contracts summary
      db.get(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'active'    THEN 1 ELSE 0 END) AS active,
          SUM(CASE WHEN status = 'expired'   THEN 1 ELSE 0 END) AS expired,
          COALESCE(SUM(amount), 0)         AS total_amount,
          COALESCE(SUM(paid_amount), 0)    AS total_paid,
          COALESCE(SUM(limit_balance), 0)  AS limit_balance_sum
        FROM contracts
      `),
      // Cargo summary
      db.get(`
        SELECT
          COUNT(*) AS total,
          SUM(CASE WHEN status = 'in_transit' THEN 1 ELSE 0 END) AS in_transit,
          SUM(CASE WHEN status = 'customs'    THEN 1 ELSE 0 END) AS customs,
          SUM(CASE WHEN status = 'delivered'  THEN 1 ELSE 0 END) AS delivered,
          SUM(CASE WHEN eta < ? AND status NOT IN ('delivered','cancelled') THEN 1 ELSE 0 END) AS overdue
        FROM acid
      `, [today]),
      // Transactions summary
      db.get(`
        SELECT
          COALESCE(SUM(amount_usd), 0)                                              AS total_usd,
          COALESCE(SUM(CASE WHEN status = 'pending' THEN amount_usd ELSE 0 END), 0) AS pending_usd,
          SUM(CASE WHEN urgent = 1 THEN 1 ELSE 0 END)                               AS urgent_count
        FROM ais_transactions
      `),
      // Top 5 overdue stages
      db.all(`
        SELECT
          c.contract_number,
          cs.stage_name,
          cs.planned_date,
          cs.responsible,
          CAST(julianday(?) - julianday(cs.planned_date) AS INTEGER) AS days_overdue
        FROM contract_stages cs
        JOIN contracts c ON c.id = cs.contract_id
        WHERE cs.status NOT IN ('completed')
          AND cs.planned_date < ?
          AND cs.planned_date IS NOT NULL
          AND cs.planned_date != ''
        ORDER BY cs.planned_date ASC
        LIMIT 5
      `, [today, today]),
      // Last 5 cargos by created_at
      db.all(`
        SELECT * FROM acid
        ORDER BY created_at DESC
        LIMIT 5
      `)
    ]);

    res.json({
      contracts: {
        total:             contractStats.total         || 0,
        active:            contractStats.active        || 0,
        expired:           contractStats.expired       || 0,
        total_amount:      contractStats.total_amount  || 0,
        total_paid:        contractStats.total_paid    || 0,
        limit_balance_sum: contractStats.limit_balance_sum || 0
      },
      cargo: {
        total:      cargoStats.total      || 0,
        in_transit: cargoStats.in_transit || 0,
        customs:    cargoStats.customs    || 0,
        delivered:  cargoStats.delivered  || 0,
        overdue:    cargoStats.overdue    || 0
      },
      transactions: {
        total_usd:    transactionStats.total_usd    || 0,
        pending_usd:  transactionStats.pending_usd  || 0,
        urgent_count: transactionStats.urgent_count || 0
      },
      overdue_stages: overdueStages,
      recent_cargos:  recentCargos
    });
  } catch (err) {
    console.error('Dashboard error:', err);
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

    const data = sanitizeColumns(table, req.body);
    const columns = Object.keys(data);
    if (columns.length === 0) return res.status(400).json({ error: 'Нет допустимых полей' });

    const id = uuidv4();
    const placeholders = Array(columns.length + 1).fill('?').join(',');
    const columnsList = ['id', ...columns].join(',');

    await db.run(
      `INSERT INTO ${table} (${columnsList}) VALUES (${placeholders})`,
      [id, ...columns.map(k => data[k])]
    );

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

    const data = sanitizeColumns(table, body);
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

    await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
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
          await db.run(
            `INSERT OR IGNORE INTO ${table} (${columnsList}) VALUES (${placeholders})`,
            [id, ...columns.map(k => data[k])]
          );
          imported++;
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
