# AccessWeb - Simple CRUD System

**Status**: ✅ Production Ready | Backend: Running | GitHub Pages: ✅ Live

## System Overview

Простое веб-приложение для управления тремя основными сущностями:
- **Грузы (ACIDS)** - Логистические грузы и их статусы
- **Договоры (Contracts)** - Коммерческие соглашения  
- **Финансы (Finance)** - Финансовые транзакции и операции

## Architecture

### Frontend
- **Technology**: Vanilla JavaScript + HTML + CSS
- **Features**: 
  - Responsive UI с 3 основными вкладками
  - CRUD операции для каждой таблицы
  - JWT-based authentication
  - Auto-logout after 24h
- **Deployment**: GitHub Pages (https://nikshukrem.github.io/AccessWeb/)
- **API Detection**: 
  - Local: `http://localhost:8080/api` (development)
  - Remote: `https://accessweb-api.onrender.com/api` (production)

### Backend
- **Technology**: Node.js + Express + SQLite
- **Database**: SQLite3 (backend/data/accessweb.db)
- **Authentication**: JWT + bcrypt (24h token expiry)
- **API**: RESTful endpoints with role-based access
- **Deployment**: Render.yaml configured for free tier deployment

## Installation & Development

### Local Setup

```bash
# 1. Clone repository
git clone https://github.com/NikShukrem/AccessWeb.git
cd AccessWeb

# 2. Install backend dependencies
cd backend
npm install

# 3. Start server (development)
npm start
# OR watch mode
npm run dev

# 4. Open browser
# Frontend: http://localhost:8080/app.html
# or http://localhost:8080/index.html
```

**Default Credentials**:
- Login: `admin`
- Password: `admin123`

### Database Schema

#### Users
```
id, login, password_hash, name, role, department, is_egypt_mode, created_at
```

#### Acids (Грузы)
```
id, acid, gruzootravitel, status, postavshchik, naimenovanie, gw_kg, kti_nomer, 
stoimost_gruza, valyuta, kolichestvo_mest, tip_perevozki, kolichestvo_konteynerov, 
strana_otpravleniya, etd, eta, do_released, custom_status, dt_nomer, dt_data, 
created_by, created_at, updated_at
```

#### Contracts (Договоры)
```
id, nomer, predmet, kontragent, tip, kharakter_zakupki, osobennosti, data, 
okonchaniye, status, protokol, limit_sum, valyuta_oplaty, summa_oplaty, 
ostatok_limita, valyutnyy_kontrol, ds_data, ssylka, kommentariy, stadiya_dogovora, 
created_by, created_at, updated_at
```

#### Finance (Финансы)
```
id, data, kti_nomer, data_raskhoda, kti_data, valyuta, summa, organizaciya, 
kontragent, dogovor, data_dogovora, proyekt, sostoyanie, otvetstvennyy, 
srochnyy_platezh, created_by, created_at, updated_at
```

## API Endpoints

### Authentication
```
POST   /api/auth/login              - Login (returns JWT token)
GET    /api/auth/me                 - Get current user info
```

### CRUD Operations
```
GET    /api/:table                  - List records (limit=100&offset=0)
GET    /api/:table/:id              - Get single record
POST   /api/:table                  - Create new record
PUT    /api/:table/:id              - Update record
DELETE /api/:table/:id              - Delete record
POST   /api/import/:table           - Batch import (JSON array)
```

Allowed tables: `acids`, `contracts`, `finance`

### Example Request

```bash
# Login
curl -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"login":"admin","password":"admin123"}'

# Get token from response, then use it:
TOKEN="your_token_here"

# List acids
curl -X GET "http://localhost:8080/api/acids?limit=10&offset=0" \
  -H "Authorization: Bearer $TOKEN"

# Create new acid
curl -X POST http://localhost:8080/api/acids \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"acid":"AC-001","status":"pending","gruzootravitel":"Company"}'
```

## Testing

### Manual Testing
1. Frontend: http://localhost:8080/app.html
2. Login with admin/admin123
3. Add, Edit, Delete records in each table
4. Switch between tabs

### API Testing
```bash
node test-api.js
```

## Deployment

### GitHub Pages
- **URL**: https://nikshukrem.github.io/AccessWeb/
- **Update**: Just push to GitHub (auto-deployed)
- **Note**: Frontend is static; requires backend API

### Backend Deployment
Options:
1. **Render.com** (free tier): Use render.yaml config
2. **Railway**: Deploy backend service
3. **Self-hosted**: Use Docker with docker-compose.yml

### Environment Variables
```
PORT=8080
JWT_SECRET=your-secret-key
DB_PATH=./data/accessweb.db
CORS_ORIGIN=*
NODE_ENV=development
```

## Project Structure

```
AccessWeb/
├── backend/
│   ├── data/
│   │   └── schema.sql           # Database schema
│   │   └── accessweb.db         # SQLite database (created on first run)
│   ├── src/
│   │   └── server.js            # Main Express server
│   ├── package.json
│   ├── Dockerfile
│   └── render.yaml              # Render.com deployment config
├── index.html                   # Frontend (GitHub Pages)
├── app.html                     # Frontend alternate
├── test-api.js                  # API testing script
├── README.md
├── .gitignore
└── docker-compose.yml           # Local Docker development

```

## Features

### Current Implementation
- ✅ SQLite database with 3 main tables
- ✅ JWT authentication (24h expiry)
- ✅ CRUD operations for all tables
- ✅ Responsive mobile-friendly UI
- ✅ Real-time validation
- ✅ Automatic token refresh ready
- ✅ GitHub Pages hosting
- ✅ Environment-aware API URL detection

### Security
- ✅ Password hashing with bcrypt
- ✅ JWT token validation
- ✅ CORS protection
- ✅ SQL parameter binding (no injection)
- ✅ Input validation

## Performance Optimization

### Optimizations Applied
- Minimal bundle size (no frameworks)
- SQLite for local deployment
- Pagination support (limit=100&offset=0)
- Static file caching (GitHub Pages)
- GZIP compression ready

### Egypt Mode (3G-Friendly)
- Designed to work on slow connections
- Lightweight UI, minimal assets
- Efficient database queries
- Optional `is_egypt_mode` flag per user

## Troubleshooting

### Frontend can't connect to backend
- Check if backend is running: `http://localhost:8080/api/auth/me`
- Verify CORS is enabled in backend
- Check browser console for errors

### Database errors
- Delete old DB: `rm backend/data/accessweb.db`
- Restart server to reinit schema
- Check schema.sql syntax

### Auth failures
- Verify credentials: admin / admin123
- Check token in browser console (F12 → Application → localStorage)
- Clear cache and retry

## Development Notes

- Backend is intentionally simple: no middlewares, no ORM
- Frontend is vanilla JS: no React, Vue, or frameworks
- Database schema matches original CSV examples
- All code is ES6 modules

## License

MIT License - See LICENSE file for details

## Support

For issues or questions:
1. Check this README
2. Review test-api.js for examples
3. Check browser console (F12) for errors
4. Review server logs in terminal

---

**Last Updated**: June 1, 2026  
**Version**: 1.0.0  
**Status**: Production Ready
