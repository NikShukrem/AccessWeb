import { open } from 'sqlite';
import sqlite3 from 'sqlite3';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data/accessweb.db');

const db = await open({ filename: DB_PATH, driver: sqlite3.Database });
await db.exec('PRAGMA foreign_keys = ON');
await db.exec('PRAGMA journal_mode = WAL');

// ── helpers ────────────────────────────────────────────────────────────────
const rnd  = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const pick = arr => arr[rnd(0, arr.length - 1)];
const date = (daysOffset) => {
  const d = new Date();
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
};
const amt  = (min, max) => +(Math.random() * (max - min) + min).toFixed(2);

// ── reference data ─────────────────────────────────────────────────────────
const countries     = ['China', 'Germany', 'Turkey', 'UAE', 'Russia', 'Italy', 'South Korea', 'Japan', 'India', 'USA'];
const ports         = ['Shanghai', 'Hamburg', 'Istanbul', 'Jebel Ali', 'Novorossiysk', 'Genova', 'Busan', 'Yokohama', 'Nhava Sheva', 'New York'];
const vessels       = ['MSC DIANA', 'EVER GIVEN', 'COSCO SHIPPING', 'MAERSK MADRID', 'CMA CGM MARCO POLO', 'HAPAG LLOYD', 'ONE STORK', 'YANG MING', 'PIL CETUS', 'ZIM ROTTERDAM'];
const lines         = ['MSC', 'Maersk', 'CMA CGM', 'Hapag-Lloyd', 'COSCO', 'Evergreen', 'ONE', 'Yang Ming', 'PIL', 'ZIM'];
const incoterms_l   = ['FOB', 'CIF', 'CFR', 'EXW', 'DAP', 'DDP'];
const shipTypes     = ['FCL', 'LCL', 'Bulk', 'RoRo', 'Air'];
const cargoNames    = ['Строительные материалы', 'Оборудование', 'Металлоконструкции', 'Электрооборудование', 'Трубопроводная арматура', 'Кабельная продукция', 'Насосное оборудование', 'Компрессоры', 'Генераторы', 'Химическое сырьё', 'Стальные конструкции', 'Спецтехника', 'Запасные части', 'Лабораторное оборудование', 'Промышленные фильтры'];
const purposes      = ['Строительство', 'Монтаж', 'Комплектация', 'Замена', 'Ремонт', 'Расширение'];
const importModes   = ['IM4', 'IM6', 'IM7', 'Временный ввоз'];
const acidStatuses  = ['pending', 'in_transit', 'customs', 'delivered', 'cancelled'];
const acidWeights   = [70, 10, 10, 8, 2]; // probability weights for statuses
const currencies    = ['USD', 'EUR', 'EGP'];
const departments   = ['Логистика', 'Снабжение', 'Операционный отдел'];
const responsibles  = ['Иванов А.В.', 'Петрова М.С.', 'Сидоров Д.К.', 'Козлова Е.Н.', 'Фёдоров П.О.', 'Новикова Т.А.', 'Морозов В.И.', 'Захарова Л.Р.'];
const contractTypes = ['supply', 'service', 'main_construction', 'invoice'];
const contStatuses  = ['active', 'active', 'active', 'completed', 'expired', 'suspended'];
const txStatuses    = ['pending', 'pending', 'paid', 'paid', 'paid', 'overdue', 'cancelled'];
const cfos          = ['ЦФО-1', 'ЦФО-2', 'ЦФО-3'];
const projects      = ['Проект Альфа', 'Проект Бета', 'Инфраструктура', 'Основное строительство', 'Вспомогательные работы'];
const orgs          = ['АО "Египет Строй"', 'ООО "ТитанЛоджистик"', 'ЗАО "СтройИмпорт"', 'ОАО "ТехСнаб"'];

function weightedPick(arr, weights) {
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < arr.length; i++) { r -= weights[i]; if (r <= 0) return arr[i]; }
  return arr[arr.length - 1];
}

