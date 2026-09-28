import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  findByEmail: vi.fn(),
  findSafeById: vi.fn(),
  updateUser: vi.fn(),
  createRefresh: vi.fn(),
  revokeByHash: vi.fn(),
  transaction: vi.fn()
}))

vi.mock('../src/repositories/user.repository', () => ({
  userRepository: {
    findByEmail: mocks.findByEmail,
    findSafeById: mocks.findSafeById,
    update: mocks.updateUser
  }
}))
vi.mock('../src/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: {
    create: mocks.createRefresh,
    revokeByHash: mocks.revokeByHash
  }
}))
vi.mock('../src/lib/prisma-system', () => ({ prismaSystem: { $transaction: mocks.transaction, workspace: { findUnique: vi.fn() } } }))

import { authService } from '../src/services/auth.service'
import { hashToken } from '../src/utils/hash'
import { signRefreshToken } from '../src/utils/jwt'

describe('auth service', () => {
  beforeEach(() => {
    mocks.createRefresh.mockResolvedValue({})
    mocks.revokeByHash.mockResolvedValue({ count: 1 })
  })

  it('logs in active users without exposing password hash in returned user', async () => {
    const passwordHash = await bcrypt.hash('Password123!', 4)
    mocks.findByEmail.mockResolvedValue({
      id: randomUUID(),
      name: 'Admin',
      email: 'admin@test.com',
      passwordHash,
      role: Role.ADMIN,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    })
    const result = await authService.login('admin@test.com', 'Password123!')
    expect(result.accessToken).toBeTypeOf('string')
    expect(result.refreshToken).toBeTypeOf('string')
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(mocks.createRefresh).toHaveBeenCalledOnce()
  })

  it('rejects invalid login credentials', async () => {
    mocks.findByEmail.mockResolvedValue(null)
    await expect(authService.login('missing@test.com', 'Password123!')).rejects.toMatchObject({ code: 'INVALID_CREDENTIALS' })
  })

  it('rotates refresh token atomically', async () => {
    const userId = randomUUID()
    const sessionId = randomUUID()
    const token = signRefreshToken(userId, sessionId)
    const user = {
      id: userId,
      name: 'PM',
      email: 'pm@test.com',
      passwordHash: 'hash',
      role: Role.PROJECT_MANAGER,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    }
    const tx = {
      refreshToken: {
        findUnique: vi.fn().mockResolvedValue({
          id: sessionId,
          userId,
          tokenHash: hashToken(token),
          expiresAt: new Date(Date.now() + 60_000),
          revokedAt: null,
          user
        }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        create: vi.fn().mockResolvedValue({})
      }
    }
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
    const result = await authService.refresh(token)
    expect(result.refreshToken).not.toBe(token)
    expect(result.accessToken).toBeTypeOf('string')
    expect(tx.refreshToken.updateMany).toHaveBeenCalledOnce()
    expect(tx.refreshToken.create).toHaveBeenCalledOnce()
  })

  it('logs out by revoking the hashed refresh token', async () => {
    await authService.logout('secret-token')
    expect(mocks.revokeByHash).toHaveBeenCalledWith(hashToken('secret-token'))
  })

  it('updates only the authenticated user’s display name without returning credentials', async () => {
    const id = randomUUID()
    mocks.updateUser.mockResolvedValue({ id, name: 'Updated Name', email: 'person@test.com', role: Role.DEVELOPER, isActive: true, workspaceId: 'ws-test' })
    const result = await authService.updateProfile(id, { name: 'Updated Name' })
    expect(mocks.updateUser).toHaveBeenCalledWith(id, { name: 'Updated Name' })
    expect(result).not.toHaveProperty('passwordHash')
  })
})
