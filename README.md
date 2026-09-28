# Full-Stack Audit Report — Realtime Client Dashboard (`orbit.`)

**Date:** 2026-09-28
**Scope:** `frontend/` (Next.js 16.3.3 / React 19) + `backend/` (Express 4 / Prisma 6 / Socket.io 4) + PostgreSQL
**Method:** ECC workflow (v2.2.2, `github.com/affaan-m/ECC`). Static review, live HTTP integration suite,
live Socket.io suite, and real-browser journeys via Playwright MCP against the running stack.
**Verdict:** 1 critical defect found and fixed; 3 security dependency upgrades applied; core stack
verified working end-to-end against a real database. Several features are genuinely incomplete
(documented below with evidence), and one production config gap could allow unintended admin signup.

> Compilation success was **not** treated as evidence. Every "VERIFIED WORKING" below has a
> corresponding runtime check whose output is quoted in this report.

---

## 0. Tooling availability

Requested ECC skills and agents were checked on disk, not assumed.

| Requested | Installed? | Path / evidence |
|---|---|---|
| `frontend-patterns` | YES | `~/.claude/plugins/cache/ecc/ecc/2.2.2/skills/frontend-patterns` |
| `backend-patterns` | YES | same tree |
| `security-review` | YES | same tree — **loaded and applied** (§4) |
| `e2e-testing` | YES | same tree — **loaded**; see note below |
| `verification-loop` | YES | same tree |
| Agents (`security-reviewer`, `typescript-reviewer`, `react-reviewer`, `e2e-runner`, `database-reviewer`, `code-reviewer`, `build-error-resolver`, `silent-failure-hunter`) | YES (67 agent definitions present) | `~/.claude/plugins/cache/ecc/ecc/2.2.2/agents/` |
| Marketplace origin | Matches request | `known_marketplaces.json` → `https://github.com/affaan-m/ECC.git` |

**Nothing was unavailable, so no substitutions were needed.**

**Deviation, stated explicitly:** the `e2e-testing` skill prescribes a file-based Playwright suite
(`playwright.config.ts`, POM classes). This repo has **no Playwright installed** and adding a full
harness was outside the requested scope, so its substantive rules (wait on conditions never fixed
timeouts, capture artifacts, assert console + network cleanliness) were applied by driving a real
Chromium session through the Playwright MCP instead. **No Playwright test files were added to the repo.**

---

## 1. Feature / API connection matrix

Every row was exercised against the **running** backend and a **real PostgreSQL** database.
`live-audit.mjs` = 77-assertion HTTP suite; `socket-audit.mjs` = 13-assertion Socket.io suite; both
run from the session scratchpad (not added to the repo).

