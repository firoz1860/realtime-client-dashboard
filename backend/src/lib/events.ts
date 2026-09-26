import { EventEmitter } from 'node:events'

export type DomainEvents = {
  activityCreated: {
    activityId: string
    projectId: string
    taskId: string | null
    pmOwnerId: string
    developerId: string | null
  }
  notificationCreated: { notificationId: string; recipientId: string }
  notificationRead: { notificationId: string; recipientId: string }
  notificationReadAll: { recipientId: string }
  notificationsChanged: { recipientId: string }
  userAuthorizationChanged: { userId: string }
  messageCreated: { messageId: string; projectId: string }
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
