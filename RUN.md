# Running the Realtime Client Dashboard (frontend + backend)

Frontend = Next.js (`:3000`). Backend = Express + Prisma + Socket.io (`:4000`).
They are already wired together; the only thing needed to go live is a working
PostgreSQL `DATABASE_URL`.

## 1. Database (one-time)

The backend needs Postgres. Pick ONE:

### Option A — use your existing Postgres on localhost:5432
Create the role + database the default `.env` expects (run inside WSL):

```bash
sudo -u postgres psql -c "CREATE ROLE dashboard WITH LOGIN PASSWORD 'dashboard';"
sudo -u postgres psql -c "CREATE DATABASE dashboard OWNER dashboard;"
```

Now `backend/.env`'s default `DATABASE_URL` works as-is.

### Option B — point at any Postgres (local or cloud)
Edit `backend/.env` and set:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
```

## 2. Backend

```bash
cd backend
npm install
npm run prisma:generate     # once (already done)
npm run prisma:deploy       # apply migration  (or: npm run prisma:migrate)
npm run prisma:seed         # 1 admin, 2 PMs, 4 devs, 3 projects, tasks, activity
npm run dev                 # http://localhost:4000
```

## 3. Frontend

```bash
cd frontend
npm install
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 → **Log in** → use a seeded account:

| Role            | Email                  | Password       |
|-----------------|------------------------|----------------|
| Admin           | admin@dashboard.test   | `Admin123!`    |
| Project Manager | pm1@dashboard.test     | `Manager123!`  |
| Developer       | dev1@dashboard.test    | `Developer123!`|

## What is wired to the backend (this pass)

- **Auth** — real login → JWT access token (in memory) + HttpOnly refresh cookie;
  session restored on reload via the cookie; sign-out clears it. Role comes from
  the account, not the UI dropdown.
- **Dashboard KPIs** — from `/api/dashboard/{admin|pm|developer}` (role-gated).
- **Live activity feed** — Socket.io: `activity:catchup` loads the last 20 missed
  events from the DB, then `activity:new` streams updates in real time.
- **Notifications** — unread count badge, live via `notification:unread-count`.
- **Presence** — admin "Online now" KPI via the `presence:count` event.

Chat / Calendar / Team / Help remain UI mockups (no backend counterpart).

## Deploying (Vercel + Render)

### Backend → Render (Web Service, root directory = `backend`)
- **Build:** `npm install && npx prisma generate && npm run build`
- **Pre-deploy / Start:** run `npm run prisma:deploy` once, then `npm start`
- **Add a Render PostgreSQL** (free) and use its Internal Database URL.
- **Environment variables:**
  ```
  NODE_ENV=production
  DATABASE_URL=<render internal postgres url>
  JWT_ACCESS_SECRET=<32+ random chars>
  JWT_REFRESH_SECRET=<different 32+ random chars>
  CLIENT_URL=https://<your-app>.vercel.app
  CORS_ORIGIN=https://<your-app>.vercel.app
  SOCKET_CORS_ORIGIN=https://<your-app>.vercel.app   # must equal CORS_ORIGIN
  COOKIE_SAME_SITE=none                              # required: cross-site cookie
  ```
  (`secure` cookies turn on automatically when `NODE_ENV=production`.)
- Seed once from the Render shell: `npm run prisma:seed`.

### Frontend → Vercel (root directory = `frontend`)
- **Environment variable:**
  ```
  NEXT_PUBLIC_API_URL=https://<your-backend>.onrender.com
  ```

### Cross-site notes
- The refresh cookie is cross-site in production, so `COOKIE_SAME_SITE=none` +
  HTTPS are mandatory (both are handled by the settings above).
- `CORS_ORIGIN` accepts exactly one origin; set it to your primary Vercel domain.
  Vercel preview URLs (which change per deploy) won't be allowed unless you add
  logic for that — use the production domain.