| Feature | Frontend file | API method/path | Backend handler | Database / service | Verification evidence | Status |
|---|---|---|---|---|---|---|
| Signup config probe | `lib/api.ts:168` `authConfig` | `GET /api/auth/config` | `auth.routes.ts:11` → `auth.controller.config` | `env.ALLOW_PUBLIC_SIGNUP` | `A2` → 200 `{signupEnabled:true}` | VERIFIED WORKING |
| Self-service signup | `components/auth-dialog.tsx:49`, `lib/api.ts:156` | `POST /api/auth/register` | `auth.routes.ts:12` (+`authRateLimit`, Zod) | `auth.service.ts:41` tx, `Serializable` | 5 mocked unit tests pass; **live route 404'd before backend restart** | FIXED AND RETESTED (ops) |
| Login | `lib/auth.tsx:57`, `lib/api.ts:144` | `POST /api/auth/login` | `auth.routes.ts:13` | `bcrypt.compare`, `refreshToken` row | `A3` 200 role=ADMIN; browser login → dashboard | VERIFIED WORKING |
| Session restore on reload | `lib/api.ts:171` `bootstrap` | `POST /api/auth/refresh` → `GET /api/auth/me` | `auth.routes.ts:14,16` | rotation + revoke chain | Browser hard reload → still `Aarav Admin`; `A12–A15` | VERIFIED WORKING |
| Refresh-token rotation | `lib/api.ts:67` `doRefresh` | `POST /api/auth/refresh` | `auth.service.ts:86` | `revokedAt`/`replacedById`, Serializable | `A13` cookie rotates; `A14` replay → 401 `REFRESH_REVOKED` | VERIFIED WORKING |
| Logout | `lib/auth.tsx:79` | `POST /api/auth/logout` | `auth.routes.ts:15` | `revokeByHash` | Browser → landing; reload stays logged out; `localStorage` `[]` | VERIFIED WORKING |
| Update display name | `app/page.tsx:127` → `lib/api.ts:184` | `PATCH /api/auth/me` | `auth.routes.ts:17` | `userRepository.update` | `B1–B3`; **browser** toast "Profile name updated."; survived fresh login | FIXED AND RETESTED (ops) |
| Dashboard KPIs (3 roles) | `lib/useWorkspaceData.ts:139` | `GET /api/dashboard/{admin,pm,developer}` | `dashboard.routes.ts:10-12` + `requireRole` | aggregate queries | 9 matrix assertions (200/403/403 per role); browser KPIs 7/18/5/1 | VERIFIED WORKING |
| Projects list + search | `lib/useModuleData.ts:71` | `GET /api/projects?limit=100&search=` | `project.routes.ts:17` | `project.repository` | `F2` created project found by search; `C6` injection string safe | VERIFIED WORKING |
| Create project | `app/page.tsx:383` | `POST /api/projects` | `project.routes.ts:18` | insert + activity | `F1` → 201, `F2` fresh read confirms | VERIFIED WORKING |
| Tasks list / filters | `lib/useModuleData.ts:84` | `GET /api/tasks?limit=100&…` | `task.routes.ts:11` | `task.repository` | matrix 200 for all 3 roles; browser Tasks view | VERIFIED WORKING |
| Create task | `app/page.tsx:402` | `POST /api/projects/:projectId/tasks` | `project.routes.ts:23` | insert + notification | `F3` → 201 | VERIFIED WORKING |
| Change task status | `app/page.tsx:109` | `PATCH /api/tasks/:id` | `task.routes.ts:13` | update + activity row | `F4` 200 IN_REVIEW, `F5` persists, `F6` activity row written | VERIFIED WORKING |
| Clients list | `lib/endpoints.ts:78` | `GET /api/clients?limit=100` | `client.routes.ts:13` | `client.repository` | `F0` 4 seeded clients; dev → 403 | VERIFIED WORKING |
| Create client | `app/page.tsx:369` | `POST /api/clients` | `client.routes.ts:14` (ADMIN only) | insert | matrix: admin 200, **`E4` PM → 403** | VERIFIED WORKING |
| Team list | `lib/useModuleData.ts:115` | `GET /api/users` (admin) / `GET /api/users/developers` (PM) | `user.routes.ts:13,14` | `user.repository` | matrix 200/403/403 and 200/200/403 — correct role split | VERIFIED WORKING |
| Create team member | `app/page.tsx:356` | `POST /api/users` | `user.routes.ts:15` (ADMIN) | bcrypt + insert | admin 200; non-admin 403 | VERIFIED WORKING |
| Activity feed (REST) | `lib/useModuleData.ts:98` | `GET /api/activity?limit=50` | `activity.routes.ts:10` | `activity.repository` | matrix 200 all roles; browser 6 rows | VERIFIED WORKING |
| Activity catch-up (missed events) | `lib/socket.ts:47` | socket `activity:catchup` | `sockets/socket.ts` | last-N from DB | `S5` ack ok, **20 events** returned | VERIFIED WORKING |
| Live activity push | `lib/useWorkspaceData.ts:178` | socket `activity:new` | `lib/events.ts` bus | task update trigger | `S10b` admin socket received after PM's PATCH | VERIFIED WORKING |
| Notifications list / read / read-all | `lib/useModuleData.ts:102`, `useWorkspaceData.ts:110,118` | `GET /api/notifications`, `PATCH /:id/read`, `PATCH /read-all` | `notification.routes.ts:11,13,14` | update + emit | matrix 200 all roles; browser "Mark all read" | VERIFIED WORKING |
| Unread badge | `lib/useWorkspaceData.ts:149` | `GET /api/notifications/unread-count` + socket | `notification.routes.ts:12` | count query | matrix 200 ×3 | VERIFIED WORKING |
| Presence ("Online now") | `lib/useWorkspaceData.ts:195` | socket `presence:count` | `services/presence.service.ts` | in-memory registry | Browser KPI "Online now: 1" | VERIFIED WORKING |
| Chat history | `components/chat-view.tsx:70` | `GET /api/projects/:id/messages?limit=100` | `project.routes.ts:26` | `message.repository` | `F8` persists; browser 7 channels loaded | VERIFIED WORKING |
| Send chat message | `components/chat-view.tsx:85` | `POST /api/projects/:id/messages` | `project.routes.ts:27` | insert + room emit | `F7` → 201 | VERIFIED WORKING |
| **Live chat delivery to UI** | `components/chat-view.tsx:51-61` ← `app/page.tsx` | socket `message:new` | room broadcast | — | **Was BROKEN (no socket passed). After fix: pm1's message appeared in admin's browser, `mine:false`, `navigation` entries = 1 (no reload)** | FIXED AND RETESTED |
| Chat room authorization | `lib/useWorkspaceData.ts:166` | socket `project:join` | `project.service` access check | ownership query | `S7/S8` ok; **`S11` foreign project → `{ok:false,error:"FORBIDDEN"}`** | VERIFIED WORKING |
| Socket handshake auth | `lib/socket.ts:27` | WS handshake `auth.token` | `sockets/socket.ts` | `verifyAccessToken` | **`S1` no token → refused; `S2` forged token → refused** | VERIFIED WORKING |
| Calendar | `lib/useModuleData.ts:118` | `GET /api/tasks?dueDateFrom=` | `task.routes.ts:11` | due-date filter | Browser 4 deadline items | VERIFIED WORKING |
| Guest preview | `app/page.tsx:420` | none (UI only) | — | — | Enters workspace labelled "Guest preview"; no data calls | VERIFIED WORKING (by design) |
| Health check | — (ops only) | `GET /health` | `health.routes.ts:6` | DB ping | `A1` 200 `{status:"ok"}` | VERIFIED WORKING |

