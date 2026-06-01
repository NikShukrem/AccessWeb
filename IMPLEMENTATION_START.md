# AccessWeb v3.0 - Начало разработки

**Дата создания**: 1 июня 2026  
**Статус**: ✅ Архитектура готова к утверждению  
**GitHub PR**: https://github.com/NikShukrem/AccessWeb/pull/1

---

## 📋 Итоговая сводка предварительного анализа

### ✅ Выполнено

1. **PROJECT_GUIDE.md** (810 строк)
   - Полный анализ текущего состояния (плюсы/минусы)
   - Новая структура папок (backend + frontend + docs)
   - Технологический стек с обоснованием
   - Нормализованная схема БД (16 таблиц вместо 4)
   - Ролевая система с матрицей прав доступа
   - Все функциональные требования
   - Оптимизация для Египта (3G/Edge)
   - План масштабирования при 10x нагрузке
   - 7 фаз разработки с timeline

2. **ANALYSIS_SUMMARY.md** (299 строк)
   - Быстрая сводка текущего vs новое
   - Таблица с плюсами и минусами
   - Сравнение архитектур
   - Всё о фазах разработки
   - Оптимизация для Египта (примеры кода)
   - Чек-лист одобрения

3. **GitHub PR #1**
   - Ветка: `feature/v3-architecture`
   - 2 коммита с подробными описаниями
   - Готова к review

---

## 🎯 Ключевые решения архитектуры

### Текущая проблема
```
✗ 4 таблицы (плоская структура)
✗ Нет управления пользователями
✗ Нет разграничения прав доступа
✗ Нет Egypt Mode
✗ Нет Dashboard
✗ Нет уведомлений и поручений
```

### Предложенное решение
```
✓ 16 нормализованных таблиц
✓ Админ-панель для управления users/roles
✓ Матрица прав: user + role + table = [view|create|update|delete|export]
✓ Egypt Mode флаг в users.is_egypt_mode (упрощённый интерфейс)
✓ Manager Dashboard с KPI и алертами
✓ Таблицы notifications и tasks
✓ Real-time синхронизация через WebSocket
✓ Поддержка 10+ одновременных пользователей
```

---

## 📊 Структура БД (Нормализация)

### ACID таблица (было 40 столбцов в одной)

```sql
-- СТАРОЕ (плоское)
acids (ACID, Номер КТИ, Грузоотправитель, ..., Статус таможни, ..., 40 столбцов)

-- НОВОЕ (нормализованное)
acids
├─ acid_logistics (перевозка, судно, DO, porto)
├─ acid_customs (таможня, ДТ, освобождение)
└─ acid_documents (документы, BoL, инвойсы)
```

### Contracts таблица (было 19 столбцов)

```sql
-- СТАРОЕ
contracts (Номер, Контрагент, Окончание, ..., 19 столбцов)

-- НОВОЕ
contracts
├─ contract_stages (этапы подписания с датами, ответственными)
└─ invoices (счета с payment_status)
```

### Новые таблицы

```
users (пользователи с ролями и отделами)
departments (отделы)
user_permissions (матрица: user + table + [can_view|create|update|delete|export])
exchange_rates (история курсов валют)
tasks (поручения/assignments)
notifications (уведомления)
saved_queries (сохранённые фильтры пользователей)
acid_kti (связь между acids и КТИ)
```

---

## 🏗️ Стек технологий

| Слой | Было | Будет | Обоснование |
|------|------|-------|------------|
| Backend | Node.js + Express | Node.js + Express | Keep (stable) |
| API | REST + WebSocket | REST + WebSocket | Keep (working) |
| DB | SQLite | PostgreSQL (prod) / SQLite (dev) | Нормализация, индексы, надёжность |
| Frontend | Vanilla JS (один файл) | Vanilla JS + Alpine.js (модульно) | Быстро на 3G, no React/Vue |
| Auth | JWT basic | JWT + bcryptjs + middleware | Улучшенная безопасность |
| Real-time | WebSocket direct | WebSocket + Redis Pub/Sub | Масштабирование |
| Deployment | Docker (dev only) | Docker + Nginx + PostgreSQL | Production-ready |

