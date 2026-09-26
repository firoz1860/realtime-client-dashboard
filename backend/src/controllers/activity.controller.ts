import type { Request, Response } from 'express'
import { activityService } from '../services/activity.service'
import { AppError } from '../utils/app-error'

const user = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user
}

export const activityController = {
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number; projectId?: string; taskId?: string }
    const result = await activityService.list(user(req), query)
    res.json({ success: true, ...result })
  },
  recent: async (req: Request, res: Response) => {
    const query = req.query as unknown as { limit: number }
    res.json({ success: true, data: await activityService.recent(user(req), query.limit) })
  }
}
