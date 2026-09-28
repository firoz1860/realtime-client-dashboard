import { WorkspaceStatus } from '@prisma/client'
import { z } from 'zod'

export const updateWorkspaceBodySchema = z.strictObject({
  status: z.nativeEnum(WorkspaceStatus)
})

/**
 * Deleting a workspace cascades every tenant row, so the caller echoes the
 * workspace slug back. An id alone is too easy to paste from a list.
 */
export const deleteWorkspaceBodySchema = z.strictObject({
  confirm: z.string().trim().min(1, 'Confirm with the workspace slug.')
})
