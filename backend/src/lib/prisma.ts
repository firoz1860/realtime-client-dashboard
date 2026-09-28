import { currentWorkspaceId } from './tenant-context'
import { prismaSystem } from './prisma-system'

/**
 * Tenant-scoped database client. Use this everywhere.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §4.2–4.3
 *
 * For the seven tenant models it injects `where.workspaceId` on reads, updates
 * and deletes, and sets `data.workspaceId` on creates. Call sites therefore do
 * not mention the workspace at all, which is the point: a query cannot forget a
 * filter it never had to write.
 *
 * If there is no tenant context it THROWS. Failing closed is deliberate — a
 * missing scope must break loudly in a test rather than quietly return every
 * workspace's rows.
 */

/**
 * Models carrying a `workspaceId` column.
 *
 * `RefreshToken` is deliberately absent: POST /api/auth/refresh presents only
 * the HttpOnly cookie, so no context exists on that path. Scoping it would fail
 * closed for every refresh and log all users out permanently (spec §3.3).
 * `Workspace` itself is absent because it *is* the tenant.
 */
export const TENANT_MODELS = new Set([
  'User',
  'Client',
  'Project',
  'Task',
  'ActivityLog',
  'Notification',
  'Message'
])

/** Operations whose tenant key belongs in `data`, not `where`. */
const CREATE_OPERATIONS = new Set(['create', 'createMany', 'createManyAndReturn'])

/**
 * Prisma restricts `findUnique`'s `where` to unique fields. `workspaceId` is not
 * unique, so it must be rewritten to the non-unique equivalent, which accepts an
 * arbitrary filter. Selectivity is unchanged: the original unique field (usually
 * `id`) stays in `where` and the workspace merely narrows it further.
 */
const UNIQUE_TO_FIRST: Record<string, string> = {
  findUnique: 'findFirst',
  findUniqueOrThrow: 'findFirstOrThrow'
}

type Delegate = Record<string, ((args: unknown) => unknown) | undefined>

const delegateFor = (model: string): Delegate => {
  const key = model.charAt(0).toLowerCase() + model.slice(1)
  const delegate = (prismaSystem as unknown as Record<string, Delegate | undefined>)[key]
  if (!delegate) {
    throw new Error(`No Prisma delegate for model ${model}.`)
  }
  return delegate
}

export const prisma = prismaSystem.$extends({
  name: 'tenant-isolation',
  query: {
    $allModels: {
      async $allOperations({ model, operation, args, query }) {
        if (!model || !TENANT_MODELS.has(model)) return query(args)

        const workspaceId = currentWorkspaceId()
        if (!workspaceId) {
          throw new Error(
            `Tenant-scoped query ${model}.${operation} ran with no workspace context. ` +
              'Wrap the call in runInTenant(), or use prismaSystem if bypassing ' +
              'isolation is genuinely intended (see src/lib/prisma-system.ts).'
          )
        }

        const next = { ...((args ?? {}) as Record<string, unknown>) }

        if (CREATE_OPERATIONS.has(operation)) {
          const data = next.data
          next.data = Array.isArray(data)
            ? data.map((row: Record<string, unknown>) => ({ ...row, workspaceId }))
            : { ...((data ?? {}) as Record<string, unknown>), workspaceId }
          return query(next)
        }

        if (operation === 'upsert') {
          next.create = { ...((next.create ?? {}) as Record<string, unknown>), workspaceId }
          next.where = { ...((next.where ?? {}) as Record<string, unknown>), workspaceId }
          return query(next)
        }

        next.where = { ...((next.where ?? {}) as Record<string, unknown>), workspaceId }

        const rewritten = UNIQUE_TO_FIRST[operation]
        if (rewritten) {
          // Re-dispatched on the unextended client on purpose: the tenant filter
          // has already been applied to `next.where` above, so this cannot leak.
          // Going through `query()` is not an option because it would still run
          // the original findUnique, which rejects the non-unique filter.
          const method = delegateFor(model)[rewritten]
          if (!method) {
            throw new Error(`Prisma delegate for ${model} has no ${rewritten} operation.`)
          }
          return method(next)
        }

        return query(next)
      }
    }
  }
})
