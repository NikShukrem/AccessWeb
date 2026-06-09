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
    'acid', 'nomer_ais', 'initial_request_number', 'shipment_type', 'gruzootravitel',
    'postavshchik', 'importer_name', 'kontragent', 'registration_number', 'vat_number',
    'naimenovanie', 'gw_kg', 'kolichestvo_mest', 'kolichestvo_konteynerov', 'tip_perevozki',
    'stoimost_gruza', 'valyuta', 'summa_perevozki', 'strana_otpravleniya', 'port_otpravleniya',
    'incoterms', 'mesto_postavki', 'sudno', 'shipping_line', 'bol_number', 'bol_date',
    'perevozchik', 'etd', 'eta', 'data_postavki', 'data_pribytiya_egypt', 'mesto_pribytiya',
    'data_zaprosa_osvobozhdeniya', 'kurator_osvobozhdeniya', 'data_polucheniya_osvobozhdeniya',
    'do_released', 'rezhim_vvoza', 'nomer_dt', 'data_dt', 'data_vypuska_dt',
    'data_dostavki_na_ploschad', 'custom_status', 'naznachenie', 'kurator_upo',
    'invoiz_zagruzhen', 'prodlen_do', 'primechanie', 'status', 'otvetstvennyy',
    'komentar', 'kontract_id', 'nomer_kontrakta'
  ]),
  contracts: new Set([
    'nomer_kontrakta', 'tip_kontrakta', 'kontragent', 'nazvanie', 'data_kontrakta',
    'srok_deystviya', 'ds_data', 'cena_kontrakta', 'valyuta', 'summa_oplaty',
    'marshrut_to', 'vid_zakupki', 'lot_nomer', 'status', 'valyutnyy_kontrol',
    'komentar', 'ssylka', 'ostatok_limita'
  ]),
  contract_stages: new Set([
    'kontract_id', 'stage_number', 'stage_name', 'status',
    'data_nachal', 'data_okonch', 'kurator', 'komentar'
  ]),
  finance: new Set([
    'data', 'nomer', 'data_raskhoda', 'kti_data', 'valyuta', 'summa_usd',
    'organizaciya', 'kontragent', 'kontragent_kratko', 'dogovor_kontragenta',
    'data_dogovora_kontragenta', 'dogovor_i_data', 'proyekt', 'sostoyanie',
    'cfo', 'otvetstvennyy', 'srochnyy_platezh'
  ])
};

const VALID_TABLES = new Set(['acid', 'contracts', 'contract_stages', 'finance']);

// Role permissions are defined in ROLE_PERMISSIONS (see middleware section)

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

  const schema = fs.readFileSync(join(__dirname, '../data/schema.sql'), 'utf8');
  await db.exec(schema);

  // Run migrations for existing databases
  await runMigrations();

  // Seed default users if not present
  await seedUsers();

  console.log('Database ready:', DB_PATH);
}

async function runMigrations() {
  // Fix Cyrillic typo in contracts table (summa_oplatы → summa_oplaty)
  // SQLite ALTER TABLE RENAME COLUMN requires SQLite 3.25+
  try {
    const cols = await db.all("PRAGMA table_info(contracts)");
    const hasOld = cols.some(c => c.name === 'summa_oplatы');
    if (hasOld) {
      await db.exec('ALTER TABLE contracts RENAME COLUMN "summa_oplatы" TO summa_oplaty');
      console.log('Migration: renamed summa_oplatы → summa_oplaty');
    }
  } catch {
    // Column already correct or SQLite version too old — safe to ignore
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
    { login: 'director',     password: 'director123',  name: 'Директор',                    role: 'director' },
    { login: 'logistics',    password: 'logistics123',  name: 'Логистическая поддержка',     role: 'logistics_support' },
    { login: 'analytics',    password: 'analytics123',  name: 'Информационная аналитика',    role: 'info_analytics' },
    { login: 'oplogistics',  password: 'oplog123',      name: 'Оперативная логистика',       role: 'operational_logistics' },
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
// tables: '*' = all, array = whitelist
// write:  true = all tables, array = only listed tables, false = read-only
// import: true = allowed, false = not allowed
const ROLE_PERMISSIONS = {
  admin:                { tables: '*',                              write: true,                   import: true },
  egypt:                { tables: ['acid'],                         write: false,                  import: false },
  director:             { tables: '*',                              write: false,                  import: false },
  logistics_support:    { tables: ['acid', 'contracts', 'finance'], write: ['acid', 'contracts'],  import: ['acid', 'contracts'] },
  info_analytics:       { tables: '*',                              write: false,                  import: false },
  operational_logistics:{ tables: ['acid', 'contracts'],            write: ['acid'],               import: ['acid'] },
};

function checkAccess(req, res, next) {
  const role = req.user.role;
  const table = req.params.table;
  const perm = ROLE_PERMISSIONS[role];

  if (!perm) return res.status(403).json({ error: 'Роль не найдена' });

  if (table && perm.tables !== '*' && !perm.tables.includes(table)) {
    return res.status(403).json({ error: 'Нет доступа к этой таблице' });
  }

  const isWrite = ['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method);
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

function egyptReadOnly(req, res, next) { next(); } // kept for compatibility, replaced by checkAccess

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

    const data = sanitizeColumns(table, req.body);
    const columns = Object.keys(data);
    if (columns.length === 0) return res.status(400).json({ error: 'Нет допустимых полей' });

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
        } catch {
          skipped++;
        }
      }
      await db.exec('COMMIT');
    } catch (err) {
      await db.exec('ROLLBACK');
      throw err;
    }

    res.json({ imported, skipped });
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
      console.log(`Roles: admin/admin123 (full access), egypt/egypt2024 (cargo read-only)`);
    });
  } catch (err) {
    console.error('Failed to start:', err);
    process.exit(1);
  }
}

start();