### Backend-only endpoints (exist, no UI caller)

Distinguishing deliberate API surface from missing integration:

| Endpoint | Frontend helper? | Assessment |
|---|---|---|
| `PATCH /api/users/:id` | **`userApi.update` exists at `lib/endpoints.ts:87` but is never invoked** | **MISSING UI INTEGRATION** — see Finding M5 |
| `GET /api/activity/recent` | none | Backend-only; `activityApi` has no `recent`. Harmless surplus. |
| `GET /api/users/:id` | none | Backend-only (admin detail view not built). |
| `GET`/`PATCH`/`DELETE /api/projects/:id` | none | **No project edit/delete UI exists** — see M5 |
| `GET`/`PATCH`/`DELETE /api/clients/:id` | none | **No client edit/delete UI exists** — see M5 |
| `GET /api/tasks/:id` | none | Backend-only; list view carries the data. |
| `GET /api/projects/:projectId/tasks` | none (list uses `?projectId=`) | Redundant surplus route. |
| `GET /api/docs` (Swagger UI) | n/a | Deliberate. |

**No mismatched field names, broken imports, placeholder handlers, or mock data were found in the
request path.** No "button without a real action" was found: create/update controls all call real
endpoints. The gaps are *absent* controls, not fake ones.

---

## 2. Findings ranked by severity

### CRITICAL

**C1. Dashboard Chat tab had no realtime connection; frontend typecheck was red.** — FIXED AND RETESTED
`frontend/app/page.tsx:133` rendered `<ChatView user={user} onToast={onToast} />`, omitting the
`socket` prop that `frontend/components/chat-view.tsx:14` declares as required
(`socket: AppSocket | null`).

- `npx tsc --noEmit` → `app/page.tsx(133,59): error TS2741: Property 'socket' is missing`. **`npm run build` could not pass.**
- Runtime impact: `chat-view.tsx:52` returns early when `socket` is falsy, so `socket.on('message:new')`
  never registered. Chat loaded history over REST and **looked** functional, but no live message ever
  arrived and the header pill at `chat-view.tsx:114` stayed on "Connecting…" forever. Silent failure.
- The shared connection was already available as `workspace.socket`
  (`lib/useWorkspaceData.ts:35,231`); it simply was never threaded through `WorkspaceView`.
- **The backend was never at fault** — `socket-audit.mjs` scored 13/13 before any fix.

### HIGH

**H2. Production dependencies carried 8 high + 2 moderate advisories.** — FIXED AND RETESTED
Most consequential: `express-rate-limit@8.1.0` — *"IPv4-mapped IPv6 addresses bypass per-client rate
limiting on dual-stack servers"* (HIGH). That directly undermines `authRateLimit`
(`backend/src/middlewares/rate-limit.middleware.ts:3`, 20 attempts / 15 min) which is the **only**
brute-force protection on `/api/auth/login` and `/api/auth/register`.
Also cleared: `path-to-regexp` ReDoS (HIGH), `body-parser` silent limit-bypass DoS, 4× `qs` DoS.
Separately, `vitest@3.2.4` had a **CRITICAL** advisory (arbitrary file read/execute via its UI server).

Production advisories went **10 → 4**; critical **1 → 0**.

**H3. `ALLOW_PUBLIC_SIGNUP` defaults to `true`, and the first account in an empty database becomes ADMIN.** — BROKEN (config risk, not fixed — needs your decision)
`backend/src/config/env.ts:25` defaults the flag to `'true'`; `backend/src/services/auth.service.ts:53`
grants `Role.ADMIN` to the first user when `user.count() === 0`.

- Your local `backend/.env` **does not set `ALLOW_PUBLIC_SIGNUP`** (verified: variable absent), so the
  running server reports `signupEnabled: true` (`A2`).
- `RUN.md`'s production environment list for Render **omits `ALLOW_PUBLIC_SIGNUP` entirely**.
- Consequence: a fresh production deploy against an empty database, following `RUN.md` literally,
  leaves open registration on, and **the first stranger to POST `/api/auth/register` becomes workspace ADMIN**.
- Mitigating: the bootstrap is genuinely useful and correctly transactional (`Serializable`, P2002/P2034
  handled, 5 passing unit tests). This is a *default and documentation* problem, not broken logic.
- I did not change the default — flipping it would break your intended signup feature. See §6.

