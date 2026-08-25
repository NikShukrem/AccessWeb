# CLAUDE.md

This file gives Claude Code project-specific guidance for working in this repository.

## Project overview

AccessWeb v3 is a Russian-language web-based logistics management system built to replace an existing MS Access desktop database (the repo name refers to that migration, not to a live Access DB — no `.mdb`/`.accdb` file is involved). It tracks cargo shipments (ACID), contracts (with a stage/substage tracker and a Chart.js Gantt view), counterparties, and financial transactions (AIS), plus a task/CRM module for managers, a cross-entity global search, and an ad-hoc SQL report builder. Stack: a single-file vanilla JS/HTML frontend (`index.html`, no build step, no framework) served by a Node.js/Express backend (`backend/src/server.js`) backed by SQLite. It's deployed as a small on-prem app: a laptop runs the Express server as both API and static file host, with an optional GitHub Pages mirror of the static frontend and a Cloudflare Tunnel for remote access.

## Repository structure

```
AccessWeb/
├── index.html            # Main SPA — ~5000 lines, all HTML/CSS/JS inline, no modules/bundler
├── egypt.html            # Lightweight variant for the "Egypt" role — no Chart.js/PapaParse/XLSX, for slow connections
├── sw.js                 # Service worker (cache-busting tied to APP_VERSION in index.html)
├── run.bat               # Primary launch: git pull (if no local changes) + install deps + start.bat
├── start.bat             # Launch without pulling updates (offline-safe)
├── tunnel.bat            # Exposes localhost:8080 via cloudflared for remote access
└── backend/
    ├── src/server.js     # Express API server, ~1760 lines, single file, routes + auth + business logic
    ├── data/
    │   ├── schema.sql    # SQLite schema (source of truth for tables)
    │   └── accessweb.db  # Runtime DB (gitignored)
    ├── seed/              # One-off/maintenance scripts (backfill, data fixes) — not wired into the server
    ├── seed.js            # Initial demo data seeding (gitignored — regenerate locally if needed)
    ├── package.json
    └── .env.example       # Template for backend/.env
```

There is no root-level `package.json` — the only Node project is `backend/`.

## Build / run / test

No frontend build step exists — `index.html` and `egypt.html` are served as-is by Express.

Backend (run from `backend/`):
```
npm install          # install dependencies
npm start            # node src/server.js — production-style run
npm run dev           # node --watch src/server.js — auto-restart on change
```
Server listens on `PORT` (default `8080`); visiting `http://localhost:8080/` serves `index.html` from the same server.

There is no test suite in this repo (no test script, no test framework dependency) — do not invent `npm test` commands.

Windows entry points (what a human/operator actually double-clicks): `run.bat` (git pull + install + start), `start.bat` (start without pulling), `tunnel.bat` (cloudflared tunnel for external access). These wrap the same `npm install` / `npm start` flow.

### Environment variables (backend, see `backend/.env.example`)
- `PORT` (default 8080), `NODE_ENV`, `HTTPS`
- `JWT_SECRET` — **falls back to a hardcoded insecure dev value with a console warning if unset**; must be set for any real deployment
- `DB_PATH` — defaults to `backend/data/accessweb.db`
- `CORS_ORIGINS` / `ALLOWED_ORIGINS` — comma-separated allowlist; server also hardcodes `localhost:8080`, `127.0.0.1:8080`, and `https://nikshukrem.github.io` as defaults

## Architecture / conventions actually observed

