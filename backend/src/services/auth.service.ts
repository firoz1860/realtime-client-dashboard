import { randomUUID } from 'node:crypto'
import bcrypt from 'bcryptjs'
import { Prisma, Role, WorkspaceStatus, type User } from '@prisma/client'
import { env } from '../config/env'
import { prismaSystem } from '../lib/prisma-system'
import { refreshTokenRepository } from '../repositories/refresh-token.repository'
import { userRepository } from '../repositories/user.repository'
import { AppError } from '../utils/app-error'
import { durationToMs } from '../utils/duration'
import { hashToken } from '../utils/hash'
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../utils/jwt'
import { publicUser } from '../utils/sanitize'

/** A url-safe, unique slug for a company name. Derived, never hardcoded. */
const uniqueSlug = async (
  tx: { workspace: { findUnique: (a: { where: { slug: string }; select: { id: true } }) => Promise<unknown> } },
  companyName: string
): Promise<string> => {
  const base =
    companyName
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'workspace'
  for (let attempt = 0; attempt < 50; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${attempt + 1}`
    if (!(await tx.workspace.findUnique({ where: { slug: candidate }, select: { id: true } }))) return candidate
  }
  return `${base}-${randomUUID().slice(0, 8)}`
}

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

/** A suspended company cannot be signed into (spec §5.4). */
const assertWorkspaceActive = async (workspaceId: string | null): Promise<void> => {
  if (!workspaceId) return
  const workspace = await prismaSystem.workspace.findUnique({
    where: { id: workspaceId },
    select: { status: true }
  })
  if (workspace?.status === WorkspaceStatus.SUSPENDED) {
    throw new AppError(403, 'WORKSPACE_SUSPENDED', 'This workspace is suspended. Contact your administrator.')
  }
}

const issueSession = async (user: User) => {
  const session = buildRefreshSession(user.id)
  await refreshTokenRepository.create({
    id: session.sessionId,
    userId: user.id,
    tokenHash: session.tokenHash,
    expiresAt: session.expiresAt
  })
  return {
    accessToken: signAccessToken(user.id, user.role, user.workspaceId),
    refreshToken: session.refreshToken,
    user: publicUser(user)
  }
}

export const authService = {
  register: async (input: { name: string; email: string; password: string; companyName: string }) => {
    if (!env.ALLOW_PUBLIC_SIGNUP) {
      throw new AppError(403, 'SIGNUP_DISABLED', 'Self-service signup is disabled. Ask your workspace administrator for an account.')
    }
    const passwordHash = await bcrypt.hash(input.password, 12)

    let user: User
    try {
      user = await prismaSystem.$transaction(async (tx) => {
        const existing = await tx.user.findUnique({ where: { email: input.email }, select: { id: true } })
        if (existing) throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try logging in instead.')
        // Signing up provisions a workspace and makes the signer its admin.
        // There is no global-first-user special case any more: each account is
        // the administrator of its own company, never of the whole platform.
        const workspace = await tx.workspace.create({
          data: { name: input.companyName, slug: await uniqueSlug(tx, input.companyName) }
        })
        return tx.user.create({
          data: {
            name: input.name,
            email: input.email,
            passwordHash,
            role: Role.ADMIN,
            isActive: true,
            workspaceId: workspace.id
          },
          include: { workspace: { select: { id: true, name: true, slug: true } } }
        })
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, 'EMAIL_TAKEN', 'An account with this email already exists. Try logging in instead.')
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppError(409, 'SIGNUP_RACE', 'Signup could not be completed. Please try again.')
      }
      throw error
    }

    return issueSession(user)
  },

  login: async (email: string, password: string) => {
    // Deliberately unscoped: login cannot know the workspace until the user is
    // found, so this must not go through the tenant-scoped repository. Email is
    // globally unique, so exactly one row can match.
    const user = await prismaSystem.user.findUnique({
      where: { email },
      include: { workspace: { select: { id: true, name: true, slug: true } } }
    })
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Email or password is incorrect.')
    }
    if (!user.isActive) throw new AppError(403, 'ACCOUNT_INACTIVE', 'This account is inactive.')
    await assertWorkspaceActive(user.workspaceId)
    return issueSession(user)
  },

  refresh: async (rawToken: string) => {
    const payload = verifyRefreshToken(rawToken)
    const presentedHash = hashToken(rawToken)
    const nextSession = buildRefreshSession(payload.sub)

    let result: User
    try {
      result = await prismaSystem.$transaction(async (tx) => {
        const current = await tx.refreshToken.findUnique({
          where: { id: payload.sid },
          include: {
            user: { include: { workspace: { select: { id: true, name: true, slug: true } } } }
          }
        })
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
      accessToken: signAccessToken(result.id, result.role, result.workspaceId),
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
  },
  updateProfile: (userId: string, input: { name: string }) =>
    userRepository.update(userId, { name: input.name })
}
