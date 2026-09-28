import type { Role } from '@prisma/client'

export type AuthUser = {
  id: string
  email: string
  role: Role
  isActive: boolean
  /** Null only for SUPER_ADMIN, which belongs to no workspace. */
  workspaceId: string | null
}

export type AccessTokenPayload = {
  sub: string
  type: 'access'
  role: Role
  /** Workspace claim. Absent on SUPER_ADMIN tokens and on tokens issued before
   *  multi-tenancy, which requireAuth rejects with 401 so the client refreshes. */
  ws: string | null
}

export type RefreshTokenPayload = {
  sub: string
  sid: string
  type: 'refresh'
}
