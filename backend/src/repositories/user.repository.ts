import { Prisma, Role } from '@prisma/client'
import { prisma } from '../lib/prisma'

const safeSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  workspaceId: true,
  // The company this account belongs to. The dashboard shows its name, which
  // was previously a hardcoded string with no model behind it.
  workspace: { select: { id: true, name: true, slug: true } }
} satisfies Prisma.UserSelect

export const userRepository = {
  findById: (id: string) => prisma.user.findUnique({ where: { id } }),
  findSafeById: (id: string) => prisma.user.findUnique({ where: { id }, select: safeSelect }),
  create: (data: Prisma.UserCreateInput) => prisma.user.create({ data, select: safeSelect }),
  update: (id: string, data: Prisma.UserUpdateInput) => prisma.user.update({ where: { id }, data, select: safeSelect }),
  list: async (input: { page: number; limit: number; role?: Role; isActive?: boolean; search?: string }) => {
    const where: Prisma.UserWhereInput = {
      ...(input.role ? { role: input.role } : {}),
      ...(input.isActive === undefined ? {} : { isActive: input.isActive }),
      ...(input.search
        ? { OR: [{ name: { contains: input.search, mode: 'insensitive' } }, { email: { contains: input.search, mode: 'insensitive' } }] }
        : {})
    }
    const [data, total] = await prisma.$transaction([
      prisma.user.findMany({ where, select: safeSelect, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
      prisma.user.count({ where })
    ])
    return { data, total }
  },
  findActiveDeveloper: (id: string) => prisma.user.findFirst({ where: { id, role: Role.DEVELOPER, isActive: true } }),
  listActiveDevelopers: () => prisma.user.findMany({
    where: { role: Role.DEVELOPER, isActive: true },
    select: { id: true, name: true, email: true, role: true, isActive: true },
    orderBy: { name: 'asc' }
  }),
  countOwnedProjects: (id: string) => prisma.project.count({ where: { createdById: id } }),
  countAssignedTasks: (id: string) => prisma.task.count({ where: { assignedDeveloperId: id } })
}
