import { Role, WorkspaceStatus } from '@prisma/client'
import type { RequestHandler } from 'express'
import { prismaSystem } from '../lib/prisma-system'
import { runInTenant } from '../lib/tenant-context'
import { AppError } from '../utils/app-error'
import { verifyAccessToken } from '../utils/jwt'

/**
 * Authenticates the caller and opens their tenant scope.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §5.1
 *
 * The workspace comes from the token's `ws` claim, not a database lookup, which
 * resolves a chicken-and-egg problem: loading the user is itself a tenant-scoped
 * query. Reading the claim first lets the scope exist before the user is read —
 * and because that read is then filtered by the workspace, a forged or stale
 * claim simply yields no row and a clean 401.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  try {
    const authorization = req.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    }

    const payload = verifyAccessToken(authorization.slice(7))

    if (payload.role === Role.SUPER_ADMIN) {
      const superAdmin = await prismaSystem.user.findFirst({
        where: { id: payload.sub, role: Role.SUPER_ADMIN, isActive: true },
        select: { id: true, email: true, role: true, isActive: true, workspaceId: true }
      })
      if (!superAdmin) {
        throw new AppError(401, 'ACCOUNT_INACTIVE', 'User account is unavailable or inactive.')
      }
      req.user = superAdmin
      next()
      return
    }

    // Tokens minted before multi-tenancy carry no workspace. 401 (not 403) is
    // required: the frontend's single-flight refresh only triggers on 401, so a
    // 401 lets an existing session recover silently instead of surfacing an
    // error the user cannot act on.
    if (!payload.ws) {
      throw new AppError(
        401,
        'TOKEN_MISSING_WORKSPACE',
        'Session predates workspaces. Refreshing the session will reissue it.'
      )
    }

    const workspace = await prismaSystem.workspace.findUnique({
      where: { id: payload.ws },
      select: { status: true }
    })
    if (!workspace) {
      throw new AppError(401, 'INVALID_ACCESS_TOKEN', 'Access token is invalid.')
    }
    if (workspace.status === WorkspaceStatus.SUSPENDED) {
      throw new AppError(403, 'WORKSPACE_SUSPENDED', 'This workspace is suspended. Contact your administrator.')
    }

    const workspaceId = payload.ws

    await runInTenant({ workspaceId }, async () => {
      // Scoped read: proves the user really belongs to the workspace they claim.
      const user = await prismaSystem.user.findFirst({
        where: { id: payload.sub, workspaceId },
        select: { id: true, email: true, role: true, isActive: true, workspaceId: true }
      })
      if (!user || !user.isActive) {
        throw new AppError(401, 'ACCOUNT_INACTIVE', 'User account is unavailable or inactive.')
      }
      req.user = user
      next()
    })
  } catch (error) {
    next(error)
  }
}
