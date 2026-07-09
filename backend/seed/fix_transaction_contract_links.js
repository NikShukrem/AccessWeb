// Fixes existing ais_transactions rows whose contract doesn't match the
// contract of the ACID they're linked to (acid_link). Idempotent — safe to
// rerun. Not imported by server.js; the server now enforces this consistency
// going forward on create/update, this script only backfills history.
//
// Usage: node backend/seed/fix_transaction_contract_links.js [path-to-accessweb.db]
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(__dirname, '../data/accessweb.db');

async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout=5000');

  const rows = await db.all(
    `SELECT t.id, t.number, t.acid_link, t.contract_id AS tx_contract_id, t.contract_number AS tx_contract_number,
            a.contract_id AS acid_contract_id, a.contract_number AS acid_contract_number
     FROM ais_transactions t
     JOIN acid a ON a.acid = t.acid_link
     WHERE t.acid_link IS NOT NULL
       AND (t.contract_id IS NOT a.contract_id OR t.contract_number IS NOT a.contract_number)`
  );

  console.log(`Found ${rows.length} счёта whose contract disagrees with their linked ACID's contract.`);
  for (const r of rows) {
    await db.run(
      'UPDATE ais_transactions SET contract_id = ?, contract_number = ? WHERE id = ?',
      [r.acid_contract_id, r.acid_contract_number, r.id]
    );
    console.log(`  Fixed ${r.number}: ${r.tx_contract_number || '(none)'} -> ${r.acid_contract_number || '(none)'}`);
  }

  await db.close();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
