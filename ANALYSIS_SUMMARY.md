# AccessWeb v3.0 - Краткая сводка анализа

**Дата**: 1 июня 2026  
**Статус**: ✅ Архитектура одобрена, готово к разработке

---

## 🎯 Резюме для принятия решений

### Текущее состояние (v2.0)

```
✅ ЕСТЬ                           ❌ НЕ ХВАТАЕТ
─────────────────────────────────────────────────────
✅ WebSocket real-time           ❌ Управление пользователями (админ)
✅ REST API endpoints             ❌ Разграничение прав доступа
✅ SQLite backend                 ❌ Role-based таблица permissions
✅ Basic auth (JWT)               ❌ Админ-панель для управления
✅ ACID, Contracts, Finance      ❌ "Egypt Mode" (упрощённый UI)
✅ Импорт CSV/JSON                ❌ Manager Dashboard (KPI)
✅ Оптимизация для 3G             ❌ Таблица notifications
                                  ❌ Tasks/assignments (поручения)
                                  ❌ Multi-table normalized schema
```

### Плюсы текущей архитектуры

| + | Детали |
|---|--------|
| **Один HTML файл** | Быстро загружается на 3G |
| **WebSocket real-time** | Уже работает синхронизация между пользователями |
| **Минималистичный фронтенд** | Быстрый на медленном интернете |
| **Docker-ready** | docker-compose.yml уже настроен |
| **Базовые роли** | Уже есть системя ролей (admin, contracts, finance) |

### Минусы текущей архитектуры

| - | Проблема | Критичность |
|---|---------|------------|
| **Плоская БД** | 4 таблицы вместо нормализованных 16 | 🔴 Высокая |
| **Нет управления users** | Хардкод admin/admin123, нет админ-панели | 🔴 Высокая |
| **Нет матрицы прав** | Все роли видят все таблицы | 🔴 Высокая |
| **Нет Egypt Mode** | Один интерфейс для всех, плохо в Египте | 🟠 Средняя |
| **Нет уведомлений** | Нет система notifications в БД | 🟠 Средняя |
| **Нет поручений** | Нет таблицы tasks/assignments | 🟠 Средняя |

---

## 🏗️ Предложенная архитектура

### Структура

```
Текущее:                    Новое:
────────────────────────────────────────────
index.html (все в файле)    backend/src/ (модульно)
  ├─ CSS inline             frontend/public/
  ├─ JS inline              ├─ js/pages/ (page-specific)
  └─ HTML                   ├─ js/ui/ (components)
                            └─ css/
```

### Стек

```
Текущее:                    Новое:
────────────────────────────────────────────
✅ Node.js + Express        → Keep (улучшить)
✅ SQLite                   → PostgreSQL (prod)
✅ WebSocket (ws)           → Keep
✅ Vanilla JS               → Vanilla JS + Alpine.js
❌ No frontend structure    → pages/ + ui/ + utils/
```

### БД: ACID таблица нормализована

**Было**:
```
acids (40 столбцов в одной таблице) ❌
```

**Стало** (нормализовано):
```
acids (основная)            ✅
├─ acid_logistics (перевозка)
├─ acid_customs (таможня)
└─ acid_documents (документы)
```

### Роли и права

**Было**:
```
ROLE.ADMIN
ROLE.CONTRACTS
ROLE.FINANCE
(просто константы, нет матрицы)
```

**Стало** (матрица прав):
```
users → departments → roles (admin, manager, analytics, logistics, operations)
      ↓
user_permissions (таблица прав: user_id + table_name + [can_view|create|update|delete|export])

┌─────────┬────────┬──────────┬─────────┬─────────┐
│ Role    │ ACID   │ Contract │ Finance │ Admin   │
├─────────┼────────┼──────────┼─────────┼─────────┤
│ admin   │ VCUDE  │ VCUDE    │ VCUDE   │ VCUDE   │
│ manager │ VCU    │ VCU      │ VCU     │ ─       │
│ logistics│ VCU   │ V        │ ─       │ ─       │
└─────────┴────────┴──────────┴─────────┴─────────┘
```

### Egypt Mode

**Было**:
```
Один интерфейс для всех ❌
```

**Стало**:
```
Каждый пользователь может иметь флаг: users.is_egypt_mode = true/false ✅

Если true:
  - Меньше столбцов в таблицах
  - Упрощённые формы
  - Крупнее шрифты
  - Отсутствие дашборда
  - Отсутствие экспорта
```

---

## 📊 Фазы разработки

