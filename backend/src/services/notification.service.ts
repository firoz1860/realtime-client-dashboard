import { eventBus } from '../lib/events'
import { requireWorkspaceId } from '../lib/tenant-context'
import { notificationRepository } from '../repositories/notification.repository'
import { AppError } from '../utils/app-error'
import { paginationMeta } from '../utils/pagination'

export const notificationService = {
  list: async (recipientId: string, input: { page: number; limit: number; isRead?: boolean }) => {
    const result = await notificationRepository.list({ recipientId, ...input })
    return { data: result.data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },
  get: (id: string, recipientId: string) => notificationRepository.findOwnedById(id, recipientId),
  unreadCount: (recipientId: string) => notificationRepository.unreadCount(recipientId),
  markRead: async (id: string, recipientId: string) => {
    const owned = await notificationRepository.findOwnedById(id, recipientId)
    if (!owned) throw new AppError(404, 'NOTIFICATION_NOT_FOUND', 'Notification was not found.')
    if (owned.isRead) return owned
    const result = await notificationRepository.markRead(id, recipientId)
    if (result.count) {
      eventBus.emit('notificationRead', { workspaceId: requireWorkspaceId(), notificationId: id, recipientId })
      eventBus.emit('notificationsChanged', { workspaceId: requireWorkspaceId(), recipientId })
    }
    return notificationRepository.findOwnedById(id, recipientId)
  },
  markAllRead: async (recipientId: string) => {
    const result = await notificationRepository.markAllRead(recipientId)
    if (result.count) {
      eventBus.emit('notificationReadAll', { workspaceId: requireWorkspaceId(), recipientId })
      eventBus.emit('notificationsChanged', { workspaceId: requireWorkspaceId(), recipientId })
    }
    return { updated: result.count }
  }
}
