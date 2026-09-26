import { beforeEach, describe, expect, it, vi } from 'vitest'

const { updateMany, deleteExpired } = vi.hoisted(() => ({ updateMany: vi.fn(), deleteExpired: vi.fn() }))

vi.mock('../src/lib/prisma', () => ({ prisma: { task: { updateMany } } }))
vi.mock('../src/repositories/refresh-token.repository', () => ({ refreshTokenRepository: { deleteExpired } }))

import { runOverdueSweep } from '../src/jobs/overdue.job'

describe('overdue scheduler', () => {
  beforeEach(() => {
    updateMany.mockReset()
    updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 0 })
    deleteExpired.mockResolvedValue({ count: 0 })
  })

  it('marks only scheduler-selected tasks and is safe to repeat', async () => {
    await expect(runOverdueSweep()).resolves.toBe(2)
    await expect(runOverdueSweep()).resolves.toBe(0)
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(updateMany.mock.calls[0]?.[0]?.where?.isOverdue).toBe(false)
  })
})
