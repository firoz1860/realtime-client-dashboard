import { Prisma, Role, TaskPriority, TaskStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthUser } from '../types/auth'

export const taskInclude = {
  project: { select: { id: true, name: true, createdById: true } },
  assignedDeveloper: { select: { id: true, name: true, email: true, isActive: true } }
} satisfies Prisma.TaskInclude

export const taskScope = (user: AuthUser): Prisma.TaskWhereInput => {
  if (user.role === Role.ADMIN) return {}
  if (user.role === Role.PROJECT_MANAGER) return { project: { createdById: user.id } }
  return { assignedDeveloperId: user.id }
}

export const taskRepository = {
  findById: (id: string) => prisma.task.findUnique({ where: { id }, include: taskInclude }),
  findScopedById: (id: string, user: AuthUser) => prisma.task.findFirst({ where: { id, ...taskScope(user) }, include: taskInclude }),
  list: async (input: {
    user: AuthUser
    page: number
    limit: number
    status?: TaskStatus
    priority?: TaskPriority
    dueDateFrom?: Date
    dueDateTo?: Date
    projectId?: string
    assignedDeveloperId?: string
  }) => {
    const where: Prisma.TaskWhereInput = {
      ...taskScope(input.user),
      ...(input.status ? { status: input.status } : {}),
      ...(input.priority ? { priority: input.priority } : {}),
      ...(input.projectId ? { projectId: input.projectId } : {}),
      ...(input.assignedDeveloperId ? { assignedDeveloperId: input.assignedDeveloperId } : {}),
      ...(input.dueDateFrom || input.dueDateTo
        ? { dueDate: { ...(input.dueDateFrom ? { gte: input.dueDateFrom } : {}), ...(input.dueDateTo ? { lte: input.dueDateTo } : {}) } }
        : {})
    }
    const [data, total] = await prisma.$transaction([
      prisma.task.findMany({ where, include: taskInclude, orderBy: [{ dueDate: 'asc' }, { createdAt: 'desc' }], skip: (input.page - 1) * input.limit, take: input.limit }),
      prisma.task.count({ where })
    ])
    return { data, total }
  }
}