### MEDIUM

**M4. Stale dev/build artifacts made working code appear broken.** — FIXED AND RETESTED (operational)
The backend process serving :4000 (PID 9228) started **2026-09-27 11:39:12**, while
`auth.routes.ts`, `env.ts`, and `auth.service.ts` were all modified at **19:01** — ~7.5 h later.
Against that process: `GET /api/auth/config` → **404**, `POST /api/auth/register` → **404**, both
despite existing in source. `backend/dist/` was staler still (Sep 26 13:22, containing **no `routes/`
directory at all**), so `npm start` would have served an even older API.
This is the same class of problem `QA-TEST-NOTES.md` correctly diagnosed for `PATCH /api/auth/me`;
**that prior diagnosis was right and its recommended fix (restart) works** — re-verified in the browser.
Resolved by restarting the dev server and running `npm run build` (which refreshed `dist/`).

**M5. Incomplete features — no edit or delete UI for projects, clients, or team roles.** — BROKEN (incomplete, by scope)
Backend supports `PATCH`/`DELETE` for projects and clients and `PATCH /api/users/:id` for roles, and
`lib/endpoints.ts:87` even wraps the last one as `userApi.update` — but **nothing calls it** (grep: 0
call sites outside its own definition). The Team view renders role and `Active`/`Inactive` status
(`lib/useModuleData.ts:116`) with no control to change either. The app is effectively **create-only**.
This is consistent with `RUN.md`'s stated scope, so it is incomplete-by-design rather than a defect —
but it is not documented as "no editing anywhere", which is what the code actually does.

**M6. The entire backend test suite is MOCKED — zero integration coverage.** — NOT TESTED (pre-existing gap)
`backend/tests/setup.ts:2` points `DATABASE_URL` at a **fake** database
(`postgresql://user:pass@localhost:5432/testdb`), and 7 of 16 test files `vi.mock('../src/lib/prisma')`.
The 44 passing tests prove **unit logic only**. Additionally:

- `supertest` is a declared devDependency used in **zero** test files → no HTTP-level route tests.
- **No Playwright/Cypress/E2E exists anywhere** in the repo.
- `frontend/package.json` has **no `test` script**; its tests run only via a manual `node --test`.

All live evidence in this report came from suites I wrote in the scratchpad. **They are not in your
repo**, so this coverage gap remains after the audit. See §6.

### LOW

**L7. Duplicate `GET /api/projects?limit=100` on every dashboard load.** — VERIFIED WORKING (inefficiency)
Browser network log shows it twice: once from `useWorkspaceData.joinChatRooms`
(`lib/useWorkspaceData.ts:170`) and once from the overview effect (`app/page.tsx:344`). Both return 200;
purely wasteful, not incorrect. (The paired `/auth/config` and `/auth/me` calls are React StrictMode
double-effects in dev only.)

**L8. No `frontend/.env.example`.** — BROKEN (docs)
`RUN.md` documents `NEXT_PUBLIC_API_URL` for Vercel and `frontend/.env.local` exists and is correctly
gitignored (`frontend/.gitignore:10`), but there is no committed template. `backend/.env.example` exists.

**L9. Documentation contradicts the code.** — BROKEN (docs)
`RUN.md` states: *"This repository does not provide self-service signup"* and `CONTINUATION.md` repeats
it under "Known remaining scope". Both are now false — signup is implemented end-to-end
(`auth.routes.ts:12`, `auth-dialog.tsx`, `register.test.ts`, `ALLOW_PUBLIC_SIGNUP`). `QA-TEST-NOTES.md`
is also pre-signup (dated 2026-09-26).

**L10. Landing page implemented twice; one copy is dead code.** — BROKEN (dead code)
`frontend/components/landing.tsx` (163 lines, full marketing page with its own nav/hero/`LiveBoard`) is
**never imported**. The rendered page is `PublicHome` inside `app/page.tsx:117`. Confirmed in the
browser: the live `<h1>` is "Make work feel in motion.", not `landing.tsx`'s "Client work, moving in
real time." The two also carry different brand copy.

### Accessibility / UI (carried over from this session's earlier UI audit, re-confirmed at runtime)

**A11. Sidebar nav labels are `display:none` until hover.** — BROKEN
Measured live: sidebar width **72px**, and each label's computed style is
`display: none; opacity: 0; pointer-events: none`. `display:none` removes them from the accessibility
tree entirely, leaving only the `title` attribute as an accessible name — and tooltips never appear on
touch devices. `Element.innerText` returned `""` for all 10 nav items, while `textContent` returned the
labels, which is the proof. Affects touch laptops/tablets at ≥769px. (The ≤760px drawer is fine.)

