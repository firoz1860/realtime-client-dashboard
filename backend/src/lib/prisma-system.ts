import { PrismaClient } from '@prisma/client'

/**
 * UNSCOPED database client — bypasses tenant isolation.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §4.2.1
 *
 * Every query made through this client can read and write ANY workspace's rows.
 * It exists because a handful of operations legitimately run with no workspace
 * context:
 *
 *   - src/services/auth.service.ts        register creates the workspace itself;
 *                                         login resolves a user before the
 *                                         workspace is known; refresh carries no
 *                                         access token at all (spec §3.3)
 *   - src/middlewares/auth.middleware.ts  verifies the token before a scope exists
 *   - src/services/workspace.service.ts   SUPER_ADMIN metadata endpoints (§5.4)
 *   - prisma/seed.ts                      runs outside any request
 *   - src/lib/prisma.ts                   wraps this to build the scoped client
 *
 * It lives in its own module so the *import path* is the signal, and so ESLint
 * can restrict who may import it. Importing this anywhere else is a tenant
 * bypass: use `prisma` from './prisma' instead, which fails closed.
 */
export const prismaSystem = new PrismaClient()
