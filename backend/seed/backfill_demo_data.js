// One-off/rerunnable backfill for demo data richness. Safe to run multiple times
// (idempotent: only fills gaps, never duplicates). Delete this file to remove it —
// it isn't imported by server.js, so nothing else depends on it.
//
// Usage: node backend/seed/backfill_demo_data.js [path-to-accessweb.db]
import sqlite3 from 'sqlite3';
import { open } from 'sqlite';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.argv[2] || join(__dirname, '../data/accessweb.db');

const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[rnd(0, arr.length - 1)];

const FORWARDERS = [
  'ООО "ЕгиптТранс"', 'Nile Logistics LLC', 'Cairo Freight Services',
  'ООО "КарготрансЭкспо"', 'Red Sea Forwarding Co.', 'ООО "ВостокЭкспедиция"',
  'Alexandria Shipping Agency', 'ООО "ТрансКонтейнер-Юг"'
];

const NOMENCLATURE_POOL = [
  ['Кабель силовой ВВГ 3x2.5', 'КБ-001', 'м'],
  ['Труба стальная бесшовная', 'ТР-014', 'м'],
  ['Насос центробежный', 'НС-220', 'шт'],
  ['Компрессор винтовой', 'КМ-330', 'шт'],
  ['Фильтр промышленный', 'ФЛ-050', 'шт'],
  ['Генератор дизельный', 'ГН-500', 'шт'],
  ['Электродвигатель асинхронный', 'ЭД-075', 'шт'],
  ['Клапан запорный', 'КЗ-100', 'шт'],
  ['Металлоконструкция балочная', 'МК-200', 'т'],
  ['Профиль стальной гнутый', 'ПС-060', 'м'],
  ['Лист стальной горячекатаный', 'ЛС-010', 'т'],
  ['Болт М16', 'БТ-016', 'шт'],
  ['Подшипник роликовый', 'ПД-305', 'шт'],
  ['Редуктор червячный', 'РД-140', 'шт'],
  ['Щит распределительный', 'ЩР-400', 'шт'],
  ['Кабельный лоток', 'КЛ-075', 'м'],
  ['Изоляционный материал', 'ИМ-025', 'м2'],
  ['Трансформатор силовой', 'ТФ-630', 'шт'],
  ['Задвижка клиновая', 'ЗД-150', 'шт'],
  ['Рукав напорный', 'РН-032', 'м'],
];

const CONTRACT_TYPES_FOR_ITEMS_MSG = null; // (unused placeholder, kept out of the way)

async function main() {
  const db = await open({ filename: dbPath, driver: sqlite3.Database });
  await db.exec('PRAGMA busy_timeout=5000');

  // ---- 1. Fill missing forwarder on acid rows ----
  const acidMissingForwarder = await db.all("SELECT id FROM acid WHERE forwarder IS NULL OR forwarder = ''");
  for (const row of acidMissingForwarder) {
    await db.run('UPDATE acid SET forwarder = ? WHERE id = ?', [pick(FORWARDERS), row.id]);
  }
  console.log(`Forwarder filled on ${acidMissingForwarder.length} acid rows.`);

  // ---- 2. Every delivered ACID needs a contract + at least one linked счёт ----
  const delivered = await db.all("SELECT * FROM acid WHERE status = 'delivered'");
  const contracts = await db.all('SELECT id, contract_number FROM contracts');
  const counterparties = await db.all('SELECT id, name FROM counterparties');
  let contractsAssigned = 0;
  let transactionsCreated = 0;

  for (const acid of delivered) {
    let contractId = acid.contract_id;
    let contractNumber = acid.contract_number;

    if (!contractId && contracts.length) {
      const c = pick(contracts);
      contractId = c.id;
      contractNumber = c.contract_number;
      await db.run('UPDATE acid SET contract_id = ?, contract_number = ? WHERE id = ?', [contractId, contractNumber, acid.id]);
      contractsAssigned++;
    }

    const existing = await db.get(
      'SELECT id FROM ais_transactions WHERE acid_link = ? LIMIT 1', [acid.acid]
    );
    if (existing) continue;

    const cp = counterparties.length ? pick(counterparties) : null;
    const amount = +(rnd(5000, 500000) + Math.random()).toFixed(2);
    const id = uuidv4();
    await db.run(
      `INSERT INTO ais_transactions
        (id, date, number, expense_date, currency, amount, amount_usd,
         organization, counterparty, counterparty_id, contract_number, contract_id,
         status, responsible, acid_link)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [
        id,
        acid.delivery_date || acid.eta || new Date().toISOString().slice(0, 10),
        `СЧ-BF${rnd(1000, 9999)}`,
        acid.delivery_date || acid.eta || new Date().toISOString().slice(0, 10),
        'USD', amount, amount,
        'АО "Египет Строй"',
        cp ? cp.name : null, cp ? cp.id : null,
        contractNumber, contractId,
        'paid', acid.responsible || null, acid.acid
      ]
    );
    transactionsCreated++;
  }
  console.log(`Contracts assigned to ${contractsAssigned} delivered ACID; ${transactionsCreated} счёта created to cover the rest.`);

  // ---- 3. Every счёт needs 2-20 nomenclature line items ----
  const transactions = await db.all('SELECT id FROM ais_transactions');
  let txFilled = 0;
  let itemsCreated = 0;

  for (const tx of transactions) {
    const { cnt } = await db.get('SELECT COUNT(*) AS cnt FROM transaction_items WHERE transaction_id = ?', [tx.id]);
    if (cnt > 0) continue;

    const itemCount = rnd(2, 20);
    for (let i = 0; i < itemCount; i++) {
      const [name, sku, unit] = pick(NOMENCLATURE_POOL);
      const quantity = rnd(1, 200);
      const unitPrice = +(rnd(10, 5000) + Math.random()).toFixed(2);
      await db.run(
        `INSERT INTO transaction_items (id, transaction_id, name, sku, unit, quantity, unit_price, amount, sort_order)
         VALUES (?,?,?,?,?,?,?,?,?)`,
        [uuidv4(), tx.id, name, sku, unit, quantity, unitPrice, +(quantity * unitPrice).toFixed(2), i]
      );
      itemsCreated++;
    }
    txFilled++;
  }
  console.log(`Nomenclature items created for ${txFilled} счёта (${itemsCreated} items total).`);

  await db.close();
  console.log('Done.');
}

main().catch(err => { console.error(err); process.exit(1); });
