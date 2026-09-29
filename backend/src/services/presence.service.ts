/**
 * Who is online, partitioned by workspace.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §6.2
 *
 * This was previously a single `Map<userId, Set<socketId>>` whose `count()`
 * returned the total across the whole instance. Surfaced as the admin
 * dashboard's "Online now" KPI, that would have told one company how many of a
 * competitor's staff were signed in. It is not a query, so no amount of
 * database scoping could have fixed it — the partition has to live here.
 */
class PresenceService {
  private readonly byWorkspace = new Map<string, Map<string, Set<string>>>()

  connect(workspaceId: string, userId: string, socketId: string): void {
    const users = this.byWorkspace.get(workspaceId) ?? new Map<string, Set<string>>()
    const sockets = users.get(userId) ?? new Set<string>()
    sockets.add(socketId)
    users.set(userId, sockets)
    this.byWorkspace.set(workspaceId, users)
  }

  disconnect(workspaceId: string, userId: string, socketId: string): void {
    const users = this.byWorkspace.get(workspaceId)
    if (!users) return
    const sockets = users.get(userId)
    if (!sockets) return
    sockets.delete(socketId)
    if (sockets.size === 0) users.delete(userId)
    // Drop the workspace entry once empty so the map does not grow without
    // bound across the lifetime of the process.
    if (users.size === 0) this.byWorkspace.delete(workspaceId)
  }

  isOnline(workspaceId: string, userId: string): boolean {
    return (this.byWorkspace.get(workspaceId)?.get(userId)?.size ?? 0) > 0
  }

  /** Distinct signed-in users in this workspace only. */
  count(workspaceId: string): number {
    return this.byWorkspace.get(workspaceId)?.size ?? 0
  }

  clear(): void {
    this.byWorkspace.clear()
  }
}

export const presenceService = new PresenceService()
