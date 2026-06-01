-- AccessWeb Database Schema

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

-- ACID table (Грузы)
CREATE TABLE IF NOT EXISTS acids (
  id TEXT PRIMARY KEY,
  acid TEXT UNIQUE,
  gruzootravitel TEXT,
  status TEXT,
  postavshchik TEXT,
  naimenovanie TEXT,
  gw_kg TEXT,
  kti_nomer TEXT,
  stoimost_gruza TEXT,
  valyuta TEXT,
  kolichestvo_mest TEXT,
  tip_perevozki TEXT,
  kolichestvo_konteynerov TEXT,
  strana_otpravleniya TEXT,
  etd TEXT,
  eta TEXT,
  do_released TEXT,
  custom_status TEXT,
  dt_nomer TEXT,
  dt_data TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Contracts table (Договоры)
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  nomer TEXT UNIQUE,
  predmet TEXT,
  kontragent TEXT,
  tip TEXT,
  kharakter_zakupki TEXT,
  osobennosti TEXT,
  data TEXT,
  okonchaniye TEXT,
  status TEXT,
  protokol TEXT,
  limit_sum TEXT,
  valyuta_oplaty TEXT,
  summa_oplaty TEXT,
  ostatok_limita TEXT,
  valyutnyy_kontrol TEXT,
  ds_data TEXT,
  ssylka TEXT,
  kommentariy TEXT,
  stadiya_dogovora TEXT,
  created_by TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Finance table (Финансы)
CREATE TABLE IF NOT EXISTS finance (
  id TEXT PRIMARY KEY,
  data TEXT,
  kti_nomer TEXT,
  data_raskhoda TEXT,
  kti_data TEXT,
  valyuta TEXT,
  summa TEXT,
  organizaciya TEXT,
  kontragent TEXT,
  dogovor TEXT,
  data_dogovora TEXT,
  proyekt TEXT,
  sostoyanie TEXT,
  otvetstvennyy TEXT,
  srochnyy_platezh TEXT,
  created_by TEXT,
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

-- User permissions
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

-- Indexes
CREATE INDEX IF NOT EXISTS idx_acids_kti ON acids(kti_nomer);
CREATE INDEX IF NOT EXISTS idx_acids_status ON acids(status);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_okonchaniye ON contracts(okonchaniye);
CREATE INDEX IF NOT EXISTS idx_finance_kti ON finance(kti_nomer);
CREATE INDEX IF NOT EXISTS idx_finance_valyuta ON finance(valyuta);
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
