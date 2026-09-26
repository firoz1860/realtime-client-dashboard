import { activityRepository } from '../repositories/activity.repository'
import type { AuthUser } from '../types/auth'
import { paginationMeta } from '../utils/pagination'

export const activityService = {
  list: async (user: AuthUser, input: { page: number; limit: number; projectId?: string; taskId?: string }) => {
    const result = await activityRepository.list({ user, ...input })
    return { data: result.data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },
  recent: (user: AuthUser, limit: number) => activityRepository.recent(user, limit),
  getEvent: (id: string) => activityRepository.findById(id)
}
