import { AsyncLocalStorage } from 'node:async_hooks'

/**
 * Request-scoped tenant context.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §4.1
 *
 * `AsyncLocalStorage` rather than a module-level variable: the store survives
 * `await` boundaries but stays private to the async call chain that opened it.
 * A module-level variable would be shared by every in-flight request, so two
 * concurrent requests from different workspaces would overwrite each other's
 * id — a cross-tenant data-disclosure bug, not merely a race.
 */
export interface TenantContext {
  workspaceId: string
}

const storage = new AsyncLocalStorage<TenantContext>()

/** Runs `fn` with `ctx` visible to every scoped query it performs. */
export const runInTenant = <T>(ctx: TenantContext, fn: () => T): T => storage.run(ctx, fn)

/** The current workspace, or undefined outside any tenant scope. */
export const currentWorkspaceId = (): string | undefined => storage.getStore()?.workspaceId

/**
 * The current workspace, throwing when absent.
 *
 * Callers that genuinely have no workspace (auth bootstrap, refresh,
 * SUPER_ADMIN oversight) must use `prismaSystem` instead of reaching for this.
 */
export const requireWorkspaceId = (): string => {
  const workspaceId = currentWorkspaceId()
  if (!workspaceId) {
    throw new Error('No tenant context: expected to be inside runInTenant().')
  }
  return workspaceId
}
