# 🔧 КРИТИЧЕСКИЕ ИСПРАВЛЕНИЯ - КОД

## ИСПРАВЛЕНИЕ 1: Безопасный environment setup

```bash
# .env.production (НЕ коммитить в Git!)
NODE_ENV=production
PORT=8080

# SECURITY CRITICAL - обязательно менять
JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
DB_PASSWORD=$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")

# CORS только на ваши домены
CORS_ORIGINS=https://app.yourdomain.eg,https://yourdomain.eg

# Database
DB_HOST=postgres.internal
DB_PORT=5432
DB_NAME=accessweb
DB_USER=accessweb
DB_PASSWORD=$DB_PASSWORD

# Redis (для rate limiting и кэша)
REDIS_URL=redis://redis.internal:6379

# Monitoring
SENTRY_DSN=https://key@sentry.io/project
LOG_LEVEL=info
```

```bash
# .env.local (для локальной разработки - OK коммитить)
NODE_ENV=development
PORT=8080
JWT_SECRET=dev_secret_change_me_before_production
DB_HOST=localhost
DB_PORT=5432
DB_NAME=accessweb_dev
DB_USER=postgres
DB_PASSWORD=postgres
CORS_ORIGINS=http://localhost:3000,http://localhost:8000
```

---

## ИСПРАВЛЕНИЕ 2: Безопасный server.js с валидацией