- **Generic CRUD core**: `app.get/post/put/delete('/:table', ...)` in `backend/src/server.js` handles most entities through one code path, guarded by a `VALID_TABLES` whitelist (`acid`, `contracts`, `contract_stages`, `counterparties`, `ais_transactions`, `acid_kti`, `ais_imports`) and a per-table `ALLOWED_COLUMNS` whitelist — never accept a raw table/column name into SQL without checking these sets first.
- **Role-based access** is centralized in `ROLE_PERMISSIONS` plus shared middleware (`checkAccess`, `canReadTable`, `canWriteTable`, `canDeleteTable`, `auth`) rather than scattered per-route checks. New routes should reuse this middleware, not reimplement authorization.
- **Auth**: JWT (12h expiry) via `auth` middleware reading `req.user` from the verified token — never trust a `user_id` field from the request body.
- **Migrations**: `runMigrations()` applies idempotent schema changes on server startup; `backend/data/schema.sql` documents the base schema. Prefer adding a migration over hand-editing the live `.db` file.
- **Security middleware already in place**: `helmet` (with CSP allowing `'unsafe-inline'` for inline `onclick=` handlers and `cdn.jsdelivr.net` for script src), `cors` with an explicit origin allowlist, `express-rate-limit` (`authLimiter`: 20/15min on login, `apiLimiter`: 300/min elsewhere), `bcryptjs` for password hashing, `multer` for uploads (extension whitelist, 15MB limit, UUID-named files on disk — never derive upload paths from user-supplied filenames).
- **Non-generic routes** (`/auth/*`, `/dashboard`, `/tasks/*`, `/attachments/*`, `/notifications/*`, `/audit-log`, `/users/:id/password`, `/search`, `/reports/*`, nested `/acid/:id/transactions`, `/ais_transactions/:id/items`, `/import/:table`) are defined explicitly above the generic `/:table` handlers in `server.js` — route order matters, keep specific routes before the generic ones.
- **Audit logging**: writes to `audit_log` table capture who/when/table/record/changed-fields for create/update/delete and attachment upload/delete; exposed via `GET /audit-log` to `admin`/`director` roles only.
- **Global search** (`GET /search`, `admin`/`director` only): searches acid/contracts/ais_transactions/counterparties/transaction_items. The installed `sqlite3` build has **no `db.function()` support** (verified — the native binding's `Database.prototype` doesn't expose it), and SQLite's own `LIKE`/`LOWER()` only case-fold ASCII, so a naive SQL `LIKE` search silently misses Cyrillic text in a different case. `/search` works around this by fetching the searchable columns per table (all comfortably under ~8k rows) and filtering with JS's `.toLowerCase().includes()`, which handles Cyrillic correctly — don't revert this to plain SQL `LIKE` for text search. The report builder's generated `LIKE` operator still has this limitation (arbitrary user SQL can't be JS-filtered the same way) — documented as a known gap in README, not fixed.
- **Report builder** (`POST /reports/run`, `GET/POST/DELETE /reports/saved`, `admin`/`director` only): runs arbitrary read-only SQL. `assertSafeSelect()` requires `SELECT`/`WITH`, blocks a DDL/DML keyword list, and rejects multiple statements; the query is always wrapped as `SELECT * FROM (<query>) LIMIT 500` before execution. Saved queries live in the `saved_reports` table (not part of `VALID_TABLES` — it has its own dedicated routes, not the generic `/:table` CRUD). Frontend has a block-based query constructor (`REPORT_TABLES` in `index.html`) that generates SQL text into the same editable textarea used for raw queries.
- **Contract stage tracking**: `contract_stages` rows (stage_number, stage_name, substage_name, planned_date, actual_date, status, responsible) are managed through a dedicated "Стадии договоров" sub-tab with full CRUD (add/edit/quick-complete/delete, all via the generic `/:table` routes — editing reuses the same add form pre-filled, toggled by an `_editingStageId` frontend state var) and visualized read-only as a Chart.js floating-bar Gantt in the "Этапы (Гант)" sub-tab, with per-договор toggle chips (temporary, in-memory hide/show — never a delete). A template loader (`CONTRACT_STAGE_TEMPLATE` in `index.html`) can bulk-create the standard 4-stage/24-substage approval process from a chosen start date, computing each `planned_date` by chaining the *maximum* of its working-day duration range. The Gantt's bar span for a leaf substage is computed by chaining strictly on `planned_date` order (not `stage_number`/`sort_order`) — real hand-entered data isn't always numbered consistently, and a date-order chain can never produce a negative-width bar.
- **User administration**: a `admin`-only "Пользователи" tab lists all users and lets admin add new accounts and reset any user's password (`PUT /users/:id/password`, bcrypt-hashed, audit-logged without the password value itself). There is still no self-service password change. The Tasks tab caches the user list in a module-level `tasksUsersCache` var (`ensureUsersLoaded()`) for its assignee dropdowns — that cache must be invalidated (`tasksUsersCache = null`) after adding/deleting a user or it goes stale for the rest of the session (this bit us once — don't reintroduce the staleness).
- **Tasks "Сотрудники" stats view** (`GET /tasks/stats`) intentionally lists *every* user via `LEFT JOIN tasks`, including those with zero assigned tasks (no `HAVING total > 0` filter) — a manager needs to see who's free to assign work to, not just who's already busy. Don't reintroduce that filter.
- **No emoji in the UI** — all icons are inline SVG (feather-style, `currentColor` stroke) so they render consistently across platforms; don't introduce emoji characters when adding new UI elements.
- **`express-validator` is a listed dependency but unused** — request body validation is done manually per-handler. Don't assume validator middleware exists; check the handler body.
- **Frontend is a single large file with no modules**: `index.html` mixes HTML/CSS/inline `<script>` with global functions and inline `onclick=` handlers — this is an intentional simplification for a small team/deployment, not an oversight. `egypt.html` deliberately omits Chart.js/PapaParse/XLSX to stay light for slow connections; keep that constraint if editing it.
- **Cache-busting**: `index.html` has an `APP_VERSION` constant near the top that, when bumped, clears service-worker caches and forces reload — bump it when shipping frontend changes that must invalidate old caches. `sw.js` cooperates with this.
- **`meta[name="api-base"]`** in `index.html` controls where the frontend points its API calls — empty means same-origin; set when frontend is deployed separately (e.g., GitHub Pages) from the API.
- **`backend/seed/` is mixed**: `backfill_demo_data.js` and `fix_transaction_contract_links.js` are one-off data-repair scripts, not imported by `server.js` — run manually with `node` when needed, safe to delete/rerun. `demoEmployees.js` is different — `seedUsers()` in `server.js` dynamically `import()`s it on every startup (wrapped in try/catch) to optionally provision demo accounts if they don't already exist; deleting the file just silently skips that step rather than erroring.
- Language: all UI text, error messages, and README/audit notes are in Russian; keep new user-facing strings consistent with that unless told otherwise.

