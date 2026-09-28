import { Prisma, Role } from '@prisma/client'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createRefresh: vi.fn(),
  transaction: vi.fn(),
  tx: {
    user: {
      findUnique: vi.fn(),
      count: vi.fn(),
      create: vi.fn()
    }
  }
}))

vi.mock('../src/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: { create: mocks.createRefresh, revokeByHash: vi.fn() }
}))
vi.mock('../src/repositories/user.repository', () => ({ userRepository: {} }))
vi.mock('../src/lib/prisma', () => ({ prisma: { $transaction: mocks.transaction } }))

import { authService } from '../src/services/auth.service'
import { registerBodySchema } from '../src/schemas/auth.schema'

const input = { name: 'New Person', email: 'new@test.com', password: 'Password123' }
const created = (role: Role) => ({
  id: '8b5a6e0c-2c4f-4d7a-9f0e-0f5e2f2d1c11',
  name: input.name,
  email: input.email,
  passwordHash: 'hash',
  role,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
})

describe('self-service signup', () => {
  beforeEach(() => {
    mocks.createRefresh.mockResolvedValue({})
    mocks.transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx))
    mocks.tx.user.findUnique.mockResolvedValue(null)
  })

  it('makes the first account in an empty workspace an admin', async () => {
    mocks.tx.user.count.mockResolvedValue(0)
    mocks.tx.user.create.mockImplementation(async ({ data }: { data: { role: Role } }) => created(data.role))
    const result = await authService.register(input)
    expect(mocks.tx.user.create.mock.calls[0]![0].data.role).toBe(Role.ADMIN)
    expect(result.user.role).toBe(Role.ADMIN)
    expect(result.accessToken).toBeTypeOf('string')
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(mocks.createRefresh).toHaveBeenCalledOnce()
  })

  it('gives later accounts the non-privileged default role and hashes the password', async () => {
    mocks.tx.user.count.mockResolvedValue(5)
    mocks.tx.user.create.mockImplementation(async ({ data }: { data: { role: Role } }) => created(data.role))
    await authService.register(input)
    const data = mocks.tx.user.create.mock.calls[0]![0].data as { role: Role; passwordHash: string }
    expect(data.role).toBe(Role.DEVELOPER)
    expect(data.passwordHash).not.toBe(input.password)
  })

  it('rejects an email that is already registered', async () => {
    mocks.tx.user.findUnique.mockResolvedValue({ id: 'existing' })
    await expect(authService.register(input)).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' })
    expect(mocks.tx.user.create).not.toHaveBeenCalled()
  })

  it('maps a unique-constraint race to EMAIL_TAKEN', async () => {
    mocks.transaction.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: 'test' }))
    await expect(authService.register(input)).rejects.toMatchObject({ statusCode: 409, code: 'EMAIL_TAKEN' })
  })

  it('validates signup input and never accepts a client-chosen role', () => {
    expect(registerBodySchema.safeParse({ ...input, role: 'ADMIN' }).success).toBe(false)
    expect(registerBodySchema.safeParse({ ...input, password: 'short1' }).success).toBe(false)
    expect(registerBodySchema.safeParse({ ...input, password: 'lettersonly' }).success).toBe(false)
    const parsed = registerBodySchema.parse({ ...input, email: '  New@Test.com ' })
    expect(parsed.email).toBe('new@test.com')
  })
})