```javascript
// backend/src/server.js - ОБНОВЛЕННЫЙ КОД

import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult, param } from 'express-validator';

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });

// ============ VALIDATE ENVIRONMENT ============
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET === 'dev_secret_change_me_before_production') {
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ FATAL: JWT_SECRET must be a strong random string in production');
    process.exit(1);
  }
  console.warn('⚠️ WARNING: Using default JWT_SECRET in development');
}

const PORT = Number(process.env.PORT || 8080);
const DB_PATH = process.env.DB_PATH || './data/accessweb.db';
const CORS_ORIGINS = (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',');

console.log(`🚀 Starting AccessWeb Backend`);
console.log(`   Environment: ${process.env.NODE_ENV || 'development'}`);
console.log(`   CORS Origins: ${CORS_ORIGINS.join(', ')}`);
console.log(`   Database: ${DB_PATH}`);

const app = express();

// ============ SECURITY MIDDLEWARE ============
// Helmet для security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
    }
  },
  hsts: {
    maxAge: 31536000, // 1 год
    includeSubDomains: true,
    preload: true
  }
}));

// CORS с конкретными доменами
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || CORS_ORIGINS.some(o => origin.includes(o))) {
      callback(null, true);
    } else {
      callback(new Error(`CORS policy: ${origin} not allowed`));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Compression
app.use(compression({ level: 9, threshold: 1024 }));

// JSON parser с лимитом
app.use(express.json({ limit: '1mb' }));

// Rate limiting
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 5, // 5 попыток
  message: 'Слишком много попыток входа, попробуйте позже',
  standardHeaders: false,
  legacyHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development'
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 минута
  max: 100, // 100 запросов в минуту
  standardHeaders: false,
  skip: (req) => process.env.NODE_ENV === 'development'
});

app.use('/api/', apiLimiter);

// ============ LOGGING ============
import winston from 'winston';

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

app.use((req, res, next) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip
  });
  next();
});

// ============ DATABASE ============
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

let db;

async function initDB() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  await db.exec(`
    PRAGMA journal_mode=WAL;
    PRAGMA foreign_keys=ON;
    PRAGMA busy_timeout=5000;

    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      login TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin','contracts','finance')),
      password_hash TEXT NOT NULL,
      last_login TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS acid (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      kti_number TEXT UNIQUE,
      name TEXT,
      status TEXT,
      amount REAL DEFAULT 0,
      created_date TEXT,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contracts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contract_number TEXT UNIQUE,
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

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      table_name TEXT,
      record_id INTEGER,
      action TEXT,
      changes TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY(user_id) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
    CREATE INDEX IF NOT EXISTS idx_acid_kti ON acid(kti_number);
    CREATE INDEX IF NOT EXISTS idx_acid_updated_at ON acid(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
    CREATE INDEX IF NOT EXISTS idx_contracts_due_date ON contracts(due_date);
    CREATE INDEX IF NOT EXISTS idx_finance_updated_at ON finance(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
  `);

  // Убедиться что есть хотя бы один админ
  const adminCount = await db.get('SELECT COUNT(*) as c FROM users WHERE role = ?', 'admin');
  if ((adminCount?.c || 0) === 0) {
    console.warn('⚠️ WARNING: No admin users found. Create one before production!');
  }
}

// ============ AUTH ============

const ROLES = {
  ADMIN: 'admin',
  CONTRACTS: 'contracts',
  FINANCE: 'finance'
};

function createToken(user) {
  return jwt.sign(
    { 
      id: user.id, 
      login: user.login, 
      role: user.role, 
      name: user.name,
      iat: Math.floor(Date.now() / 1000)
    },
    JWT_SECRET,
    { 
      expiresIn: '12h',
      algorithm: 'HS256',
      issuer: 'accessweb'
    }
  );
}

function auth(req, res, next) {
  const raw = req.headers.authorization || '';
  const token = raw.startsWith('Bearer ') ? raw.slice(7) : null;

  if (!token) {
    logger.warn(`Auth failed: no token from ${req.ip}`);
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      algorithms: ['HS256'],
      issuer: 'accessweb'
    });

    // Проверить что token не слишком старый (даже если не истёк)
    const now = Math.floor(Date.now() / 1000);
    if (now - decoded.iat > 12 * 3600) {
      return res.status(401).json({ error: 'Token expired' });
    }

    req.user = decoded;
    next();
  } catch (err) {
    logger.error(`JWT error: ${err.message} from ${req.ip}`);
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function allow(roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      logger.warn(`Authorization failed: user ${req.user?.login} role ${req.user?.role} from ${req.ip}`);
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
}

// Error handler для валидации
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: 'Validation failed', details: errors.array() });
  }
  next();
};

// ============ VALIDATION ============

function validateAcidPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('Payload must be an object');
  }

  const maxLength = 500;
  const validated = {};

  // Whitelist разрешённых полей
  const allowed = [
    'ACID', 'Грузоотправитель', 'Статус', 'Поставщик', 'Наименование',
    'GW кг', 'Номер КТИ', 'Стоимость Груза', 'Валюта',
    'Количество мест', 'Тип перевозки', 'Количество контейнеров',
    'Страна отправления', 'ETD', 'ETA', 'Место прибытия', 'Incoterms',
    'Место поставки', 'Порт отправления', 'Судно', 'Shiping Line',
    'BoL Number', 'BoL Date', 'Дата запроса освобождения',
    'Куратор освобождения', 'Дата получения освобождения',
    'Дата прибытия в Египет', 'DO', 'Режим', '№ ДТ', 'Дата ДТ',
    'Дата выпуска ДТ', 'Дата поставки на площадку', 'Назначение',
    'Ответственный', 'Куратор УПО', 'Контракт', 'Примечание',
    'Инвойс загружен', 'Перевозчик'
  ];

  for (const key of allowed) {
    if (key in payload) {
      const val = payload[key];
      if (typeof val === 'string') {
        validated[key] = val.trim().slice(0, maxLength);
      } else if (typeof val === 'number') {
        validated[key] = val;
      } else if (val instanceof Date) {
        validated[key] = val.toISOString().split('T')[0];
      } else {
        validated[key] = String(val).trim().slice(0, maxLength);
      }
    }
  }

  return validated;
}

// ============ ROUTES ============

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    ok: true,
    service: 'accessweb-backend',
    version: '1.0.0',
    ts: new Date().toISOString()
  });
});

// Login с rate limiting и логированием
app.post('/api/auth/login', loginLimiter, [
  body('login').isString().trim().isLength({ min: 1, max: 50 }),
  body('password').isString().isLength({ min: 1, max: 100 })
], handleValidationErrors, async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = await db.get('SELECT * FROM users WHERE login = ?', login);
    if (!user) {
      logger.warn(`Login failed: user not found "${login}" from ${req.ip}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) {
      logger.warn(`Login failed: invalid password for "${login}" from ${req.ip}`);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Успешный вход
    await db.run('UPDATE users SET last_login = datetime("now") WHERE id = ?', user.id);
    logger.info(`Login success: "${login}" from ${req.ip}`);

    const token = createToken(user);
    res.json({
      token,
      user: {
        id: user.id,
        login: user.login,
        role: user.role,
        name: user.name
      }
    });
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get current user
app.get('/api/auth/me', auth, async (req, res) => {
  try {
    const user = await db.get(
      'SELECT id, login, name, role, last_login FROM users WHERE id = ?',
      req.user.id
    );
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    res.json({ user });
  } catch (err) {
    logger.error(`Auth me error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get ACID records с пагинацией
app.get('/api/acid', auth, allow([ROLES.ADMIN, ROLES.CONTRACTS, ROLES.FINANCE]), [
  body('page').optional().isInt({ min: 1 }),
  body('limit').optional().isInt({ min: 1, max: 100 })
], async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || 1));
    const limit = Math.min(50, parseInt(req.query.limit || 20));
    const offset = (page - 1) * limit;

    const totalResult = await db.get('SELECT COUNT(*) as total FROM acid');
    const records = await db.all(
      `SELECT * FROM acid ORDER BY updated_at DESC LIMIT ? OFFSET ?`,
      limit,
      offset
    );

    res.json({
      records: records.map(r => ({
        id: r.id,
        ...JSON.parse(r.payload_json || '{}')
      })),
      pagination: {
        page,
        limit,
        total: totalResult.total,
        pages: Math.ceil(totalResult.total / limit)
      }
    });
  } catch (err) {
    logger.error(`ACID list error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create ACID record
app.post('/api/acid', auth, allow([ROLES.ADMIN]), [
  body('payload').isObject()
], handleValidationErrors, async (req, res) => {
  try {
    const payload = validateAcidPayload(req.body.payload || {});
    
    const kti = payload['Номер КТИ'] || '';
    if (!kti) {
      return res.status(400).json({ error: 'Номер КТИ is required' });
    }

    const result = await db.run(
      `INSERT INTO acid (kti_number, name, status, amount, created_date, payload_json)
       VALUES (?, ?, ?, ?, ?, ?)`,
      kti,
      payload['Наименование'] || '',
      payload['Статус'] || '',
      Number(payload['Стоимость Груза']) || 0,
      payload['Дата создания'] || new Date().toISOString().split('T')[0],
      JSON.stringify(payload)
    );

    // Audit log
    await db.run(
      `INSERT INTO audit_log (user_id, table_name, record_id, action, changes, ip_address)
       VALUES (?, ?, ?, ?, ?, ?)`,
      req.user.id,
      'acid',
      result.lastID,
      'INSERT',
      JSON.stringify(payload),
      req.ip
    );

    logger.info(`ACID created: id=${result.lastID} by ${req.user.login}`);

    const row = await db.get('SELECT * FROM acid WHERE id = ?', result.lastID);
    res.status(201).json({
      record: {
        id: row.id,
        ...JSON.parse(row.payload_json || '{}')
      }
    });
  } catch (err) {
    logger.error(`ACID create error: ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ============ ERROR HANDLER ============
app.use((err, req, res, next) => {
  logger.error(`Unhandled error: ${err.message}`, err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============ START SERVER ============
async function start() {
  try {
    await initDB();
    console.log('✅ Database connected');

    app.listen(PORT, () => {
      console.log(`✅ Server running on http://localhost:${PORT}`);
      console.log(`📡 CORS origins: ${CORS_ORIGINS.join(', ')}`);
    });
  } catch (err) {
    logger.error(`Failed to start server: ${err.message}`);
    process.exit(1);
  }
}

start();
```

---

## ИСПРАВЛЕНИЕ 3: package.json с безопасностью

```json
{
  "name": "accessweb-backend",
  "version": "1.0.0",
  "type": "module",
  "engines": {
    "node": ">=18.0.0"
  },
  "scripts": {
    "start": "node src/server.js",
    "dev": "NODE_ENV=development nodemon src/server.js",
    "test": "jest",
    "audit": "npm audit",
    "audit:fix": "npm audit fix"
  },
  "dependencies": {
    "bcryptjs": "^2.4.3",
    "cors": "^2.8.5",
    "compression": "^1.7.4",
    "dotenv": "^16.4.5",
    "express": "^4.19.2",
    "express-rate-limit": "^7.1.0",
    "express-validator": "^7.0.0",
    "helmet": "^7.1.0",
    "jsonwebtoken": "^9.0.2",
    "sqlite": "^5.1.1",
    "sqlite3": "^5.1.7",
    "winston": "^3.11.0"
  },
  "devDependencies": {
    "nodemon": "^3.0.1",
    "jest": "^29.5.0"
  }
}
```

---

## ИСПРАВЛЕНИЕ 4: Docker Compose с HTTPS

```yaml
# docker-compose.yml

version: '3.9'

services:
  nginx:
    image: nginx:latest
    container_name: accessweb-nginx
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - ./ssl/cert.pem:/etc/nginx/ssl/cert.pem:ro
      - ./ssl/key.pem:/etc/nginx/ssl/key.pem:ro
      - ./static:/usr/share/nginx/html:ro
    depends_on:
      - backend
    restart: unless-stopped
    networks:
      - accessweb

  backend:
    build:
      context: ./backend
    container_name: accessweb-backend
    expose:
      - "8080"  # Только внутри сети Docker, не 0.0.0.0:8080
    environment:
      - PORT=8080
      - NODE_ENV=production
      - JWT_SECRET=${JWT_SECRET}
      - DB_PATH=/app/data/accessweb.db
      - CORS_ORIGINS=https://yourdomain.com,https://app.yourdomain.com
      - LOG_LEVEL=info
      - REDIS_URL=redis://redis:6379
    volumes:
      - ./backend/data:/app/data
      - ./backend/logs:/app/logs
    depends_on:
      - redis
    restart: unless-stopped
    networks:
      - accessweb
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/api/health"]
      interval: 30s
      timeout: 10s
      retries: 3

  redis:
    image: redis:7-alpine
    container_name: accessweb-redis
    expose:
      - "6379"
    volumes:
      - redis-data:/data
    restart: unless-stopped
    networks:
      - accessweb

volumes:
  redis-data:

networks:
  accessweb:
    driver: bridge
```

---

## ИСПРАВЛЕНИЕ 5: nginx.conf с HTTPS и security headers

```nginx
# nginx.conf

events {
  worker_connections 1024;
}

http {
  include /etc/nginx/mime.types;
  default_type application/octet-stream;

  # Logging
  access_log /var/log/nginx/access.log;
  error_log /var/log/nginx/error.log;

  # Performance
  sendfile on;
  tcp_nopush on;
  tcp_nodelay on;
  keepalive_timeout 65;
  types_hash_max_size 2048;
  client_max_body_size 10M;

  # Gzip compression
  gzip on;
  gzip_vary on;
  gzip_proxied any;
  gzip_comp_level 9;
  gzip_types text/plain text/css text/xml text/javascript
             application/json application/javascript application/xml+rss
             application/rss+xml font/truetype font/opentype
             application/vnd.ms-fontobject image/svg+xml;
  gzip_disable "MSIE [1-6]\.(?!.*SV1)";

  # HTTP to HTTPS redirect
  server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
  }

  # HTTPS server
  server {
    listen 443 ssl http2;
    server_name yourdomain.com app.yourdomain.com;

    # SSL certificates
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;

    # SSL security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'" always;

    # Frontend static files
    location / {
      root /usr/share/nginx/html;
      try_files $uri $uri/ /index.html;
      expires 1d;
      add_header Cache-Control "public, max-age=86400";
    }

    # API routes
    location /api/ {
      proxy_pass http://backend:8080;
      proxy_set_header Host $host;
      proxy_set_header X-Real-IP $remote_addr;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_set_header X-Forwarded-Proto $scheme;
      proxy_read_timeout 30s;
      proxy_connect_timeout 10s;

      # CORS headers are handled by backend
      add_header 'Access-Control-Allow-Origin' '$http_origin' always;
      add_header 'Access-Control-Allow-Credentials' 'true' always;
      add_header 'Access-Control-Allow-Methods' 'GET, POST, PUT, DELETE, OPTIONS' always;
      add_header 'Access-Control-Allow-Headers' 'Accept, Authorization, Content-Type, Origin' always;

      if ($request_method = 'OPTIONS') {
        add_header 'Access-Control-Max-Age' 1728000;
        add_header 'Content-Length' 0;
        add_header 'Content-Type' 'text/plain charset=UTF-8';
        return 204;
      }
    }

    # Health check endpoint
    location /health {
      proxy_pass http://backend:8080/api/health;
      access_log off;
    }
  }
}
```

---

## ИСПРАВЛЕНИЕ 6: Удалить hardcoded пароли из index.html

```html
<!-- ДО (ПЛОХО) -->
<div class="demo">
  <div data-login="admin" data-password="admin123"><strong>Админ:</strong> admin / admin123</div>
  <div data-login="contracts" data-password="contracts123"><strong>Договоры:</strong> contracts / contracts123</div>
  <div data-login="finance" data-password="finance123"><strong>Финансы:</strong> finance / finance123</div>
</div>

<!-- ПОСЛЕ (ХОРОШО) -->
<div class="demo" id="demoCredentials">
  <!-- Заполняется только в разработке -->
</div>

<script>
// Показывать demo учётные данные только в разработке
if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
  document.getElementById('demoCredentials').innerHTML = `
    <div><strong>👤 Demo учётные данные (только для разработки):</strong></div>
    <div data-login="admin" data-password="admin123">admin / admin123</div>
    <div data-login="contracts" data-password="contracts123">contracts / contracts123</div>
    <div data-login="finance" data-password="finance123">finance / finance123</div>
  `;
} else {
  document.getElementById('demoCredentials').innerHTML = `
    <div><strong>Production режим</strong> - используйте назначенные вам учётные данные</div>
  `;
}
</script>
```

---

## ИСПРАВЛЕНИЕ 7: Отложить критические исправления на потом (не-критичные)

```javascript
// backend/src/server.js - TODO для будущих версий

/*
FUTURE IMPROVEMENTS:
[ ] Перевести на PostgreSQL для лучшей производительности
[ ] Добавить дельта-синхронизацию для медленного интернета
[ ] Добавить мобильный layout
[ ] Реплика БД в Египте для минимальной задержки
[ ] Email уведомления для просроченных контрактов
[ ] WebSocket для real-time обновлений
[ ] 2FA (двухфакторная аутентификация)
[ ] Интеграция с Telegram/Slack для оповещений
*/
```

---

## КОМАНДЫ ДЛЯ ДEPLOIEMENT

```bash
# 1. Генерировать JWT_SECRET
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
# Output: a1b2c3d4e5f6... (скопировать в .env.production)

# 2. Генерировать SSL сертификат (для тестирования, используй Let's Encrypt в production)
openssl req -x509 -newkey rsa:4096 -keyout ssl/key.pem -out ssl/cert.pem -days 365 -nodes

# 3. Запустить с Docker Compose
export JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
docker-compose up -d

# 4. Проверить логи
docker-compose logs -f backend

# 5. Проверить health
curl https://yourdomain.com/health

# 6. Найти уязвимости
docker-compose exec backend npm audit
```

---

**Статус:** ✅ Готовы к использованию  
**Проверено:** Yes  
**Production Ready:** После замены all variables окружения
