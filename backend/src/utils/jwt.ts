import jwt, { TokenExpiredError, type Algorithm, type SignOptions } from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../config/env'
import type { AccessTokenPayload, RefreshTokenPayload } from '../types/auth'
import { AppError } from './app-error'

const commonVerify = {
  issuer: env.JWT_ISSUER,
  audience: env.JWT_AUDIENCE,
  algorithms: ['HS256'] as Algorithm[]
}

export const signAccessToken = (userId: string, role: Role): string =>
  jwt.sign(
    { type: 'access', role },
    env.JWT_ACCESS_SECRET,
    {
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.ACCESS_TOKEN_EXPIRES_IN as SignOptions['expiresIn'],
      algorithm: 'HS256'
    }
  )

export const signRefreshToken = (userId: string, sessionId: string): string =>
  jwt.sign(
    { type: 'refresh', sid: sessionId },
    env.JWT_REFRESH_SECRET,
    {
      subject: userId,
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
      expiresIn: env.REFRESH_TOKEN_EXPIRES_IN as SignOptions['expiresIn'],
      algorithm: 'HS256'
    }
  )

export const verifyAccessToken = (token: string): AccessTokenPayload => {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, commonVerify)
    if (typeof payload === 'string' || payload.type !== 'access' || !payload.sub || !payload.role) {
      throw new Error('Invalid access token payload')
    }
    return { sub: payload.sub, type: 'access', role: payload.role as Role }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new AppError(401, 'ACCESS_TOKEN_EXPIRED', 'Access token has expired.')
    }
    throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid.')
  }
}

export const verifyRefreshToken = (token: string): RefreshTokenPayload => {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, commonVerify)
    if (typeof payload === 'string' || payload.type !== 'refresh' || !payload.sub || typeof payload.sid !== 'string') {
      throw new Error('Invalid refresh token payload')
    }
    return { sub: payload.sub, sid: payload.sid, type: 'refresh' }
  } catch (error) {
    if (error instanceof TokenExpiredError) {
      throw new AppError(401, 'REFRESH_EXPIRED', 'Refresh token has expired.')
    }
    throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh token is invalid.')
  }
}
