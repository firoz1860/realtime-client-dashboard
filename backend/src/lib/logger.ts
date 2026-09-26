import pino from 'pino'
import { env } from '../config/env'

export const logger = pino({
  level: env.LOG_LEVEL,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'passwordHash',
      'accessToken',
      'refreshToken',
      '*.password',
      '*.passwordHash',
      '*.accessToken',
      '*.refreshToken'
    ],
    censor: '[REDACTED]'
  }
})
