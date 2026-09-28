# API Contract

Base URL: `http://localhost:4000`

REST and Socket.IO use the same configured frontend origin; startup rejects mismatched `CORS_ORIGIN` and `SOCKET_CORS_ORIGIN`. Access and refresh JWT secrets must also be different.

Authenticated requests use `Authorization: Bearer <accessToken>`. The refresh token is never returned in JSON; it is stored only in the configured HttpOnly cookie. In production the cookie is Secure; set `COOKIE_SAME_SITE=none` for a cross-site HTTPS frontend/API deployment and `lax` for a same-site deployment.

Success envelope:

```json
{ "success": true, "data": {} }
```

Paginated success envelope:

```json
{
  "success": true,
  "data": [],
  "pagination": { "page": 1, "limit": 20, "total": 0, "totalPages": 0 }
}
```

Error envelope:

```json
{
  "success": false,
  "error": { "code": "FORBIDDEN", "message": "You do not have permission to access this resource." }
}
```

Common errors are `400 INVALID_JSON`, `401 AUTH_REQUIRED/INVALID_ACCESS_TOKEN/ACCESS_TOKEN_EXPIRED`, `403 FORBIDDEN`, `404 *_NOT_FOUND`, `409 CONFLICT/CONCURRENT_UPDATE/REFRESH_RACE`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED`, and `500 INTERNAL_ERROR`.

## Authentication

| Method | Path | Access | Request | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/auth/config` | Public | — | `{ signupEnabled }` | — |
| POST | `/api/auth/register` | Public | JSON `{ name, email, password }` (password ≥ 8 chars with a letter and a number) | `201 { accessToken, user }` plus HttpOnly refresh cookie. First account in an empty DB becomes `ADMIN`; later accounts get `SIGNUP_DEFAULT_ROLE` | `403 SIGNUP_DISABLED`, `409 EMAIL_TAKEN`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED` |
| POST | `/api/auth/login` | Public | JSON `{ email, password }` | `{ accessToken, user }` plus HttpOnly refresh cookie | `401 INVALID_CREDENTIALS`, `403 ACCOUNT_INACTIVE`, `422 VALIDATION_ERROR`, `429 RATE_LIMITED` |
| POST | `/api/auth/refresh` | Refresh cookie | No JSON body | New `{ accessToken, user }` and rotated refresh cookie | `401 REFRESH_COOKIE_MISSING/INVALID_REFRESH_TOKEN/REFRESH_REVOKED/REFRESH_EXPIRED`, `403 ACCOUNT_INACTIVE`, `409 REFRESH_RACE`, `429 RATE_LIMITED` |
| POST | `/api/auth/logout` | Cookie optional | No JSON body | `{ loggedOut: true }`; current session is revoked when cookie exists and cookie is cleared | `500 INTERNAL_ERROR` |
| GET | `/api/auth/me` | Authenticated | No body | Current safe user | `401 AUTH_REQUIRED`, `404 USER_NOT_FOUND` |

## Users and assignment directory

| Method | Path | Access | Request/query | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/users/developers` | ADMIN, PROJECT_MANAGER | None | Active developers with safe assignment fields | `401`, `403` |
| GET | `/api/users` | ADMIN | `page`, `limit`, optional `role`, `isActive`, `search` | Paginated users; never includes `passwordHash` | `401`, `403`, `422` |
| POST | `/api/users` | ADMIN | `{ name, email, password, role, isActive? }` | Created safe user | `403`, `409`, `422` |
| GET | `/api/users/:id` | ADMIN | UUID path param | Safe user | `403`, `404`, `422` |
| PATCH | `/api/users/:id` | ADMIN | Any non-empty subset of `{ name, email, password, role, isActive }` | Updated safe user | `403`, `404`, `409 ROLE_CHANGE_BLOCKED/CONFLICT`, `422` |

