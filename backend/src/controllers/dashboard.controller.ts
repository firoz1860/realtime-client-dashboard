import type { Request, Response } from 'express'
import { dashboardService } from '../services/dashboard.service'
import { AppError } from '../utils/app-error'

const user = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user
}

export const dashboardController = {
  admin: async (req: Request, res: Response) => res.json({ success: true, data: await dashboardService.admin(user(req)) }),
  pm: async (req: Request, res: Response) => res.json({ success: true, data: await dashboardService.pm(user(req)) }),
  developer: async (req: Request, res: Response) => res.json({ success: true, data: await dashboardService.developer(user(req)) })
}
