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
- **`prismaSystem`** — the raw client, unscoped, and **exported from its own module**
  `src/lib/prisma-system.ts` rather than from `src/lib/prisma.ts`. Keeping it in a separate
  module means the *import path itself* is the signal, and it can be restricted by path.

### 4.2.1 `prismaSystem` is allowlisted and CI-enforced

Unscoped access must be impossible to acquire casually. Three layers, all mechanical:

**1. Closed allowlist.** `src/lib/prisma-system.ts` may be imported only by:

| File | Why it needs unscoped access |
|---|---|
| `src/services/auth.service.ts` | `register` creates the workspace (no context exists yet); `login` resolves a user before a workspace is known; `refresh` runs with no access token (§3.3) |
| `src/middlewares/auth.middleware.ts` | verifies the token before context can be established (§5.1 steps 1–2) |
| `src/services/workspace.service.ts` | the three `SUPER_ADMIN` metadata endpoints (§5.4) |
| `prisma/seed.ts` | seeding runs outside any request |
| `src/lib/prisma.ts` | wraps it to build the scoped client |

**2. ESLint `no-restricted-imports` zone.** `eslint.config.js` forbids importing
`./lib/prisma-system` repo-wide, with `overrides` re-permitting exactly the five files above.
`npm run lint` already runs inside `npm run verify`, so an unapproved import **fails CI**, not
review.

**3. An importer-set test.** A test greps the source tree for imports of `prisma-system` and
asserts the resulting file set equals the allowlist. ESLint config can be edited; a test that
pins the *expected* set makes widening it a deliberate, visible diff (§8, case 12).

**Why this cannot become a general bypass.** Obtaining unscoped access requires editing
`eslint.config.js` **and** the importer-set test in the same commit. Neither is something a
developer does by accident while adding a feature, and both appear in review as explicit
"I am widening tenant-bypass access" changes.

**Residual risk, stated plainly.** Any file on the allowlist can still run an unscoped query
over tenant data. The five entries are therefore kept small and are the files a security review
should read first. `auth.service.ts` is the largest of them and the only one handling
caller-supplied input, so §8 case 13 asserts its unscoped reads are confined to `User` and
`RefreshToken` lookups by id/email — never `Project`, `Task`, `Client`, `Message`,
`ActivityLog` or `Notification`.

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
foreign key that points at one*.

```ts
assertSameWorkspace(entity: { workspaceId: string }): void   // throws 404 NOT_FOUND
```

**Complete audit of caller-supplied `*Id` fields.** Every request schema was enumerated; there
are nine such fields in total, split into five writes that need the check and four filters that
do not.

#### Writes — `assertSameWorkspace` required (5)

| # | Endpoint | Schema | Field |
|---|---|---|---|
| 1 | `POST /api/projects` | `project.schema.ts:8` | `clientId` (required) |
| 2 | `POST /api/projects` | `project.schema.ts:10` | `createdById` (optional; `ADMIN` assigns an owner) |
| 3 | `PATCH /api/projects/:id` | `project.schema.ts:16` | `clientId` (optional) — **reassigning a project to another tenant's client** |
| 4 | `POST /api/projects/:projectId/tasks` | `task.schema.ts:35` | `assignedDeveloperId` |
| 5 | `PATCH /api/tasks/:id` | `task.schema.ts:44` | `assignedDeveloperId` |

Rows 3 and 5 were **missed in the first draft of this spec**, which listed only the two create
paths plus `PATCH /api/users/:id`. Both update paths are equally exploitable: the scoped `where`
confirms you may modify *your* project or task, then writes a foreign key pointing at another
workspace's client or developer.

`PATCH /api/users/:id` needs **no** explicit check after all — the target is a path parameter,
so the scoped `where` on `User` already yields no row for a foreign id, producing a clean 404.
The first draft listed it unnecessarily.

#### Query filters — no check needed (4)

| Endpoint | Schema | Field |
|---|---|---|
| `GET /api/projects` | `project.schema.ts:22` | `clientId` |
| `GET /api/tasks` | `task.schema.ts:57` | `projectId` |
| `GET /api/tasks` | `task.schema.ts:58` | `assignedDeveloperId` |
| `GET /api/activity` | `activity.schema.ts:5-6` | `projectId`, `taskId` |

These are **narrowing** filters composed with the injected `where.workspaceId`. Passing a
foreign id yields an empty result, never a foreign row, and reveals nothing — an empty list is
indistinguishable from "you have no matching records". Adding `assertSameWorkspace` here would
be redundant *and* harmful: it would turn an empty result into a 404 that confirms the id
exists somewhere on the platform. **Do not guard these.**