Hard deletion is intentionally not exposed for users. Admins deactivate accounts with `isActive=false`, preserving project/activity relationships and immediately blocking API/refresh use. A PM who still owns projects cannot be changed to a non-PM role, and a developer who still has assigned tasks cannot be changed to a non-developer role; resources must be reassigned first.

## Clients

Project managers have read-only client access so they can choose a client for projects they own. Client mutations remain admin-only.

| Method | Path | Access | Request/query | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/clients` | ADMIN, PROJECT_MANAGER | `page`, `limit`, optional `search` | Paginated clients | `401`, `403`, `422` |
| POST | `/api/clients` | ADMIN | `{ name, email, company?, phone? }` | Created client | `403`, `422` |
| GET | `/api/clients/:id` | ADMIN, PROJECT_MANAGER | UUID path param | Client | `403`, `404`, `422` |
| PATCH | `/api/clients/:id` | ADMIN | Non-empty client field subset | Updated client | `403`, `404`, `422` |
| DELETE | `/api/clients/:id` | ADMIN | UUID path param | `{ deleted: true }` | `403`, `404`, `409 RELATION_CONFLICT`, `422` |

## Projects

| Method | Path | Access | Request/query | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/projects` | ADMIN, PROJECT_MANAGER | `page`, `limit`, optional `status`, `clientId`, `search` | Role-scoped paginated projects | `401`, `403`, `422` |
| POST | `/api/projects` | ADMIN, PROJECT_MANAGER | `{ name, description?, clientId, status?, createdById? }`; `createdById` is required only when ADMIN creates a project | Created project | `403`, `422 INVALID_CLIENT/INVALID_PROJECT_OWNER/PROJECT_OWNER_REQUIRED` |
| GET | `/api/projects/:id` | ADMIN, owning PROJECT_MANAGER | UUID path param | Scoped project | `403` route-role failure, `404 PROJECT_NOT_FOUND`, `422` |
| PATCH | `/api/projects/:id` | ADMIN, owning PROJECT_MANAGER | Non-empty subset of `{ name, description, clientId, status }` | Updated project | `403`, `404`, `422 INVALID_CLIENT` |
| DELETE | `/api/projects/:id` | ADMIN, owning PROJECT_MANAGER | UUID path param | `{ deleted: true }` | `403`, `404`, `422` |

A project manager can never set or transfer ownership through request data. The server derives PM ownership from the authenticated user. When an admin creates a project, `createdById` must identify an active project manager.

## Tasks

Task status values: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `DONE`.

Priority values: `LOW`, `MEDIUM`, `HIGH`, `CRITICAL`.

Task list filters: `status`, `priority`, `dueDateFrom`, `dueDateTo`, `page`, `limit`. The global list additionally supports `projectId` and `assignedDeveloperId`. Dates may be `YYYY-MM-DD` or timezone-aware ISO datetimes. Date-only `dueDateTo` includes the entire UTC day. Maximum `limit` is `100`; `dueDateFrom > dueDateTo` is rejected.

| Method | Path | Access | Request/query | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/tasks` | Authenticated | Task list filters | Paginated role-scoped tasks | `401`, `403` for developer querying another assignee, `422` |
| GET | `/api/tasks/:id` | Authenticated | UUID path param | Accessible task | `401`, `404 TASK_NOT_FOUND`, `422` |
| PATCH | `/api/tasks/:id` | ADMIN, owning PM, assigned DEVELOPER | Admin/PM: non-empty task field subset. Developer: `status` and optional `version` only | Updated task | `403`, `404`, `409 STALE_TASK_VERSION/CONCURRENT_UPDATE`, `422 INVALID_DEVELOPER` |
| GET | `/api/projects/:projectId/tasks` | ADMIN, owning PROJECT_MANAGER | UUID project plus task list filters | Role-scoped tasks in project | `403`, `404 PROJECT_NOT_FOUND`, `422` |
| POST | `/api/projects/:projectId/tasks` | ADMIN, owning PROJECT_MANAGER | `{ title, description?, assignedDeveloperId?, status?, priority?, dueDate? }` | Created task | `403`, `404 PROJECT_NOT_FOUND`, `422 INVALID_DEVELOPER` |

For a developer, task authorization always uses the authenticated user ID and verifies `assignedDeveloperId === authenticatedUser.id`. A client-provided developer ID is never trusted for authorization.

Status/assignment mutations use a database transaction. The task update and persistent activity/notification writes commit before Socket.IO success events are emitted. `version` provides optimistic concurrency protection.

## Activity

| Method | Path | Access | Query | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/activity` | Authenticated | `page`, `limit`, optional `projectId`, `taskId` | Paginated role-filtered activity | `401`, `422` |
| GET | `/api/activity/recent` | Authenticated | `limit` from 1 to 50, default 20 | Latest authorized PostgreSQL activity for reconnect catch-up | `401`, `422` |

