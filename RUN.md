# Running the Realtime Client Dashboard (frontend + backend)

Frontend = Next.js (`:3000`). Backend = Express + Prisma + Socket.io (`:4000`).
They are wired together. Running locally requires PostgreSQL, backend environment
settings, and Node.js 20 or newer.

## 1. Database (one-time)

Copy the backend template first:

```bash
cp backend/.env.example backend/.env
```

Set distinct, random values of at least 32 characters for `JWT_ACCESS_SECRET`
and `JWT_REFRESH_SECRET` in `backend/.env`. The backend needs Postgres. Pick ONE:

### Option A — use your existing Postgres on localhost:5432
Create the role + database the sample `.env` expects (run where Postgres is installed):

```bash
sudo -u postgres psql -c "CREATE ROLE dashboard WITH LOGIN PASSWORD 'dashboard';"
sudo -u postgres psql -c "CREATE DATABASE dashboard OWNER dashboard;"
```

The sample `DATABASE_URL` now points to that local database.

### Option B — point at any Postgres (local or cloud)
Edit `backend/.env` and set:

```
DATABASE_URL=postgresql://USER:PASSWORD@HOST:5432/DBNAME?schema=public
```

## 2. Backend

```bash
cd backend
npm ci
npm run prisma:generate
npm run prisma:deploy       # apply migration  (or: npm run prisma:migrate)
npm run prisma:seed         # 1 admin, 2 PMs, 4 devs, 3 projects, tasks, activity
npm run dev                 # http://localhost:4000
```

## 3. Frontend

```bash
cd frontend
npm ci
npm run dev                 # http://localhost:3000
```

Open http://localhost:3000 → **Log in** → use a seeded account:

Logging in asks for a **workspace** as well, because an email address is only
unique within its own company: the same address may be an employee of several
workspaces. The seeded company's workspace is `orbit-studio`.

| Workspace       | Role            | Email                  | Password       |
|-----------------|-----------------|------------------------|----------------|
| `orbit-studio`  | Admin           | admin@dashboard.test   | `Admin123!`    |
| `orbit-studio`  | Project Manager | pm1@dashboard.test     | `Manager123!`  |
| `orbit-studio`  | Developer       | dev1@dashboard.test    | `Developer123!`|

A new company signs up from the landing page ("Create your workspace"), which
provisions its own workspace and makes the signer its admin. The workspace name
shown under the company in the sidebar is the slug used to log in.

## What is wired to the backend

- **Auth** — real login → JWT access token (in memory) + HttpOnly refresh cookie;
  session restored on reload via the cookie; sign-out clears it. Role comes from
  the account, not the UI dropdown.
- **Dashboard KPIs** — from `/api/dashboard/{admin|pm|developer}` (role-gated).
- **Live activity feed** — Socket.io: `activity:catchup` loads the last 20 missed
  events from the DB, then `activity:new` streams updates in real time.
- **Notifications** — unread count badge, live via `notification:unread-count`.
- **Presence** — admin "Online now" KPI via the `presence:count` event.
- **Projects and tasks** — role-scoped lists, search, creation, task status
  updates, and date/status filters. Calendar uses real task due dates.
- **Team and clients** — admin account creation and new-client action in the
  project dialog; managers see developers and can select existing clients.
- **Chat** — project-scoped history and Socket.io messages for signed-in users.
- **Activity and notifications** — live events and read/unread actions.

**Settings:** Signed-in users can update their own display name; email and role
are managed by an admin. Help center contains brief built-in guidance. Guest
mode previews the UI without backend data and shows a Log in action.
The landing-page illustration is a design preview. This repository does not
provide self-service signup, email invitations, multiple workspaces, support
messaging, or editable account preferences beyond the display name.

Large lists currently show at most the first 100 records per API request;
the activity and notification views show at most 50 records. Pagination is
available in the backend, but the frontend does not yet offer paging controls.

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
- For a demo environment only, seed once from the Render shell with
  `npm run prisma:seed`; the seed uses known demonstration credentials.

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
