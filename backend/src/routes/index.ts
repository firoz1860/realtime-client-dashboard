import { Router } from 'express'
import { authRoutes } from './auth.routes'
import { userRoutes } from './user.routes'
import { clientRoutes } from './client.routes'
import { projectRoutes } from './project.routes'
import { taskRoutes } from './task.routes'
import { activityRoutes } from './activity.routes'
import { notificationRoutes } from './notification.routes'
import { dashboardRoutes } from './dashboard.routes'
import { healthRoutes } from './health.routes'
import { workspaceRoutes } from './workspace.routes'
import { blockSuperAdmin } from '../middlewares/role.middleware'

export const apiRouter = Router()
apiRouter.use('/auth', authRoutes)

// Platform oversight: metadata only, and the one place SUPER_ADMIN is allowed.
apiRouter.use('/workspaces', workspaceRoutes)

// Everything below serves workspace-owned data. SUPER_ADMIN has no workspace and
// must not be able to read it, or oversight becomes cross-tenant access.
apiRouter.use(blockSuperAdmin)
apiRouter.use('/users', userRoutes)
apiRouter.use('/clients', clientRoutes)
apiRouter.use('/projects', projectRoutes)
apiRouter.use('/tasks', taskRoutes)
apiRouter.use('/activity', activityRoutes)
apiRouter.use('/notifications', notificationRoutes)
apiRouter.use('/dashboard', dashboardRoutes)
apiRouter.use('/health', healthRoutes)