// ── 1. COUNTERPARTIES (30) ─────────────────────────────────────────────────
console.log('Seeding counterparties...');
const cpNames = [
  ['Shanghai Steel Co.', 'Shanghai Steel', 'China', 'supplier'],
  ['Deutsche Maschinen GmbH', 'Deutsche M.', 'Germany', 'supplier'],
  ['Türk Boru A.Ş.', 'Türk Boru', 'Turkey', 'supplier'],
  ['Gulf Trading FZE', 'Gulf Trading', 'UAE', 'supplier'],
  ['Novorossiysk Shipping', 'NovoShip', 'Russia', 'carrier'],
  ['MSC Mediterranean', 'MSC', 'Switzerland', 'carrier'],
  ['Maersk Line A/S', 'Maersk', 'Denmark', 'carrier'],
  ['CMA CGM S.A.', 'CMA CGM', 'France', 'carrier'],
  ['Korea Heavy Ind.', 'KHI', 'South Korea', 'supplier'],
  ['Italian Engineering S.p.A.', 'Italian Eng.', 'Italy', 'supplier'],
  ['Японская Корпорация', 'Japan Corp', 'Japan', 'supplier'],
  ['India Tech Ltd.', 'India Tech', 'India', 'supplier'],
  ['American Systems Inc.', 'AmSystems', 'USA', 'supplier'],
  ['Alexandria Import Co.', 'Alexandria Imp.', 'Egypt', 'importer'],
  ['Cairo Logistics LLC', 'Cairo Log.', 'Egypt', 'importer'],
  ['Hapag-Lloyd AG', 'Hapag-Lloyd', 'Germany', 'carrier'],
  ['Evergreen Marine Corp.', 'Evergreen', 'Taiwan', 'carrier'],
  ['ONE Ocean Network', 'ONE', 'Japan', 'carrier'],
  ['Yang Ming Marine', 'Yang Ming', 'Taiwan', 'carrier'],
  ['PIL Pacific Intl.', 'PIL', 'Singapore', 'carrier'],
  ['ZIM Integrated', 'ZIM', 'Israel', 'carrier'],
  ['COSCO Shipping', 'COSCO', 'China', 'carrier'],
  ['Siemens AG', 'Siemens', 'Germany', 'supplier'],
  ['ABB Group', 'ABB', 'Switzerland', 'supplier'],
  ['Schneider Electric', 'Schneider', 'France', 'supplier'],
  ['Caterpillar Inc.', 'CAT', 'USA', 'supplier'],
  ['Komatsu Ltd.', 'Komatsu', 'Japan', 'supplier'],
  ['Liebherr Group', 'Liebherr', 'Germany', 'supplier'],
  ['Atlas Copco AB', 'Atlas Copco', 'Sweden', 'supplier'],
  ['Grundfos A/S', 'Grundfos', 'Denmark', 'supplier'],
];

const counterpartyIds = [];
for (const [name, short_name, country, type] of cpNames) {
  const id = uuidv4();
  counterpartyIds.push({ id, name, type });
  await db.run(
    `INSERT OR IGNORE INTO counterparties (id, name, short_name, country, type, is_active) VALUES (?,?,?,?,?,1)`,
    [id, name, short_name, country, type]
  );
}
console.log(`  → ${cpNames.length} counterparties`);

const suppliers = counterpartyIds.filter(c => c.type === 'supplier');
const carriers  = counterpartyIds.filter(c => c.type === 'carrier');