**A12. Nine grey text colors, all below WCAG AA.** — BROKEN
Computed ratios on `#fff`/`#f7f8fc`: `#a9b0bd` 2.18/2.05, `#9ba3b2` 2.54/2.39, `#9aa2b1` 2.57/2.42,
`#9aa2b0` 2.57/2.42, `#929aaa` 2.83/2.67, `#8c95a4` 3.02/2.85, `#8b94a4` 3.06/2.88, `#8790a2`
3.21/3.03, `#778092` 3.97/3.74 — AA needs 4.5:1. `--muted` is also defined **twice with different
values** (`globals.css:7` `#727b8d`, `globals.css:174` `#8790a2`; the later wins).

**A13. 149 of 205 `font-size` declarations are 7–11px; exactly one is 16px.** — BROKEN
Form labels at 9px (`globals.css:36`) and 10px (`:30`); inputs at 10–11px. Beyond readability, **iOS
Safari auto-zooms any focused input under 16px**, so every dashboard search/form field jerks the
viewport on tap.

*(A11–A13 are unchanged in this audit — they are design-system work, not defects I was asked to fix,
and touching `globals.css` would have conflicted with "preserve my current design".)*

---

## 3. Fixes made and files changed

| File | Change | Lines |
|---|---|---|
| `frontend/app/page.tsx` | Thread the existing shared socket to chat: added `import type { AppSocket }`; added `socket` to `WorkspaceView` props; passed `socket={socket}` to `<ChatView>`; passed `socket={workspace.socket}` to `<WorkspaceView>` | +4 / −3 |
| `backend/package.json` | `express` 4.21.2 → **4.22.3**; `express-rate-limit` 8.1.0 → **8.7.0**; `vitest` 3.2.4 → **3.2.7** (all same-major, `--save-exact` to match existing pinning style) | 3 lines |
| `backend/package-lock.json` | regenerated by `npm install` | — |
| `frontend/tests/chat-socket-wiring.test.mjs` | **NEW** — 4 regression tests pinning the ChatView↔socket contract | +70 |

**Total production-code change: 4 lines in one file.** No design, styling, or unrelated edit was touched.
No real integration was replaced with mock data.

### Regression test — proven to actually catch the bug

The fix was reverted, the test run, and then restored:

```
=== bug reintroduced; does the test catch it? ===
✔ ChatView still requires a socket prop
✔ ChatView guards its realtime listener on socket
✖ the dashboard passes the shared workspace socket down to ChatView
  AssertionError: page.tsx must render <ChatView ... socket={socket} ...> or the Chat tab loses realtime
ℹ tests 4 | pass 3 | fail 1
=== restoring ===
ℹ tests 4 | pass 4 | fail 0
RESTORED: typecheck clean
```

### Operational fixes (no code change)

- Restarted the 7.5-hour-stale backend, which restored `GET /api/auth/config`, `POST /api/auth/register`,
  and `PATCH /api/auth/me` from 404 → 200.
- `npm run build` refreshed `backend/dist/`, which had no `routes/` directory.

---

## 4. Configuration and security review

Applied the ECC `security-review` checklist.

