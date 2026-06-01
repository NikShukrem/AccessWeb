# AccessWeb v3.0 - Полное руководство архитектуры

**Дата**: 1 июня 2026  
**Версия**: 3.0 (Переработка с ролевой системой и оптимизацией для Египта)  
**Статус**: Концепция одобрена, готово к разработке

---

## ЧАСТЬ 1: АНАЛИЗ ТЕКУЩЕГО СОСТОЯНИЯ

### 1.1 Плюсы текущей архитектуры

| Плюс | Описание |
|------|---------|
| **Один HTML файл** | Быстрая загрузка, легко разворачивается |
| **Оффлайн IndexedDB** | Работает полностью без интернета после первой загрузки |
| **WebSocket real-time** | v2.0 уже имеет синхронизацию между пользователями |
| **Минималистичный фронтенд** | Быстрый на 3G интернете |
| **SQLite backend** | Легко развертывается, нет зависимостей |
| **Role-based access** | Базовая ролевая система уже реализована |

### 1.2 Минусы текущей архитектуры

| Минус | Проблема | Решение |
|-------|---------|---------|
| **Плоская структура БД** | Все данные в 4 таблицах, нет нормализации | Разбить ACID на 4 таблицы, Договоры на 3 |
| **Нет управления пользователями** | Только хардкод admin/admin123 | Админ-панель для создания пользователей |
| **Нет разграничения по таблицам** | Все роли видят всё | Матрица прав доступа (table + operation) |
| **Нет "Упрощённой версии"** | Один интерфейс для всех | Условный UI на основе флага user.is_egypt_mode |
| **Нет уведомлений** | Только консоль браузера | Система notifications в БД + WebSocket broadcast |
| **Нет поручений** | Нет планирования работ | Таблица tasks/assignments с назначением |
| **Статические курсы валют** | Нельзя обновить при импорте | Таблица exchange_rates с историей |

---

## ЧАСТЬ 2: НОВАЯ АРХИТЕКТУРА

### 2.1 Структура папок проекта

