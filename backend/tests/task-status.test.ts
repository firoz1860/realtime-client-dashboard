import { Role, TaskPriority, TaskStatus } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  emit: vi.fn(),
  findActiveDeveloper: vi.fn(),
  taskList: vi.fn(),
  taskFind: vi.fn(),
  projectFind: vi.fn()
}))

vi.mock('../src/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))
vi.mock('../src/lib/events', () => ({ eventBus: { emit: mocks.emit } }))
vi.mock('../src/repositories/user.repository', () => ({ userRepository: { findActiveDeveloper: mocks.findActiveDeveloper } }))
vi.mock('../src/repositories/task.repository', () => ({
  taskInclude: {},
  taskRepository: { list: mocks.taskList, findScopedById: mocks.taskFind }
}))
vi.mock('../src/repositories/project.repository', () => ({ projectRepository: { findById: mocks.projectFind } }))

import { taskService } from '../src/services/task.service'

describe('task status transaction', () => {
  it('updates status, persists activity and review notification before emitting', async () => {
    const existing = {
      id: 'task-1',
      projectId: 'project-1',
      title: 'API integration',
      description: null,
      assignedDeveloperId: 'dev-1',
      status: TaskStatus.IN_PROGRESS,
      priority: TaskPriority.HIGH,
      dueDate: null,
      isOverdue: false,
      version: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
      project: { id: 'project-1', name: 'Project', createdById: 'pm-1', createdBy: { id: 'pm-1', name: 'PM', email: 'pm@test.com' }, client: { id: 'client-1', name: 'Client', company: 'Co' } },
      assignedDeveloper: { id: 'dev-1', name: 'Dev', email: 'dev@test.com', isActive: true }
    }
    const updated = { ...existing, status: TaskStatus.IN_REVIEW, version: 3 }
    const tx = {
      task: {
        findUnique: vi.fn().mockResolvedValue(existing),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUniqueOrThrow: vi.fn().mockResolvedValue(updated)
      },
      activityLog: { create: vi.fn().mockResolvedValue({ id: 'activity-1' }) },
      notification: { create: vi.fn().mockResolvedValue({ id: 'notification-1', recipientId: 'pm-1' }) }
    }
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))

    const user = { id: 'dev-1', email: 'dev@test.com', role: Role.DEVELOPER, isActive: true }
    const result = await taskService.update('task-1', user, { status: TaskStatus.IN_REVIEW, version: 2 })

    expect(result.status).toBe(TaskStatus.IN_REVIEW)
    expect(tx.activityLog.create).toHaveBeenCalledOnce()
    expect(tx.notification.create).toHaveBeenCalledOnce()
    expect(mocks.emit).toHaveBeenCalledWith('activityCreated', expect.objectContaining({ activityId: 'activity-1' }))
    expect(mocks.emit).toHaveBeenCalledWith('notificationCreated', { notificationId: 'notification-1', recipientId: 'pm-1' })
  })
})
