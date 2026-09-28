import type { Request, Response } from 'express'
import type { Role } from '@prisma/client'
import { userService } from '../services/user.service'
import { AppError } from '../utils/app-error'

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
    const id = req.params.id as string
    const body = req.body as { name?: string; email?: string; password?: string; role?: Role; isActive?: boolean }
    // Prevent an admin from locking themselves (and possibly the workspace) out.
    if (req.user?.id === id && ((body.role !== undefined && body.role !== req.user.role) || body.isActive === false)) {
      throw new AppError(409, 'SELF_LOCKOUT', 'You cannot change your own role or deactivate your own account.')
    }
    const data = await userService.update(id, body)
    res.json({ success: true, data })
  }
}
