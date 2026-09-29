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

import { runInTenant } from '../src/lib/tenant-context'
import { notificationService } from '../src/services/notification.service'

describe('notification ownership', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not allow a user to mark another users notification as read', async () => {
    mocks.findOwnedById.mockResolvedValue(null)

    await expect(runInTenant({ workspaceId: 'ws-test-1' }, () =>
      notificationService.markRead('notification-1', 'user-b'))).rejects.toMatchObject({
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

    await runInTenant({ workspaceId: 'ws-test-1' }, () =>
      notificationService.markRead('notification-1', 'user-a'))

    expect(mocks.markRead).toHaveBeenCalledWith('notification-1', 'user-a')
    // Events carry the workspace so detached socket listeners can address the
    // right rooms without an ambient request scope (spec 6).
    expect(mocks.emit).toHaveBeenCalledWith('notificationRead', {
      workspaceId: 'ws-test-1',
      notificationId: 'notification-1',
      recipientId: 'user-a'
    })
    expect(mocks.emit).toHaveBeenCalledWith('notificationsChanged', {
      workspaceId: 'ws-test-1',
      recipientId: 'user-a'
    })
  })

  it('does not emit duplicate events when a notification was already read', async () => {
    mocks.findOwnedById.mockResolvedValue({ id: 'notification-1', recipientId: 'user-a', isRead: true })
    await runInTenant({ workspaceId: 'ws-test-1' }, () =>
      notificationService.markRead('notification-1', 'user-a'))
    expect(mocks.markRead).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })
})
