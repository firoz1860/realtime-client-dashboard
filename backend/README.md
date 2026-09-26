# Real-Time Client Project Dashboard Backend

Production-oriented backend for a real-time client project dashboard with role-based access control, persistent activity history, notifications, presence, JWT authentication, refresh-token rotation, PostgreSQL, Prisma and Socket.IO.

## Stack

Node.js, TypeScript, Express, PostgreSQL, Prisma ORM, Socket.IO, Zod, JWT, bcryptjs, node-cron, Helmet, CORS, express-rate-limit and Pino structured logging.

## Architecture

```text
backend/
├── src/
│   ├── config/          environment and cookie configuration
│   ├── controllers/     HTTP request and response handling
│   ├── middlewares/     auth, RBAC, rate limiting and errors
│   ├── routes/          REST route registration
│   ├── services/        business logic and resource authorization
│   ├── repositories/    Prisma data access and role scopes
│   ├── validators/      request validation middleware
│   ├── schemas/         Zod request schemas
│   ├── types/           TypeScript application types
│   ├── utils/           JWT, hashing, pagination and errors
│   ├── jobs/            overdue scheduler
│   ├── sockets/         Socket.IO auth, rooms, events and presence
│   ├── lib/             Prisma, logger, event bus and OpenAPI
│   ├── app.ts
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── tests/             authorization, auth, socket, scheduler and validation tests
├── docs/              API contract and final audit notes
├── scripts/           repeatable static requirement audit
├── .env.example
├── Dockerfile
├── docker-compose.yml
├── package.json
├── tsconfig.json
└── tsconfig.build.json
```

Controllers do not contain business authorization rules. Resource-level authorization is enforced by services and repository scopes. Prisma is the only database access layer; there is no raw SQL in controllers or services, including the database-aware health check.

### Naming conventions

- Files use lowercase feature names with role suffixes such as `task.service.ts`, `task.repository.ts`, `task.controller.ts` and `task.routes.ts`.
- TypeScript values/functions use `camelCase`; classes/types use `PascalCase`; Prisma enums use uppercase enum values.
- REST resource paths use lowercase plural nouns. Socket rooms use `user:{userId}` and `project:{projectId}`.
- Environment variables use `UPPER_SNAKE_CASE`. Database fields follow Prisma `camelCase` naming.

## Roles

### ADMIN

Can manage users, clients, all projects and all tasks, assign developers, view global activity and use the global dashboard.

### PROJECT_MANAGER

Can create projects, manage only projects they own, create and update tasks in those projects, assign developers, view only activity belonging to owned projects and use the PM dashboard.

### DEVELOPER

Can see only assigned tasks, update only the status of those tasks, receive task notifications, and view activity only for tasks assigned to them. Developers cannot use the project REST APIs, manage projects, change roles, query another developer's tasks or read another user's notifications.

## Authentication and JWT strategy

The access token is short lived and returned in the login/refresh JSON response. The backend does not store it in localStorage and never instructs the frontend to do so.

The refresh token is long lived and stored only in an HttpOnly cookie. In production the cookie is always `Secure`; `COOKIE_SAME_SITE` controls the SameSite mode. Use `none` for a separately deployed cross-site HTTPS frontend/API and `lax` for a same-site deployment.

Refresh tokens are not stored raw in PostgreSQL. SHA-256 hashes are stored in `RefreshToken.tokenHash`. Every refresh rotates the token by revoking the old row and creating a new session row in a serializable transaction. An atomic `updateMany` check prevents two concurrent refresh requests from both succeeding. Logout revokes the hash matching the current cookie.

Separate, different secrets are required. Startup validation rejects identical access/refresh secrets:

```env
JWT_ACCESS_SECRET=
JWT_REFRESH_SECRET=
```

JWT verification validates signature, expiry, issuer, audience and token type. The verified token identifies the user, then the current user record is loaded from PostgreSQL so stale role or inactive-account information is not trusted from the client.

## Database schema

Required entities are implemented:

- `User`
- `RefreshToken`
- `Client`
- `Project`
- `Task`
- `ActivityLog`
- `Notification`

`Task.version` is an additional integer used for optimistic concurrency control. A task update is applied only if its current version still matches the version loaded by the transaction. Concurrent updates return `409` instead of silently overwriting each other.

`isOverdue` is independent of workflow status. A task may therefore remain `IN_PROGRESS` while `isOverdue=true`.

## Indexes

Indexes support the expected access patterns:

- unique `User.email`
- `Project.createdById`, `Project.clientId`, and `(createdById, status)`
- `Task.projectId`, `assignedDeveloperId`, `status`, `priority`, `dueDate`
- composite task indexes for `(projectId, status)`, `(assignedDeveloperId, status)`, and `(isOverdue, dueDate)`
- `ActivityLog.projectId`, `taskId`, `actorId`, `createdAt`, and recent-activity composites
- `Notification.recipientId`, `isRead`, `createdAt`, and `(recipientId, isRead, createdAt)`
- `RefreshToken.userId`, `expiresAt`, and `(userId, revokedAt)`

These indexes match ownership filtering, task dashboards, overdue scans, recent activity, unread notifications and session cleanup.

## Task transactions and activity

A task status mutation runs in a Prisma transaction:

```text
authorize task
load current version/status
update task with optimistic version check
create ActivityLog
create Notification when needed
commit
emit Socket.IO events
```

No success event is emitted until the transaction has committed. Every status change has a persistent `ActivityLog` row, so the database remains the source of truth after reconnects and server restarts.

Assignments also create a persistent activity row and a persistent notification for the assigned developer. Moving an assigned task to `IN_REVIEW` notifies the owning project manager.

## REST API

All authenticated endpoints use `Authorization: Bearer <accessToken>`.

| Method | Path | Access | Purpose |
| --- | --- | --- | --- |
| POST | `/api/auth/login` | Public | Login and set refresh cookie |
| POST | `/api/auth/refresh` | Refresh cookie | Rotate refresh token and issue access token |
| POST | `/api/auth/logout` | Public/cookie | Revoke current refresh session and clear cookie |
| GET | `/api/auth/me` | Authenticated | Current user |
| GET | `/api/users/developers` | ADMIN, PROJECT_MANAGER | Active developer assignment directory |
| GET | `/api/users` | ADMIN | Paginated users |
| POST | `/api/users` | ADMIN | Create user |
| GET | `/api/users/:id` | ADMIN | Get user |
| PATCH | `/api/users/:id` | ADMIN | Update user |
| GET | `/api/clients` | ADMIN, PROJECT_MANAGER | Read-only client lookup for project assignment |
| POST | `/api/clients` | ADMIN | Create client |
| GET | `/api/clients/:id` | ADMIN, PROJECT_MANAGER | Read-only client detail |
| PATCH | `/api/clients/:id` | ADMIN | Update client |
| DELETE | `/api/clients/:id` | ADMIN | Delete client |
| GET | `/api/projects` | ADMIN, PROJECT_MANAGER | Role-scoped project list |
| POST | `/api/projects` | ADMIN, PROJECT_MANAGER | Create project |
| GET | `/api/projects/:id` | ADMIN, PROJECT_MANAGER | Role-scoped project detail |
| PATCH | `/api/projects/:id` | ADMIN, owning PROJECT_MANAGER | Update project |
| DELETE | `/api/projects/:id` | ADMIN, owning PROJECT_MANAGER | Delete project |
| GET | `/api/projects/:projectId/tasks` | ADMIN, owning PROJECT_MANAGER | Role-scoped tasks within project |
| POST | `/api/projects/:projectId/tasks` | ADMIN, owning PROJECT_MANAGER | Create task |
| GET | `/api/tasks` | Authenticated | Role-scoped, filtered tasks |
| GET | `/api/tasks/:id` | Authenticated | Accessible task detail |
| PATCH | `/api/tasks/:id` | Authenticated with resource rules | Update task/status |
| GET | `/api/activity` | Authenticated | Paginated role-filtered activity |
| GET | `/api/activity/recent` | Authenticated | Reconnect catch-up from PostgreSQL |
| GET | `/api/notifications` | Authenticated | Own notifications |
| PATCH | `/api/notifications/:id/read` | Authenticated | Mark own notification read |
| PATCH | `/api/notifications/read-all` | Authenticated | Mark all own notifications read |
| GET | `/api/notifications/unread-count` | Authenticated | Own unread count |
| GET | `/api/dashboard/admin` | ADMIN | Global dashboard |
| GET | `/api/dashboard/pm` | PROJECT_MANAGER | Owned-project dashboard |
| GET | `/api/dashboard/developer` | DEVELOPER | Assigned-task dashboard |
| GET | `/health` | Public | DB-aware health check |
| GET | `/api/health` | Public | DB-aware API health check |
| GET | `/api/docs` | Public | Swagger/OpenAPI UI |

### Task query filters

`GET /api/tasks` and project task listing support:

```text
status
priority
dueDateFrom
dueDateTo
page
limit
```

The global task endpoint additionally accepts `projectId` and `assignedDeveloperId`. `dueDateFrom > dueDateTo` is rejected. Maximum page size is 100.

Pagination uses:

```json
{
  "success": true,
  "data": [],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 100,
    "totalPages": 5
  }
}
```

## Error format

