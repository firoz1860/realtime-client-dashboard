import type { User } from '@prisma/client'

export interface PublicWorkspace {
  id: string
  name: string
  slug: string
}

/**
 * The user shape returned to clients. Never includes passwordHash.
 *
 * `workspace` is optional because SUPER_ADMIN belongs to none, and because the
 * login/refresh paths load it explicitly while other callers may not need it.
 */
export const publicUser = (user: User & { workspace?: PublicWorkspace | null }) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  role: user.role,
  isActive: user.isActive,
  workspaceId: user.workspaceId,
  workspace: user.workspace
    ? { id: user.workspace.id, name: user.workspace.name, slug: user.workspace.slug }
    : null,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt
})
