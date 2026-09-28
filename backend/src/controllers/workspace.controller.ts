import type { WorkspaceStatus } from '@prisma/client'
import type { Request, Response } from 'express'
import { workspaceService } from '../services/workspace.service'

/**
 * SUPER_ADMIN oversight endpoints.
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §5.4
 */
export const workspaceController = {
  list: async (_req: Request, res: Response) => {
    const data = await workspaceService.list()
    res.json({ success: true, data })
  },

  setStatus: async (req: Request, res: Response) => {
    const { id } = req.params as { id: string }
    const { status } = req.body as { status: WorkspaceStatus }
    const data = await workspaceService.setStatus(id, status)
    res.json({ success: true, data })
  },

  remove: async (req: Request, res: Response) => {
    const { id } = req.params as { id: string }
    const { confirm } = req.body as { confirm: string }
    const data = await workspaceService.remove(id, confirm)
    res.json({ success: true, data })
  }
}
