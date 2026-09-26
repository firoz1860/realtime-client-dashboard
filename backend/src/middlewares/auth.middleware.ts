import type { RequestHandler } from 'express'
import { userRepository } from '../repositories/user.repository'
import { AppError } from '../utils/app-error'
import { verifyAccessToken } from '../utils/jwt'

export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    }
    const payload = verifyAccessToken(authorization.slice(7))
    const user = await userRepository.findById(payload.sub)
    if (!user || !user.isActive) {
      throw new AppError(401, 'ACCOUNT_INACTIVE', 'User account is unavailable or inactive.')
    }
    req.user = { id: user.id, email: user.email, role: user.role, isActive: user.isActive }
    next()
  } catch (error) {
    next(error)
  }
}
