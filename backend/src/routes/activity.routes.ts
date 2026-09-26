import { Router } from 'express'
import { activityController } from '../controllers/activity.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { activityQuerySchema, recentActivityQuerySchema } from '../schemas/activity.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const activityRoutes = Router()
activityRoutes.use(requireAuth)
activityRoutes.get('/', validate({ query: activityQuerySchema }), asyncHandler(activityController.list))
activityRoutes.get('/recent', validate({ query: recentActivityQuerySchema }), asyncHandler(activityController.recent))