Validation, authentication, authorization, conflicts, not-found cases, rate limiting and internal errors use one shape:

```json
{
  "success": false,
  "error": {
    "code": "FORBIDDEN",
    "message": "You do not have permission to access this resource."
  }
}
```

Stack traces are never returned by the API.

## Socket.IO

The frontend connects with the access token in the Socket.IO auth object:

```ts
io(API_URL, {
  auth: { token: accessToken },
  withCredentials: true
})
```

Authentication is verified server-side. An inactive or unknown user is rejected even if a syntactically valid access token exists. If an admin changes a user’s role or active state, existing sockets for that user are disconnected so they must re-authenticate with current authorization.

### Rooms

```text
user:{userId}
project:{projectId}
role:ADMIN
```

Every authenticated socket automatically joins its private user room. Admin sockets join `role:ADMIN`.

`project:join` is authorized by the server:

- ADMIN: any existing project
- PROJECT_MANAGER: only `project.createdById === user.id`
- DEVELOPER: only projects where that developer currently has an assigned task

An arbitrary project ID cannot be used to subscribe to unauthorized data.

Sensitive activity is not blindly broadcast to every member of a project room. Activity delivery is server-selected: admins, the owning PM, and the developer assigned to the affected task receive the event. This prevents a developer who happens to work on another task in the same project from receiving task activity they are not authorized to view.

### Events

Server emits:

```text
activity:new
task:status-updated
notification:new
notification:read
notification:read-all
notification:unread-count
presence:count
```

Client may send:

```text
project:join
project:leave
activity:catchup
```

Status update payloads include the persistent activity ID, project/task IDs, actor, previous status, new status and timestamp.

## Missed activity catch-up

Missed activity is never kept only in memory. After reconnect the frontend can call:

```text
GET /api/activity/recent?limit=20
```

or emit `activity:catchup` over Socket.IO. Both paths re-query PostgreSQL using the current user's role/ownership scope.

## Presence

Presence uses a `Map<userId, Set<socketId>>`. Multiple tabs therefore count as one online user. Closing one tab does not mark the user offline while another connection remains. The admin room receives `presence:count` updates.

Presence is intentionally ephemeral. It represents current connections and is rebuilt after a process restart.

## Notifications

Notifications are persistent PostgreSQL records. Users can only query and mutate rows whose `recipientId` matches their authenticated user ID.

Task assignment creates a `TASK_ASSIGNED` notification. A developer moving a task to `IN_REVIEW` creates a `TASK_REVIEW_REQUESTED` notification for the owning PM. Unread count changes are pushed through Socket.IO rather than polled.

## Overdue scheduler

`node-cron` runs according to:

```env
OVERDUE_CRON=*/5 * * * *
CRON_TIMEZONE=UTC
```

The job updates only rows matching:

```text
dueDate < now
status != DONE
isOverdue = false
```

This makes repeated executions idempotent. The job also removes expired refresh-token rows. Task updates recalculate `isOverdue` when status or due date changes.

## CORS and cookies

Development default:

```env
CLIENT_URL=http://localhost:5173
CORS_ORIGIN=http://localhost:5173
SOCKET_CORS_ORIGIN=http://localhost:5173
COOKIE_SAME_SITE=lax
```

Production frontend and API must both use HTTPS. Set the exact frontend origin rather than `*`. Express and Socket.IO both use `credentials: true`, and startup validation requires `SOCKET_CORS_ORIGIN` to match `CORS_ORIGIN`. Production refresh cookies are always `HttpOnly` and `Secure`; configure `COOKIE_SAME_SITE=none` for cross-site frontend/API domains or `lax` for same-site deployments.

Frontend fetch example:

```ts
fetch(`${API_URL}/api/auth/refresh`, {
  method: 'POST',
  credentials: 'include'
})
```

## Security

Implemented controls include:

- Helmet
- exact-origin CORS with credentials
- authentication rate limiting
- global API rate limiting
- bcrypt password hashing
- short-lived access JWTs
- refresh-token hashing, rotation and revocation
- issuer/audience/type validation
- current-user database verification
- Zod body/query/param validation
- role middleware
- service-layer ownership checks
- optimistic task concurrency
- structured logging with auth/cookie/password redaction
- no secrets committed to source
- no frontend-only authorization
- role-change relationship guards so project owners remain PMs and assigned users remain developers
- developer response minimization for task/activity metadata
- active-role changes disconnect existing Socket.IO sessions so authorization is re-evaluated

Passwords, JWTs, refresh tokens and cookies are redacted from logs.

## Local setup

Requirements: Node.js 22+, npm, Docker Desktop or a local PostgreSQL 16+ installation.

```bash
cp .env.example .env
```

Generate two different strong secrets for `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET`.