#### Return code

All five checks return **404, not 403**. A 403 confirms the record exists, which is itself a
cross-tenant disclosure.

#### Keeping this audit true

New `*Id` fields will be added to schemas later. §8 case 11 pins the surface: a test enumerates
every `*Id` field across `src/schemas/*.ts` and asserts each is either in the writes table above
(and covered by a check) or in the filters table. A new unclassified field fails the test.

### 4.5 Dashboard aggregates — the third discovered leak

`src/services/dashboard.service.ts` (48 lines) builds the admin KPIs from **entirely unscoped**
aggregates. Verbatim from the source:

```ts
prisma.project.count(),                                              // :12  no `where` at all
prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),     // :13  no `where` at all
prisma.task.count({ where: { isOverdue: true, status: { not: DONE } } }),  // :14  no tenant filter
…
return { totalProjects, taskStatus, overdueCount,
         onlineUsers: presenceService.count(), globalActivity }      // :17
```

Post-change, all four admin KPIs — *Total projects, Total tasks, Overdue tasks, Online now* —
would report **platform-wide** figures. A company would learn its competitors' project and task
volumes from its own dashboard.

The fix splits in two, and the distinction matters for the plan:

**Covered by the extension, but must be verified.** Lines 12–14 operate on `Project` and `Task`,
so §4.3 injects `where.workspaceId` automatically. However `count`, `groupBy` and `aggregate`
are precisely the operations §4.3 flags as needing individual handling — `groupBy` accepts
`where` but not `data`, and a naive implementation that only patches `create`/`findMany` would
leave these three lines leaking. **Test 3 must assert these specific KPI numbers equal the
workspace's own totals**, not merely that lists are filtered.

**Not covered by the extension.** `presenceService.count()` at line 17 is an in-memory map, not
a Prisma call, so no query extension can scope it. It requires the §6.2 partitioning, and
`dashboard.service.ts` must pass the current workspace id into it.

The PM and developer paths (`:25-42`) are already scoped by ownership (`taskWhere`,
`createdById`), so they inherit correct behaviour once the extension is live — but they are
still covered by test 3 rather than assumed.

---

## 5. Authentication and provisioning

### 5.1 Token carries the workspace

The access token gains a `ws` claim (`signAccessToken` in `src/utils/jwt.ts`). This resolves a
chicken-and-egg problem: `requireAuth` must load the user to check `isActive`, but loading the
user is itself a tenant-scoped query.

Order of operations in `requireAuth`:

1. Verify the token signature (no DB).
2. Reject the token if the `ws` claim is absent, with **401** `TOKEN_MISSING_WORKSPACE` — see
   §7.4 for why the status must be 401 and how the client recovers silently.
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

### 7.4 Deploy-time session recovery — verified against the source

Existing access tokens carry no `ws` claim. The claim is therefore a **silent, automatic**
re-issue rather than a forced logout. Each link in that chain was checked against the code, not
assumed:

**1. Refresh can reconstruct the workspace with no access token and no `ws` claim.**
`auth.service.ts:94` already loads the user alongside the session:

```ts
const current = await tx.refreshToken.findUnique({
  where: { id: payload.sid },
  include: { user: true },          // <- the user row is already here
})
```

So `current.user.workspaceId` is in hand. The refresh token itself needs **no** new claim — the
workspace is derived from the persisted user row, which the phase-2 backfill guarantees is
populated. This query runs through `prismaSystem` (§3.3: `RefreshToken` is untenanted, and no
context exists on this path).

`signAccessToken(result.id, result.role)` at `auth.service.ts:129` gains the workspace argument
and emits the `ws` claim. `login` at `:83` and `register` at `:74` do the same via `issueSession`.

**2. A missing claim must be 401, and the client already recovers from 401.**
`lib/api.ts:111-118`:

```ts
if (res.status === 401 && auth && retryOn401) {
  const refreshed = await refreshOnce()          // single-flight
  if (refreshed) return request<T>(path, { ...options, retryOn401: false })
  accessToken = null
  onUnauthenticated?.()
}
```

The chain is therefore: stale token → `requireAuth` 401 `TOKEN_MISSING_WORKSPACE` →
`refreshOnce()` → refresh reads `user.workspaceId` → new token with `ws` → original request
retried once. The retry sets `retryOn401: false`, so a still-failing request cannot loop.
`refreshOnce()` is single-flight (`api.ts:83-90`), so concurrent in-flight requests trigger
exactly one refresh.

