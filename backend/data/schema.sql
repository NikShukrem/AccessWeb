-- AccessWeb Production Database Schema
-- Optimized for logistics, contracts, and financial tracking

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL,
  department TEXT,
  is_egypt_mode BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ACID TABLES (разбиты на 3 связанные таблицы) =====

-- ACID Main (основная информация о грузе)
CREATE TABLE IF NOT EXISTS acid_main (
  id TEXT PRIMARY KEY,
  acid TEXT UNIQUE NOT NULL,
  nomyer_ais TEXT,
  initial_request_number TEXT,
  shipment_type TEXT,
  importer_name TEXT,
  gruzootravitel TEXT,
  registration_number TEXT,
  vat_number TEXT,
  status TEXT DEFAULT 'pending',
  postavshchik TEXT,
  naimenovanie TEXT,
  gw_kg REAL,
  stoimost_gruza REAL,
  valyuta TEXT DEFAULT 'USD',
  kolichestvo_mest INTEGER,
  tip_perevozki TEXT,
  kolichestvo_konteynerov INTEGER,
  strana_otpravleniya TEXT,
  kontract_id TEXT,
  otvetstvennyy TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(kontract_id) REFERENCES contract_main(id)
);

-- ACID Logistics (информация о логистике)
CREATE TABLE IF NOT EXISTS acid_logistics (
  id TEXT PRIMARY KEY,
  acid_id TEXT NOT NULL,
  etd TEXT,
  eta TEXT,
  mesto_pribytiya TEXT,
  incoterms TEXT,
  mesto_postavki TEXT,
  data_postavki TEXT,
  port_otpravleniya TEXT,
  sudno TEXT,
  shipping_line TEXT,
  bol_number TEXT,
  bol_date TEXT,
  perevozchik TEXT,
  data_zaprosa_osvobozhdeniya TEXT,
  kurator_osvobozhdeniya TEXT,
  data_polucheniya_osvobozhdeniya TEXT,
  data_pribytiya_egypt TEXT,
  do_released TEXT,
  rezhim_vvoza TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(acid_id) REFERENCES acid_main(id) ON DELETE CASCADE
);

-- ACID Customs (информация о таможне)
CREATE TABLE IF NOT EXISTS acid_customs (
  id TEXT PRIMARY KEY,
  acid_id TEXT NOT NULL,
  nomer_dt TEXT,
  data_dt TEXT,
  data_vypuska_dt TEXT,
  data_dostavki_na_ploschad TEXT,
  naznachenie TEXT,
  kurator_upo TEXT,
  primechanie TEXT,
  invoiz_zagruzhen BOOLEAN DEFAULT FALSE,
  prodlen_do TEXT,
  custom_status TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(acid_id) REFERENCES acid_main(id) ON DELETE CASCADE
);

-- ===== CONTRACT TABLES =====

-- Contract Main (основная информация)
CREATE TABLE IF NOT EXISTS contract_main (
  id TEXT PRIMARY KEY,
  nomer_kontrakta TEXT UNIQUE NOT NULL,
  tip_kontrakta TEXT,
  kontragent TEXT,
  nazvanie TEXT,
  data_kontrakta TEXT,
  srok_deystviya TEXT,
  ds_data TEXT,
  cena_kontrakta REAL,
  valyuta TEXT DEFAULT 'USD',
  summa_oplatы REAL,
  marshrut_to TEXT,
  vid_zakupki TEXT,
  lot_nomer TEXT,
  status TEXT DEFAULT 'active',
  valyutnyy_kontrol TEXT,
  komentar TEXT,
  ssylka TEXT,
  ostatok_limita REAL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contract Stages (отслеживание этапов подписания)
CREATE TABLE IF NOT EXISTS contract_stages (
  id TEXT PRIMARY KEY,
  kontract_id TEXT NOT NULL,
  stage_number INTEGER,
  stage_name TEXT,
  status TEXT DEFAULT 'pending',
  data_nachal TEXT,
  data_okonch TEXT,
  kurator TEXT,
  komentar TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(kontract_id) REFERENCES contract_main(id) ON DELETE CASCADE
);

-- ===== ACID-KTI LINK TABLE =====

CREATE TABLE IF NOT EXISTS acid_kti (
  id TEXT PRIMARY KEY,
  acid_id TEXT NOT NULL,
  data_polucheniya TEXT,
  nomer_kontrakta TEXT,
  summa_perevozki REAL,
  valyuta TEXT DEFAULT 'USD',
  nomer_ais TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(acid_id) REFERENCES acid_main(id) ON DELETE CASCADE,
  FOREIGN KEY(nomer_kontrakta) REFERENCES contract_main(nomer_kontrakta)
);

-- ===== FINANCE/AIS EXPORT TABLE =====

CREATE TABLE IF NOT EXISTS finance_ais_export (
  id TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  nomer TEXT,
  data_raskhoda TEXT,
  kti_data TEXT,
  valyuta TEXT DEFAULT 'USD',
  summa_usd REAL,
  organizaciya TEXT,
  kontragent TEXT,
  kontragent_kratko TEXT,
  dogovor_kontragenta TEXT,
  data_dogovora_kontragenta TEXT,
  dogovor_i_data TEXT,
  proyekt TEXT,
  sostoyanie TEXT,
  cfo TEXT,
  otvetstvennyy TEXT,
  srochnyy_platezh BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Notifications
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  message TEXT,
  type TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- User Permissions
CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  table_name TEXT,
  can_view BOOLEAN DEFAULT FALSE,
  can_create BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  UNIQUE(user_id, table_name)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_acid_main_status ON acid_main(status);
CREATE INDEX IF NOT EXISTS idx_acid_main_kontract ON acid_main(kontract_id);
CREATE INDEX IF NOT EXISTS idx_acid_logistics_acid ON acid_logistics(acid_id);
CREATE INDEX IF NOT EXISTS idx_acid_customs_acid ON acid_customs(acid_id);
CREATE INDEX IF NOT EXISTS idx_contract_main_status ON contract_main(status);
CREATE INDEX IF NOT EXISTS idx_contract_stages_contract ON contract_stages(kontract_id);
CREATE INDEX IF NOT EXISTS idx_acid_kti_acid ON acid_kti(acid_id);
CREATE INDEX IF NOT EXISTS idx_finance_data ON finance_ais_export(data);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
