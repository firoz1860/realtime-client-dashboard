import { Role } from '@prisma/client'
import { Router } from 'express'
import { dashboardController } from '../controllers/dashboard.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireRole } from '../middlewares/role.middleware'
import { asyncHandler } from '../utils/async-handler'

export const dashboardRoutes = Router()
dashboardRoutes.use(requireAuth)
dashboardRoutes.get('/admin', requireRole(Role.ADMIN), asyncHandler(dashboardController.admin))
dashboardRoutes.get('/pm', requireRole(Role.PROJECT_MANAGER), asyncHandler(dashboardController.pm))
dashboardRoutes.get('/developer', requireRole(Role.DEVELOPER), asyncHandler(dashboardController.developer))
