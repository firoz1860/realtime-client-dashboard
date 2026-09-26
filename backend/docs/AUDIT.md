# Final Backend Audit

This document records the final requirement-oriented review of the backend.

## Fixed during second audit

1. Production build/start alignment was fixed with a dedicated `tsconfig.build.json`: only `src/` is emitted and `npm start` runs `dist/server.js`.
2. Project managers now have read-only access to client lookup endpoints, allowing them to choose clients when creating/updating owned projects without receiving client mutation permissions.
3. Added `GET /api/users/developers` for ADMIN and PROJECT_MANAGER. It returns only active developer assignment fields, so PMs can assign developers without gaining general user-management access.
4. Added complete endpoint contract documentation in `docs/API.md`, including method, path, access, request/query shape, response purpose and important errors.
5. Added static requirement audit script and extra tests for multi-tab presence and role middleware behavior.
6. Task date validation now accepts both the specification’s `YYYY-MM-DD` query example and timezone-aware ISO datetimes, with end-of-day handling for date-only `dueDateTo`.
7. Task update authorization now runs before developer-assignment validation, and serializable transaction conflicts are mapped to `409 CONCURRENT_UPDATE`.
8. Added role-change relationship guards so project owners cannot stop being PMs and assigned task owners cannot stop being developers until resources are reassigned.
9. Developer task/activity responses no longer expose internal PM ownership metadata.
10. Startup configuration now rejects identical access/refresh JWT secrets and mismatched REST/Socket CORS origins.
11. Existing sockets are forcibly disconnected when an admin changes a user’s role or active state, preventing stale long-lived Socket.IO authorization.
12. Nested project-task REST listing is now ADMIN/PROJECT_MANAGER only; developers remain task-scoped through `/api/tasks` while Socket.IO room joins still follow assigned-task authorization.
13. Owning project managers can delete their own projects, while cross-PM deletion is rejected in the service layer.
14. Added explicit notification-ownership, expired-JWT and project-service authorization tests.
15. Fixed Express getter-backed `req.query` validation so Zod-coerced query values are safely installed without assigning to a getter-only property; a regression test covers it.

## Core requirement status

- Required stack: present.
- PostgreSQL + Prisma relational schema: present.
- Required models and indexes: present.
- Access/refresh JWT split: present.
- Refresh cookie: HttpOnly and production Secure/cross-site compatible.
- Refresh-token database storage: hashes only.
- Rotation, revocation, multiple sessions and refresh race handling: present.
- ADMIN / PROJECT_MANAGER / DEVELOPER RBAC: present.
- Resource ownership checks in services/repositories: present.
- PM cross-project isolation: present.
- Developer assigned-task isolation: present.
- Persistent transactional activity: present.
- Persistent notifications and unread count: present.
- Socket.IO authentication, user rooms, project-room authorization, activity/notification events, reconnect catch-up: present.
- Multi-tab presence: present.
- Idempotent overdue scheduler: present.
- Dashboard APIs with role-scoped aggregation: present.
- Zod request validation and bounded pagination: present.
- Centralized API errors: present.
- Helmet, CORS, rate limiting, password hashing and structured logging/redaction: present.
- DB-aware health endpoints: present.
- SIGTERM/SIGINT graceful shutdown: present.
- Seed data: present.
- Docker/PostgreSQL/migrations: present.
- Swagger UI plus full Markdown API contract: present.

## Verification commands

Run after dependency installation and PostgreSQL setup:

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run audit
```

Or run all checks:

```bash
npm run verify
```

The build environment used to package this project could not reach the npm registry, so dependency-backed lint/typecheck/test/build execution could not be completed there. The source was still subjected to file/route/security static auditing and TypeScript syntax parsing before packaging.
