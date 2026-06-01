import express from 'express';
import cors from 'cors';
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
const JWT_SECRET = process.env.JWT_SECRET || 'secret-key';
const DB_PATH = process.env.DB_PATH || join(__dirname, '../data/accessweb.db');

let db = null;

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '10mb' }));
app.use(express.static(join(__dirname, '../../')));

// ============== DB INIT ==============

async function initDB() {
  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  const schema = fs.readFileSync(join(__dirname, '../data/schema.sql'), 'utf8');
  await db.exec(schema);

  const admin = await db.get("SELECT * FROM users WHERE login = 'admin'");
  if (!admin) {
    const hash = await bcryptjs.hash('admin123', 10);
    await db.run(
      `INSERT INTO users (id, login, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'admin', hash, 'Administrator', 'admin']
    );
  }

  console.log('Database initialized');
}

// ============== MIDDLEWARE ==============

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid token' });
  }
}

// ============== AUTH ==============

app.post('/api/auth/login', async (req, res) => {
  const { login, password } = req.body;

  const user = await db.get('SELECT * FROM users WHERE login = ?', [login]);
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });

  const isValid = await bcryptjs.compare(password, user.password_hash);
  if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

  const token = jwt.sign(
    { id: user.id, login: user.login, role: user.role, name: user.name },
    JWT_SECRET,
    { expiresIn: '24h' }
  );

  res.json({ token, user: { id: user.id, login: user.login, role: user.role, name: user.name } });
});

app.get('/api/auth/me', auth, async (req, res) => {
  const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
  res.json({ user });
});

// ============== GENERIC CRUD ==============

app.get('/api/:table', auth, async (req, res) => {
  const { table } = req.params;
  const { limit = 100, offset = 0 } = req.query;

  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    const records = await db.all(
      `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
      [parseInt(limit), parseInt(offset)]
    );
    const countResult = await db.get(`SELECT COUNT(*) as count FROM ${table}`);

    res.json({
      data: records,
      total: countResult.count || 0,
      limit: parseInt(limit),
      offset: parseInt(offset)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/:table/:id', auth, async (req, res) => {
  const { table, id } = req.params;
  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    const record = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    if (!record) return res.status(404).json({ error: 'Not found' });
    res.json({ data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/:table', auth, async (req, res) => {
  const { table } = req.params;
  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    const id = uuidv4();
    const data = req.body;
    const columns = Object.keys(data).filter(k => k !== 'id');
    const values = columns.map(c => data[c]);

    const placeholders = Array(columns.length).fill('?').join(',');
    const columnList = columns.join(',');

    await db.run(
      `INSERT INTO ${table} (id, ${columnList}) VALUES (?, ${placeholders})`,
      [id, ...values]
    );

    const record = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.status(201).json({ data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/:table/:id', auth, async (req, res) => {
  const { table, id } = req.params;
  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    const data = req.body;
    const columns = Object.keys(data).filter(k => k !== 'id');
    const values = columns.map(c => data[c]);

    const setList = columns.map(c => `${c} = ?`).join(',');

    await db.run(
      `UPDATE ${table} SET ${setList}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );

    const record = await db.get(`SELECT * FROM ${table} WHERE id = ?`, [id]);
    res.json({ data: record });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/:table/:id', auth, async (req, res) => {
  const { table, id } = req.params;
  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  try {
    await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== IMPORT ==============

app.post('/api/import/:table', auth, async (req, res) => {
  const { table } = req.params;
  const { rows } = req.body;
  const allowedTables = ['acids', 'contracts', 'finance'];
  if (!allowedTables.includes(table)) return res.status(400).json({ error: 'Invalid table' });

  if (!Array.isArray(rows)) return res.status(400).json({ error: 'rows must be array' });

  try {
    let imported = 0;
    for (const row of rows) {
      const id = uuidv4();
      const columns = Object.keys(row);
      const values = columns.map(c => row[c]);
      const placeholders = Array(columns.length).fill('?').join(',');
      const columnList = columns.join(',');

      await db.run(
        `INSERT INTO ${table} (id, ${columnList}) VALUES (?, ${placeholders})`,
        [id, ...values]
      );
      imported++;
    }

    res.json({ imported, total: rows.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== START ==============

async function start() {
  await initDB();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

start().catch(console.error);
