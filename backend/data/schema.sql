-- AccessWeb v3.0 - Redesigned Schema
-- Unified ACID table with 40+ columns, simplified contracts & finance

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  department TEXT,
  is_egypt_mode BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== UNIFIED ACID TABLE (40+ columns) =====
CREATE TABLE IF NOT EXISTS acid (
  id TEXT PRIMARY KEY,
  acid TEXT UNIQUE NOT NULL,
  nomer_ais TEXT,
  initial_request_number TEXT,
  shipment_type TEXT,
  gruzootravitel TEXT,
  postavshchik TEXT,
  importer_name TEXT,
  kontragent TEXT,
  registration_number TEXT,
  vat_number TEXT,
  naimenovanie TEXT,
  gw_kg REAL,
  kolichestvo_mest INTEGER,
  kolichestvo_konteynerov INTEGER,
  tip_perevozki TEXT,
  stoimost_gruza REAL,
  valyuta TEXT DEFAULT 'USD',
  summa_perevozki REAL,
  strana_otpravleniya TEXT,
  port_otpravleniya TEXT,
  incoterms TEXT,
  mesto_postavki TEXT,
  sudno TEXT,
  shipping_line TEXT,
  bol_number TEXT,
  bol_date TEXT,
  perevozchik TEXT,
  etd TEXT,
  eta TEXT,
  data_postavki TEXT,
  data_pribytiya_egypt TEXT,
  mesto_pribytiya TEXT,
  data_zaprosa_osvobozhdeniya TEXT,
  kurator_osvobozhdeniya TEXT,
  data_polucheniya_osvobozhdeniya TEXT,
  do_released TEXT,
  rezhim_vvoza TEXT,
  nomer_dt TEXT,
  data_dt TEXT,
  data_vypuska_dt TEXT,
  data_dostavki_na_ploschad TEXT,
  custom_status TEXT,
  naznachenie TEXT,
  kurator_upo TEXT,
  invoiz_zagruzhen BOOLEAN DEFAULT FALSE,
  prodlen_do TEXT,
  primechanie TEXT,
  status TEXT DEFAULT 'pending',
  otvetstvennyy TEXT,
  komentar TEXT,
  kontract_id TEXT,
  nomer_kontrakta TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(kontract_id) REFERENCES contracts(id),
  FOREIGN KEY(nomer_kontrakta) REFERENCES contracts(nomer_kontrakta)
);

-- ===== CONTRACTS TABLE =====
CREATE TABLE IF NOT EXISTS contracts (
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

-- ===== CONTRACT STAGES TABLE =====
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
  FOREIGN KEY(kontract_id) REFERENCES contracts(id) ON DELETE CASCADE
);

-- ===== FINANCE TABLE =====
CREATE TABLE IF NOT EXISTS finance (
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

-- ===== NOTIFICATIONS TABLE =====
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  title TEXT,
  message TEXT,
  type TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES FOR PERFORMANCE =====
CREATE INDEX IF NOT EXISTS idx_acid_status ON acid(status);
CREATE INDEX IF NOT EXISTS idx_acid_gruzootravitel ON acid(gruzootravitel);
CREATE INDEX IF NOT EXISTS idx_acid_kontract ON acid(kontract_id);
CREATE INDEX IF NOT EXISTS idx_acid_nomer ON acid(acid);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_nomer ON contracts(nomer_kontrakta);
CREATE INDEX IF NOT EXISTS idx_finance_data ON finance(data);
CREATE INDEX IF NOT EXISTS idx_contract_stages_kontract ON contract_stages(kontract_id);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