```
AccessWeb/
├── backend/                          # Node.js + Express server
│   ├── src/
│   │   ├── server.js                # Main Express + WebSocket
│   │   ├── db.js                    # Database connection + initialization
│   │   ├── auth.js                  # JWT authentication, password hashing
│   │   ├── middleware/
│   │   │   ├── authMiddleware.js    # JWT verification
│   │   │   ├── roleMiddleware.js    # Role + table permission checks
│   │   │   └── errorHandler.js      # Global error handling
│   │   ├── routes/
│   │   │   ├── auth.js              # Login, register (admin-only)
│   │   │   ├── users.js             # Admin: CRUD users, departments, roles
│   │   │   ├── tables.js            # CRUD tables (ACID, Contracts, Finance, etc)
│   │   │   ├── saved-queries.js     # Saved queries per user
│   │   │   ├── notifications.js     # Get/mark read notifications
│   │   │   ├── tasks.js             # Tasks/assignments management
│   │   │   ├── import-export.js     # CSV/JSON import, Excel export
│   │   │   └── dashboard.js         # Manager dashboard stats + alerts
│   │   ├── services/
│   │   │   ├── validation.js        # Schema validation, sanitization
│   │   │   ├── permissions.js       # Check user access to table/column
│   │   │   ├── notifications.js     # Create, broadcast notifications
│   │   │   ├── tasks.js             # Task assignment logic
│   │   │   ├── exchange-rates.js    # Currency conversion
│   │   │   └── sync-service.js      # Multi-user conflict resolution
│   │   ├── websocket.js             # WebSocket event handlers + broadcast
│   │   └── scheduled-jobs.js        # Cron: check overdue contracts, etc
│   ├── data/
│   │   ├── schema.sql               # Database schema initialization
│   │   ├── seed.sql                 # Initial demo data
│   │   └── accessweb.db             # SQLite database (created on first run)
│   ├── package.json
│   ├── .env.example
│   ├── .env                         # (gitignored) PORT, JWT_SECRET, DB_PATH
│   ├── Dockerfile
│   └── README.md                    # Backend setup guide
│
├── frontend/                         # Vanilla JS + Alpine.js lightweight UI
│   ├── public/
│   │   ├── index.html               # Main HTML entry point
│   │   ├── css/
│   │   │   ├── base.css             # Typography, layout, colors
│   │   │   ├── components.css       # Buttons, modals, inputs, cards
│   │   │   ├── table.css            # Tables, virtualization, responsive
│   │   │   ├── egypt-mode.css       # Simplified UI for Egypt users
│   │   │   └── dark-mode.css        # (Optional) Dark theme
│   │   ├── js/
│   │   │   ├── app.js               # Main initialization, router
│   │   │   ├── api.js               # Fetch wrapper, error handling, retries
│   │   │   ├── auth.js              # Login state, token management
│   │   │   ├── websocket.js         # WebSocket client, reconnect logic
│   │   │   ├── store.js             # Simple state management (tables cache)
│   │   │   ├── ui/
│   │   │   │   ├── tables.js        # Table rendering, virtual scrolling
│   │   │   │   ├── forms.js         # CRUD forms, validation
│   │   │   │   ├── filters.js       # Search, sort, multi-filter UI
│   │   │   │   ├── modals.js        # Modal dialogs
│   │   │   │   ├── notifications.js # Toast notifications, alerts
│   │   │   │   └── dashboard.js     # Manager dashboard widgets
│   │   │   ├── utils/
│   │   │   │   ├── dates.js         # Date parsing, formatting, overdue logic
│   │   │   │   ├── currency.js      # Currency conversion, formatting
│   │   │   │   ├── validation.js    # Input validation, schema checks
│   │   │   │   ├── storage.js       # localStorage for UI state (not data)
│   │   │   │   └── format.js        # Number, string formatting
│   │   │   └── pages/               # Page-specific logic
│   │   │       ├── acid.js          # ACID table page
│   │   │       ├── contracts.js     # Contracts page
│   │   │       ├── finance.js       # Finance page
│   │   │       ├── admin.js         # Admin panel (users, roles, depts)
│   │   │       ├── dashboard.js     # Manager dashboard
│   │   │       ├── tasks.js         # Tasks/assignments page
│   │   │       └── settings.js      # User settings, Egypt mode toggle
│   │   ├── images/
│   │   │   └── (icons, logos)
│   │   └── manifest.json            # PWA manifest
│   └── package.json                 # (Optional) for build tools, if needed
│
├── docs/                            # Documentation
│   ├── DATABASE_SCHEMA.md           # Detailed column definitions
│   ├── API_REFERENCE.md             # All endpoints, request/response
│   ├── PERMISSIONS_MATRIX.md        # Role + Table access matrix
│   ├── DEPLOYMENT.md                # Docker, production, scaling
│   ├── TESTING_GUIDE.md             # Test scenarios
│   └── TROUBLESHOOTING.md           # Common issues, debugging
│
├── docker-compose.yml               # Dev environment (db, server, nginx)
├── Dockerfile                       # Server container
├── nginx.conf                       # Reverse proxy (optional, for production)
│
├── .env.example                     # Environment variables template
├── .gitignore
├── README.md                        # Main project README
├── PROJECT_GUIDE.md                 # This file
└── package.json                     # Root package.json (scripts for both)
```

### 2.2 Стек технологий

| Слой | Технология | Обоснование |
|------|-----------|------------|
| **Backend** | Node.js (ES6+) | Быстро, легко, одна экосистема с фронтом |
| **API фреймворк** | Express.js | Стандарт, простой, много middleware |
| **Database** | PostgreSQL (prod) / SQLite (dev) | Нормализованная схема, надежность, индексы для 3G |
| **WebSocket** | ws или Socket.IO | Real-time синхронизация, broadcast |
| **Authentication** | JWT + bcryptjs | Stateless, масштабируемо, стандарт |
| **Frontend** | Vanilla JS + Alpine.js | Минимум кода, максимум скорость на 3G |
| **HTTP client** | Fetch API | Встроено в браузер, async/await, retries |
| **CSS** | Vanilla (PostCSS опционально) | Легко, быстро, контролируемо |
| **Build/Deployment** | Docker + docker-compose | Изолированные контейнеры, простое масштабирование |
| **Scheduling** | node-cron | Ежедневные проверки просроченных договоров |

