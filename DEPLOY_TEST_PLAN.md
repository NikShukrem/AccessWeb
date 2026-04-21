# Test Deploy Plan (Free Tier)

## Option A: Render (Backend) + Cloudflare Pages (Frontend)
1. Push project to GitHub.
2. Create Render Web Service from `backend` folder.
3. Set env vars:
   - `PORT=8080`
   - `JWT_SECRET=<strong-secret>`
   - `DB_PATH=/opt/render/project/src/data/accessweb.db`
   - `CORS_ORIGIN=https://<your-pages-domain>`
4. Add persistent disk mounted to `/opt/render/project/src/data`.
5. Deploy frontend to Cloudflare Pages.
6. Configure frontend API base URL to Render URL.

## Option B: Single VPS / Docker
1. `docker compose up -d --build`
2. Put Nginx in front with TLS (Let's Encrypt).

## Verification Checklist
- Auth works for 3 roles.
- Two browsers see shared changes.
- Dashboard metrics update after inserts/edits.
- Finance trends endpoint returns monthly points.
