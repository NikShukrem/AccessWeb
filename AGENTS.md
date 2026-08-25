# AGENTS.md

Instructions for AI coding agents working in this repository.

## What this project is

AccessWeb v3 — a Russian-language logistics management web app that replaces a legacy MS Access desktop database (the name reflects that migration; there is no live `.mdb`/`.accdb` file anywhere in this repo). It manages cargo shipments (ACID), contracts (including a stage/substage tracker with full CRUD and a Chart.js Gantt view), counterparties, financial transactions (AIS), and includes a task/CRM module with a kanban board, notifications, an audit log, user administration (add users, admin-set passwords), a cross-entity global search, and an ad-hoc SQL report builder.

Stack:
- Frontend: a single static HTML file (`index.html`, ~5000+ lines) with inline CSS and vanilla JavaScript — no framework, no bundler, no npm build step. `egypt.html` is a stripped-down variant for one user role, intentionally excluding heavier libraries.
- Backend: Node.js + Express (`backend/src/server.js`, ~1750 lines, single file), using SQLite (`sqlite`/`sqlite3` packages) for storage, JWT for auth, `bcryptjs` for password hashing, `multer` for file uploads.
- Deployment model: a single machine (typically a laptop) runs the Express server, which both serves the API and hosts the static frontend files on `http://localhost:8080`. The static frontend is also mirrored to GitHub Pages, and a Cloudflare Tunnel (`tunnel.bat`) provides remote/external access when needed.

## Repository layout

- `index.html` — main application (SPA), all markup/styles/logic in one file
- `egypt.html` — lightweight alternate frontend for the "Egypt" role, no Chart.js/PapaParse/XLSX
- `sw.js` — service worker; cache invalidation is keyed off an `APP_VERSION` string defined in `index.html`
- `run.bat` / `start.bat` / `tunnel.bat` — Windows launch scripts (pull+install+start / start-only / Cloudflare tunnel)
- `backend/src/server.js` — the entire Express API: auth, generic CRUD, task/CRM routes, attachments, audit log, global search, report builder, user administration, migrations
- `backend/data/schema.sql` — base SQLite schema; the server also applies idempotent migrations on startup
- `backend/data/accessweb.db` — the runtime database file (not committed; gitignored)
- `backend/seed/` — mixed: `backfill_demo_data.js`/`fix_transaction_contract_links.js` are standalone maintenance scripts run manually with `node <file>`; `demoEmployees.js` is dynamically `import()`-ed by `seedUsers()` in `server.js` on every startup (try/catch-wrapped, optional) to provision demo accounts
- `backend/.env.example` — template for the backend's `.env` file
- No root `package.json` exists; the only Node project lives under `backend/`.

## Setup, run, and test commands

All commands run from the `backend/` directory:

```
npm install       # install backend dependencies
npm start          # node src/server.js
npm run dev         # node --watch src/server.js  (auto-restart during development)
```

The server listens on `PORT` (default `8080`) and serves the frontend from the same origin — open `http://localhost:8080/` after starting it.

There is no automated test suite in this repository (no `test` script, no test framework installed). Do not assume or invent a test command.

On Windows, the scripts in the repo root (`run.bat`, `start.bat`, `tunnel.bat`) are the operator-facing entry points and just wrap the `npm install`/`npm start` flow above, plus optional `git pull` and Cloudflare tunnel setup.

### Configuration (backend/.env, see backend/.env.example for the template)
- `PORT`, `NODE_ENV`, `HTTPS`
- `JWT_SECRET` — required for anything beyond local dev; the server silently falls back to an insecure hardcoded value (with a console warning) if this is unset
- `DB_PATH` — path to the SQLite file, defaults to `backend/data/accessweb.db`
- `CORS_ORIGINS` / `ALLOWED_ORIGINS` — comma-separated list of allowed origins for the API

## Conventions and patterns to follow