---

## ЧАСТЬ 3: СТРУКТУРА БАЗЫ ДАННЫХ

### 3.1 Таблица: users

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  login VARCHAR(50) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100),
  department_id UUID REFERENCES departments(id),
  role VARCHAR(50) NOT NULL,              -- 'admin', 'manager', 'logistics', 'operations', 'analytics'
  is_egypt_mode BOOLEAN DEFAULT FALSE,    -- Упрощённый интерфейс для Египта
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP,
  settings JSONB                          -- User preferences: theme, notifications, etc
);
```

### 3.2 Таблица: departments

```sql
CREATE TABLE departments (
  id UUID PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,      -- 'Admin', 'Logistics', 'Finance', 'Analytics', etc
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### 3.3 Таблица: user_permissions

```sql
CREATE TABLE user_permissions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  table_name VARCHAR(50) NOT NULL,        -- 'acids', 'contracts', 'finance', 'tasks', etc
  can_view BOOLEAN DEFAULT FALSE,
  can_create BOOLEAN DEFAULT FALSE,
  can_update BOOLEAN DEFAULT FALSE,
  can_delete BOOLEAN DEFAULT FALSE,
  can_export BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, table_name)
);
```

### 3.4 Таблица: acids (нормализована)

```sql
CREATE TABLE acids (
  id UUID PRIMARY KEY,
  acid_number VARCHAR(50) UNIQUE NOT NULL,
  kti_number VARCHAR(50),                 -- Номер КТИ для связи с finance
  contract_number VARCHAR(50) REFERENCES contracts(number),
  shipper VARCHAR(150),                   -- Грузоотправитель
  consignee VARCHAR(150),                 -- Грузополучатель
  cargo_description TEXT,
  weight_kg DECIMAL(12,2),
  volume_cbm DECIMAL(12,2),
  container_count INT,
  departure_date DATE,
  eta_date DATE,                          -- Ожидаемая дата прибытия
  actual_arrival_date DATE,
  status VARCHAR(50),                     -- 'new', 'in_transit', 'customs', 'delivered', 'delayed'
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

### 3.5 Таблица: acid_logistics

```sql
CREATE TABLE acid_logistics (
  id UUID PRIMARY KEY,
  acid_id UUID NOT NULL REFERENCES acids(id) ON DELETE CASCADE,
  carrier VARCHAR(100),                   -- Перевозчик
  transport_type VARCHAR(50),             -- 'air', 'sea', 'rail', 'truck'
  bl_number VARCHAR(100),                 -- Bill of Lading
  vessel_name VARCHAR(100),               -- Название судна (if sea)
  eta_port DATE,
  vessel_arrival_actual DATE,
  do_released_date DATE,                  -- Дата выпуска DO
  port_charges_paid BOOLEAN,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.6 Таблица: acid_customs

```sql
CREATE TABLE acid_customs (
  id UUID PRIMARY KEY,
  acid_id UUID NOT NULL REFERENCES acids(id) ON DELETE CASCADE,
  dt_number VARCHAR(100),                 -- Декларация таможни
  dt_date DATE,
  dt_status VARCHAR(50),                  -- 'filed', 'approved', 'released', 'rejected'
  release_request_date DATE,              -- Дата запроса освобождения
  release_curator VARCHAR(100),           -- Куратор по освобождению
  clearance_date DATE,                    -- Дата рассчитаны пошлины
  duty_amount_usd DECIMAL(12,2),
  remarks TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.7 Таблица: acid_documents

```sql
CREATE TABLE acid_documents (
  id UUID PRIMARY KEY,
  acid_id UUID NOT NULL REFERENCES acids(id) ON DELETE CASCADE,
  document_type VARCHAR(50),              -- 'invoice', 'packing_list', 'bol', 'certificate'
  document_number VARCHAR(100),
  document_date DATE,
  issued_by VARCHAR(150),
  file_path VARCHAR(255),                 -- S3 или local storage
  created_at TIMESTAMP DEFAULT NOW(),
  uploaded_by UUID REFERENCES users(id)
);
```

### 3.8 Таблица: contracts

```sql
CREATE TABLE contracts (
  id UUID PRIMARY KEY,
  number VARCHAR(50) UNIQUE NOT NULL,     -- Номер договора
  counterparty VARCHAR(150) NOT NULL,     -- Контрагент
  contract_date DATE,
  end_date DATE,                          -- Дата окончания (для красного выделения)
  amount_usd DECIMAL(12,2),
  currency VARCHAR(3) DEFAULT 'USD',      -- EGP, EUR, RUB, USD
  status VARCHAR(50),                     -- 'active', 'expired', 'terminated'
  responsible_person VARCHAR(100),        -- ФИО ответственного
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id),
  is_overdue BOOLEAN GENERATED ALWAYS AS (end_date < CURRENT_DATE) STORED
);
```

### 3.9 Таблица: contract_stages

```sql
CREATE TABLE contract_stages (
  id UUID PRIMARY KEY,
  contract_id UUID NOT NULL REFERENCES contracts(id) ON DELETE CASCADE,
  stage_name VARCHAR(100),                -- '签署', 'Согласование', 'Финализация'
  stage_order INT,
  status VARCHAR(50),                     -- 'pending', 'in_progress', 'completed'
  planned_date DATE,
  actual_date DATE,
  responsible_person VARCHAR(100),
  responsible_user_id UUID REFERENCES users(id),
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### 3.10 Таблица: invoices

```sql
CREATE TABLE invoices (
  id UUID PRIMARY KEY,
  contract_id UUID REFERENCES contracts(id),
  invoice_number VARCHAR(50) UNIQUE NOT NULL,
  invoice_date DATE,
  amount_usd DECIMAL(12,2),
  amount_original DECIMAL(12,2),
  currency VARCHAR(3),
  payment_status VARCHAR(50),             -- 'draft', 'issued', 'paid', 'overdue', 'cancelled'
  payment_due_date DATE,
  payment_date DATE,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

### 3.11 Таблица: finance

```sql
CREATE TABLE finance (
  id UUID PRIMARY KEY,
  kti_number VARCHAR(50),                 -- Связь с ACID через КТИ
  contract_number VARCHAR(50) REFERENCES contracts(number),
  expense_date DATE,
  category VARCHAR(100),                  -- 'port_charges', 'customs', 'transport', 'misc'
  description TEXT,
  amount_original DECIMAL(12,2),
  currency VARCHAR(3),
  exchange_rate DECIMAL(10,4),            -- Курс на дату расхода
  amount_usd DECIMAL(12,2),
  payment_method VARCHAR(50),             -- 'cash', 'bank_transfer', 'credit'
  payment_status VARCHAR(50),             -- 'pending', 'paid', 'cancelled'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);
```

### 3.12 Таблица: acid_kti (связь)

```sql
CREATE TABLE acid_kti (
  id UUID PRIMARY KEY,
  acid_id UUID NOT NULL REFERENCES acids(id) ON DELETE CASCADE,
  kti_date DATE,
  contract_number VARCHAR(50) REFERENCES contracts(number),
  amount_usd DECIMAL(12,2),
  ais_number VARCHAR(100),
  payment_status VARCHAR(50),             -- 'pending', 'paid', 'partial'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(acid_id, kti_date)
);
```

### 3.13 Таблица: exchange_rates (истории курсов)

```sql
CREATE TABLE exchange_rates (
  id UUID PRIMARY KEY,
  date DATE NOT NULL,
  currency VARCHAR(3) NOT NULL,          -- EGP, EUR, RUB
  rate DECIMAL(10,4) NOT NULL,           -- 1 USD = X currency
  source VARCHAR(100),                   -- 'manual', 'cbr', 'api'
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(date, currency)
);
```

### 3.14 Таблица: tasks (поручения)

```sql
CREATE TABLE tasks (
  id UUID PRIMARY KEY,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  assigned_to UUID NOT NULL REFERENCES users(id),
  assigned_by UUID REFERENCES users(id),
  related_table VARCHAR(50),             -- 'acids', 'contracts', 'finance'
  related_record_id VARCHAR(100),        -- ID в связанной таблице
  status VARCHAR(50),                    -- 'open', 'in_progress', 'completed', 'cancelled'
  priority VARCHAR(20),                  -- 'low', 'medium', 'high'
  due_date DATE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  completed_by UUID REFERENCES users(id),
  notes TEXT
);
```

### 3.15 Таблица: notifications

```sql
CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title VARCHAR(255) NOT NULL,
  message TEXT,
  type VARCHAR(50),                     -- 'overdue_contract', 'new_task', 'payment_reminder', 'system'
  related_table VARCHAR(50),
  related_record_id VARCHAR(100),
  is_read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  read_at TIMESTAMP
);
```

### 3.16 Таблица: saved_queries

```sql
CREATE TABLE saved_queries (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(100) NOT NULL,
  table_name VARCHAR(50) NOT NULL,
  filters JSONB,                        -- Сохранённые фильтры: {column: value, ...}
  sort_column VARCHAR(50),
  sort_order VARCHAR(4),                -- 'ASC' или 'DESC'
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(user_id, name, table_name)
);
```

---

## ЧАСТЬ 4: РОЛЕВАЯ СИСТЕМА

### 4.1 Матрица прав (PERMISSIONS_MATRIX.md)

```
┌──────────────┬──────┬──────┬────────┬───────────┬──────────┬────────────┐
│ Role         │ ACID │ Cont │ Finance│ Tasks     │ Admin    │ Dashboard  │
├──────────────┼──────┼──────┼────────┼───────────┼──────────┼────────────┤
│ admin        │ VCUD │ VCUD │  VCUD  │  VCUD     │  VCUD    │   View     │
│ manager      │ VC U │ VC U │  VC U  │  VC U     │  ---     │   View✓✓   │
│ analytics    │ VC U │ VC U │  VC U  │  VC       │  ---     │   View✓    │
│ logistics    │ VCU  │  V   │  ---   │  VC U     │  ---     │   ---      │
│ operations   │ VCU  │  V   │  ---   │  VC U     │  ---     │   ---      │
└──────────────┴──────┴──────┴────────┴───────────┴──────────┴────────────┘

Legend: V=View, C=Create, U=Update, D=Delete, E=Export
✓✓ = Full dashboard with KPIs, alerts, forecasting
✓  = Basic dashboard (assigned tasks only)
```

### 4.2 Роли

| Роль | Описание | Отделы |
|------|---------|--------|
| **admin** | Полный доступ, управление пользователями/ролями | Admin |
| **manager** | Руководитель: полный доступ + дашборд с KPI и алертами | Management |
| **analytics** | Аналитик: просмотр всех таблиц, экспорт, сохранённые запросы | Analytics |
| **logistics** | Отдел логистики: Contracts, Finance, Tasks, ACID (view) | Logistics |
| **operations** | Операционная логистика: ACID, Tasks, отчеты по поручениям | Operations |

---

## ЧАСТЬ 5: ФУНКЦИОНАЛЬНЫЕ ТРЕБОВАНИЯ

### 5.1 Аутентификация и управление пользователями

- [x] JWT-based authentication (12 часов session)
- [x] Пароль хешируется bcryptjs
- [x] Админ может создавать новых пользователей (без self-registration)
- [x] Админ может удалять пользователей, отзывать доступ
- [x] Админ может переназначать роли и отделы
- [x] Админ может включать/отключать флаг `is_egypt_mode` для пользователя
- [x] Login endpoint: POST /api/auth/login
- [x] Refresh token: POST /api/auth/refresh (опционально)

### 5.2 Интерфейс для Администратора

**Страница: /admin**

- Список пользователей (таблица: ID, Login, Name, Department, Role, EgyptMode, Active)
- Кнопки: + Добавить, Редактировать, Удалить
- Список отделов с CRUD
- Матрица разрешений (таблица + role = доступ)
- Импорт пользователей из CSV

### 5.3 Dashboard для Руководителя

**Страница: /dashboard**

Widgets:

1. **KPI Cards** (4 карточки):
   - Всего договоров (кол-во)
   - Просроченных договоров (красная карточка)
   - Деньги в пути (USD, sum of finance где status != 'paid')
   - Загруженных грузов за месяц (ACID count where actual_arrival_date в текущем месяце)

2. **Overdue Contracts Alert** (таблица):
   - Пока контракт не закрыт и end_date < today
   - Столбцы: Номер, Контрагент, Окончание, Дней просрочки, Действие
   - Действие: "Назначить ответственного" (task creation)

3. **Recent Tasks** (таблица):
   - Последние 10 открытых задач, отсортированные по due_date
   - Только для текущего пользователя или его отдела

4. **Finance Summary** (график или таблица):
   - Расходы по категориям за последние 30 дней
   - Остаток бюджета (если есть бюджет в системе)

5. **Incoming Shipments** (таблица):
   - ACID с status = 'in_transit', отсортированные по eta_date
   - Выделить красным если ETA прошла, но статус не 'delivered'

### 5.4 Таблицы и CRUD

Для каждой таблицы (ACID, Contracts, Finance):

- **View**: Таблица с virtual scrolling (50 rows на странице)
- **Search**: Поиск по всем текстовым полям (real-time фильтр)
- **Sort**: Нажать на заголовок столбца для сортировки
- **Filter**: Multi-filter (столбец + оператор + значение)
- **Add**: Модальное окно с формой
- **Edit**: Модальное окно с существующими данными
- **Delete**: Подтверждение перед удалением
- **Export**: CSV экспорт видимых данных (с применёнными фильтрами)

### 5.5 Импорт данных

**Endpoint: POST /api/import**

- Поддержать CSV и JSON форматы
- Auto-detect таблицы по заголовкам (ACID, Номер КТИ → acids; Номер контракта → contracts)
- Валидация схемы перед импортом
- При импорте финансовых данных — подтянуть актуальные курсы валют из exchange_rates
- Возвращать отчёт: загружено X записей, 0 ошибок

### 5.6 Уведомления и алерты

**Типы уведомлений**:

1. **overdue_contract**: Контракт просрочен (каждый день проверка cron job)
2. **new_task**: Новое поручение назначено пользователю
3. **task_completed**: Коллега завершил задачу, связанную с вами
4. **payment_reminder**: До due_date счёта осталось 3 дня
5. **system**: Системные события (новый пользователь добавлен, и т.д.)

**WebSocket broadcast**: При создании notification для пользователя — отправить real-time alert

### 5.7 Ежедневная автоматическая проверка (Cron)

**Задача**: Каждый день в 00:00 UTC проверить просроченные договоры

```javascript
// node-cron job
schedule('0 0 * * *', async () => {
  const today = new Date().toISOString().slice(0, 10);
  const overdue = await db.query(
    `SELECT * FROM contracts WHERE end_date < ? AND status = 'active'`,
    [today]
  );
  
  for (const contract of overdue) {
    // Уведомить всех админов и менеджеров
    await createNotification({
      type: 'overdue_contract',
      title: `Contract ${contract.number} is overdue`,
      message: `Контракт с ${contract.counterparty} просрочен на ${daysOverdue} дней`,
      related_table: 'contracts',
      related_record_id: contract.id
    });
  }
});
```

---

## ЧАСТЬ 6: ОПТИМИЗАЦИЯ ДЛЯ ЕГИПТА (3G/Edge)

### 6.1 Backend оптимизация

| Оптимизация | Реализация |
|------------|-----------|
| **Gzip compression** | Express.js middleware `compression` |
| **Database indexing** | Индексы на часто-ищущихся столбцах: acids(kti_number), contracts(end_date), finance(kti_number) |
| **Pagination** | Всегда return limit 100 records, offset для pagination |
| **Field selection** | API accept `?fields=id,name,status` для выгрузки только нужных столбцов |
| **Caching headers** | 304 Not Modified для статических ресурсов (CSS, JS) |
| **SQLite WAL mode** | Включить WAL для лучшей параллельности |

### 6.2 Frontend оптимизация

| Оптимизация | Реализация |
|------------|-----------|
| **Single HTML file** (prod) | Заменить на минифицированный bundle с inline CSS |
| **Virtual scrolling** | Вернуть виртуальную прокрутку из старой версии (50 строк в DOM) |
| **Lazy loading images** | `<img loading="lazy">` для документов/аватаров |
| **Service Worker** | Кэширование API response (с валидацией 1 час) |
| **Debouncing** | Поиск отправлять не на каждый символ, а после паузы 300ms |
| **CSS inline** | В продакшене вставить CSS прямо в HTML |
| **Минификация JS** | Minify all JS (Terser или встроенное в bundler) |
| **Brotli compression** | Nginx Brotli вместо Gzip |

### 6.3 "Egypt Mode" UI

Для пользователей с флагом `is_egypt_mode = true`:

- **Меньше столбцов**: Скрыть некритичные поля (created_at, updated_at, notes)
- **Упрощённые формы**: Только обязательные поля, убрать expert-режим
- **Меньше фильтров**: Только по основным полям (status, date)
- **Отсутствие дашборда**: Egypt mode пользователи видят только таблицы
- **Крупнее шрифты**: Лучше читаемость на мобильных
- **Меньше функций**: Экспорт убрать или упростить

---

## ЧАСТЬ 7: ТРЕБОВАНИЯ К МАСШТАБИРУЕМОСТИ

### 7.1 Одновременные пользователи

| Метрика | Целевое значение | Как достичь |
|---------|---------|-----------|
| **Макс одновременных** | 10+ users | WebSocket broadcast, горизонтальное масштабирование |
| **Response time** | < 500ms на 3G | Индексы БД, pagination, field selection |
| **DB connections** | Pooling (max 20) | Use `sqlite` or `pg` with connection pool |
| **Memory per server** | < 500MB | Stateless Node.js servers, Redis для session (если нужно) |

### 7.2 Масштабирование при 10x нагрузке

**Сейчас**: 10 users, 10K records

**При 10x**: 100 users, 100K records

| Компонент | Текущее | При 10x | Решение |
|-----------|---------|---------|---------|
| **Frontend** | Single JS | Bundle + Service Worker | Nginx + Brotli, CDN для assets |
| **Backend** | 1 Node server | 2-3 Node servers | Load balancer (Nginx) |
| **Database** | SQLite local | PostgreSQL remote | Replication, read replicas, sharding по KTI |
| **WebSocket** | Direct broadcast | Redis Pub/Sub | Redis для cross-server broadcasting |
| **Storage** | Local FS | S3/Minio | Для документов и backups |

---

## ЧАСТЬ 8: ПРАВИЛА РАЗРАБОТКИ

### 8.1 Код

- **JavaScript**: ES6+, async/await, const/let
- **No external JS frameworks**: Vanilla JS + Alpine.js для интерактивности (не React/Vue)
- **Error handling**: try/catch везде, graceful degradation
- **Logging**: console.log (dev), winston (prod)
- **Comments**: Только для сложной логики, коммиты пишут себя

### 8.2 Database

- **Migrations**: SQL скрипты в `schema.sql`
- **No raw SQL**: Использовать параметризованные запросы (?)
- **Seed data**: Тестовые данные в `seed.sql`
- **Indexes**: На foreign keys, дату и часто-фильтруемые поля

### 8.3 API

- **REST conventions**: GET, POST, PUT, DELETE с правильными status codes
- **JSON responses**: `{data: ..., error: null}` или `{error: "msg"}`
- **Authentication**: Bearer token в Authorization header
- **CORS**: Настроено для фронтенда

### 8.4 Frontend

- **Files structure**: Page-centric (pages/acid.js, pages/contracts.js)
- **HTML**: Semantic markup, accessibility-first
- **CSS**: BEM naming convention, mobile-first approach
- **State**: Minimal (only UI state в localStorage, data идёт с сервера)

### 8.5 Testing

- **Manual testing checklist**: В TESTING_GUIDE.md
- **Cross-browser**: Chrome, Firefox, Safari, Edge
- **Mobile**: iOS Safari, Android Chrome
- **Slow network**: Тестировать на Edge/3G (DevTools throttling)

### 8.6 Documentation

- **Each file**: JSDoc комментарии для функций
- **API endpoints**: Все в API_REFERENCE.md
- **Database**: Все таблицы и столбцы в DATABASE_SCHEMA.md
- **Deploy**: Пошаговые инструкции в DEPLOYMENT.md

---

## ЧАСТЬ 9: ФАЗЫ РАЗРАБОТКИ

### Фаза 1: Backend + Database (1-2 недели)

- [x] Инициализировать PostgreSQL schema
- [x] Создать Express server с основными routes
- [x] Реализовать JWT authentication
- [x] CRUD endpoints для всех таблиц
- [x] WebSocket broadcast
- [x] Permission checking middleware

### Фаза 2: Frontend (1-2 недели)

- [x] Создать новый index.html с модульной структурой
- [x] Компоненты: таблица, форма, фильтр, модаль
- [x] Подключить WebSocket и REST API
- [x] Реализовать виртуальную прокрутку таблиц
- [x] Упрощённый режим (Egypt mode)

### Фаза 3: Admin & Dashboard (1 неделя)

- [x] Admin panel для управления пользователями
- [x] Manager dashboard с KPI и алертами
- [x] Матрица разрешений

### Фаза 4: Импорт & Экспорт (3-4 дня)

- [x] CSV/JSON импорт с валидацией
- [x] Excel экспорт
- [x] Обработка курсов валют

### Фаза 5: Уведомления & Cron (3-4 дня)

- [x] Таблица notifications
- [x] WebSocket broadcast notifications
- [x] Ежедневная проверка просроченных (node-cron)

### Фаза 6: Testing & Documentation (1 неделя)

- [x] Ручное тестирование всех сценариев
- [x] Документация всех endpoints и таблиц
- [x] Deployment guide

### Фаза 7: Deployment (3-4 дня)

- [x] Docker setup (dev + prod)
- [x] PostgreSQL на продакшене
- [x] Nginx reverse proxy
- [x] SSL/TLS (Let's Encrypt)

---

## ЧАСТЬ 10: GIT BRANCHES И WORKFLOW

### Current branches

```
main                    # Production-ready code
├── develop             # Integration branch
    ├── feature/auth          # Authentication & users
    ├── feature/tables        # CRUD for all tables
    ├── feature/dashboard     # Manager dashboard
    ├── feature/admin         # Admin panel
    ├── feature/import-export # Import/export
    ├── feature/notifications # Notifications & cron
    ├── feature/egypt-mode    # Simplified UI
    └── bugfix/...            # Bug fixes
```

### Commit messages

```
feat: Add JWT authentication to backend
fix: Resolve WebSocket reconnection timeout
docs: Update API_REFERENCE.md with new endpoints
chore: Update dependencies
refactor: Simplify table rendering logic
test: Add manual testing checklist
```

---

## ЗАВЕРШЕНИЕ

После одобрения этого guide:

1. **GitHub branch**: Создать `feature/v3-architecture` для всех изменений
2. **Изменения**: Обновить структуру папок, создать новые файлы
3. **Поэтапная разработка**: Следовать фазам 1-7
4. **Коммиты**: Каждый день pull request с прогрессом
5. **Review**: Ежедневный review и feedback

---

**Статус**: ⏳ Ожидает одобрения для начала разработки  
**Контакт**: Для вопросов — комментарий в GitHub issue
