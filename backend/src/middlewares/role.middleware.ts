import type { RequestHandler } from 'express'
import type { Role } from '@prisma/client'
import { AppError } from '../utils/app-error'

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'))
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'))
  }
  next()
}
