import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export const clientRepository = {
  findById: (id: string) => prisma.client.findUnique({ where: { id } }),
  create: (data: Prisma.ClientCreateInput) => prisma.client.create({ data }),
  update: (id: string, data: Prisma.ClientUpdateInput) => prisma.client.update({ where: { id }, data }),
  remove: (id: string) => prisma.client.delete({ where: { id } }),
  list: async (input: { page: number; limit: number; search?: string }) => {
    const where: Prisma.ClientWhereInput = input.search
      ? { OR: [
          { name: { contains: input.search, mode: 'insensitive' } },
          { email: { contains: input.search, mode: 'insensitive' } },
          { company: { contains: input.search, mode: 'insensitive' } }
        ] }
      : {}
    const [data, total] = await prisma.$transaction([
      prisma.client.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (input.page - 1) * input.limit, take: input.limit }),
      prisma.client.count({ where })
    ])
    return { data, total }
  }
}
