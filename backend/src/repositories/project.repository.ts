import { Prisma, Role, type ProjectStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthUser } from '../types/auth'

const includeProject = {
  client: true,
  createdBy: { select: { id: true, name: true, email: true, role: true } },
  _count: { select: { tasks: true } }
} satisfies Prisma.ProjectInclude

export const projectScope = (user: AuthUser): Prisma.ProjectWhereInput => {
  if (user.role === Role.ADMIN) return {}
  if (user.role === Role.PROJECT_MANAGER) return { createdById: user.id }
  return { tasks: { some: { assignedDeveloperId: user.id } } }
}

export const projectRepository = {
  findById: (id: string) => prisma.project.findUnique({ where: { id }, include: includeProject }),
  findScopedById: (id: string, user: AuthUser) => prisma.project.findFirst({ where: { id, ...projectScope(user) }, include: includeProject }),
  create: (data: Prisma.ProjectCreateInput) => prisma.project.create({ data, include: includeProject }),
  update: (id: string, data: Prisma.ProjectUpdateInput) => prisma.project.update({ where: { id }, data, include: includeProject }),
  remove: (id: string) => prisma.project.delete({ where: { id } }),
  list: async (input: {
    user: AuthUser
    page: number
    limit: number
    status?: ProjectStatus
    clientId?: string
    search?: string
  }) => {
    const where: Prisma.ProjectWhereInput = {
      ...projectScope(input.user),
      ...(input.status ? { status: input.status } : {}),
      ...(input.clientId ? { clientId: input.clientId } : {}),
      ...(input.search ? { name: { contains: input.search, mode: 'insensitive' } } : {})
    }
    const [data, total] = await prisma.$transaction([
      prisma.project.findMany({ where, include: includeProject, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
      prisma.project.count({ where })
    ])
    return { data, total }
  }
}
