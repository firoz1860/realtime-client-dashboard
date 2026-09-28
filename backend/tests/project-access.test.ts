import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findById: vi.fn(),
  findScopedById: vi.fn(),
  remove: vi.fn(),
  list: vi.fn(),
  transaction: vi.fn(),
  emit: vi.fn()
}))

vi.mock('../src/repositories/project.repository', () => ({
  projectRepository: {
    findById: mocks.findById,
    findScopedById: mocks.findScopedById,
    remove: mocks.remove,
    list: mocks.list
  }
}))
vi.mock('../src/repositories/client.repository', () => ({ clientRepository: { findById: vi.fn() } }))
vi.mock('../src/repositories/user.repository', () => ({ userRepository: { findById: vi.fn() } }))
vi.mock('../src/lib/prisma', () => ({ prisma: { project: { findUnique: vi.fn() }, task: { count: vi.fn() }, $transaction: mocks.transaction } }))
vi.mock('../src/lib/events', () => ({ eventBus: { emit: mocks.emit } }))

import { projectService } from '../src/services/project.service'

const pmA = { id: 'pm-a', email: 'a@test.com', role: Role.PROJECT_MANAGER, isActive: true, workspaceId: 'ws-test' }
const pmB = { id: 'pm-b', email: 'b@test.com', role: Role.PROJECT_MANAGER, isActive: true, workspaceId: 'ws-test' }
const developer = { id: 'dev-a', email: 'dev@test.com', role: Role.DEVELOPER, isActive: true, workspaceId: 'ws-test' }

describe('project service authorization', () => {
  beforeEach(() => vi.clearAllMocks())

  it('allows a PM to delete only their own project', async () => {
    mocks.findById.mockResolvedValue({ id: 'project-1', createdById: pmA.id })
    mocks.remove.mockResolvedValue({ id: 'project-1' })

    await expect(projectService.remove('project-1', pmA)).resolves.toEqual({ id: 'project-1' })
    expect(mocks.remove).toHaveBeenCalledWith('project-1')
  })

  it('denies a PM deleting another PM project', async () => {
    mocks.findById.mockResolvedValue({ id: 'project-1', createdById: pmA.id })

    await expect(projectService.remove('project-1', pmB)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    expect(mocks.remove).not.toHaveBeenCalled()
  })

  it('denies developer project REST access in the service layer', async () => {
    await expect(projectService.get('project-1', developer)).rejects.toMatchObject({ statusCode: 403, code: 'FORBIDDEN' })
    expect(mocks.findScopedById).not.toHaveBeenCalled()
  })

  it('does not create activity for an unchanged project update', async () => {
    const project = { id: 'project-1', name: 'Orbit', status: 'ACTIVE', description: null, clientId: 'client-1', createdById: pmA.id }
    mocks.findById.mockResolvedValue(project)
    const result = await projectService.update('project-1', pmA, { name: 'Orbit' })
    expect(result).toEqual(project)
    expect(mocks.transaction).not.toHaveBeenCalled()
    expect(mocks.emit).not.toHaveBeenCalled()
  })
})
