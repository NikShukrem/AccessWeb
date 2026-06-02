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
  try {
    // Remove old database if it exists
    if (fs.existsSync(DB_PATH)) {
      fs.unlinkSync(DB_PATH);
      console.log('Old database removed');
    }
  } catch (err) {
    console.log('Database cleanup skipped:', err.message);
  }

  db = await open({
    filename: DB_PATH,
    driver: sqlite3.Database
  });

  const schema = fs.readFileSync(join(__dirname, '../data/schema.sql'), 'utf8');
  await db.exec(schema);

  // Create default users
  const admin = await db.get("SELECT * FROM users WHERE login = 'admin'");
  if (!admin) {
    const hash = await bcryptjs.hash('admin123', 10);
    await db.run(
      `INSERT INTO users (id, login, password_hash, name, role) VALUES (?, ?, ?, ?, ?)`,
      [uuidv4(), 'admin', hash, 'Administrator', 'admin']
    );
  }

  console.log('Database initialized with new schema v3.0');
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

app.post('/auth/login', async (req, res) => {
  try {
    const { login, password } = req.body;

    const user = await db.get('SELECT * FROM users WHERE login = ?', [login]);
    if (!user) return res.status(401).json({ error: 'Invalid credentials' });

    const isValid = await bcryptjs.compare(password, user.password_hash);
    if (!isValid) return res.status(401).json({ error: 'Invalid credentials' });

    const token = jwt.sign(
      { id: user.id, login: user.login, role: user.role },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/auth/me', auth, async (req, res) => {
  try {
    const user = await db.get('SELECT * FROM users WHERE id = ?', [req.user.id]);
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== GENERIC CRUD ==============

// GET all records from a table
app.get('/:table', auth, async (req, res) => {
  try {
    const { table } = req.params;
    const validTables = ['acid', 'contracts', 'contract_stages', 'finance'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    const limit = parseInt(req.query.limit) || 100;
    const offset = parseInt(req.query.offset) || 0;

    const rows = await db.all(
      `SELECT * FROM ${table} LIMIT ? OFFSET ?`,
      [limit, offset]
    );

    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// CREATE a new record
app.post('/:table', auth, async (req, res) => {
  try {
    const { table } = req.params;
    const validTables = ['acid', 'contracts', 'contract_stages', 'finance'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    const data = req.body;
    const id = data.id || uuidv4();
    
    // Get column names from table
    const columns = Object.keys(data).filter(k => k !== 'id');
    const values = columns.map(k => data[k]);
    
    const placeholders = Array(columns.length + 1).fill('?').join(',');
    const columnsList = ['id', ...columns].join(',');

    await db.run(
      `INSERT INTO ${table} (${columnsList}) VALUES (${placeholders})`,
      [id, ...values]
    );

    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// UPDATE a record
app.put('/:table/:id', auth, async (req, res) => {
  try {
    const { table, id } = req.params;
    const validTables = ['acid', 'contracts', 'contract_stages', 'finance'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    const data = req.body;
    const columns = Object.keys(data).filter(k => k !== 'id');
    
    const updates = columns.map(k => `${k} = ?`).join(', ');
    const values = columns.map(k => data[k]);

    await db.run(
      `UPDATE ${table} SET ${updates}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [...values, id]
    );

    res.json({ id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE a record
app.delete('/:table/:id', auth, async (req, res) => {
  try {
    const { table, id } = req.params;
    const validTables = ['acid', 'contracts', 'contract_stages', 'finance'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    await db.run(`DELETE FROM ${table} WHERE id = ?`, [id]);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== IMPORT ==============

app.post('/import/:table', auth, async (req, res) => {
  try {
    const { table } = req.params;
    const validTables = ['acid', 'contracts', 'finance'];
    
    if (!validTables.includes(table)) {
      return res.status(400).json({ error: 'Invalid table' });
    }

    const { rows } = req.body;
    if (!Array.isArray(rows)) {
      return res.status(400).json({ error: 'rows must be an array' });
    }

    let imported = 0;
    for (const data of rows) {
      const id = uuidv4();
      const columns = Object.keys(data);
      const values = columns.map(k => data[k]);
      
      const placeholders = Array(columns.length + 1).fill('?').join(',');
      const columnsList = ['id', ...columns].join(',');

      await db.run(
        `INSERT INTO ${table} (${columnsList}) VALUES (${placeholders})`,
        [id, ...values]
      );
      imported++;
    }

    res.json({ imported });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============== STARTUP ==============

async function start() {
  try {
    await initDB();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
      console.log(`Database: ${DB_PATH}`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();
