import 'dotenv/config'
import { z } from 'zod'

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_ACCESS_SECRET: z.string().min(32),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_ISSUER: z.string().min(1).default('realtime-client-dashboard'),
  JWT_AUDIENCE: z.string().min(1).default('realtime-client-dashboard-web'),
  ACCESS_TOKEN_EXPIRES_IN: z.string().default('15m'),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),
  CLIENT_URL: z.string().url().default('http://localhost:3000'),
  CORS_ORIGIN: z.string().url().optional(),
  SOCKET_CORS_ORIGIN: z.string().url().optional(),
  COOKIE_NAME: z.string().min(1).default('refreshToken'),
  COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  CRON_TIMEZONE: z.string().default('UTC'),
  OVERDUE_CRON: z.string().default('*/5 * * * *'),
  LOG_LEVEL: z.string().default('info'),
  // Public self-service signup. New accounts get SIGNUP_DEFAULT_ROLE; the very
  // first account in an empty database becomes ADMIN so a fresh deploy can be
  // bootstrapped without shell access.
  ALLOW_PUBLIC_SIGNUP: z.enum(['true', 'false']).default('true').transform((value) => value === 'true'),
  SIGNUP_DEFAULT_ROLE: z.enum(['DEVELOPER', 'PROJECT_MANAGER']).default('DEVELOPER')
})

const parsed = envSchema.safeParse(process.env)
if (!parsed.success) {
  const problems = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ')
  throw new Error(`Invalid environment configuration: ${problems}`)
}

if (parsed.data.JWT_ACCESS_SECRET === parsed.data.JWT_REFRESH_SECRET) {
  throw new Error('Invalid environment configuration: JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different.')
}

const corsOrigin = parsed.data.CORS_ORIGIN ?? parsed.data.CLIENT_URL
const socketCorsOrigin = parsed.data.SOCKET_CORS_ORIGIN ?? corsOrigin
if (socketCorsOrigin !== corsOrigin) {
  throw new Error('Invalid environment configuration: SOCKET_CORS_ORIGIN must match CORS_ORIGIN.')
}

export const env = {
  ...parsed.data,
  CORS_ORIGIN: corsOrigin,
  SOCKET_CORS_ORIGIN: socketCorsOrigin
}
