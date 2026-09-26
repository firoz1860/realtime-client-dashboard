import type { Request, Response } from 'express'
import type { TaskPriority, TaskStatus } from '@prisma/client'
import { taskService, type TaskFilters, type TaskMutation } from '../services/task.service'
import { AppError } from '../utils/app-error'

const authUser = (req: Request) => {
  if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
  return req.user
}

const queryFilters = (req: Request): TaskFilters => req.query as unknown as TaskFilters

export const taskController = {
  list: async (req: Request, res: Response) => {
    const result = await taskService.list(authUser(req), queryFilters(req))
    res.json({ success: true, ...result })
  },
  listForProject: async (req: Request, res: Response) => {
    const filters = queryFilters(req)
    const result = await taskService.listForProject(req.params.projectId as string, authUser(req), filters)
    res.json({ success: true, ...result })
  },
  get: async (req: Request, res: Response) => res.json({ success: true, data: await taskService.get(req.params.id as string, authUser(req)) }),
  create: async (req: Request, res: Response) => {
    const body = req.body as { title: string; description?: string | null; assignedDeveloperId?: string | null; status?: TaskStatus; priority?: TaskPriority; dueDate?: Date | null }
    const data = await taskService.create(req.params.projectId as string, authUser(req), body)
    res.status(201).json({ success: true, data })
  },
  update: async (req: Request, res: Response) => {
    const data = await taskService.update(req.params.id as string, authUser(req), req.body as TaskMutation)
    res.json({ success: true, data })
  }
}
