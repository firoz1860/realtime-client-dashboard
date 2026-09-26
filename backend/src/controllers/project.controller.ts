import type { Request, Response } from 'express'
import type { ProjectStatus } from '@prisma/client'
import { projectService } from '../services/project.service'
import { AppError } from '../utils/app-error'

const authUser = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user
}

export const projectController = {
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number; status?: ProjectStatus; clientId?: string; search?: string }
    const result = await projectService.list({ user: authUser(req), ...query })
    res.json({ success: true, ...result })
  },
  get: async (req: Request, res: Response) => res.json({ success: true, data: await projectService.get(req.params.id as string, authUser(req)) }),
  create: async (req: Request, res: Response) => {
    const data = await projectService.create(authUser(req), req.body as { name: string; description?: string | null; clientId: string; status?: ProjectStatus; createdById?: string })
    res.status(201).json({ success: true, data })
  },
  update: async (req: Request, res: Response) => {
    const data = await projectService.update(req.params.id as string, authUser(req), req.body as { name?: string; description?: string | null; clientId?: string; status?: ProjectStatus })
    res.json({ success: true, data })
  },
  remove: async (req: Request, res: Response) => {
    await projectService.remove(req.params.id as string, authUser(req))
    res.json({ success: true, data: { deleted: true } })
  }
}
