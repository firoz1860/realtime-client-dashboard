import type { Request, Response } from 'express'
import { messageService } from '../services/message.service'
import { AppError } from '../utils/app-error'

const user = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user
}

export const messageController = {
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number }
    const result = await messageService.list(req.params.projectId as string, user(req), query)
    res.json({ success: true, ...result })
  },
  create: async (req: Request, res: Response) => {
    const body = (req.body as { body: string }).body
    const message = await messageService.create(req.params.projectId as string, user(req), body)
    res.status(201).json({ success: true, data: message })
  }
}
