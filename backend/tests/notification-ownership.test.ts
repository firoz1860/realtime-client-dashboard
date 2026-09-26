import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findOwnedById: vi.fn(),
  markRead: vi.fn(),
  emit: vi.fn()
}))

vi.mock('../src/repositories/notification.repository', () => ({
  notificationRepository: {
    findOwnedById: mocks.findOwnedById,
    markRead: mocks.markRead,
    list: vi.fn(),
    unreadCount: vi.fn(),
    markAllRead: vi.fn()
  }
}))
vi.mock('../src/lib/events', () => ({ eventBus: { emit: mocks.emit } }))

import { notificationService } from '../src/services/notification.service'

describe('notification ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not allow a user to mark another users notification as read', async () => {
    mocks.findOwnedById.mockResolvedValue(null)

    await expect(notificationService.markRead('notification-1', 'user-b')).rejects.toMatchObject({
      statusCode: 404,
      code: 'NOTIFICATION_NOT_FOUND'
    })
    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })

  it('marks only an owned notification and emits recipient-scoped updates', async () => {
    const notification = { id: 'notification-1', recipientId: 'user-a', isRead: false }
    mocks.findOwnedById.mockResolvedValueOnce(notification).mockResolvedValueOnce({ ...notification, isRead: true })
    mocks.markRead.mockResolvedValue({ count: 1 })

    await notificationService.markRead('notification-1', 'user-a')

    expect(mocks.markRead).toHaveBeenCalledWith('notification-1', 'user-a')
    expect(mocks.emit).toHaveBeenCalledWith('notificationRead', { notificationId: 'notification-1', recipientId: 'user-a' })
    expect(mocks.emit).toHaveBeenCalledWith('notificationsChanged', { recipientId: 'user-a' })
  })
})