```
ФАЗА 1: Backend + Database              (1-2 недели)
├─ PostgreSQL schema (нормализация)
├─ Express endpoints для всех таблиц
├─ JWT auth improvement
├─ WebSocket для broadcast
└─ Permission middleware

ФАЗА 2: Frontend Модульность           (1-2 недели)
├─ Переструктурировать index.html
├─ pages/acid.js, contracts.js, finance.js
├─ ui/tables.js, forms.js, filters.js
└─ utils/dates.js, currency.js, etc

ФАЗА 3: Admin & Dashboard              (1 неделя)
├─ Admin panel (/admin) для users/roles
├─ Manager dashboard (/dashboard) с KPI
├─ Перм матрица UI

ФАЗА 4: Импорт & Экспорт               (3-4 дня)
├─ CSV/JSON импорт с валидацией
├─ Excel экспорт
└─ Курсы валют

ФАЗА 5: Notifications & Cron            (3-4 дня)
├─ Таблица notifications
├─ WebSocket broadcast
└─ Daily cron для просроченных

ФАЗА 6: Testing & Docs                 (1 неделя)
├─ API_REFERENCE.md
├─ DATABASE_SCHEMA.md
└─ Manual testing

ФАЗА 7: Deployment                     (3-4 дня)
├─ Docker PostgreSQL
├─ Nginx reverse proxy
└─ Production checklist
```

---

## ⏱️ Временная оценка

| Фаза | Время | Риски | Критичность |
|------|-------|-------|------------|
| 1. Backend | 7-10 дней | Миграция со SQLite на PostgreSQL | 🔴 Высокая |
| 2. Frontend | 7-10 дней | Разбиение одного HTML файла | 🔴 Высокая |
| 3. Admin | 5-7 дней | Матрица прав, UI | 🟠 Средняя |
| 4. Import/Export | 3-4 дня | Валидация CSV | 🟢 Низкая |
| 5. Notifications | 3-4 дня | Cron scheduling | 🟢 Низкая |
| 6. Testing | 5-7 дней | Регрессия | 🟠 Средняя |
| 7. Deploy | 3-4 дня | Production issues | 🟠 Средняя |
| **ИТОГО** | **~35-45 дней** | — | — |

---

## 🚀 Оптимизация для Egyptа (3G/Edge)

### Backend сторона

```javascript
// Gzip compression
app.use(compression());

// Database indexing
CREATE INDEX idx_acids_kti ON acids(kti_number);
CREATE INDEX idx_contracts_end_date ON contracts(end_date);

// Pagination (не выгружать все 100K за раз)
GET /api/acids?limit=100&offset=0

// Field selection (выгружать только нужные поля)
GET /api/acids?fields=id,status,cargo_description
```

### Frontend сторона

```javascript
// Virtual scrolling (только 50 строк в DOM)
const renderTable = (data, startIdx, endIdx) => {
  return data.slice(startIdx, endIdx).map(renderRow);
};

// Debouncing поиска (не каждый символ, а после паузы)
const debouncedSearch = debounce(search, 300);

// Service Worker для кэширования API
navigator.serviceWorker.register('sw.js');

// Lazy loading изображений
<img src="..." loading="lazy">
```

### UI для Egypt Mode

```javascript
if (user.is_egypt_mode) {
  // Скрыть сложные колонки
  table.columns = ['id', 'status', 'description'];
  
  // Упрощённые формы (только обязательные поля)
  form.fields = ['status', 'cargo_description'];
  
  // Отсутствие дашборда
  dashboard.style.display = 'none';
  
  // Крупнее шрифты
  document.body.style.fontSize = '16px';
}
```

---

## ✅ Чек-лист одобрения

Перед началом разработки фазы 1:

- [ ] Одобрена архитектура (PROJECT_GUIDE.md)
- [ ] Подтверждена БД schema (16 таблиц)
- [ ] Согласованы роли и права доступа
- [ ] Утверждены требования к Egypt Mode
- [ ] Одобрены фазы разработки
- [ ] Выделены ресурсы (разработчик/разработчики)

---

## 📋 Документы в этом PR

| Документ | Строк | Содержание |
|----------|-------|-----------|
| PROJECT_GUIDE.md | 810 | Полная архитектура, фазы, требования |
| DATABASE_SCHEMA.md | TBD | Все 16 таблиц с описанием столбцов |
| API_REFERENCE.md | TBD | Все endpoints и примеры |
| PERMISSIONS_MATRIX.md | TBD | Role + table access matrix |
| DEPLOYMENT.md | TBD | Docker, PostgreSQL, production setup |

---

## 🔗 GitHub

| Статус | Ссылка |
|--------|--------|
| **PR для одобрения** | https://github.com/NikShukrem/AccessWeb/pull/1 |
| **Ветка** | feature/v3-architecture |
| **Коммит** | bdd00d1 |

---

## 💬 Вопросы для обсуждения

1. **PostgreSQL или SQLite на prod?** → Рекомендую PostgreSQL для надёжности
2. **Redis для cross-server WebSocket?** → Нужно только если > 3 серверов
3. **S3 для документов?** → Опционально, можно local FS
4. **SSL сертификат?** → Let's Encrypt (бесплатно)
5. **Какой сервер (hosting)?** → Docker на Render/Railway/Heroku или VPS

---

**Статус**: 🟡 Ожидает одобрения архитектуры  
**Следующий шаг**: После одобрения → начать фазу 1 (Backend + Database)