---

## 🚀 Фазы разработки (35-45 дней)

### ФАЗА 1: Backend + Database (7-10 дней)
**Ветка**: `feature/backend-v3`

- [ ] Создать PostgreSQL schema (16 таблиц)
- [ ] Мигрировать данные со SQLite на PostgreSQL
- [ ] Переписать Express server.js (модульная структура)
- [ ] Endpoints для всех таблиц:
  - GET /api/acids (с pagination, filters, field selection)
  - POST /api/acids (create)
  - PUT /api/acids/:id (update)
  - DELETE /api/acids/:id (delete)
  - (То же для contracts, finance, users, tasks, notifications)
- [ ] Middleware:
  - authMiddleware (JWT verification)
  - roleMiddleware (check user.role)
  - permissionMiddleware (check user_permissions)
- [ ] WebSocket endpoints for real-time updates
- [ ] Database indexing на часто-ищущихся полях

### ФАЗА 2: Frontend Модульность (7-10 дней)
**Ветка**: `feature/frontend-v3`

- [ ] Переструктурировать index.html:
  ```
  frontend/public/
  ├─ js/
  │  ├─ app.js (main init, router)
  │  ├─ api.js (fetch wrapper)
  │  ├─ auth.js (login, token)
  │  ├─ websocket.js (client)
  │  ├─ store.js (simple state)
  │  ├─ pages/ (acid.js, contracts.js, finance.js, etc)
  │  ├─ ui/ (tables.js, forms.js, filters.js, modals.js)
  │  └─ utils/ (dates.js, currency.js, validation.js, etc)
  ├─ css/
  │  ├─ base.css
  │  ├─ components.css
  │  ├─ table.css (с virtual scrolling)
  │  └─ egypt-mode.css
  └─ index.html (clean, no inline code)
  ```
- [ ] Virtual scrolling (50 rows в DOM)
- [ ] Debouncing поиска (300ms)
- [ ] Egypt Mode CSS (меньше столбцов, крупнее шрифты)

### ФАЗА 3: Admin & Dashboard (5-7 дней)
**Ветка**: `feature/admin-v3`

- [ ] Admin panel (/admin):
  - Таблица users (CRUD)
  - Таблица departments (CRUD)
  - Матрица прав доступа (user_permissions)
  - Импорт users из CSV
- [ ] Manager Dashboard (/dashboard):
  - KPI cards (contracts, overdue, finance, shipments)
  - Overdue contracts alert
  - Recent tasks
  - Finance summary (график)
  - Incoming shipments

### ФАЗА 4: Импорт & Экспорт (3-4 дня)
**Ветка**: `feature/import-export-v3`

- [ ] CSV импорт с валидацией
- [ ] JSON импорт
- [ ] Excel экспорт (CSV формат)
- [ ] Auto-detect таблицы по заголовкам
- [ ] Обработка курсов валют (exchange_rates)

### ФАЗА 5: Notifications & Cron (3-4 дня)
**Ветка**: `feature/notifications-v3`

- [ ] Таблица notifications
- [ ] WebSocket broadcast notifications
- [ ] node-cron job (ежедневно 00:00):
  - Проверить просроченные договоры (contracts где end_date < today)
  - Создать notifications для admin + manager
- [ ] Task assignment notifications
- [ ] Payment reminder notifications

### ФАЗА 6: Testing & Documentation (5-7 дней)
**Ветка**: `feature/testing-v3`

- [ ] API_REFERENCE.md (все endpoints)
- [ ] DATABASE_SCHEMA.md (все столбцы с типами)
- [ ] PERMISSIONS_MATRIX.md (role + table access)
- [ ] Manual testing checklist
- [ ] Регрессионное тестирование
- [ ] Cross-browser testing (Chrome, Firefox, Safari, Edge)
- [ ] Mobile testing (iOS, Android)

