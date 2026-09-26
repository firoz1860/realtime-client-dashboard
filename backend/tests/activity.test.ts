import { Role } from '@prisma/client'
import { describe, expect, it, vi } from 'vitest'

const { recent } = vi.hoisted(() => ({ recent: vi.fn() }))
vi.mock('../src/repositories/activity.repository', () => ({
  activityRepository: { recent, list: vi.fn(), findById: vi.fn() }
}))

import { activityService } from '../src/services/activity.service'

describe('recent activity', () => {
  it('delegates to role-scoped repository with requested catch-up limit', async () => {
    recent.mockResolvedValue([{ id: 'activity-1' }])
    const user = { id: 'dev-1', email: 'dev@test.com', role: Role.DEVELOPER, isActive: true }
    const result = await activityService.recent(user, 20)
    expect(result).toEqual([{ id: 'activity-1' }])
    expect(recent).toHaveBeenCalledWith(user, 20)
  })
})