**3. Returning 403 would break this.** `api.ts` only refreshes on 401. A 403 would fall through
to `throw new ApiError`, surfacing an error toast and leaving the user stuck until they manually
reload — and a reload would not help, because `bootstrap()` calls the same refresh path but only
*after* `hasSessionHint()`, so the visible failure would look like an outage. **The rejection
must be 401.**

**4. Socket reconnection.** `lib/socket.ts:34-42` already handles `connect_error` by calling
`api.me()` and re-connecting with the refreshed token, so sockets recover through the same
mechanism.

**Residual case.** If the refresh cookie is also expired (older than
`REFRESH_TOKEN_EXPIRES_IN`, default 7d), refresh fails, `onUnauthenticated()` fires, and the
user logs in again — correct behaviour, unrelated to this migration.

Covered by §8 case 10.

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
3. **Enumeration and aggregates (§4.5)** — W1 list endpoints never include W2 ids. Explicitly
    assert the four admin KPIs from `dashboard.service.ts` equal W1's own totals: `totalProjects`,
    the `taskStatus` `groupBy` buckets, `overdueCount`, and `onlineUsers`. These must be checked
    as numbers, not merely "the list is filtered" — `count`/`groupBy`/`aggregate` are the
    operations most likely to be missed by the extension (§4.3), and `onlineUsers` is not a
    Prisma call at all.
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
10. **Deploy-time session recovery (§7.4)** — the exact upgrade scenario, end to end:
    a. Mint an access token **without** a `ws` claim (a pre-migration token).
    b. Call a protected endpoint with it → expect **401** and code `TOKEN_MISSING_WORKSPACE`.
       Assert the status is 401 and *not* 403, since `lib/api.ts` only refreshes on 401.
    c. `POST /api/auth/refresh` with the still-valid refresh cookie → expect 200, and assert
       the returned access token **does** carry a `ws` claim equal to the user's `workspaceId`.
    d. Retry the original request with the new token → expect 200.
    e. Assert the reissued token's `ws` matches the workspace the user was backfilled into.
    f. Negative: an **expired** refresh cookie → 401 and no new token (no silent recovery).
    g. Concurrency: fire five parallel protected requests with the stale token and assert
       `POST /api/auth/refresh` was called exactly **once** (single-flight, `api.ts:83-90`).
11. **FK-injection surface is complete (§4.4)** — enumerate every `*Id` field across
    `src/schemas/*.ts` and assert each appears either in the writes table (with a check wired)
    or the filters table. An unclassified new field fails. Plus live attempts: W1 reassigning a
    project to W2's `clientId` (case 3) and W1 assigning a W2 developer on `PATCH /api/tasks/:id`
    (case 5) both return 404.
12. **`prismaSystem` importer allowlist (§4.2.1)** — grep the tree for imports of
    `lib/prisma-system` and assert the file set equals the five allowlisted paths exactly.
    Widening it must require editing this test.
13. **`auth.service.ts` unscoped reads stay narrow (§4.2.1)** — assert its `prismaSystem` usage
    touches only `User`, `RefreshToken` and `Workspace` (creation), never `Project`, `Task`,
    `Client`, `Message`, `ActivityLog` or `Notification`.
14. **Migration** — against a database seeded with pre-migration data, all three phases run and
    every row lands in the default workspace with no NULLs remaining.

Existing tests keep passing. Those that mock `prisma` need the tenant context stubbed, or the
mock re-pointed at `prismaSystem`.

---

## 9. Frontend

Deliberately minimal — the isolation work is the backend.

### 9.1 Which auth UI gets the Company name field — DECIDED

**Decision: extend the inline `.auth-preview` form in `app/page.tsx`. Do not wire up
`components/auth-dialog.tsx`, and delete that file.**

**Evidence for the decision.** Three facts, each verified against the source:

1. **There is no signup UI in the rendered app at all.** `app/page.tsx` contains only
   `authMode === 'login'`, `setAuthMode('guest')` and `handleLogin`. `api.register`
   (`lib/api.ts:156`) and `POST /api/auth/register` both exist and work — nothing calls them
   from the UI. So this is not "add a field to signup"; it is **build the signup form**.