// ── 2. CONTRACTS (50) ─────────────────────────────────────────────────────
console.log('Seeding contracts...');
const contractIds = [];
for (let i = 1; i <= 50; i++) {
  const id  = uuidv4();
  const num = `К-2024/${String(i).padStart(3,'0')}`;
  const cp  = pick(suppliers);
  const amt_base = amt(50000, 5000000);
  const ds_mult  = 1 + Math.random() * 0.3;
  const paid_pct = Math.random();
  const status   = pick(contStatuses);
  const startDay = rnd(-500, -30);
  const endDay   = rnd(30, 365);
  contractIds.push({ id, num });
  await db.run(`
    INSERT OR IGNORE INTO contracts
      (id, contract_number, type, counterparty_id, counterparty, name,
       contract_date, validity_period, amount, amount_with_ds, currency,
       paid_amount, limit_balance, procurement_type, lot_number,
       status, currency_control, responsible, route_to, notes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, num, pick(contractTypes), cp.id, cp.name,
      `Договор поставки ${pick(cargoNames).toLowerCase()}`,
      date(startDay), date(endDay),
      amt_base, +(amt_base * ds_mult).toFixed(2), 'USD',
      +(amt_base * ds_mult * paid_pct).toFixed(2),
      +(amt_base * ds_mult * (1 - paid_pct)).toFixed(2),
      pick(['Тендер', 'Прямая закупка', 'КП']),
      `Лот-${rnd(1,20)}`,
      status, pick(['Пройден', 'В процессе', null]),
      pick(responsibles), pick(countries),
      Math.random() > 0.7 ? `Примечание по договору ${i}` : null,
    ]
  );
}
console.log(`  → 50 contracts`);

// ── 3. ACID CARGOS (500) ───────────────────────────────────────────────────
console.log('Seeding acid cargos...');
const acidCodes = [];
for (let i = 1; i <= 500; i++) {
  const id       = uuidv4();
  const acidCode = `ACID-${String(2024000 + i)}`;
  acidCodes.push(acidCode);
  const status   = weightedPick(acidStatuses, acidWeights);
  const contract = pick(contractIds);
  const shipper  = pick(suppliers);
  const carrier  = pick(carriers);
  const etd_off  = rnd(-180, 60);
  const eta_off  = etd_off + rnd(15, 45);
  const cur      = pick(currencies);

  await db.run(`
    INSERT OR IGNORE INTO acid
      (id, acid, ais_number, initial_request_number, shipment_type,
       shipper_id, shipper, supplier_id, supplier, importer_name,
       name, gw_kg, packages_qty, containers_qty, transport_type,
       cargo_cost, currency, shipping_cost, incoterms,
       departure_country, departure_port, delivery_place, arrival_place,
       vessel, shipping_line, bol_number, bol_date, carrier,
       etd, eta, delivery_date, egypt_arrival_date,
       release_request_date, release_curator, release_received_date,
       do_released, import_mode, dt_number, dt_date, dt_release_date,
       delivery_to_site_date, custom_status, purpose, upo_curator,
       invoice_uploaded, extended_to, status, responsible,
       notes, comment, contract_id, contract_number)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, acidCode,
      `АИС-${rnd(10000,99999)}`,
      `ЗАП-${rnd(1000,9999)}`,
      pick(shipTypes),
      shipper.id, shipper.name,
      shipper.id, shipper.name,
      'Египет Строй АО',
      pick(cargoNames),
      amt(500, 50000),
      rnd(1, 200), rnd(1, 20),
      pick(['Морской', 'Авиа', 'Авто', 'Ж/Д']),
      amt(10000, 2000000), cur,
      amt(1000, 100000),
      pick(incoterms_l),
      pick(countries), pick(ports),
      'Порт Александрия, Египет',
      'Александрия',
      pick(vessels), pick(lines),
      `BOL${rnd(100000,999999)}`,
      date(etd_off - 5),
      pick(carriers).name,
      date(etd_off), date(eta_off),
      status === 'delivered' ? date(eta_off + rnd(1,10)) : null,
      status === 'delivered' ? date(eta_off + rnd(2,15)) : (status === 'customs' ? date(eta_off + rnd(1,5)) : null),
      status === 'customs' || status === 'delivered' ? date(eta_off + rnd(1,5)) : null,
      pick(responsibles),
      status === 'customs' || status === 'delivered' ? date(eta_off + rnd(2,7)) : null,
      status === 'delivered' ? 'DO выдан' : null,
      pick(importModes),
      status === 'delivered' ? `ДТ${rnd(10000000,99999999)}` : null,
      status === 'delivered' ? date(eta_off + rnd(5,20)) : null,
      status === 'delivered' ? date(eta_off + rnd(6,25)) : null,
      status === 'delivered' ? date(eta_off + rnd(10,30)) : null,
      status === 'delivered' ? 'Выпущен' : (status === 'customs' ? 'На оформлении' : null),
      pick(purposes),
      pick(responsibles),
      Math.random() > 0.5 ? 1 : 0,
      Math.random() > 0.8 ? date(rnd(30,180)) : null,
      status,
      pick(responsibles),
      Math.random() > 0.6 ? `Примечание груза ${i}` : null,
      Math.random() > 0.7 ? `Комментарий ${i}` : null,
      contract.id, contract.num,
    ]
  );
  if (i % 100 === 0) process.stdout.write(`  → ${i}/500\n`);
}
console.log('  → 500 acid records');

// ── 4. AIS_TRANSACTIONS (700) ─────────────────────────────────────────────
console.log('Seeding ais_transactions...');
for (let i = 1; i <= 700; i++) {
  const id       = uuidv4();
  const contract = pick(contractIds);
  const cp       = pick(suppliers);
  const txDate   = date(rnd(-365, 0));
  const cur      = pick(currencies);
  const amtVal   = amt(1000, 500000);
  const rates    = { USD: 1, EUR: 1.08, EGP: 0.021 };
  const amtUSD   = +(amtVal * (rates[cur] || 1)).toFixed(2);
  const acid     = Math.random() > 0.3 ? pick(acidCodes) : null;
  const org      = pick(orgs);

  await db.run(`
    INSERT OR IGNORE INTO ais_transactions
      (id, date, number, expense_date, kti_date, currency, amount, amount_usd,
       organization, counterparty, counterparty_short,
       counterparty_id, contract_number, contract_date, contract_id,
       project, status, cfo, responsible, urgent, acid_link)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    [
      id, txDate,
      `СЧ-${String(i).padStart(5,'0')}`,
      txDate,
      `${rnd(2023,2025)}-01-01`,
      cur, amtVal, amtUSD,
      org, cp.name,
      cp.name.split(' ')[0],
      cp.id,
      contract.num, date(rnd(-500,-30)),
      contract.id,
      pick(projects),
      pick(txStatuses),
      pick(cfos),
      pick(responsibles),
      Math.random() > 0.9 ? 1 : 0,
      acid,
    ]
  );
  if (i % 100 === 0) process.stdout.write(`  → ${i}/700\n`);
}
console.log('  → 700 transactions');

await db.close();
console.log('\nDone! DB seeded successfully.');
