import { Router } from 'express'
import { notificationController } from '../controllers/notification.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { idParamSchema } from '../schemas/common.schema'
import { notificationQuerySchema } from '../schemas/notification.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const notificationRoutes = Router()
notificationRoutes.use(requireAuth)
notificationRoutes.get('/', validate({ query: notificationQuerySchema }), asyncHandler(notificationController.list))
notificationRoutes.get('/unread-count', asyncHandler(notificationController.unreadCount))
notificationRoutes.patch('/read-all', asyncHandler(notificationController.markAllRead))
notificationRoutes.patch('/:id/read', validate({ params: idParamSchema }), asyncHandler(notificationController.markRead))