## Known gotchas (from the repo's own security/code audit in README.md)

- `JWT_SECRET` has an insecure default — always set it explicitly outside of local dev.
- Default demo accounts (`admin/admin123`, `director/director123`, etc.) are seeded automatically and documented in README — must be changed/disabled before real external deployment; admin can now do this from the "Пользователи" tab instead of editing the DB directly.
- No self-service password change endpoint exists yet (`/auth/change-password` is not implemented) — only admin-initiated resets via `PUT /users/:id/password`.
- JWT is stored in `localStorage` on the frontend, and CSP allows `'unsafe-inline'` scripts (needed for existing inline `onclick=` handlers) — XSS risk is higher than with a strict CSP.
- Express itself serves plain HTTP; TLS is expected to come from an external reverse proxy or the Cloudflare tunnel, not from the app.
- SQLite has no built-in file-level encryption; treat `backend/data/accessweb.db` as sensitive (it's gitignored, and the root-static-serving vulnerability that used to expose it has already been fixed — do not reintroduce a catch-all `express.static` on the repo root).
- The installed `sqlite3` package has **no `db.function()`** (verified — not on `Database.prototype`). Don't try to register a custom SQL function for Unicode-aware case folding; it'll throw. Cyrillic-safe case-insensitive search has to fetch-and-filter-in-JS instead (see `/search`'s implementation). The report builder's `LIKE` operator still has this limitation and is documented as a known gap, not a bug to silently "fix" the same way.
