import { Router } from 'express'
import { workspaceController } from '../controllers/workspace.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireSuperAdmin } from '../middlewares/role.middleware'
import { idParamSchema } from '../schemas/common.schema'
import { deleteWorkspaceBodySchema, updateWorkspaceBodySchema } from '../schemas/workspace.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

/**
 * Platform oversight. Metadata only — see services/workspace.service.ts.
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §5.4
 */
export const workspaceRoutes = Router()
workspaceRoutes.use(requireAuth, requireSuperAdmin)

workspaceRoutes.get('/', asyncHandler(workspaceController.list))

workspaceRoutes.patch(
  '/:id',
  validate({ params: idParamSchema, body: updateWorkspaceBodySchema }),
  asyncHandler(workspaceController.setStatus)
)

workspaceRoutes.delete(
  '/:id',
  validate({ params: idParamSchema, body: deleteWorkspaceBodySchema }),
  asyncHandler(workspaceController.remove)
)