Scope is determined server-side: ADMIN sees all activity, PROJECT_MANAGER sees only owned-project activity, and DEVELOPER sees only activity attached to currently assigned tasks.

## Notifications

All notification endpoints are ownership-scoped to `authenticatedUser.id`.

| Method | Path | Access | Query/body | Success | Important errors |
| --- | --- | --- | --- | --- | --- |
| GET | `/api/notifications` | Authenticated | `page`, `limit`, optional `isRead=true|false` | Paginated own notifications | `401`, `422` |
| PATCH | `/api/notifications/:id/read` | Authenticated | UUID path param | Updated own notification | `401`, `404 NOTIFICATION_NOT_FOUND`, `422` |
| PATCH | `/api/notifications/read-all` | Authenticated | None | `{ updated: number }` | `401` |
| GET | `/api/notifications/unread-count` | Authenticated | None | `{ count: number }` | `401` |

## Dashboards

| Method | Path | Access | Success | Important errors |
| --- | --- | --- | --- | --- |
| GET | `/api/dashboard/admin` | ADMIN | Total projects, task counts by status, overdue count, live online-user count, global recent activity | `401`, `403` |
| GET | `/api/dashboard/pm` | PROJECT_MANAGER | Owned projects with task counts, tasks by priority, due-this-week tasks | `401`, `403` |
| GET | `/api/dashboard/developer` | DEVELOPER | Assigned task list with priority, due date, status and overdue flag | `401`, `403` |

Dashboard aggregation is role-scoped before data is returned.

## Health and API documentation

| Method | Path | Access | Success |
| --- | --- | --- | --- |
| GET | `/health` | Public | `{ status: "ok" }` after a Prisma DB query |
| GET | `/api/health` | Public | Same DB-aware health response |
| GET | `/api/docs` | Public | Swagger UI for the REST API |

## Socket.IO contract

Socket authentication uses the access token in `socket.handshake.auth.token`. The server verifies the JWT, loads the user from PostgreSQL, and rejects inactive/missing users.

Rooms:

- `user:{userId}` is joined automatically after authentication.
- `role:ADMIN` is joined automatically by admins for global activity/presence.
- `project:{projectId}` may be joined only after server-side authorization: ADMIN always, owning PM only, or developer with at least one assigned task in the project.

Client events:

| Event | Payload | Result |
| --- | --- | --- |
| `project:join` | `projectId`, acknowledgement callback | `{ ok: true }` or `{ ok: false, error }` |
| `project:leave` | `projectId` | Leaves the project room |
| `activity:catchup` | `limit`, acknowledgement callback | Latest role-authorized PostgreSQL activity |

Server events:

- `activity:new`
- `task:status-updated`
- `notification:new`
- `notification:read`
- `notification:read-all`
- `notification:unread-count`
- `presence:count` to admins only

Task activity is delivered through authorized user/admin rooms instead of broadcasting all task activity to a project room. This prevents a developer assigned to one task in a project from receiving another developer's task activity.
