import { Role } from '@prisma/client'
import { Router } from 'express'
import { clientController } from '../controllers/client.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { requireRole } from '../middlewares/role.middleware'
import { createClientBodySchema, clientQuerySchema, updateClientBodySchema } from '../schemas/client.schema'
import { idParamSchema } from '../schemas/common.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const clientRoutes = Router()
clientRoutes.use(requireAuth)
clientRoutes.get('/', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ query: clientQuerySchema }), asyncHandler(clientController.list))
clientRoutes.post('/', requireRole(Role.ADMIN), validate({ body: createClientBodySchema }), asyncHandler(clientController.create))
clientRoutes.get('/:id', requireRole(Role.ADMIN, Role.PROJECT_MANAGER), validate({ params: idParamSchema }), asyncHandler(clientController.get))
clientRoutes.patch('/:id', requireRole(Role.ADMIN), validate({ params: idParamSchema, body: updateClientBodySchema }), asyncHandler(clientController.update))
clientRoutes.delete('/:id', requireRole(Role.ADMIN), validate({ params: idParamSchema }), asyncHandler(clientController.remove))
