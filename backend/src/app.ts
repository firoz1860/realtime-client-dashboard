import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import pinoHttp from 'pino-http'
import swaggerUi from 'swagger-ui-express'
import { env } from './config/env'
import { logger } from './lib/logger'
import { openApiDocument } from './lib/openapi'
import { errorHandler } from './middlewares/error.middleware'
import { notFound } from './middlewares/not-found.middleware'
import { apiRateLimit } from './middlewares/rate-limit.middleware'
import { healthRoutes } from './routes/health.routes'
import { apiRouter } from './routes'

export const createApp = () => {
  const app = express()
  if (env.NODE_ENV === 'production') app.set('trust proxy', 1)

  app.use(helmet())
  app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }))
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.use(pinoHttp({ logger }))
  app.use(apiRateLimit)

  app.use('/health', healthRoutes)
  app.use('/api', apiRouter)
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument))

  app.use(notFound)
  app.use(errorHandler)
  return app
}

export const app = createApp()
