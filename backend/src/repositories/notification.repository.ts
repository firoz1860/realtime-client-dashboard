import { prisma } from '../lib/prisma'

export const notificationRepository = {
  findOwnedById: (id: string, recipientId: string) => prisma.notification.findFirst({
    where: { id, recipientId },
    include: {
      actor: { select: { id: true, name: true } },
      task: { select: { id: true, title: true } },
      project: { select: { id: true, name: true } }
    }
  }),
  list: async (input: { recipientId: string; page: number; limit: number; isRead?: boolean }) => {
    const where = { recipientId: input.recipientId, ...(input.isRead === undefined ? {} : { isRead: input.isRead }) }
    const [data, total] = await prisma.$transaction([
      prisma.notification.findMany({
        where,
        include: { actor: { select: { id: true, name: true } }, task: { select: { id: true, title: true } }, project: { select: { id: true, name: true } } },
        orderBy: { createdAt: 'desc' },
        skip: (input.page - 1) * input.limit,
        take: input.limit
      }),
      prisma.notification.count({ where })
    ])
    return { data, total }
  },
  unreadCount: (recipientId: string) => prisma.notification.count({ where: { recipientId, isRead: false } }),
  markRead: (id: string, recipientId: string) => prisma.notification.updateMany({ where: { id, recipientId, isRead: false }, data: { isRead: true, readAt: new Date() } }),
  markAllRead: (recipientId: string) => prisma.notification.updateMany({ where: { recipientId, isRead: false }, data: { isRead: true, readAt: new Date() } })
}
