import { Role } from '@prisma/client'
import { Router } from 'express'
import { messageController } from '../controllers/message.controller'
import { projectController } from '../controllers/project.controller'
import { taskController } from '../controllers/task.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireRole } from '../middlewares/role.middleware'
import { idParamSchema, projectIdParamSchema } from '../schemas/common.schema'
import { createMessageBodySchema, messageQuerySchema } from '../schemas/message.schema'
import { createProjectBodySchema, projectQuerySchema, updateProjectBodySchema } from '../schemas/project.schema'
import { createTaskBodySchema, taskQuerySchema } from '../schemas/task.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const projectRoutes = Router()
projectRoutes.use(requireAuth)
projectRoutes.get('/', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ query: projectQuerySchema }), asyncHandler(projectController.list))
projectRoutes.post('/', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ body: createProjectBodySchema }), asyncHandler(projectController.create))
projectRoutes.get('/:id', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: idParamSchema }), asyncHandler(projectController.get))
projectRoutes.patch('/:id', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: idParamSchema, body: updateProjectBodySchema }), asyncHandler(projectController.update))
projectRoutes.delete('/:id', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: idParamSchema }), asyncHandler(projectController.remove))
projectRoutes.get('/:projectId/tasks', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: projectIdParamSchema, query: taskQuerySchema }), asyncHandler(taskController.listForProject))
projectRoutes.post('/:projectId/tasks', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: projectIdParamSchema, body: createTaskBodySchema }), asyncHandler(taskController.create))

// Project chat — all roles; access is enforced per-project in the service.
projectRoutes.get('/:projectId/messages', validate({ params: projectIdParamSchema, query: messageQuerySchema }), asyncHandler(messageController.list))
projectRoutes.post('/:projectId/messages', validate({ params: projectIdParamSchema, body: createMessageBodySchema }), asyncHandler(messageController.create))
