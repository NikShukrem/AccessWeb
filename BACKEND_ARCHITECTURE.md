# AccessWeb Backend Architecture

## Goal
Enable real multi-user work with centralized storage and role-based access.

## Components
- Frontend SPA (existing UI)
- Backend API (`backend/src/server.js`)
- Shared DB (`backend/data/accessweb.db`)

## Security
- Passwords hashed with bcrypt.
- JWT bearer token for API access.
- RBAC middleware for role segregation.

## Data Model
- `users`: identities and roles
- `acid`: primary logistics records + schema-flexible JSON payload
- `contracts`: contract records + JSON payload
- `finance`: financial records + JSON payload and normalized USD fields

## API Domains
- `auth`: login + profile
- `users`: admin role management
- `acid/contracts/finance`: CRUD endpoints
- `dashboard`: stats and monthly finance trends

## Finance Trend Logic
Monthly aggregation in USD:
- Red line (`debtUsd`): states like "план/ожидание"
- Green line (`paymentsUsd`): states like "оплачено"
- Blue line (`servicesUsd`): total services amount

## Deployment Strategy
Phase 1 (now):
- Containerized backend via Docker Compose
- Persistent volume for DB

Phase 2 (recommended):
- Move DB to managed PostgreSQL
- Put backend behind HTTPS reverse proxy
- Add CI/CD pipeline and migration scripts
