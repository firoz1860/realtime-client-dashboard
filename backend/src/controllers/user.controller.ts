import type { Request, Response } from 'express'
import type { Role } from '@prisma/client'
import { userService } from '../services/user.service'

export const userController = {
  developers: async (_req: Request, res: Response) => {
    res.json({ success: true, data: await userService.activeDevelopers() })
  },
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number; role?: Role; isActive?: boolean; search?: string }
    const result = await userService.list(query)
    res.json({ success: true, ...result })
  },
  get: async (req: Request, res: Response) => res.json({ success: true, data: await userService.get(req.params.id as string) }),
  create: async (req: Request, res: Response) => {
    const data = await userService.create(req.body as { name: string; email: string; password: string; role: Role; isActive?: boolean })
    res.status(201).json({ success: true, data })
  },
  update: async (req: Request, res: Response) => {
    const data = await userService.update(req.params.id as string, req.body as { name?: string; email?: string; password?: string; role?: Role; isActive?: boolean })
    res.json({ success: true, data })
  }
}
