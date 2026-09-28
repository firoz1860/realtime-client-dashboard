# Frontend QA Test Notes — Realtime Client Dashboard (orbit.)

**Tested:** 2026-09-26 · Local run (frontend `http://localhost:3000`, backend `http://localhost:4000`)
**How:** Real Chrome driven headless via Puppeteer against the live app, cross-checked with direct backend API calls. Logged in with the seeded accounts (admin / PM / developer).

---

## TL;DR

The website works. Landing, auth, guest mode, role-gating, dashboard, all module views,
live chat, notifications, and the create/update flows all function against real backend data.

**One thing is broken in the currently-running app:** updating your display name on the
**Settings** page fails with **"Route not found."** — and it is **not a code bug**. The running
backend process is stale (it was started *before* the profile-update route was added to the
source). **Restarting the backend fixes it.** Details below.

---

## ❌ Not working

### 1. Settings → "Save changes" (update display name) → "Route not found."
- **Symptom:** Sign in → Settings → change **Full name** → **Save changes** → red error
  **"Route not found."** appears; the name is not saved.
- **Cause:** The frontend calls `PATCH /api/auth/me`. That route **exists and is correct in
  source** (`backend/src/routes/auth.routes.ts:15`, plus its controller and Zod schema), but the
  **running backend process does not have it loaded**:
  - Running backend PID `30328` (`tsx src/server.ts`) started **19:29:46**.
  - `auth.routes.ts` was last changed **19:57:59** (commit `f078434` "…account settings", 19:55),
    which is the commit that **added** `authRoutes.patch('/me', …)`.
  - The process started ~28 min before the route was added and never picked up the change, so
    `GET /api/auth/me` → **200** but `PATCH /api/auth/me` → **404 "Route not found."**
  - (The stale compiled `backend/dist/` from 13:22 is also missing the route, for the same reason.)
- **Fix (no code change needed):** restart the backend so it loads current source:
  ```
  # in backend/  — stop the current process, then:
  npm run dev
  ```
  This was the **only** route added in that commit, so it is the only endpoint affected.
  After restarting, re-test Settings → Save changes.

---

## ✅ Working (verified from the frontend)

| Area | Result |
|---|---|
| Landing page (`orbit.`) | Renders; hero, nav links, "Log in" all work |
| Login (Admin / PM / Developer seeded accounts) | All authenticate; role comes from the account |
| Guest mode | Enters workspace as a labelled preview |
| Session persistence | Survives full page reload (HttpOnly refresh cookie) |
| Sign out | Returns to landing page |
| Role-based nav gating | Developer correctly hides **Projects** and **Team** |
| Overview | KPIs (Tasks 15 / Overdue 5 / Online 1), Tasks-by-status chart, Project progress (3 projects), Recent activity, Upcoming deadlines — all load real data |
| Projects module | 3 projects load |
| Tasks module | 15 tasks load; search/filter works |
| Team module | 7 members load |
| Calendar / Activity | Load real due-dated tasks / activity feed |
| Notifications | Loads; "Mark all read" works (admin seed has 0, so empty state is expected) |
| Help center | Static guidance renders |
| **Create task** | `POST /projects/:id/tasks` → **201** (modal opens, validates required project) |
| **Create project** (admin, client + owner) | `POST /projects` → **201** |
| **Create client** | `POST /clients` → **201** |
| **Change task status** | `PATCH /tasks/:id` → **200** + success toast |
| **Chat** | 3 project channels load; sending a message works live (Socket.io) |
| JS console | Clean — no errors except the single 404 from the Settings bug above |

---

## ℹ️ Observations (not bugs)

- **First visit to each module is slow (~4–7 s).** This is Next.js 16 **dev-mode** on-demand route
  compilation, not a data problem — the data is already fetched and returns 200. A production
  build (`next build && next start`) does not have this lag. (If quick local iteration matters,
  this is expected `npm run dev` behavior.)
- The seeded **admin** account has **no notifications**, so its Notifications view shows the empty
  state — correct, not a failure.
- Backend health, auth, and all data endpoints returned 200 throughout; database is fully seeded
  (3 projects, 15 tasks, 7 users, clients, activity).

---

## Suggested next step

Restart the backend (`npm run dev` in `backend/`) and re-check **Settings → Save changes**.
That is the only outstanding functional issue found; everything else works.