Start PostgreSQL:

```bash
docker compose up -d postgres
```

Install dependencies:

```bash
npm install
```

Generate Prisma client:

```bash
npx prisma generate
```

Apply development migrations:

```bash
npx prisma migrate dev
```

Seed:

```bash
npx prisma db seed
```

Start development server:

```bash
npm run dev
```

API: `http://localhost:4000`

Swagger: `http://localhost:4000/api/docs`

Full request/query/response/error contracts are documented in `docs/API.md`.

## Seed credentials

Seed data creates 1 admin, 2 project managers, 4 developers, 3 clients, 3 projects, 15 tasks, overdue tasks, activities and notifications.

```text
Admin
admin@dashboard.test
Admin123!

Project Manager 1
pm1@dashboard.test
Manager123!

Project Manager 2
pm2@dashboard.test
Manager123!

Developers
dev1@dashboard.test
dev2@dashboard.test
dev3@dashboard.test
dev4@dashboard.test
Developer123!
```

These accounts are fictional development credentials and must not be used in production.

## Migrations

Development:

```bash
npx prisma migrate dev
```

Production:

```bash
npx prisma migrate deploy
```

Seed explicitly when desired:

```bash
npx prisma db seed
```

Production does not depend on `prisma db push`.

## Tests and audit

The test suite contains coverage for:

- login
- invalid login
- refresh rotation
- logout revocation
- admin authorization
- PM own-project access
- PM cross-project denial
- developer assigned-task access
- developer cross-task denial
- task status update transaction
- persistent activity creation
- review notification creation
- recent activity catch-up
- overdue scheduler
- unauthorized socket/project-room access
- invalid date ranges and pagination limits
- multi-tab presence behavior
- reusable role middleware allow/deny behavior
- notification ownership isolation
- expired access-token handling
- PM own-project deletion and developer project-service denial
- getter-backed Express query validation with Zod transformations

Run:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
```

## Docker application image

Build:

```bash
docker build -t realtime-client-dashboard-backend .
```

The image expects `DATABASE_URL`, JWT secrets, origins and other environment variables at runtime. Database migrations should be executed as a deployment/release step with `npx prisma migrate deploy` before serving production traffic.

## Deployment

Recommended deployment sequence:

```bash
npm install
npx prisma generate
npm run build
npx prisma migrate deploy
npm start
```

`npm run build` compiles only `src/` through `tsconfig.build.json`, and `npm start` executes the production entry point at `dist/server.js`.

Set:

```env
NODE_ENV=production
DATABASE_URL=<managed-postgres-url>
JWT_ACCESS_SECRET=<strong-secret>
JWT_REFRESH_SECRET=<different-strong-secret>
CLIENT_URL=https://your-frontend.example
CORS_ORIGIN=https://your-frontend.example
SOCKET_CORS_ORIGIN=https://your-frontend.example
CRON_TIMEZONE=UTC
```

If frontend and API are on separate sites, both must use HTTPS and set `COOKIE_SAME_SITE=none` for the production cross-site refresh cookie. For same-site deployments, `lax` is usually appropriate.

## Known limitations

- Presence is process-local. A multi-instance deployment needs a shared Socket.IO adapter/presence store such as Redis. Redis is intentionally not included because the assessment does not require it and a single-instance backend works without it.
- The scheduler is safe to repeat, but in a multi-instance deployment each instance may run the same idempotent overdue update. For very large deployments use a dedicated worker or distributed scheduler lock.
- The refresh-token model supports multiple independent sessions but does not implement a named-device UI.
- Swagger provides the interactive route contract. `docs/API.md` contains the complete request/query/response/error contract and Socket.IO contract.

## Authorization audit checklist

- Developer cannot access another developer's task: enforced by task scope and `assertTaskAccess`.
- Developer cannot access project REST data; task REST access is assignment-scoped, while Socket.IO project-room joins require at least one assigned task in that project.
- PM cannot access another PM's project: enforced in repository scope and service mutation checks.
- Frontend cannot bypass backend authorization: ownership checks are server-side.
- Refresh token is HttpOnly: configured in `src/config/cookie.ts`.
- Refresh token is never returned in response JSON: controllers only return access token and user.
- Activity is stored in PostgreSQL: `ActivityLog`.
- Missed activity comes from PostgreSQL: recent endpoint and Socket.IO catch-up.
- Socket.IO is real: initialized on the HTTP server.
- No polling is required for activity/notifications.
- Presence handles multiple tabs with socket sets.
- Notifications are persistent.
- Unread count is pushed through WebSocket events.
- Overdue is scheduler-driven and idempotent.
- CORS uses configured exact origins with credentials.
- Secrets come from environment variables.
