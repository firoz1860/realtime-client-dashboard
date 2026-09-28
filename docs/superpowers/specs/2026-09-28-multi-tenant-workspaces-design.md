# Multi-Tenant Workspaces — Design Spec

**Date:** 2026-09-28
**Status:** Approved for planning
**Repo:** `realtime-client-dashboard` (Express 4 + Prisma 6 + Socket.io 4 backend, Next.js 16 frontend)

---

## 1. Intent

Orbit today is a **single global organisation**. `User` has no tenant column, `email` is
globally unique, and `ADMIN` sees every project, task, client and message in the database.

We are turning it into a **multi-tenant SaaS**: each *workspace* is one company that uses
Orbit. A workspace owns its own users, clients, projects, tasks, activity, notifications and
chat. Nothing crosses the boundary — a member of one company must not be able to observe the
existence, contents, counts, or even the online headcount of another.

**Success criteria**

1. A user in workspace A cannot read, write or enumerate any record belonging to workspace B —
   including as that workspace's `ADMIN`.
2. A query written *after* this change that forgets a tenant filter **fails closed** (throws)
   rather than returning cross-tenant rows.
3. Existing seeded data survives the migration inside a default workspace.
4. `SUPER_ADMIN` oversight cannot read tenant business content.

**Non-goals.** See §10.

---

## 2. Decisions taken

| Decision | Choice | Consequence |
|---|---|---|
| What is a workspace? | **The agency** — a company using Orbit | `Client` keeps its present meaning: the agency's customer |
| Membership | **One user belongs to exactly one workspace** | `User.workspaceId` is a plain FK, no join table |
| Provisioning | **Self-serve signup creates a workspace**, plus a `SUPER_ADMIN` oversight role | Retires audit finding H3 (see §5.3) |
| Isolation mechanism | **Prisma client extension + `AsyncLocalStorage`**, fail-closed | 82 existing call sites keep their current shape |
| Email uniqueness | **Stays globally unique** | Login is unchanged; one email can never join two workspaces |

---

## 3. Data model

### 3.1 New model

```prisma
enum WorkspaceStatus {
  ACTIVE
  SUSPENDED
}

model Workspace {
  id        String          @id @default(uuid()) @db.Uuid
  name      String                               // the company name
  slug      String          @unique              // url-safe, derived from name
  status    WorkspaceStatus @default(ACTIVE)
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  users         User[]
  clients       Client[]
  projects      Project[]
  tasks         Task[]
  activities    ActivityLog[]
  notifications Notification[]
  messages      Message[]

  @@index([status])
}
```

### 3.2 Tenant models (7)

`workspaceId String @db.Uuid` + relation + index is added to:

`User`, `Client`, `Project`, `Task`, `ActivityLog`, `Notification`, `Message`

Each gains `@@index([workspaceId])` and, where a composite index already exists, a
workspace-leading variant — e.g. `Project` currently has `@@index([createdById, status])` and
gains `@@index([workspaceId, status])`. **These indexes are mandatory**: without them every
scoped query degrades to a full table scan plus a filter.

### 3.3 `RefreshToken` is deliberately NOT tenant-scoped

`POST /api/auth/refresh` presents only the HttpOnly cookie — **no access token, therefore no
tenant context**. If the extension filtered `RefreshToken`, refresh would fail closed for every
user and log everyone out permanently. `RefreshToken` remains scoped by `userId` (a uuid,
unguessable, and already validated against a stored hash in `auth.service.ts:94-99`).

### 3.4 `SUPER_ADMIN` and nullable `workspaceId`

```prisma
enum Role {
  SUPER_ADMIN        // new: platform oversight, no workspace
  ADMIN
  PROJECT_MANAGER
  DEVELOPER
}
```

`User.workspaceId` is **nullable at the database level** solely so `SUPER_ADMIN` rows can exist
without a workspace. A check constraint enforces the real invariant:

```sql
ALTER TABLE "User" ADD CONSTRAINT user_workspace_role_ck CHECK (
  (role = 'SUPER_ADMIN' AND "workspaceId" IS NULL) OR
  (role <> 'SUPER_ADMIN' AND "workspaceId" IS NOT NULL)
);
```

The other six tenant models keep `workspaceId` strictly `NOT NULL`.

---

## 4. Isolation mechanism

### 4.1 Request-scoped tenant context

`src/lib/tenant-context.ts`

```ts
import { AsyncLocalStorage } from 'node:async_hooks'

export interface TenantContext { workspaceId: string }

const storage = new AsyncLocalStorage<TenantContext>()

export const runInTenant = <T>(ctx: TenantContext, fn: () => T): T => storage.run(ctx, fn)
export const currentWorkspaceId = (): string | undefined => storage.getStore()?.workspaceId
```