| Check | Result | Evidence |
|---|---|---|
| Hardcoded secrets in source | **PASS** | Pattern scan (API keys, AWS, private keys, inline passwords) over all source: 0 hits |
| Secrets in git history | **PASS** | No `.env` ever committed; only `backend/.env.example` tracked |
| `.env` gitignored | **PASS** | `frontend/.gitignore:10` → `.env*.local` covers `frontend/.env.local` |
| Env validation | **PASS** | `env.ts` Zod schema; fails fast; enforces ≥32-char JWT secrets and rejects identical access/refresh secrets (`env.ts:35`) |
| SQL injection | **PASS** | **Zero** `$queryRaw`/`$executeRaw(Unsafe)` anywhere. `C6`: `' OR 1=1--` as search → 200, 0 rows |
| XSS sinks | **PASS** | No `dangerouslySetInnerHTML`, `innerHTML=`, or `eval(` in frontend source |
| Token storage | **PASS** | Access token in memory only; browser `Object.keys(localStorage)` → `[]` after login (only a non-secret `orbit_session` flag, cleared on logout) |
| Refresh cookie flags | **PASS** | `HttpOnly` ✓, `SameSite=Lax` (dev) ✓, `Path=/api/auth` ✓, `secure` auto-on when `NODE_ENV=production` (`config/cookie.ts:6`); `document.cookie` cannot read it |
| Refresh rotation + replay | **PASS** | `A13` rotates; `A14` old cookie → 401 `REFRESH_REVOKED`; `A15` no cookie → 401 |
| CORS | **PASS** | Preflight from `http://evil.example.com` returns `Access-Control-Allow-Origin: http://localhost:3000` (not the attacker origin), `Vary: Origin`, `credentials: true`. `env.ts:41` hard-fails if `SOCKET_CORS_ORIGIN ≠ CORS_ORIGIN` |
| Role authorization | **PASS** | 33 matrix assertions across admin/PM/developer × 11 endpoints — all expected 200/403 exactly |
| Privilege escalation | **PASS** | `E1` dev→ADMIN 403; `E2` PM→ADMIN 403; `E3` dev reads other user 403; `E4` PM creates client 403 |
| Mass-assignment | **PASS** | `C2`: `PATCH /api/auth/me {name, role:'ADMIN'}` → **422** (Zod `strictObject`, `auth.schema.ts:18`) |
| Tenant/ownership isolation | **PASS** | `F9` dev blocked from unassigned project's chat (403); `S11` socket `project:join` on foreign project → `FORBIDDEN` |
| User enumeration | **PASS** | `C5` unknown email and wrong password return byte-identical `INVALID_CREDENTIALS` message |
| Error leakage | **PASS** | `error.middleware.ts:44-45` logs internally, returns generic `INTERNAL_ERROR`; no stack traces |
| Security headers | **PASS** | Live: CSP (`default-src 'self'`, `object-src 'none'`, `script-src 'self'`), HSTS `max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`, COOP/CORP, `X-Frame-Options: SAMEORIGIN` |
| Rate limiting | **PASS (after H2 fix)** | Live headers — auth: `RateLimit-Policy: 20;w=900`; general API: `300;w=60` |
| CSRF | **ACCEPTABLE** | No CSRF tokens, but state-changing routes require a `Bearer` header (not ambient cookie auth), and the refresh cookie is `SameSite=Lax` + `Path=/api/auth`. Note `COOKIE_SAME_SITE=none` in production (required for cross-site Vercel↔Render) weakens this; the Bearer requirement remains the real defense. |
| Password storage | **PASS** | `bcrypt` cost 12 (`auth.service.ts:45`); `publicUser()` sanitizer; `A8` confirms no `passwordHash` in login response |
| Dependency vulnerabilities | **PARTIAL** | 10 → 4 high (all remaining are Prisma **CLI** chain — see §6) |
| DB connection config | **PASS** | `DATABASE_URL` required by schema; 2 migrations present (`202609260001_init`, `202609260002_chat`); live reads/writes confirmed |
| Demo credentials | **NOTE** | `prisma/seed.ts` contains known demo passwords. `RUN.md` already scopes this to "demo environment only" — correct, but do not seed a real production DB. |

**No secret values are printed anywhere in this report — only variable names.**

---

## 5. Exact commands run and actual results

### Static gates

```
backend  $ npm run lint                          → PASS (eslint, exit 0)
backend  $ npm run typecheck                     → PASS (tsc --noEmit, exit 0)
backend  $ npm test                              → 16 files / 44 tests PASSED   [MOCKED — see M6]
backend  $ npm run build                         → PASS (tsc -p tsconfig.build.json, exit 0)
backend  $ npm run audit                         → "PASS backend static audit"
backend  $ npm run verify (all of the above)     → PASS after dependency upgrades (44/44 on vitest 3.2.7)

frontend $ npx tsc --noEmit    (BEFORE fix)      → FAIL: app/page.tsx(133,59) TS2741 'socket' is missing
frontend $ npx tsc --noEmit    (AFTER fix)       → PASS (exit 0)
frontend $ npm run build                         → PASS — "Compiled successfully in 11.1s",
                                                     "Finished TypeScript in 6.2s", 3/3 static pages
frontend $ node --test tests/*.test.mjs          → 7/7 PASSED (3 pre-existing + 4 new regression)
```

### Live API integration — `live-audit.mjs`, 77 assertions

```
================ 73 passed, 4 failed ================
```

**The 4 "failures" are incorrect assertions in my own suite, not product defects.** I expected HTTP 400
for validation errors; the API deliberately returns **422** (`error.middleware.ts:9` for `ZodError`),
which `lib/api.ts:127-135` handles correctly. Adjusted for that, **77/77 behaviors are correct.**
Re-run after the dependency upgrades: identical 73/4 → **no regression**.

Coverage: auth lifecycle (A1–A15), profile persistence (B1–B4), validation/injection/enumeration
(C1–C6), 33-cell role matrix (D), privilege escalation (E1–E4), DB persistence (F0–F9), error surfaces
(G1–G3).

### Live Socket.io — `socket-audit.mjs`, 13 assertions

```
================ 13 passed, 0 failed ================
```
Including `S1` anonymous handshake refused, `S2` forged token refused, `S5` catch-up returned **20**
DB events, `S9b` cross-user `message:new` delivered, `S11` foreign room → `FORBIDDEN`.
Re-run after upgrades: **13/13 again**.

### Database verification (real PostgreSQL on 127.0.0.1:5432)

| Write | Read-back proof |
|---|---|
| Profile name | `PATCH` → fresh `GET /me` → **and a brand-new login** all returned the new name; then restored to `Aarav Admin` |
| Project create | `POST` 201 → fresh `GET /projects?search=` contained the new id |
| Task create + status | `POST` 201 → `PATCH` `IN_REVIEW` → fresh `GET /tasks/:id` still `IN_REVIEW` |
| Activity side-effect | Task update produced a matching row in `GET /activity` |
| Chat message | `POST` 201 → fresh `GET …/messages` contained the body |
| Browser→DB | UI "Save changes" → toast → name confirmed via API from a **separate** login |

