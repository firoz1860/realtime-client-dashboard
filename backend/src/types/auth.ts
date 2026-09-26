import type { Role } from '@prisma/client'

export type AuthUser = {
  id: string
  email: string
  role: Role
  isActive: boolean
}

export type AccessTokenPayload = {
  sub: string
  type: 'access'
  role: Role
}

export type RefreshTokenPayload = {
  sub: string
  sid: string
  type: 'refresh'
}
