import { prisma } from '../lib/prisma'

export const healthService = {
  check: async () => {
    await prisma.user.count()
    return { status: 'ok' as const }
  }
}
