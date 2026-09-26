import { Router } from 'express'
import { taskController } from '../controllers/task.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { idParamSchema } from '../schemas/common.schema'
import { taskQuerySchema, updateTaskBodySchema } from '../schemas/task.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const taskRoutes = Router()
taskRoutes.use(requireAuth)
taskRoutes.get('/', validate({ query: taskQuerySchema }), asyncHandler(taskController.list))
taskRoutes.get('/:id', validate({ params: idParamSchema }), asyncHandler(taskController.get))
taskRoutes.patch('/:id', validate({ params: idParamSchema, body: updateTaskBodySchema }), asyncHandler(taskController.update))
