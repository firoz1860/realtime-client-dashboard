import type { Request, Response } from 'express'
import { healthService } from '../services/health.service'

export const healthController = {
  check: async (_req: Request, res: Response) => {
    res.json({ success: true, data: await healthService.check() })
  }
}