### Browser journeys (real Chromium via Playwright MCP)

| Journey | Result |
|---|---|
| Landing renders | PASS — `PublicHome`, nav/hero/CTA present |
| Login dialog → admin login | PASS — reached dashboard as `Aarav Admin` / `Admin` |
| Real data on Overview | PASS — KPIs 7 / 18 / 5 / 1; 5 project rows, 6 activity rows, 4 deadlines, 4 chart bars |
| Role nav gating | PASS — admin sees all 8 items (developer gating verified at API level: `/projects` → 403) |
| **Chat "Connected"** | PASS — pill reads `Connected` (was stuck `Connecting…` before the fix) |
| **Live message, no refresh** | PASS — pm1's "LIVE PUSH from pm1" appeared as `mine:false`; `performance.getEntriesByType('navigation')` = **1** entry, type `navigate` → no reload |
| Session persists across reload | PASS — hard reload kept the session via HttpOnly cookie |
| No token in localStorage | PASS — `Object.keys(localStorage)` → `[]` |
| Settings loads | PASS — email / role / member-since correctly read-only; Save disabled until dirty |
| **Settings save (QA's reported bug)** | PASS — toast "Profile name updated.", sidebar updated live, persisted to DB |
| Logout | PASS — returned to landing, storage cleared, reload stayed logged out, cookie unreadable from JS |
| Loading / empty / error states | PASS — "Loading channels…", "No messages yet…", empty-notification state all render |
| **Console errors** | **PASS — 0 errors, 0 warnings across the entire session** |
| **Failed network requests** | **PASS — all 20 `/api/*` calls returned 200; zero failures** |

**Unauthorized state** was verified at the API layer (401 without/with forged token, 403 across 33
role cells) rather than by forcing a mid-session token expiry in the browser — see §6.

---

## 6. Remaining issues, missing configuration, and what was not tested

### Needs your decision

1. **`ALLOW_PUBLIC_SIGNUP` default (H3).** I did not change it — setting it to `false` would disable the
   signup feature you just built. Recommended: keep the code default, but **add
   `ALLOW_PUBLIC_SIGNUP=false` to `RUN.md`'s Render env list** and turn it on deliberately only while
   bootstrapping the first admin. Your local `.env` is also missing both `ALLOW_PUBLIC_SIGNUP` and
   `SIGNUP_DEFAULT_ROLE`, so it currently runs on defaults (signup **on**).

2. **4 remaining HIGH advisories, all in the Prisma CLI chain** (`prisma`, `@prisma/config`,
   `deepmerge-ts`, `effect`). `npm audit` only "fixes" these by **downgrading** `prisma` 6.16.2 → 6.12.0,
   flagged semver-major. I left them, and this is defensible: `@prisma/config` is pulled **solely** by
   `prisma` (the CLI devDependency), and `@prisma/client` — the production runtime — has **zero
   dependencies**. So they affect build/migration tooling, not the deployed request path. Verified via
   `npm ls @prisma/config` and `@prisma/client/package.json`.

3. **Two landing pages (L10).** Tell me which is canonical and I'll delete the other;
   `components/landing.tsx` is currently dead.

### Missing configuration (names only)

| Missing | Where | Impact |
|---|---|---|
| `ALLOW_PUBLIC_SIGNUP` | `backend/.env` (local) | Defaults to `true` → signup enabled |
| `SIGNUP_DEFAULT_ROLE` | `backend/.env` (local) | Defaults to `DEVELOPER` (safe) |
| `ALLOW_PUBLIC_SIGNUP` | `RUN.md` production env list | Undocumented for deploy → H3 |
| `frontend/.env.example` | missing entirely | No template for `NEXT_PUBLIC_API_URL` (L8) |

### NOT TESTED (explicitly)

- **Production deploy path** (Render + Vercel, `COOKIE_SAME_SITE=none`, cross-site cookies, HTTPS,
  `secure` cookie flag). Never exercised — no deploy was attempted, per your instruction.
- **Token-expiry refresh in the browser.** `ACCESS_TOKEN_EXPIRES_IN=15m`; I verified the refresh/retry
  path at the API layer (`A12–A15`) but did not idle a browser session past 15 minutes.
- **Developer and PM journeys in the browser.** Both were fully verified at API and socket level
  (33-cell role matrix, `S11`); only the **admin** persona was driven through the UI.
- **Overdue cron job behavior over time.** Observed one successful sweep at startup
  (`"Overdue task sweep completed", count: 0`); did not age data to trigger transitions.
- **Pagination controls.** Backend paginates; frontend caps at 100 records (50 for activity/
  notifications) with no paging UI — documented in `RUN.md` as known scope.
- **Load/concurrency, multi-tab socket behavior, file uploads** (no upload feature exists).
- **`npm ci` from a clean slate** — existing `node_modules` were reused.
- **Migration rollback** and `prisma migrate deploy` against an empty database.

### Not reviewed

`backend/docs/API.md` and `backend/src/lib/openapi.ts` were **modified in your uncommitted work** but I
did not diff their contents for accuracy against the live routes; `backend/docs/AUDIT.md` was not read.
`prisma/seed.ts` was inspected only for credential handling, not for data correctness.

### Coverage gap that persists

Per **M6**, all live evidence here came from scratchpad suites that are **not in your repo**. Nothing
in CI would catch a repeat of C1's *runtime* half (the typecheck would catch the prop omission, and the
new regression test pins the wiring — but neither proves a message actually arrives). If you want that
permanently guarded, the highest-value additions are: (a) `supertest` route tests against a real test
database — the dependency is already installed and unused; and (b) one Playwright spec covering
login → chat → live message. I did not add either, as both expand scope beyond the fixes you asked for.

