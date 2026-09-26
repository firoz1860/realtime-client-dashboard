import cron, { type ScheduledTask } from 'node-cron'
import { TaskStatus } from '@prisma/client'
import { env } from '../config/env'
import { logger } from '../lib/logger'
import { prisma } from '../lib/prisma'
import { refreshTokenRepository } from '../repositories/refresh-token.repository'

export const runOverdueSweep = async (): Promise<number> => {
  const result = await prisma.task.updateMany({
    where: { dueDate: { lt: new Date() }, status: { not: TaskStatus.DONE }, isOverdue: false },
    data: { isOverdue: true }
  })
  await refreshTokenRepository.deleteExpired()
  return result.count
}

export const startSchedulers = (): ScheduledTask => cron.schedule(
  env.OVERDUE_CRON,
  () => {
    void runOverdueSweep()
      .then((count) => logger.info({ count }, 'Overdue task sweep completed'))
      .catch((error: unknown) => logger.error({ err: error }, 'Overdue task sweep failed'))
  },
  { timezone: env.CRON_TIMEZONE }
)