2. **`auth-dialog.tsx` is imported by nothing.** It is dead, untracked code.
3. **`auth-dialog.tsx` is unstyled.** 14 of its 21 class names have **zero** rules in
   `globals.css`: `.overlay`, `.auth-dialog`, `.dialog-sub`, `.form`, `.field`, `.input-affix`,
   `.strength`, `.btn-primary`, `.btn-lg`, `.btn-block`, `.dialog-close`, `.link-muted`,
   `.dialog-foot`, `.dev-hint`, `.spin`. Wiring it in would render a visually broken dialog —
   the same defect already found in the chat panel, where 9 of 11 classes had no rules.

**Why not reuse it anyway?** It does carry useful logic — password strength meter,
confirm-password, a login/signup segmented toggle, `autoComplete` hints, `role="dialog"` with
Esc handling. Adopting it would mean authoring ~15 new CSS rules first. Extending the inline
form instead needs **no new CSS**, because `.auth-preview` and its inputs are already styled and
proven working in the browser. Strength meter and confirm-password are dropped as non-essential:
the backend already enforces the password rules (`auth.schema.ts:11-16`) and `lib/api.ts:130-135`
already surfaces field-level validation messages.

**Concretely, in `app/page.tsx`:**

- `authMode` widens from `'login' | 'guest' | null` to `'login' | 'signup' | 'guest' | null`.
- The `.auth-preview` form renders two extra inputs when `authMode === 'signup'`:
  **Full name** (`autoComplete="name"`) and **Company name** (`autoComplete="organization"`,
  2–100 chars, the new `Workspace.name`).
- A `.segmented` toggle switches Log in / Create account, shown only when
  `authConfig().signupEnabled` is true (`lib/auth.tsx:50` already fetches this).
- `handleSignup` calls the existing `register()` from `useAuth()` (`lib/auth.tsx:68`), which
  needs `companyName` threaded through `api.register` → `AuthContextValue.register`.
- Submit button text and the dialog heading switch on mode.

**Cleanup:** delete `components/auth-dialog.tsx`. Keeping an unstyled, unimported second auth
implementation guarantees future confusion about which form is live. If its password-strength UI
is wanted later, it should be reintroduced deliberately with the CSS it needs.
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
| `prismaSystem` spreads beyond its allowlist → general tenant bypass | High | Own module, ESLint `no-restricted-imports` zone failing `npm run lint` in CI, plus an importer-set test (§4.2.1, tests 12–13). Widening requires editing both the lint config and the test in one visible diff |
| A caller-supplied `*Id` added later reintroduces FK injection | High | Schema-enumeration test asserts every `*Id` field is classified as a guarded write or a safe filter (§4.4, test 11) |
| Deploy-time 401→refresh recovery fails and reads as an outage | Medium | Verified against `auth.service.ts:94` and `lib/api.ts:111-118`; rejection pinned to 401; test 10 covers the full chain including single-flight and expired-cookie cases |
| Phase 3 runs before phase 2 completes on a large table | High | Phase 2 verifies zero NULLs per table before phase 3 is applied |
| `findUnique` conversions to `findFirst` change behaviour | Medium | Enumerated during planning; typecheck plus the existing 44 unit tests |
| Missing composite indexes degrade every list query | Medium | Indexes ship in phase 3; `EXPLAIN` spot-check on `Project` and `Task` |
| Someone re-adds an unstyled second auth form | Low | §9.1 deletes `auth-dialog.tsx` and records why the inline form is the live one |

**Largest risk overall:** the blast radius is the whole backend — 82 query call sites across the
7 tenant models. The extension is what keeps those call sites untouched; the migration and the
auth-context wiring are where this can still go wrong.

---

## 12. Suggested sequence

1. Schema + the three migrations (§3, §7) — no behaviour change yet
2. Tenant context, the extension, `prisma-system.ts` + its ESLint zone, fail-closed test
   (§4, §4.2.1, tests 5, 12, 13)
3. Auth: `ws` claim, `requireAuth` 401 path, refresh reissue, signup with `companyName`
   (§5.1–5.3, §7.4, test 10)
4. `assertSameWorkspace` on the **five** FK write paths + the schema-enumeration test
   (§4.4, test 11)
5. `SUPER_ADMIN` role, the three metadata endpoints, and the tenant-route guard (§5.4, test 7)
6. Realtime: workspace-prefixed rooms and partitioned presence (§6, test 9)
7. Integration isolation suite in full (§8)
8. Frontend: signup form in `app/page.tsx`, delete `auth-dialog.tsx`, dynamic workspace name
   (§9)

Steps 1–2 are inert on their own; the system changes behaviour at step 3. Step 4 must not be
deferred past step 3 — once the extension is live, the five unguarded FK paths are the only
remaining cross-tenant write vector.