### Test-data left behind

My suites created rows in your local database, labelled for easy identification: several
`Audit Project <timestamp>` projects with `Audit Task <timestamp>` tasks and `audit message`/
`socket audit`/`LIVE PUSH from pm1` chat messages, plus the activity rows those generated. The admin's
display name was changed and **restored** to `Aarav Admin`. Tell me if you want these purged.

**Note:** `/api/auth/*` is rate-limited to 20 requests per 15 minutes per IP and my tests consumed 13.
If logins are briefly refused, wait for the window to reset.

---

## 7. Exact startup commands

Prerequisites: Node ≥ 20 (running 24.14.0), PostgreSQL reachable, `backend/.env` present.

### Backend — http://localhost:4000

```bash
cd backend
npm ci                      # first run only
npm run prisma:generate     # first run only
npm run prisma:deploy       # apply migrations (first run / after schema change)
npm run prisma:seed         # optional, disposable local DB only
npm run dev                 # tsx watch src/server.ts
```

### Frontend — http://localhost:3000

```bash
cd frontend
npm ci                      # first run only
npm run dev                 # next dev
```

### Full verification

```bash
cd backend  && npm run verify              # lint + typecheck + test + build + static audit
cd frontend && npx tsc --noEmit && node --test tests/*.test.mjs && npm run build
```

### If routes 404 despite existing in source

That is **M4**. The dev server was serving 7.5-hour-old code. Restart it:

```bash
# stop the process on :4000, then
cd backend && npm run dev
```
Confirm with `curl http://localhost:4000/api/auth/config` → expect `{"success":true,"data":{"signupEnabled":true}}`.
Before `npm start`, always run `npm run build` — `dist/` does not rebuild itself.

### Seeded accounts (local demo only)

| Role | Email | Password |
|---|---|---|
| Admin | `admin@dashboard.test` | `Admin123!` |
| Project Manager | `pm1@dashboard.test` | `Manager123!` |
| Developer | `dev1@dashboard.test` | `Developer123!` |

---

## 8. Status summary

| Area | Status |
|---|---|
| Authentication (login / logout / refresh / rotation / session restore) | VERIFIED WORKING |
| Authorization (33-cell role matrix, escalation, ownership, socket rooms) | VERIFIED WORKING |
| Database persistence (create / update / read-back across 6 entity types) | VERIFIED WORKING |
| Realtime (socket auth, catch-up, chat, activity, presence) — backend | VERIFIED WORKING |
| Realtime chat delivery into the dashboard UI | FIXED AND RETESTED |
| Frontend typecheck + production build | FIXED AND RETESTED |
| Profile update (`PATCH /api/auth/me`) | FIXED AND RETESTED (stale process) |
| Self-service signup — unit + live route reachability | FIXED AND RETESTED (stale process) |
| Self-service signup — full browser journey | NOT TESTED |
| Dependency security (production) | FIXED AND RETESTED (10 → 4; 4 are CLI-only) |
| Secrets / injection / XSS / headers / CORS / cookies | VERIFIED WORKING |
| `ALLOW_PUBLIC_SIGNUP` production default + docs | BROKEN (needs decision) |
| Edit/delete UI for projects, clients, team roles | BROKEN (incomplete by scope) |
| Backend integration & E2E test coverage | NOT TESTED (mocked only — pre-existing) |
| Accessibility (contrast, type scale, hover-only nav) | BROKEN (design work, not attempted) |
| Production deployment path | NOT TESTED |
| Docs accuracy (`RUN.md`, `CONTINUATION.md`, `QA-TEST-NOTES.md` vs signup) | BROKEN (stale) |

**Nothing here claims completeness on the basis of a successful compile.** The one critical defect was
reproduced, fixed in 4 lines, guarded by a regression test proven to fail without the fix, and
re-verified in a real browser with a real message crossing a real socket.
