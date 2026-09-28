import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  projects: vi.fn().mockResolvedValue([]), projectCount: vi.fn().mockResolvedValue(0),
  tasks: vi.fn().mockResolvedValue([]), taskCount: vi.fn().mockResolvedValue(0)
}))
vi.mock('../src/lib/prisma', () => ({ prisma: {
  $transaction: (queries: Array<Promise<unknown>>) => Promise.all(queries),
  project: { findMany: mocks.projects, count: mocks.projectCount },
  task: { findMany: mocks.tasks, count: mocks.taskCount }
} }))

import { projectRepository } from '../src/repositories/project.repository'
import { taskRepository } from '../src/repositories/task.repository'

const user = { id: 'pm-1', email: 'pm@example.test', role: Role.PROJECT_MANAGER, isActive: true, workspaceId: 'ws-test' }

describe('role-scoped search', () => {
  it('searches project name, description and client while retaining manager scope', async () => {
    await projectRepository.list({ user, page: 1, limit: 20, search: 'Acme' })
    const where = mocks.projects.mock.calls.at(-1)?.[0].where
    expect(where.createdById).toBe(user.id)
    expect(where.OR).toEqual(expect.arrayContaining([
      { client: { company: { contains: 'Acme', mode: 'insensitive' } } }
    ]))
  })

  it('searches task title and project while retaining manager scope', async () => {
    await taskRepository.list({ user, page: 1, limit: 20, search: 'Acme' })
    const where = mocks.tasks.mock.calls.at(-1)?.[0].where
    expect(where.project.createdById).toBe(user.id)
    expect(where.OR).toEqual(expect.arrayContaining([
      { project: { name: { contains: 'Acme', mode: 'insensitive' } } }
    ]))
  })
})
