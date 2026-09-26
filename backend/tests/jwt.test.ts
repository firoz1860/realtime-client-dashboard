import { Role } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import jwt from 'jsonwebtoken'
import { env } from '../src/config/env'
import { signAccessToken, signRefreshToken, verifyAccessToken, verifyRefreshToken } from '../src/utils/jwt'

describe('JWT strategy', () => {
  it('signs and verifies access token type and role', () => {
    const token = signAccessToken('00000000-0000-0000-0000-000000000001', Role.ADMIN)
    const payload = verifyAccessToken(token)
    expect(payload.type).toBe('access')
    expect(payload.role).toBe(Role.ADMIN)
  })

  it('rejects an expired access token with a specific auth error', () => {
    const token = jwt.sign(
      { role: Role.ADMIN, type: 'access' },
      env.JWT_ACCESS_SECRET,
      { subject: '00000000-0000-0000-0000-000000000001', expiresIn: -1, issuer: env.JWT_ISSUER, audience: env.JWT_AUDIENCE, algorithm: 'HS256' }
    )
    let caught: unknown
    try {
      verifyAccessToken(token)
    } catch (error) {
      caught = error
    }
    expect(caught).toMatchObject({ code: 'ACCESS_TOKEN_EXPIRED', statusCode: 401 })
  })

  it('signs and verifies refresh token session id', () => {
    const token = signRefreshToken('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000002')
    const payload = verifyRefreshToken(token)
    expect(payload.type).toBe('refresh')
    expect(payload.sid).toBe('00000000-0000-0000-0000-000000000002')
  })
})