### ФАЗА 7: Deployment (3-4 дня)
**Ветка**: `feature/deployment-v3`

- [ ] PostgreSQL Docker container
- [ ] Nginx reverse proxy
- [ ] Environment variables (.env)
- [ ] Gzip + Brotli compression
- [ ] Database backups strategy
- [ ] SSL/TLS (Let's Encrypt)
- [ ] Monitoring и logging
- [ ] Production checklist

---

## ✅ Чек-лист одобрения (ДО НАЧАЛА РАЗРАБОТКИ)

Пожалуйста, подтвердите:

- [ ] **Архитектура одобрена**
  - 16 таблиц нормализованы ✅
  - Стек технологий согласован ✅
  - Роли и права определены ✅

- [ ] **Требования ясны**
  - Egypt Mode функционал ✅
  - Manager Dashboard ✅
  - Уведомления и cron ✅
  - Поддержка 10+ users ✅

- [ ] **Ресурсы выделены**
  - Разработчик(и) → ___________
  - Тестировщик → ___________
  - Product Owner → ___________

- [ ] **Timeline согласован**
  - 35-45 дней на 7 фаз ✅
  - Приоритет фаз определён ✅

- [ ] **GitHub setup**
  - Ветка `feature/v3-architecture` создана ✅
  - PR #1 открыт ✅
  - Доступ к репо есть ✅

---

## 🔗 Ссылки и файлы

### Документация в репо

| Файл | Размер | Содержание |
|------|--------|-----------|
| [PROJECT_GUIDE.md](PROJECT_GUIDE.md) | 810 строк | Полная архитектура |
| [ANALYSIS_SUMMARY.md](ANALYSIS_SUMMARY.md) | 299 строк | Краткая сводка |
| [IMPLEMENTATION_START.md](IMPLEMENTATION_START.md) | Этот файл | Начало разработки |

### GitHub

| Статус | Ссылка |
|--------|--------|
| **PR для одобрения** | https://github.com/NikShukrem/AccessWeb/pull/1 |
| **Ветка** | https://github.com/NikShukrem/AccessWeb/tree/feature/v3-architecture |
| **Репо** | https://github.com/NikShukrem/AccessWeb |

### Дополнительные документы (TBD)

```
docs/
├─ DATABASE_SCHEMA.md      (после одобрения)
├─ API_REFERENCE.md        (после фазы 1)
├─ PERMISSIONS_MATRIX.md   (после фазы 1)
├─ DEPLOYMENT.md           (после фазы 7)
└─ TESTING_GUIDE.md        (после фазы 6)
```

---

## 📞 Вопросы и обсуждение

Используйте комментарии в GitHub PR #1 для обсуждения:

1. **PostgreSQL или SQLite в продакшене?**
   → Рекомендация: PostgreSQL для надёжности и индексов

2. **Redis для cross-server WebSocket?**
   → Рекомендация: Нужно только если > 3 серверов

3. **Где хранить документы (S3 vs local)?**
   → Рекомендация: Local FS (с git-lfs или S3 в будущем)

4. **Как часто обновлять курсы валют?**
   → Рекомендация: Ручной импорт или API (напр. OpenExchangeRates)

5. **Нужен ли Redis кэш для таблиц?**
   → Рекомендация: Нет, оптимизировать индексы в БД

---

## 🎯 Следующие шаги (ПОСЛЕ ОДОБРЕНИЯ)

1. **Merge PR #1 в main**
   - Архитектура становится baseline

2. **Начать ФАЗА 1: Backend**
   - Создать ветку `feature/backend-v3`
   - Переписать Express server
   - Создать PostgreSQL schema
   - Сделать PR в develop

3. **Параллельно: создать другие файлы**
   - DATABASE_SCHEMA.md
   - API_REFERENCE.md
   - PERMISSIONS_MATRIX.md

4. **Continuous deployment**
   - Каждый день: коммиты в feature ветки
   - Каждую неделю: PR для review
   - Каждые 2 недели: merge в develop
   - После всех фаз: merge в main (v3.0 release)

---

## 📝 Примечания разработчику

### Важное про Egypt Mode

```javascript
// frontend/js/pages/acid.js (example)

if (user.is_egypt_mode) {
  // Показать только основные столбцы
  const columns = ['acid_number', 'status', 'cargo_description'];
  
  // Упростить форму (только обязательные)
  const formFields = ['status', 'cargo_description', 'remarks'];
  
  // Скрыть дашборд
  document.getElementById('dashboard').style.display = 'none';
  
  // Крупнее шрифты
  document.body.classList.add('egypt-mode');
}
```

### Важное про Permission checks

```javascript
// backend/src/middleware/roleMiddleware.js (example)

async function checkTableAccess(req, res, next) {
  const { userId, role } = req.user;
  const { tableName, operation } = req.params; // 'acids', 'view'
  
  const perm = await db.query(
    `SELECT can_view, can_create, can_update, can_delete, can_export
     FROM user_permissions
     WHERE user_id = ? AND table_name = ?`,
    [userId, tableName]
  );
  
  const canOperationMap = {
    'view': perm?.can_view,
    'create': perm?.can_create,
    'update': perm?.can_update,
    'delete': perm?.can_delete,
    'export': perm?.can_export,
  };
  
  if (!canOperationMap[operation]) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  
  next();
}
```

### Важное про Cron job

```javascript
// backend/src/scheduled-jobs.js

import cron from 'node-cron';

// Каждый день в 00:00 UTC проверить просроченные договоры
cron.schedule('0 0 * * *', async () => {
  const today = new Date().toISOString().slice(0, 10);
  
  const overdue = await db.query(
    `SELECT id, number, counterparty, end_date
     FROM contracts
     WHERE end_date < ? AND status = 'active'`,
    [today]
  );
  
  for (const contract of overdue) {
    const daysOverdue = Math.floor(
      (new Date(today) - new Date(contract.end_date)) / (1000 * 60 * 60 * 24)
    );
    
    // Уведомить всех admin + manager
    await db.query(
      `INSERT INTO notifications (user_id, type, title, message, related_table, related_record_id)
       SELECT user_id, 'overdue_contract', ?, ?, 'contracts', ?
       FROM users
       WHERE role IN ('admin', 'manager')`
      [
        `Contract ${contract.number} is overdue`,
        `Contract with ${contract.counterparty} is ${daysOverdue} days overdue`,
        contract.id
      ]
    );
    
    // Broadcast через WebSocket
    broadcastUpdate('notification', {
      type: 'overdue_contract',
      contractId: contract.id,
    });
  }
});
```

---

## ✨ Итоговый статус

```
╔═════════════════════════════════════════════════════════════╗
║           ACCESSWEB v3.0 - ГОТОВО К РАЗРАБОТКЕ             ║
╠═════════════════════════════════════════════════════════════╣
║  ✅ Архитектура разработана и документирована              ║
║  ✅ Стек технологий выбран                                 ║
║  ✅ БД нормализована (16 таблиц)                          ║
║  ✅ Роли и права определены                                ║
║  ✅ Требования к Egypt Mode ясны                           ║
║  ✅ Timeline: 35-45 дней (7 фаз)                           ║
║  ✅ GitHub PR #1 открыт для review                         ║
║                                                             ║
║  🟡 ОЖИДАЕТ: Одобрения архитектуры                         ║
║  🟡 ТРЕБУЕТСЯ: Выделение ресурсов (разработчик)           ║
║  🟡 СЛЕДУЮЩИЙ: Начало ФАЗЫ 1 (Backend)                    ║
╚═════════════════════════════════════════════════════════════╝
```

---

**Статус**: ⏳ Ожидает одобрения → Готово к разработке  
**Дата последнего обновления**: 1 июня 2026  
**Автор**: GitHub Copilot (Senior Architect Mode)  
**Версия**: 3.0

