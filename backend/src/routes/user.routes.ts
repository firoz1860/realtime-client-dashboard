import { Role } from '@prisma/client'
import { Router } from 'express'
import { userController } from '../controllers/user.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireRole } from '../middlewares/role.middleware'
import { idParamSchema } from '../schemas/common.schema'
import { createUserBodySchema, updateUserBodySchema, userQuerySchema } from '../schemas/user.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const userRoutes = Router()
userRoutes.use(requireAuth)
userRoutes.get('/developers', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), asyncHandler(userController.developers))
userRoutes.get('/', requireRole(Role.ADMIN), validate({ query: userQuerySchema }), asyncHandler(userController.list))
userRoutes.post('/', requireRole(Role.ADMIN), validate({ body: createUserBodySchema }), asyncHandler(userController.create))
userRoutes.get('/:id', requireRole(Role.ADMIN), validate({ params: idParamSchema }), asyncHandler(userController.get))
userRoutes.patch('/:id', requireRole(Role.ADMIN), validate({ params: idParamSchema, body: updateUserBodySchema }), asyncHandler(userController.update))
