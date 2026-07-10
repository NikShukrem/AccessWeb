-- AccessWeb v3.1 - Normalized Schema
-- Business: cargo import management into Egypt
-- Tables in dependency order: users → counterparties → contracts → contract_stages
--                                                    ↘ acid → acid_kti → ais_transactions
--                                                               ↗
--                                               ais_imports ↗
-- notifications

-- ===== USERS =====
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  login TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT DEFAULT 'user',
  department TEXT,
  is_egypt_mode BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== COUNTERPARTIES (suppliers, carriers, importers, etc.) =====
CREATE TABLE IF NOT EXISTS counterparties (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  short_name TEXT,
  country TEXT,
  type TEXT DEFAULT 'other'
    CHECK(type IN ('supplier','carrier','importer','contractor','other')),
  registration_number TEXT,
  vat_number TEXT,
  contact_person TEXT,
  email TEXT,
  phone TEXT,
  notes TEXT,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONTRACTS =====
CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  contract_number TEXT UNIQUE NOT NULL,
  type TEXT DEFAULT 'supply'
    CHECK(type IN ('supply','main_construction','invoice','service')),
  counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
  counterparty TEXT,                         -- denormalized display name
  name TEXT,
  contract_date TEXT,
  validity_period TEXT,
  ds_number TEXT,
  ds_date TEXT,
  amount REAL DEFAULT 0,                     -- base contract amount
  amount_with_ds REAL DEFAULT 0,             -- amount including supplementary agreements
  currency TEXT DEFAULT 'USD',
  paid_amount REAL DEFAULT 0,
  route_to TEXT,
  procurement_type TEXT,
  lot_number TEXT,
  status TEXT DEFAULT 'active'
    CHECK(status IN ('draft','active','completed','expired','suspended')),
  currency_control TEXT,
  notes TEXT,
  link TEXT,
  limit_balance REAL DEFAULT 0,
  responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  responsible TEXT,                          -- denormalized
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== CONTRACT STAGES =====
CREATE TABLE IF NOT EXISTS contract_stages (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  stage_number INTEGER,
  stage_name TEXT,
  substage_name TEXT,
  responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  responsible TEXT,                          -- denormalized
  planned_date TEXT,
  actual_date TEXT,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','in_progress','completed','overdue')),
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ACID (cargo shipments tracked by ACID code) =====
CREATE TABLE IF NOT EXISTS acid (
  id TEXT PRIMARY KEY,
  acid TEXT UNIQUE NOT NULL,                 -- the ACID tracking code
  ais_number TEXT,
  initial_request_number TEXT,
  shipment_type TEXT,
  shipper_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
  shipper TEXT,                              -- denormalized
  supplier_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
  supplier TEXT,                             -- denormalized
  importer_name TEXT,
  registration_number TEXT,
  vat_number TEXT,
  name TEXT,                                 -- cargo name
  gw_kg REAL,
  packages_qty INTEGER,
  containers_qty INTEGER,
  transport_type TEXT,
  cargo_cost REAL,
  currency TEXT DEFAULT 'USD',
  shipping_cost REAL,
  incoterms TEXT,
  departure_country TEXT,
  departure_port TEXT,
  delivery_place TEXT,
  arrival_place TEXT,
  vessel TEXT,
  shipping_line TEXT,
  bol_number TEXT,
  bol_date TEXT,
  carrier TEXT,
  forwarder TEXT,                            -- экспедитор
  etd TEXT,
  eta TEXT,
  delivery_date TEXT,
  egypt_arrival_date TEXT,
  release_request_date TEXT,
  release_curator TEXT,
  release_received_date TEXT,
  do_released TEXT,
  import_mode TEXT,
  dt_number TEXT,
  dt_date TEXT,
  dt_release_date TEXT,
  delivery_to_site_date TEXT,
  custom_status TEXT,
  purpose TEXT,
  upo_curator_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  upo_curator TEXT,                          -- denormalized
  invoice_uploaded BOOLEAN DEFAULT FALSE,
  extended_to TEXT,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','in_transit','customs','delivered','cancelled')),
  responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  responsible TEXT,                          -- denormalized
  notes TEXT,
  comment TEXT,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  contract_number TEXT,                      -- denormalized
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ACID_KTI (annual KTI linking table) =====
CREATE TABLE IF NOT EXISTS acid_kti (
  id TEXT PRIMARY KEY,
  acid TEXT NOT NULL REFERENCES acid(acid) ON DELETE CASCADE,
  kti_date TEXT NOT NULL,                    -- year of the KTI period
  kti_number TEXT,
  contract_ds_number TEXT,
  amount_usd REAL,                           -- transport cost for this KTI period
  ais_number TEXT,
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(acid, kti_date)
);

-- ===== AIS_IMPORTS (import history log) =====
CREATE TABLE IF NOT EXISTS ais_imports (
  id TEXT PRIMARY KEY,
  import_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  file_name TEXT,
  table_type TEXT CHECK(table_type IN ('acid','transactions')),
  total_rows INTEGER DEFAULT 0,
  imported_rows INTEGER DEFAULT 0,
  skipped_rows INTEGER DEFAULT 0,
  errors TEXT,                               -- JSON array of error strings
  imported_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== AIS_TRANSACTIONS (replaces old "finance" table) =====
CREATE TABLE IF NOT EXISTS ais_transactions (
  id TEXT PRIMARY KEY,
  date TEXT,
  number TEXT,
  expense_date TEXT,
  kti_date TEXT,
  currency TEXT DEFAULT 'USD',
  amount REAL DEFAULT 0,
  amount_usd REAL DEFAULT 0,
  organization TEXT,
  counterparty TEXT,
  counterparty_short TEXT,
  counterparty_id TEXT REFERENCES counterparties(id) ON DELETE SET NULL,
  contract_number TEXT,
  contract_date TEXT,
  contract_id TEXT REFERENCES contracts(id) ON DELETE SET NULL,
  project TEXT,
  status TEXT DEFAULT 'pending'
    CHECK(status IN ('pending','paid','overdue','cancelled')),
  cfo TEXT,
  responsible TEXT,
  responsible_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  urgent BOOLEAN DEFAULT FALSE,
  acid_link TEXT REFERENCES acid(acid) ON DELETE SET NULL,  -- filled after matching
  kti_id TEXT REFERENCES acid_kti(id) ON DELETE SET NULL,  -- filled after matching
  ais_import_id TEXT REFERENCES ais_imports(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== NOTIFICATIONS =====
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE CASCADE,
  title TEXT,
  message TEXT,
  type TEXT DEFAULT 'info'
    CHECK(type IN ('info','warning','error','success')),
  entity_type TEXT CHECK(entity_type IN ('contract','cargo','transaction','stage','task')),
  entity_id TEXT,
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TASKS (manager CRM: assignment & control of subordinates' work) =====
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  assigned_to TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_to_name TEXT,                     -- denormalized
  assigned_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  assigned_by_name TEXT,                     -- denormalized
  priority TEXT DEFAULT 'medium'
    CHECK(priority IN ('low','medium','high','urgent')),
  status TEXT DEFAULT 'new'
    CHECK(status IN ('new','in_progress','review','done','cancelled')),
  due_date TEXT,
  entity_type TEXT CHECK(entity_type IS NULL OR entity_type IN ('contract','cargo','counterparty')),
  entity_id TEXT,
  entity_label TEXT,                         -- denormalized display (e.g. contract number)
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TASK COMMENTS =====
CREATE TABLE IF NOT EXISTS task_comments (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  author_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  author_name TEXT,                          -- denormalized
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TASK CHECKLIST (subtasks) =====
CREATE TABLE IF NOT EXISTS task_checklist (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  is_done BOOLEAN DEFAULT FALSE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== ATTACHMENTS (files attached to contracts or transactions) =====
CREATE TABLE IF NOT EXISTS attachments (
  id TEXT PRIMARY KEY,
  entity_type TEXT NOT NULL CHECK(entity_type IN ('contract','transaction')),
  entity_id TEXT NOT NULL,
  category TEXT DEFAULT 'other'
    CHECK(category IN ('contract_scan','invoice','waybill','acceptance_act','other')),
  stored_name TEXT NOT NULL,                 -- uuid-based filename on disk
  original_name TEXT NOT NULL,               -- filename to show the user
  mime_type TEXT,
  size_bytes INTEGER,
  uploaded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  uploaded_by_name TEXT,                     -- denormalized
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== AUDIT LOG (who changed what, when) =====
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT,                            -- denormalized — kept even if user is later deleted
  user_role TEXT,
  action TEXT NOT NULL CHECK(action IN ('create','update','delete','upload','download')),
  table_name TEXT NOT NULL,
  record_id TEXT,
  record_label TEXT,                         -- human-readable identifier (e.g. contract_number, acid code)
  changes TEXT,                               -- JSON: created/updated fields, or a snapshot of the deleted row
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== TRANSACTION ITEMS (nomenclature/line items within a счёт) =====
CREATE TABLE IF NOT EXISTS transaction_items (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES ais_transactions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                        -- nomenclature / item name
  sku TEXT,                                  -- article / code
  unit TEXT DEFAULT 'шт',
  quantity REAL DEFAULT 1,
  unit_price REAL DEFAULT 0,
  amount REAL DEFAULT 0,                     -- quantity * unit_price, stored for convenience
  notes TEXT,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- ===== INDEXES FOR PERFORMANCE =====
-- users
CREATE INDEX IF NOT EXISTS idx_users_login ON users(login);

-- counterparties
CREATE INDEX IF NOT EXISTS idx_counterparties_name ON counterparties(name);
CREATE INDEX IF NOT EXISTS idx_counterparties_type ON counterparties(type);
CREATE INDEX IF NOT EXISTS idx_counterparties_active ON counterparties(is_active);

-- contracts
CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_counterparty ON contracts(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_contracts_responsible ON contracts(responsible_id);
CREATE INDEX IF NOT EXISTS idx_contracts_validity ON contracts(validity_period);

-- contract_stages
CREATE INDEX IF NOT EXISTS idx_stages_contract ON contract_stages(contract_id);
CREATE INDEX IF NOT EXISTS idx_stages_status ON contract_stages(status);
CREATE INDEX IF NOT EXISTS idx_stages_planned_date ON contract_stages(planned_date);
CREATE INDEX IF NOT EXISTS idx_stages_responsible ON contract_stages(responsible_id);

-- acid
CREATE INDEX IF NOT EXISTS idx_acid_code ON acid(acid);
CREATE INDEX IF NOT EXISTS idx_acid_status ON acid(status);
CREATE INDEX IF NOT EXISTS idx_acid_contract ON acid(contract_id);
CREATE INDEX IF NOT EXISTS idx_acid_responsible ON acid(responsible_id);
CREATE INDEX IF NOT EXISTS idx_acid_eta ON acid(eta);
CREATE INDEX IF NOT EXISTS idx_acid_egypt_arrival ON acid(egypt_arrival_date);
CREATE INDEX IF NOT EXISTS idx_acid_ais_number ON acid(ais_number);
CREATE INDEX IF NOT EXISTS idx_acid_shipper ON acid(shipper_id);
CREATE INDEX IF NOT EXISTS idx_acid_supplier ON acid(supplier_id);

-- acid_kti
CREATE INDEX IF NOT EXISTS idx_acid_kti_acid ON acid_kti(acid);
CREATE INDEX IF NOT EXISTS idx_acid_kti_date ON acid_kti(kti_date);

-- ais_transactions
CREATE INDEX IF NOT EXISTS idx_transactions_date ON ais_transactions(date);
CREATE INDEX IF NOT EXISTS idx_transactions_contract ON ais_transactions(contract_id);
CREATE INDEX IF NOT EXISTS idx_transactions_counterparty ON ais_transactions(counterparty_id);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON ais_transactions(status);
CREATE INDEX IF NOT EXISTS idx_transactions_acid_link ON ais_transactions(acid_link);
CREATE INDEX IF NOT EXISTS idx_transactions_import ON ais_transactions(ais_import_id);
CREATE INDEX IF NOT EXISTS idx_transactions_urgent ON ais_transactions(urgent);

-- notifications
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read ON notifications(is_read);

-- tasks
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to ON tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned_by ON tasks(assigned_by);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_priority ON tasks(priority);
CREATE INDEX IF NOT EXISTS idx_tasks_due_date ON tasks(due_date);

-- task_comments
CREATE INDEX IF NOT EXISTS idx_task_comments_task ON task_comments(task_id);

-- task_checklist
CREATE INDEX IF NOT EXISTS idx_task_checklist_task ON task_checklist(task_id);

-- attachments
CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);

-- audit_log
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_log_user ON audit_log(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_table ON audit_log(table_name, record_id);

-- transaction_items
CREATE INDEX IF NOT EXISTS idx_transaction_items_transaction ON transaction_items(transaction_id);
