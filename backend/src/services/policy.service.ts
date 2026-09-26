import { Role } from '@prisma/client'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'

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