Set by `requireAuth` for HTTP, and by the Socket.io handshake middleware for socket event
handlers. `AsyncLocalStorage` survives `await` boundaries, which is why it is used rather than a
module-level variable (a module variable would leak across concurrent requests — a
cross-tenant data-disclosure bug).

### 4.2 Two clients; the default is the safe one

`src/lib/prisma.ts` exports both:

- **`prisma`** — extended and tenant-scoped. For the 7 tenant models it injects
  `where.workspaceId` on every read/update/delete and sets `data.workspaceId` on every create.
  **If no context is set, it throws.** Fail-closed is the entire point: a forgotten context
  must break loudly in a test, never silently return everything.
- **`prismaSystem`** — the raw client, unscoped. Permitted **only** in:
  - `auth.service.ts` — register (creating the workspace itself), login, refresh
  - `requireAuth`'s token verification path
  - the three `SUPER_ADMIN` workspace endpoints
  - `prisma/seed.ts`

`prismaSystem` is a named, greppable escape hatch. A lint rule (or a CI grep) restricts its
import to that allowlist, so adding a new usage is a visible, reviewable act.

### 4.3 Extension sketch

```ts
const TENANT_MODELS = new Set([
  'User', 'Client', 'Project', 'Task', 'ActivityLog', 'Notification', 'Message',
])

export const prisma = prismaSystem.$extends({
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!TENANT_MODELS.has(model)) return query(args)

        const workspaceId = currentWorkspaceId()
        if (!workspaceId) {
          throw new Error(
            `Tenant-scoped query on ${model}.${operation} with no workspace context. ` +
            `Use prismaSystem explicitly if this is intentional.`,
          )
        }

        if (operation === 'create') {
          args.data = { ...args.data, workspaceId }
        } else if (operation === 'createMany') {
          args.data = (Array.isArray(args.data) ? args.data : [args.data])
            .map((row) => ({ ...row, workspaceId }))
        } else {
          args.where = { ...(args.where ?? {}), workspaceId }
        }

        return query(args)
      },
    },
  },
})
```

**Operations needing individual attention during implementation:** `upsert` (both `create` and
`update` payloads), `groupBy` / `aggregate` / `count` (`where` only), and `findUnique` — Prisma
rejects non-unique fields in `findUnique.where`, so those call sites become `findFirst`. The
implementation plan must enumerate and convert them; `user.repository.ts` has 11 calls and is
the densest.

### 4.4 What the filter cannot catch

A `where` filter stops you reading another tenant's row. It does **not** stop you *writing a
foreign key that points at one*. Three places accept a caller-supplied id and need an explicit
check:

```ts
assertSameWorkspace(entity: { workspaceId: string }): void   // throws 404 NOT_FOUND
```

1. `POST /api/projects` — `clientId`, and `createdById` when an `ADMIN` assigns an owner
2. `POST /api/projects/:id/tasks` and `PATCH /api/tasks/:id` — `assignedDeveloperId`
3. `PATCH /api/users/:id` — the target user

These return **404, not 403**: a 403 confirms the record exists, which is itself a disclosure.

---

## 5. Authentication and provisioning

### 5.1 Token carries the workspace

The access token gains a `ws` claim (`signAccessToken` in `src/utils/jwt.ts`). This resolves a
chicken-and-egg problem: `requireAuth` must load the user to check `isActive`, but loading the
user is itself a tenant-scoped query.

Order of operations in `requireAuth`:

1. Verify the token signature (no DB).
2. Reject the token if the `ws` claim is absent — see §7.3.
3. `runInTenant({ workspaceId: claims.ws }, …)`.
4. Load the user through the **scoped** `prisma`. Because the query is filtered by the
   workspace from the token, this also proves the user genuinely belongs to that workspace — a
   forged or stale `ws` claim yields no row and a clean 401.
5. Reject if the workspace is `SUSPENDED` (403 `WORKSPACE_SUSPENDED`).

`SUPER_ADMIN` tokens carry no `ws` claim and skip steps 3–5; they may reach only the routes in
§5.4.

### 5.2 Signup creates the workspace

`POST /api/auth/register` body gains `companyName` (2–100 chars, trimmed):

```
{ name, email, password, companyName }
```

In one `Serializable` transaction — the isolation level `auth.service.ts:63` already uses:

1. Create `Workspace` (`name = companyName`, unique slug derived from it)
2. Create `User` with `role = ADMIN`, `workspaceId = <new workspace>`
3. Issue the session

Slug collisions and the existing `P2002` / `P2034` handling extend to the workspace insert.

### 5.3 This retires audit finding H3

