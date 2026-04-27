# AccessWeb Backend

✅ **Security-Hardened** Production-oriented backend service for collaborative work (up to ~10 concurrent users).

## Security Updates ✅

This backend has been hardened with:
- **🔐 Helmet** - Security headers (CSP, HSTS, X-Frame-Options, etc.)
- **📦 Compression** - Gzip 9 compression for all responses
- **🔒 Rate Limiting** - Login attempts (5/15min), API (100/min)
- **✓ Input Validation** - Express-validator for all POST/PUT endpoints
- **🚫 CORS Security** - No more `*`, specific origins only
- **🔑 JWT Security** - Mandatory JWT_SECRET in production, random demo passwords
- **🌐 Nginx Reverse Proxy** - SSL/TLS termination, security headers, compression
- **🔐 Non-root Docker** - Runs as `nodejs` user for reduced attack surface

## Stack
- Node.js 20 LTS + Express 4.19+
- SQLite (WAL mode for concurrent reads/writes) → **PostgreSQL recommended**
- JWT authentication (12h tokens)
- Role-based access control (`admin`, `contracts`, `finance`)
- Helmet, Compression, Rate-limit, Validator middleware

## Quick Start (Development)

### 1. Setup
```bash
# Copy environment template
cp .env.example .env

# Install dependencies (includes new security packages)
npm install
```

### 2. Development Mode
```bash
# Start with file watching
npm run dev

# Server runs on: http://localhost:8080
```

### 3. Test Login
```bash
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login": "admin", "password": "admin123"}'
```

## Production Deployment

### 1. Generate JWT Secret
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Set Environment Variables
```bash
# Copy production template
cp .env.production .env.production

# Edit and set:
# - JWT_SECRET=<generated-above>
# - CORS_ORIGINS=https://yourdomain.eg
# - NODE_ENV=production
```

### 3. Docker Deployment
```bash
# Generate SSL certificates (development)
cd ../nginx/ssl && bash generate-certs.sh

# Or use Let's Encrypt in production

# Start services
cd ../.. && docker-compose up -d

# View logs
docker-compose logs -f accessweb-backend
```

## API Endpoints

### Public
- `GET /api/health` - Health check

### Auth
- `POST /api/auth/login` - Login (rate limited 5/15min)
- `GET /api/auth/me` - Get current user (requires JWT)

### Admin
- `GET /api/users` - List users (admin only)
- `PUT /api/users/:id` - Update user (admin only)

### ACID
- `GET /api/acid` - List ACID records
- `POST /api/acid` - Create ACID record (admin only)
- `PUT /api/acid/:id` - Update ACID record (admin only)

### Contracts  
- `GET /api/contracts` - List contracts
- `POST /api/contracts` - Create contract (admin only)
- `PUT /api/contracts/:id` - Update contract (admin only)

### Finance
- `GET /api/finance` - List finance records
- `POST /api/finance` - Create finance record (admin only)
- `PUT /api/finance/:id` - Update finance record (admin only)

### Dashboard
- `GET /api/dashboard/stats` - Dashboard statistics
- `GET /api/dashboard/finance-trends?months=12` - Finance trends

## Default Development Accounts

| Login | Password | Role | Permissions |
|-------|----------|------|------------|
| admin | admin123 | admin | All access |
| contracts | contracts123 | contracts | View ACID/Contracts, create reports |
| finance | finance123 | finance | View Finance, reports |

⚠️ **Production**: Random passwords are generated automatically. Save them on first startup!

## Security Features
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
