import { EventEmitter } from 'node:events'

/**
 * Every domain event carries its workspace.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §6
 *
 * Socket listeners run detached from the HTTP request, so there is no ambient
 * tenant context by the time they fire. Carrying the workspace on the payload
 * lets a listener both address the right rooms and reopen a scope for any
 * follow-up query. Without it, broadcasts would have to be global.
 */
export type DomainEvents = {
  activityCreated: {
    workspaceId: string
    activityId: string
    projectId: string
    taskId: string | null
    pmOwnerId: string
    developerId: string | null
  }
  notificationCreated: { workspaceId: string; notificationId: string; recipientId: string }
  notificationRead: { workspaceId: string; notificationId: string; recipientId: string }
  notificationReadAll: { workspaceId: string; recipientId: string }
  notificationsChanged: { workspaceId: string; recipientId: string }
  userAuthorizationChanged: { workspaceId: string; userId: string }
  messageCreated: { workspaceId: string; messageId: string; projectId: string }
}

class TypedEventBus {
  private readonly bus = new EventEmitter()

  emit<K extends keyof DomainEvents>(event: K, payload: DomainEvents[K]): void {
    this.bus.emit(event, payload)
  }

  on<K extends keyof DomainEvents>(event: K, listener: (payload: DomainEvents[K]) => void): void {
    this.bus.on(event, listener)
  }

  removeAllListeners(): void {
    this.bus.removeAllListeners()
  }
}

export const eventBus = new TypedEventBus()
