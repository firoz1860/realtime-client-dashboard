import { createServer } from 'node:http'
import { app } from './app'
import { env } from './config/env'
import { startSchedulers } from './jobs/overdue.job'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { closeSocket, initializeSocket } from './sockets/socket'

const httpServer = createServer(app)
initializeSocket(httpServer)
const scheduler = startSchedulers()

let shuttingDown = false

const shutdown = async (signal: string): Promise<void> => {
  if (shuttingDown) return
  shuttingDown = true
  logger.info({ signal }, 'Graceful shutdown started')
  scheduler.stop()
  await closeSocket()
  await new Promise<void>((resolve) => httpServer.close(() => resolve()))
  await prisma.$disconnect()
  logger.info('Graceful shutdown completed')
}

const handleSignal = (signal: string): void => {
  void shutdown(signal)
    .then(() => process.exit(0))
    .catch((error: unknown) => {
      logger.error({ err: error, signal }, 'Graceful shutdown failed')
      process.exit(1)
    })
}

process.on('SIGTERM', () => handleSignal('SIGTERM'))
process.on('SIGINT', () => handleSignal('SIGINT'))

httpServer.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, 'API server listening')
})
