import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  countOwnedProjects: vi.fn(),
  countAssignedTasks: vi.fn(),
  update: vi.fn()
}))

vi.mock('../src/repositories/user.repository', () => ({
  userRepository: {
    findById: mocks.findById,
    countOwnedProjects: mocks.countOwnedProjects,
    countAssignedTasks: mocks.countAssignedTasks,
    update: mocks.update,
    listActiveDevelopers: vi.fn(),
    list: vi.fn(),
    findSafeById: vi.fn(),
    create: vi.fn()
  }
}))

import { userService } from '../src/services/user.service'

describe('user role relationship invariants', () => {
  beforeEach(() => {
    mocks.countOwnedProjects.mockResolvedValue(0)
    mocks.countAssignedTasks.mockResolvedValue(0)
    mocks.update.mockResolvedValue({ id: 'user-1' })
  })

  it('blocks changing a project owner away from PROJECT_MANAGER', async () => {
    mocks.findById.mockResolvedValue({ id: 'user-1', role: Role.PROJECT_MANAGER })
    mocks.countOwnedProjects.mockResolvedValue(2)
    await expect(userService.update('user-1', { role: Role.DEVELOPER })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ROLE_CHANGE_BLOCKED'
    })
  })

  it('blocks changing an assigned developer away from DEVELOPER', async () => {
    mocks.findById.mockResolvedValue({ id: 'user-1', role: Role.DEVELOPER })
    mocks.countAssignedTasks.mockResolvedValue(3)
    await expect(userService.update('user-1', { role: Role.PROJECT_MANAGER })).rejects.toMatchObject({
      statusCode: 409,
      code: 'ROLE_CHANGE_BLOCKED'
    })
  })
})
