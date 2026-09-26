import { Prisma } from '@prisma/client'
import { prisma } from '../lib/prisma'

export const messageInclude = {
  sender: { select: { id: true, name: true, role: true } }
} satisfies Prisma.MessageInclude

export const messageRepository = {
  findById: (id: string) => prisma.message.findUnique({ where: { id }, include: messageInclude }),

  list: async (input: { projectId: string; page: number; limit: number }) => {
    const where: Prisma.MessageWhereInput = { projectId: input.projectId }
    const [data, total] = await prisma.$transaction([
      prisma.message.findMany({
        where,
        include: messageInclude,
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit
      }),
      prisma.message.count({ where })
    ])
    // Return in chronological order (oldest first) for a chat transcript.
    return { data: data.reverse(), total }
  },

  create: (data: { projectId: string; senderId: string; body: string }) =>
    prisma.message.create({ data, include: messageInclude })
}
