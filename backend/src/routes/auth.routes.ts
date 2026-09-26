import { Router } from 'express'
import { authController } from '../controllers/auth.controller'
import { requireAuth } from '../middlewares/auth.middleware'
import { authRateLimit } from '../middlewares/rate-limit.middleware'
import { loginBodySchema, updateProfileBodySchema } from '../schemas/auth.schema'
import { asyncHandler } from '../utils/async-handler'
import { validate } from '../validators/validate'

export const authRoutes = Router()

authRoutes.post('/login', authRateLimit, validate({ body: loginBodySchema }), asyncHandler(authController.login))
authRoutes.post('/refresh', authRateLimit, asyncHandler(authController.refresh))
authRoutes.post('/logout', asyncHandler(authController.logout))
authRoutes.get('/me', requireAuth, asyncHandler(authController.me))
authRoutes.patch('/me', requireAuth, validate({ body: updateProfileBodySchema }), asyncHandler(authController.updateProfile))