1. **Generic table CRUD**: most entities are served through `app.get/post/put/delete('/:table', ...)` in `server.js`, gated by a `VALID_TABLES` whitelist (`acid`, `contracts`, `contract_stages`, `counterparties`, `ais_transactions`, `acid_kti`, `ais_imports`) and per-table `ALLOWED_COLUMNS` whitelists. Any change touching table/column names must go through these whitelists — never interpolate a client-supplied table or column name directly into SQL.
2. **Authorization is centralized**: role permissions live in `ROLE_PERMISSIONS`, enforced through shared middleware (`auth`, `checkAccess`, `canReadTable`, `canWriteTable`, `canDeleteTable`). Add new routes using this middleware rather than writing bespoke per-route checks.
3. **Specific routes precede the generic `/:table` handlers** in `server.js` (e.g. `/auth/*`, `/dashboard`, `/tasks/*`, `/attachments/*`, `/notifications/*`, `/audit-log`, `/users/:id/password`, `/search`, `/reports/*`, `/acid/:id/transactions`, `/ais_transactions/:id/items`, `/import/:table`). Route registration order matters in Express — keep new specific routes above the catch-all ones.
4. **Schema changes go through migrations**: `runMigrations()` runs idempotent migrations at server startup. Prefer adding a migration step there over hand-editing the schema or the live `.db` file. `backend/data/schema.sql` reflects the base schema. SQLite can't `ALTER` a `CHECK` constraint — widening one (e.g. adding an allowed `entity_type` value) means rebuilding the table (`CREATE ..._new` with the new constraint, `INSERT ... SELECT *`, `DROP`, `RENAME`), guarded by checking `sqlite_master.sql` for the new value first so the migration stays idempotent. See the `notifications` and `tasks` migrations in `runMigrations()` for the pattern.
5. **Auth model**: JWT-based, 12-hour expiry, verified by the `auth` middleware which populates `req.user`. Never trust a `user_id` (or similar identity field) supplied in a request body — always use `req.user`.
6. **Security middleware already wired in**: `helmet` (CSP permits `'unsafe-inline'` scripts because the frontend uses inline `onclick=` handlers, and allows `cdn.jsdelivr.net` for CDN-hosted libraries), `cors` with an explicit allowlist, `express-rate-limit` (stricter limiter on `/auth/login`), `bcryptjs` password hashing, `multer` uploads with extension whitelist + 15MB cap + UUID-based filenames on disk (do not use user-supplied filenames as paths).
7. **`express-validator` is installed but not actually used anywhere** — request validation is hand-rolled per route handler. Don't assume declarative validation exists.
8. **Audit trail**: create/update/delete operations and attachment upload/delete are logged to the `audit_log` table (who, when, table, record, changed fields), exposed via `GET /audit-log` restricted to `admin`/`director` roles. Password resets are logged too, but the `changes` payload deliberately never contains the actual password.
9. **Global search** (`GET /search`, `admin`/`director` only) searches acid/contracts/ais_transactions/counterparties/transaction_items. The installed `sqlite3` build has no `db.function()` support and SQLite's built-in `LIKE`/`LOWER()` only case-fold ASCII, so plain SQL `LIKE` silently misses Cyrillic text typed in a different case. The fix in place: fetch the searchable columns (tables are small, well under ~8k rows) and filter with JS's `.toLowerCase().includes()`, which is Unicode-correct. Keep this pattern for any new text search — don't switch back to SQL `LIKE` for user-typed Cyrillic queries.
10. **Report builder** (`POST /reports/run`, `GET/POST/DELETE /reports/saved`, `admin`/`director` only) executes arbitrary read-only SQL: `assertSafeSelect()` requires `SELECT`/`WITH`, blocks DDL/DML keywords and multi-statement input, and the query always runs wrapped as `SELECT * FROM (<query>) LIMIT 500`. Saved queries live in `saved_reports`, which is intentionally *not* in `VALID_TABLES` — it has its own routes, not the generic `/:table` CRUD. The frontend also has a no-SQL block constructor (`REPORT_TABLES` in `index.html`) that writes generated SQL into the same editable textarea. Its "содержит" (`LIKE`) operator has the same Cyrillic case-sensitivity limitation as SQL `LIKE` in general and is not fixed — arbitrary user SQL can't be JS-filtered the way `/search` is.
11. **Contract stages**: `contract_stages` rows have full CRUD (add/edit/quick-complete/delete) through the "Стадии договоров" sub-tab (generic `/:table` routes; editing reuses the add form pre-filled, toggled by `_editingStageId`) and are rendered read-only as a Chart.js floating-bar Gantt ("Этапы (Гант)") with per-договор toggle chips (in-memory show/hide, never delete). A template loader (`CONTRACT_STAGE_TEMPLATE`) can bulk-create a standard 4-stage/24-substage approval workflow from a chosen start date. The Gantt chains a leaf substage's bar strictly by `planned_date` order (not `stage_number`/`sort_order`) since hand-entered data isn't always numbered consistently.
12. **User administration**: an `admin`-only "Пользователи" tab adds users and resets any user's password (`PUT /users/:id/password`). No self-service password change exists yet. The Tasks tab's `tasksUsersCache` (populated by `ensureUsersLoaded()`) must be invalidated (`tasksUsersCache = null`) whenever a user is added/deleted, or its assignee dropdowns go stale for the rest of the session.
13. **Tasks "Сотрудники" stats view** (`GET /tasks/stats`) lists every user via `LEFT JOIN tasks` (no `HAVING total > 0`) so managers can see who has zero workload, not just who's already busy — don't reintroduce that filter.
14. **No emoji anywhere in the UI** — icons are inline SVG (feather-style, `currentColor`). Match that convention for new UI elements.
15. **Frontend has no module system**: `index.html` is one file with global JS functions and inline event handlers by design, for a small team and simple deployment — don't introduce a bundler or module split unless asked. `egypt.html` must stay free of the heavier libraries (Chart.js, PapaParse, XLSX) that `index.html` loads from CDN.
16. **Frontend cache-busting**: bump the `APP_VERSION` constant near the top of `index.html` when shipping changes that should invalidate old service-worker caches (`sw.js` reacts to this).
17. **`meta[name="api-base"]` in `index.html`** determines the API origin the frontend targets; leave empty for same-origin deployment, set it when the frontend is hosted separately (e.g. GitHub Pages) from the backend.
18. **`backend/seed/` scripts are not all standalone**: `backfill_demo_data.js`/`fix_transaction_contract_links.js` are manual, re-runnable maintenance tools (`node backend/seed/<file>.js`); `demoEmployees.js` is dynamically imported by `server.js`'s `seedUsers()` on every startup — don't delete it assuming it's inert.
19. UI text and log/audit messages throughout the app are in Russian — match that for any new user-facing strings unless directed otherwise.

