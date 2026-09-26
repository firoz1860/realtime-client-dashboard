import type { CookieOptions } from 'express'
import { env } from './env'

export const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: env.NODE_ENV === 'production',
  sameSite: env.COOKIE_SAME_SITE,
  path: '/api/auth'
})
