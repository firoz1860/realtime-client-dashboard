import { Role } from '@prisma/client'
import type { Request, Response } from 'express'
import { describe, expect, it, vi } from 'vitest'
import { requireRole } from '../src/middlewares/role.middleware'

const response = {} as Response

describe('requireRole', () => {
  it('allows an explicitly permitted role', () => {
    const request = { user: { id: 'pm-1', email: 'pm@test.com', role: Role.PROJECT_MANAGER, isActive: true, workspaceId: 'ws-test' } } as unknown as Request
    const next = vi.fn()
    requireRole(Role.ADMIN, Role.PROJECT_MANAGER)(request, response, next)
    expect(next).toHaveBeenCalledWith()
  })

  it('rejects a role outside the allowed set', () => {
    const request = { user: { id: 'dev-1', email: 'dev@test.com', role: Role.DEVELOPER, isActive: true, workspaceId: 'ws-test' } } as unknown as Request
    const next = vi.fn()
    requireRole(Role.ADMIN, Role.PROJECT_MANAGER)(request, response, next)
    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403, code: 'FORBIDDEN' }))
  })
})
