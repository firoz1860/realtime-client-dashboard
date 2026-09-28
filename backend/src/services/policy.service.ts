import { Role } from '@prisma/client'
import { currentWorkspaceId } from '../lib/tenant-context'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'

/**
 * Asserts a record reached through a caller-supplied id belongs to the current
 * workspace.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §4.4
 *
 * The query extension already filters reads by workspace, so every lookup that
 * goes through `lib/prisma` returns null for a foreign id and the caller's own
 * validation rejects it. This guard is therefore defence in depth rather than
 * the primary control: it converts an implicit guarantee into an explicit,
 * testable one, and it fires loudly if a lookup is ever switched to
 * `prismaSystem`, which would silently reopen cross-workspace writes.
 *
 * Throws 404 rather than 403 deliberately: a 403 confirms the record exists
 * somewhere on the platform, which is itself a cross-tenant disclosure.
 */
export const assertSameWorkspace = (
  entity: { workspaceId: string | null } | null | undefined,
  code: string,
  message: string
): void => {
  const workspaceId = currentWorkspaceId()
  if (!entity || !workspaceId || entity.workspaceId !== workspaceId) {
    throw new AppError(404, code, message)
  }
}

export const assertProjectManageAccess = (user: AuthUser, project: { createdById: string }): void => {
  if (user.role === Role.ADMIN) return
  if (user.role === Role.PROJECT_MANAGER && project.createdById === user.id) return
  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to manage this project.')
}

export const assertTaskAccess = (
  user: AuthUser,
  task: { assignedDeveloperId: string | null; project: { createdById: string } }
): void => {
  if (user.role === Role.ADMIN) return
  if (user.role === Role.PROJECT_MANAGER && task.project.createdById === user.id) return
  if (user.role === Role.DEVELOPER && task.assignedDeveloperId === user.id) return
  throw new AppError(403, 'FORBIDDEN', 'You do not have permission to access this task.')
}
