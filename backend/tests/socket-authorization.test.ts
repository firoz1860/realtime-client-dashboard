import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  projectFind: vi.fn(),
  taskCount: vi.fn()
}))

vi.mock('../src/lib/prisma', () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    task: { count: mocks.taskCount }
  }
}))
vi.mock('../src/repositories/client.repository', () => ({ clientRepository: {} }))
vi.mock('../src/repositories/project.repository', () => ({ projectRepository: {} }))
vi.mock('../src/repositories/user.repository', () => ({ userRepository: {} }))
vi.mock('../src/repositories/activity.repository', () => ({ activityRepository: {} }))
vi.mock('../src/lib/events', () => ({ eventBus: { emit: vi.fn() } }))

import { projectService } from '../src/services/project.service'

describe('socket project-room authorization', () => {
  it('denies PM joining another PM project', async () => {
    mocks.projectFind.mockResolvedValue({ createdById: 'pm-a' })
    const user = { id: 'pm-b', email: 'pm@test.com', role: Role.PROJECT_MANAGER, isActive: true, workspaceId: 'ws-test' }
    await expect(projectService.canJoinRoom('project-1', user)).resolves.toBe(false)
  })

  it('denies developer without an assigned task in project', async () => {
    mocks.projectFind.mockResolvedValue({ createdById: 'pm-a' })
    mocks.taskCount.mockResolvedValue(0)
    const user = { id: 'dev-b', email: 'dev@test.com', role: Role.DEVELOPER, isActive: true, workspaceId: 'ws-test' }
    await expect(projectService.canJoinRoom('project-1', user)).resolves.toBe(false)
  })
})
