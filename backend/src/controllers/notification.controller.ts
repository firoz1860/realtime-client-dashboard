import type { Request, Response } from 'express'
import { notificationService } from '../services/notification.service'
import { AppError } from '../utils/app-error'

const userId = (req: Request): string => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user.id
}

export const notificationController = {
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number; isRead?: boolean }
    const result = await notificationService.list(userId(req), query)
    res.json({ success: true, ...result })
  },
  markRead: async (req: Request, res: Response) => res.json({ success: true, data: await notificationService.markRead(req.params.id as string, userId(req)) }),
  markAllRead: async (req: Request, res: Response) => res.json({ success: true, data: await notificationService.markAllRead(userId(req)) }),
  unreadCount: async (req: Request, res: Response) => res.json({ success: true, data: { count: await notificationService.unreadCount(userId(req)) } })
}
