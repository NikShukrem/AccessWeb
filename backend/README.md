# AccessWeb Backend

Production-oriented backend service for collaborative work (up to ~10 concurrent users).

## Stack
- Node.js + Express
- SQLite (WAL mode for concurrent reads/writes)
- JWT authentication
- Role-based access control (`admin`, `contracts`, `finance`)

## Run Locally
1. Copy `.env.example` to `.env` and set secrets.
2. Install dependencies:
   ```bash
   npm install
   ```
3. Start server:
   ```bash
   npm start
   ```

Service URL: `http://localhost:8080`

## API Quick Check
- `GET /api/health`
- `POST /api/auth/login`
- `GET /api/dashboard/stats`
- `GET /api/dashboard/finance-trends?months=12`

## Default Accounts
- `admin / admin123`
- `contracts / contracts123`
- `finance / finance123`

## RBAC Matrix
- admin: full read/write access
- contracts: read access to dashboard + ACID + contracts
- finance: read access to dashboard + ACID + finance

## Notes
- Data payloads are stored as JSON to keep compatibility with evolving table schemas.
- For higher scale (>10-20 concurrent users), migrate to PostgreSQL with the same API contract.
