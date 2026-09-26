import { Router } from 'express'
import { healthController } from '../controllers/health.controller'
import { asyncHandler } from '../utils/async-handler'

export const healthRoutes = Router()
healthRoutes.get('/', asyncHandler(healthController.check))
