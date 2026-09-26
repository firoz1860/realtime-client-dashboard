import { Prisma, Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthUser } from '../types/auth'

export const activityInclude = {
  actor: { select: { id: true, name: true } },
  task: { select: { id: true, title: true } },
  project: { select: { id: true, name: true } }
} satisfies Prisma.ActivityLogInclude

export const activityScope = (user: AuthUser): Prisma.ActivityLogWhereInput => {
  if (user.role === Role.ADMIN) return {}
  if (user.role === Role.PROJECT_MANAGER) return { project: { createdById: user.id } }
  return { task: { assignedDeveloperId: user.id } }
}

export const activityRepository = {
  findById: (id: string) => prisma.activityLog.findUnique({ where: { id }, include: activityInclude }),
  list: async (input: { user: AuthUser; page: number; limit: number; projectId?: string; taskId?: string }) => {
    const where: Prisma.ActivityLogWhereInput = {
      ...activityScope(input.user),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {})
    }
    const [data, total] = await prisma.$transaction([
      prisma.activityLog.findMany({ where, include: activityInclude, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
      prisma.activityLog.count({ where })
    ])
    return { data, total }
  },
  recent: (user: AuthUser, limit: number) => prisma.activityLog.findMany({
    where: activityScope(user),
    include: activityInclude,
    orderBy: { createdAt: 'desc' },
    take: limit
  })
}
