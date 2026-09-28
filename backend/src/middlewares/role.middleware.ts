import type { RequestHandler } from 'express'
import { Role } from '@prisma/client'
import { AppError } from '../utils/app-error'

export const requireRole = (...roles: Role[]): RequestHandler => (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'))
  if (!roles.includes(req.user.role)) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'))
  }
  next()
}

/** Platform oversight only. SUPER_ADMIN belongs to no workspace. */
export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.'))
  if (req.user.role !== Role.SUPER_ADMIN) {
    return next(new AppError(403, 'FORBIDDEN', 'You do not have permission to access this resource.'))
  }
  next()
}

/**
 * Refuses SUPER_ADMIN on tenant data routes.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §5.4
 *
 * Without this, oversight would quietly become cross-tenant read access and
 * defeat the confidentiality guarantee the whole feature exists for. A
 * SUPER_ADMIN has no workspace, so its requests carry no tenant scope and the
 * query extension would throw anyway — but throwing is an internal error, not
 * an answer. This turns it into an explicit, documented 403.
 */
export const blockSuperAdmin: RequestHandler = (req, _res, next) => {
  if (req.user?.role === Role.SUPER_ADMIN) {
    return next(new AppError(
      403,
      'SUPER_ADMIN_SCOPE',
      'Platform administrators cannot read workspace data. Use the workspace endpoints.'
    ))
  }
  next()
}
