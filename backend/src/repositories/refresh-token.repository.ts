import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export type TransactionClient = Prisma.TransactionClient

export const refreshTokenRepository = {
  create: (data: Prisma.RefreshTokenUncheckedCreateInput) => prisma.refreshToken.create({ data }),
  findById: (id: string) => prisma.refreshToken.findUnique({ where: { id } }),
  revokeByHash: (tokenHash: string) => prisma.refreshToken.updateMany({ where: { tokenHash, revokedAt: null }, data: { revokedAt: new Date() } }),
  revokeUserSessions: (userId: string) => prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  deleteExpired: () => prisma.refreshToken.deleteMany({ where: { expiresAt: { lt: new Date() } } })
}
