# Project handoff for Claude Code

This ZIP contains the complete source tree for `firoz1860/realtime-client-dashboard`,
including both `frontend/` and `backend/`. Extract it over the existing project
root (the directory containing `frontend/`, `backend/`, and `RUN.md`). Keep your
existing local `backend/.env`; no credentials, `node_modules`, compiled output,
or `.git` directory are included.

## Changes in this package

- The existing dashboard design is retained. Its Projects, Tasks, Calendar,
  Activity, Team, Notifications and Chat views use the existing API/Socket.io
  backend instead of success placeholders. Admins can create team accounts and
  clients from the project dialog;
  managers/admins can create projects and tasks. Search, date filters and task
  status controls now act on real data. Account settings opens the actual
  account view. Guest mode states clearly that it is a preview.
- Project and task backend searches include descriptions and related project/
  client names while keeping role access restrictions. Repeating an unchanged
  task or project update avoids duplicate activity and notifications. Repeated
  notification reads avoid duplicate events. Local frontend/backend origins
  agree on port 3000. Frontend type checking runs during `next build`.
- Added focused tests for backend search, validation and unchanged updates,
  and frontend date ranges and activity reconciliation. See `RUN.md` to run
  the app and configure Postgres.

## Verify after applying

1. In `backend/`: `npm ci`, `npm run prisma:generate`,
   `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
2. Copy `backend/.env.example` to `backend/.env` if no local config exists,
   set your database URL and distinct JWT secrets, run
   `npm run prisma:deploy`, then `npm run dev`.
3. In `frontend/`: `npm ci`, `node --test tests/*.test.mjs`,
   `npx tsc --noEmit`, `npm run build`, then `npm run dev`.
4. Sign in with an existing account. Seed data is available for a disposable
   local database (`npm run prisma:seed` in `backend/`).

## Known remaining scope

The repository has no backend models/endpoints for self-service signup, email
invitations, multiple workspaces, support messaging, or editable user settings.
These are not represented as working buttons. Frontend list views currently
fetch a maximum of 100 projects/tasks/users, or 50 activity/notification
entries, without a pagination control. The landing page illustration is static.
Run end-to-end checks with a real PostgreSQL instance and browser; automated
checks in this package do not substitute for those integration checks.