## Known issues / gotchas (documented in the repo's own README audit)

- No default `JWT_SECRET` should ever ship to a real deployment — the built-in fallback is intentionally insecure.
- Default seeded accounts (`admin/admin123`, `director/director123`, etc., listed in `README.md`) are meant to be changed before any real external deployment — admin can now do this from the "Пользователи" tab instead of editing the DB directly.
- There is still no self-service password-change endpoint (`/auth/change-password` doesn't exist) — only admin-initiated resets.
- The JWT is stored in `localStorage` on the frontend; combined with a CSP that allows inline scripts (for legacy `onclick=` handlers), this raises XSS impact — be cautious about introducing anything that reflects unsanitized user input into the DOM.
- The Express server itself does not terminate TLS; HTTPS is expected to come from an external reverse proxy or the Cloudflare tunnel.
- SQLite has no built-in encryption at rest; `backend/data/accessweb.db` is gitignored and should never be re-exposed via static file serving (a prior vulnerability that served the whole repo root, including the DB file, via `express.static` has already been fixed — do not reintroduce a root-level static mount).
- The installed `sqlite3` npm package's native binding has **no `db.function()`** — verified directly (`Database.prototype` doesn't list it). Don't attempt to register a custom SQL function (e.g. for Unicode-aware `LOWER()`) expecting it to work; it'll throw `TypeError: ... .function is not a function`. Text search that needs to handle Cyrillic case-insensitively has to fetch rows and filter in JS instead (see `/search` in server.js).
- The report builder's "содержит" (`LIKE`) operator is case-sensitive for Cyrillic for the same reason — known, documented in README, not fixed (arbitrary user SQL can't be JS-filtered the way `/search` is).