The prior risk was: `ALLOW_PUBLIC_SIGNUP` defaults to `true`, and the first account in an empty
database became **global** `ADMIN` — so on a fresh deploy the first stranger to hit
`/api/auth/register` owned the whole instance.

After this change the first account becomes admin **of its own new workspace only**, which is
the correct and harmless behaviour for a self-serve SaaS. The `isFirstUser` special case at
`auth.service.ts:53` is **deleted** — every signup follows the same path.

### 5.4 `SUPER_ADMIN` — metadata only

```
GET    /api/workspaces        -> [{ id, name, slug, status, memberCount, projectCount, createdAt }]
PATCH  /api/workspaces/:id    -> { status: ACTIVE | SUSPENDED }
DELETE /api/workspaces/:id    -> hard delete, requires { confirm: <slug> } in the body
```

Served with `prismaSystem`, returning **aggregate counts only**. No project names, task titles,
client details, or message content is ever exposed.

A guard rejects `SUPER_ADMIN` on **every** tenant route (`/projects`, `/tasks`, `/clients`,
`/users`, `/activity`, `/notifications`, `/dashboard`, `/projects/:id/messages`) with 403
`SUPER_ADMIN_SCOPE`. Without this guard the role would silently become a cross-tenant reader
and defeat the confidentiality requirement. It is covered by a test (§8, case 7).

`SUPER_ADMIN` is created only by `prisma/seed.ts`; no endpoint mints one.

---

## 6. Realtime layer

Two confirmed cross-tenant leaks exist today and must close as part of this work.

### 6.1 The `role:ADMIN` room is global

`src/sockets/socket.ts` does `join('role:ADMIN')` and `to('role:ADMIN')`. Post-change, every
admin of every company would sit in one room and receive each other's broadcasts.

Room naming becomes workspace-prefixed:

| Today | Becomes |
|---|---|
| `role:ADMIN` | `ws:{workspaceId}:role:ADMIN` |
| `user:{userId}` | `ws:{workspaceId}:user:{userId}` |
| `project:{projectId}` | unchanged — project ids are workspace-owned, and `project:join` authorises through the scoped client, so a cross-tenant join finds no project and is refused |

### 6.2 Presence count is global

`presence.service.ts:22` is `count(): number { return this.socketsByUser.size }` — the total
across the whole instance. As the admin dashboard's "Online now" KPI, that would report another
company's headcount.

`PresenceService` becomes workspace-partitioned: `connect/disconnect/count` take a
`workspaceId`, and internal state becomes `Map<workspaceId, Map<userId, Set<socketId>>>`.
`count(workspaceId)` returns only that workspace's figure.

### 6.3 Handshake

The handshake middleware reads `ws` from the token, stores it on the socket, and wraps every
event handler in `runInTenant` so scoped queries inside handlers work. `activity:catchup` is
then automatically scoped.

---

## 7. Migration

`workspaceId` must finish `NOT NULL`, but live data exists (7 projects, 18 tasks, 4 clients,
7 users). One migration cannot do this. Three ordered, individually reversible migrations:

### 7.1 Phase 1 — additive, no constraints

- Create `WorkspaceStatus` enum and `Workspace` table
- Add `SUPER_ADMIN` to the `Role` enum
- Add **nullable** `workspaceId` to the 7 tenant models

Safe on a running system; nothing reads the column yet.

### 7.2 Phase 2 — backfill

- Insert one workspace: `name = 'Default Workspace'`, `slug = 'default'`
- `UPDATE` every row in the 7 tables to that workspace id
- Verify `SELECT count(*) WHERE "workspaceId" IS NULL` returns 0 for each table before
  proceeding

### 7.3 Phase 3 — enforce

- `SET NOT NULL` on the six non-`User` tenant models
- Add FKs to `Workspace` (`onDelete: Cascade` for tenant-owned data; `Restrict` where the
  existing schema already uses `Restrict` between entities)
- Add the `@@index([workspaceId, …])` indexes from §3.2
- Add the `user_workspace_role_ck` check constraint from §3.4

**Deployment note.** Existing access tokens carry no `ws` claim, so all sessions invalidate at
deploy: users re-login once. Refresh cookies remain valid (the refresh path is untenanted), so
`POST /api/auth/refresh` reissues a token *with* the claim. Consequence: after phase 3 deploys,
the `requireAuth` rejection in §5.1 step 2 must return **401** (not 403) so the frontend's
existing single-flight refresh-and-retry in `lib/api.ts:111-118` recovers the session
automatically without a visible logout.

A documented down-path exists for each phase; phase 2's is a no-op (the backfill is idempotent).

---

## 8. Testing

