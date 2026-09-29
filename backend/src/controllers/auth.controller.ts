import type { Request, Response } from 'express'
import { env } from '../config/env'
import { refreshCookieOptions } from '../config/cookie'
import { authService } from '../services/auth.service'
import { AppError } from '../utils/app-error'
import { durationToMs } from '../utils/duration'

const setRefreshCookie = (res: Response, token: string): void => {
  res.cookie(env.COOKIE_NAME, token, { ...refreshCookieOptions(), maxAge: durationToMs(env.REFRESH_TOKEN_EXPIRES_IN) })
}

export const authController = {
  config: async (_req: Request, res: Response) => {
    res.json({ success: true, data: { signupEnabled: env.ALLOW_PUBLIC_SIGNUP } })
  },
  register: async (req: Request, res: Response) => {
    const body = req.body as { name: string; email: string; password: string; companyName: string }
    const result = await authService.register(body)
    setRefreshCookie(res, result.refreshToken)
    res.status(201).json({ success: true, data: { accessToken: result.accessToken, user: result.user } })
  },
  login: async (req: Request, res: Response) => {
    const body = req.body as { workspaceSlug: string; email: string; password: string }
    const result = await authService.login(body.workspaceSlug, body.email, body.password)
    setRefreshCookie(res, result.refreshToken)
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } })
  },
  refresh: async (req: Request, res: Response) => {
    const rawToken = req.cookies[env.COOKIE_NAME] as string | undefined
    if (!rawToken) throw new AppError(401, 'REFRESH_COOKIE_MISSING', 'Refresh cookie is missing.')
    const result = await authService.refresh(rawToken)
    setRefreshCookie(res, result.refreshToken)
    res.json({ success: true, data: { accessToken: result.accessToken, user: result.user } })
  },
  logout: async (req: Request, res: Response) => {
    const rawToken = req.cookies[env.COOKIE_NAME] as string | undefined
    await authService.logout(rawToken)
    res.clearCookie(env.COOKIE_NAME, refreshCookieOptions())
    res.json({ success: true, data: { loggedOut: true } })
  },
  me: async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    res.json({ success: true, data: await authService.me(req.user.id) })
  },
  updateProfile: async (req: Request, res: Response) => {
    if (!req.user) throw new AppError(401, 'AUTH_REQUIRED', 'Authentication is required.')
    res.json({ success: true, data: await authService.updateProfile(req.user.id, req.body as { name: string }) })
  }
}
