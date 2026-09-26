import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma, type User } from '@prisma/client'
import { env } from '../config/env'
import { prisma } from '../lib/prisma'
import { refreshTokenRepository } from '../repositories/refresh-token.repository'
import { userRepository } from '../repositories/user.repository'
import { AppError } from '../utils/app-error'
import { durationToMs } from '../utils/duration'
import { hashToken } from '../utils/hash'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { publicUser } from '../utils/sanitize'

const buildRefreshSession = (userId: string) => {
  const sessionId = randomUUID()
  const refreshToken = signRefreshToken(userId, sessionId)
  return {
    sessionId,
    refreshToken,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + durationToMs(env.REFRESH_TOKEN_EXPIRES_IN))
  }
}

export const authService = {
  login: async (email: string, password: string) => {
    const user = await userRepository.findByEmail(email)
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.')

    const session = buildRefreshSession(user.id)
    await refreshTokenRepository.create({
      id: session.sessionId,
      userId: user.id,
      tokenHash: session.tokenHash,
      expiresAt: session.expiresAt
    })

    return {
      accessToken: signAccessToken(user.id, user.role),
      refreshToken: session.refreshToken,
      user: publicUser(user)
    }
  },

  refresh: async (rawToken: string) => {
    const payload = verifyRefreshToken(rawToken)
    const presentedHash = hashToken(rawToken)
    const nextSession = buildRefreshSession(payload.sub)

    let result: User
    try {
      result = await prisma.$transaction(async (tx) => {
        const current = await tx.refreshToken.findUnique({ where: { id: payload.sid }, include: { user: true } })
        if (!current || current.userId !== payload.sub || current.tokenHash !== presentedHash) {
          throw new AppError(401, 'INVALID_REFRESH_TOKEN', 'Refresh session is invalid.')
        }
        if (current.revokedAt) throw new AppError(401, 'REFRESH_REVOKED', 'Refresh token has been revoked.')
        if (current.expiresAt <= new Date()) throw new AppError(401, 'REFRESH_EXPIRED', 'Refresh token has expired.')
        if (!current.user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.')

        const revokeResult = await tx.refreshToken.updateMany({
          where: { id: current.id, tokenHash: presentedHash, revokedAt: null },
          data: { revokedAt: new Date(), replacedById: nextSession.sessionId }
        })
        if (revokeResult.count !== 1) {
          throw new AppError(409, 'REFRESH_RACE', 'This refresh token was already rotated. Retry with the latest session.')
        }

        await tx.refreshToken.create({
          data: {
            id: nextSession.sessionId,
            userId: current.userId,
            tokenHash: nextSession.tokenHash,
            expiresAt: nextSession.expiresAt
          }
        })

        return current.user
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppError(409, 'REFRESH_RACE', 'This refresh token was rotated concurrently. Retry with the latest session.')
      }
      throw error
    }

    return {
      accessToken: signAccessToken(result.id, result.role),
      refreshToken: nextSession.refreshToken,
      user: publicUser(result)
    }
  },

  logout: async (rawToken?: string) => {
    if (!rawToken) return
    await refreshTokenRepository.revokeByHash(hashToken(rawToken))
  },

  me: async (userId: string) => {
    const user = await userRepository.findSafeById(userId)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found.')
    return user
  }
}