Isolation is the deliverable, so these are **integration tests against a real PostgreSQL
database**, not mocks. This also closes audit finding M6, which recorded that all 44 existing
backend tests mock `../src/lib/prisma` and prove unit logic only.

A `tests/integration/` suite with two seeded workspaces (W1, W2), each with an admin, a PM and
a developer:

1. **Per-model isolation** — for each of the 7 tenant models, a W1 user attempting read /
   update / delete of a W2 record gets 404. Parameterised: 7 models × 3 operations.
2. **Admin cannot cross** — W1 `ADMIN` cannot reach a W2 project. This is the test that
   retires the `policy.service.ts:6` `ADMIN`-bypass concern.
3. **Enumeration** — W1 list endpoints never include W2 ids; counts equal W1's own totals.
4. **Foreign-key injection** — W1 cannot create a project with W2's `clientId`, nor assign a
   W2 developer to a W1 task (§4.4).
5. **Fail-closed** — a scoped query executed outside `runInTenant` throws.
6. **Signup** — creates exactly one workspace and one `ADMIN`; a second signup is fully
   isolated from the first.
7. **`SUPER_ADMIN` scope** — can list workspace metadata; is 403 on every tenant route;
   the list response contains no project/task/client/message content.
8. **Suspension** — login to a `SUSPENDED` workspace returns 403 `WORKSPACE_SUSPENDED`.
9. **Realtime** — a W1 socket cannot join a W2 project room; `presence.count(W1)` is unaffected
   by W2 connections; a W1 admin does not receive W2 admin broadcasts.
10. **Migration** — against a database seeded with pre-migration data, all three phases run and
    every row lands in the default workspace with no NULLs remaining.

Existing tests keep passing. Those that mock `prisma` need the tenant context stubbed, or the
mock re-pointed at `prismaSystem`.

---

## 9. Frontend

Deliberately minimal — the isolation work is the backend.

1. **Signup** — `components/auth-dialog.tsx` gains a required "Company name" field.
   *Note:* that component is currently **imported by nothing**; `app/page.tsx` renders its own
   inline auth form. The plan must either wire `AuthDialog` in or add the field to the inline
   form, not assume the former.
2. **Workspace name** — `app/page.tsx:428` hardcodes `Orbit Studio` and avatar `O`. `GET
   /api/auth/me` returns `workspace: { id, name, slug }`, and the sidebar switcher renders it.
   This is the model whose absence made that string un-dynamic.
3. **Suspended** — `403 WORKSPACE_SUSPENDED` shows a blocking message rather than the generic
   error toast.
4. No workspace picker or switcher: one user, one workspace.

---

## 10. Out of scope

Workspace switching and multi-workspace membership; email invitations (no mailer exists in this
project); billing or plan limits; per-workspace subdomains; custom branding or theming;
cross-workspace data export or record transfer; workspace settings beyond `name` and `status`;
audit logging of `SUPER_ADMIN` actions.

---

## 11. Risks

| Risk | Severity | Mitigation |
|---|---|---|
| A tenant model is missed in `TENANT_MODELS` → silent cross-tenant reads | **Critical** | The set is derived from the 7 models with a `workspaceId` column; test case 1 covers all 7 explicitly; a schema-drift test asserts every model having `workspaceId` appears in the set |
| `prismaSystem` spreads beyond its allowlist | High | Named export, CI grep / lint rule restricting importers |
| Phase 3 runs before phase 2 completes on a large table | High | Phase 2 verifies zero NULLs per table before phase 3 is applied |
| `findUnique` conversions to `findFirst` change behaviour | Medium | Enumerated during planning; typecheck plus the existing 44 unit tests |
| Missing composite indexes degrade every list query | Medium | Indexes ship in phase 3; `EXPLAIN` spot-check on `Project` and `Task` |
| Forced re-login at deploy reads as an outage | Low | §7.3 returns 401 so the existing refresh-and-retry path recovers silently |

**Largest risk overall:** the blast radius is the whole backend — 82 query call sites across the
7 tenant models. The extension is what keeps those call sites untouched; the migration and the
auth-context wiring are where this can still go wrong.

---

## 12. Suggested sequence

1. Schema + the three migrations (§3, §7) — no behaviour change yet
2. Tenant context + extension + fail-closed test (§4, test 5)
3. Auth: `ws` claim, `requireAuth`, signup with `companyName` (§5.1–5.3)
4. `assertSameWorkspace` on the three FK write paths (§4.4)
5. `SUPER_ADMIN` role, the three endpoints, and the tenant-route guard (§5.4)
6. Realtime: room prefixes and partitioned presence (§6)
7. Integration isolation suite (§8)
8. Frontend (§9)

Steps 1–2 are inert on their own; the system changes behaviour at step 3.
