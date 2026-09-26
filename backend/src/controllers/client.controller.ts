import type { Request, Response } from 'express'
import type { Prisma } from '@prisma/client'
import { clientService } from '../services/client.service'

export const clientController = {
  list: async (req: Request, res: Response) => {
    const query = req.query as unknown as { page: number; limit: number; search?: string }
    const result = await clientService.list(query)
    res.json({ success: true, ...result })
  },
  get: async (req: Request, res: Response) => res.json({ success: true, data: await clientService.get(req.params.id as string) }),
  create: async (req: Request, res: Response) => {
    const data = await clientService.create(req.body as Prisma.ClientCreateInput)
    res.status(201).json({ success: true, data })
  },
  update: async (req: Request, res: Response) => res.json({ success: true, data: await clientService.update(req.params.id as string, req.body as Prisma.ClientUpdateInput) }),
  remove: async (req: Request, res: Response) => {
    await clientService.remove(req.params.id as string)
    res.json({ success: true, data: { deleted: true } })
  }
}
