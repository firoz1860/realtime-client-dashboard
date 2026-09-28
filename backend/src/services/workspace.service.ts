import { WorkspaceStatus } from '@prisma/client'
import { prismaSystem } from '../lib/prisma-system'
import { AppError } from '../utils/app-error'

/**
 * Platform oversight for SUPER_ADMIN.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §5.4
 *
 * This is the one service that legitimately reads across workspaces, so it is on
 * the `prismaSystem` allowlist (§4.2.1). It returns **metadata and aggregate
 * counts only** — never a project name, task title, client detail or message
 * body. Oversight that could read tenant content would defeat the
 * confidentiality the feature exists to provide.
 */
export interface WorkspaceSummary {
  id: string
  name: string
  slug: string
  status: WorkspaceStatus
  memberCount: number
  projectCount: number
  createdAt: Date
}

const summarySelect = {
  id: true,
  name: true,
  slug: true,
  status: true,
  createdAt: true,
  _count: { select: { users: true, projects: true } }
} as const

type SummaryRow = {
  id: string
  name: string
  slug: string
  status: WorkspaceStatus
  createdAt: Date
  _count: { users: number; projects: number }
}

const toSummary = (row: SummaryRow): WorkspaceSummary => ({
  id: row.id,
  name: row.name,
  slug: row.slug,
  status: row.status,
  memberCount: row._count.users,
  projectCount: row._count.projects,
  createdAt: row.createdAt
})

export const workspaceService = {
  list: async (): Promise<WorkspaceSummary[]> => {
    const rows = await prismaSystem.workspace.findMany({
      orderBy: { createdAt: 'desc' },
      select: summarySelect
    })
    return rows.map(toSummary)
  },

  setStatus: async (id: string, status: WorkspaceStatus): Promise<WorkspaceSummary> => {
    const existing = await prismaSystem.workspace.findUnique({ where: { id }, select: { id: true } })
    if (!existing) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace was not found.')

    const updated = await prismaSystem.workspace.update({
      where: { id },
      data: { status },
      select: summarySelect
    })
    return toSummary(updated)
  },

  /**
   * Permanent deletion. Every tenant row cascades, so the caller must echo the
   * workspace's slug back to prove intent — an id alone is too easy to paste
   * from a list.
   */
  remove: async (id: string, confirm: string): Promise<{ deleted: true }> => {
    const workspace = await prismaSystem.workspace.findUnique({
      where: { id },
      select: { slug: true }
    })
    if (!workspace) throw new AppError(404, 'WORKSPACE_NOT_FOUND', 'Workspace was not found.')
    if (workspace.slug !== confirm) {
      throw new AppError(
        422,
        'WORKSPACE_CONFIRM_MISMATCH',
        'Confirmation does not match the workspace slug. Deletion was not performed.'
      )
    }
    await prismaSystem.workspace.delete({ where: { id } })
    return { deleted: true }
  }
}
