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
    },
    workspace: {
      create: vi.fn(),
      findUnique: vi.fn()
    }
  }
}))

vi.mock('../src/repositories/refresh-token.repository', () => ({
  refreshTokenRepository: { create: mocks.createRefresh, revokeByHash: vi.fn() }
}))
vi.mock('../src/repositories/user.repository', () => ({ userRepository: {} }))
vi.mock('../src/lib/prisma-system', () => ({ prismaSystem: { $transaction: mocks.transaction, workspace: { findUnique: vi.fn() } } }))

import { authService } from '../src/services/auth.service'
import { registerBodySchema } from '../src/schemas/auth.schema'

const input = { name: 'New Person', email: 'new@test.com', password: 'Password123', companyName: 'Test Company' }
const created = (role: Role) => ({
  id: '8b5a6e0c-2c4f-4d7a-9f0e-0f5e2f2d1c11',
  name: input.name,
  email: input.email,
  passwordHash: 'hash',
  role,
  isActive: true,
  workspaceId: 'a1f3c2d4-5b6e-4a7c-8d9e-0f1a2b3c4d5e',
  createdAt: new Date(),
  updatedAt: new Date()
})

describe('self-service signup', () => {
  beforeEach(() => {
    mocks.createRefresh.mockResolvedValue({})
    mocks.transaction.mockImplementation(async (callback: (client: typeof mocks.tx) => Promise<unknown>) => callback(mocks.tx))
    mocks.tx.user.findUnique.mockResolvedValue(null)
    mocks.tx.workspace.findUnique.mockResolvedValue(null)
    mocks.tx.workspace.create.mockResolvedValue({
      id: 'a1f3c2d4-5b6e-4a7c-8d9e-0f1a2b3c4d5e',
      name: input.companyName,
      slug: 'test-company'
    })
  })

  it('provisions a workspace and makes the signer its admin', async () => {
    mocks.tx.user.create.mockImplementation(async ({ data }: { data: { role: Role } }) => created(data.role))
    const result = await authService.register(input)
    expect(mocks.tx.user.create.mock.calls[0]![0].data.role).toBe(Role.ADMIN)
    expect(result.user.role).toBe(Role.ADMIN)
    expect(result.accessToken).toBeTypeOf('string')
    expect(result.user).not.toHaveProperty('passwordHash')
    expect(mocks.createRefresh).toHaveBeenCalledOnce()
  })

  it('names the workspace after the supplied company and derives its slug', async () => {
    mocks.tx.user.create.mockImplementation(async ({ data }: { data: { role: Role } }) => created(data.role))
    await authService.register(input)
    const workspaceArgs = mocks.tx.workspace.create.mock.calls[0]![0] as { data: { name: string; slug: string } }
    expect(workspaceArgs.data.name).toBe(input.companyName)
    expect(workspaceArgs.data.slug).toBe('test-company')
    expect(mocks.tx.user.create.mock.calls[0]![0].data.role).toBe(Role.ADMIN)
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
