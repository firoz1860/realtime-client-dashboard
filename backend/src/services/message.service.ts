import { eventBus } from '../lib/events'
import { requireWorkspaceId } from '../lib/tenant-context'
import { messageRepository } from '../repositories/message.repository'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'
import { paginationMeta } from '../utils/pagination'
import { projectService } from './project.service'

/**
 * Project chat. Access is identical to the realtime room policy:
 * admins see every project, PMs their own projects, developers projects
 * they are assigned tasks on. This is enforced server-side on every call.
 */
const assertAccess = async (projectId: string, user: AuthUser): Promise<void> => {
  const allowed = await projectService.canJoinRoom(projectId, user)
  if (!allowed) throw new AppError(403, 'FORBIDDEN', 'You do not have access to this project chat.')
}

export const messageService = {
  list: async (projectId: string, user: AuthUser, input: { page: number; limit: number }) => {
    await assertAccess(projectId, user)
    const result = await messageRepository.list({ projectId, ...input })
    return { data: result.data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },

  create: async (projectId: string, user: AuthUser, body: string) => {
    await assertAccess(projectId, user)
    const message = await messageRepository.create({ projectId, senderId: user.id, body })
    eventBus.emit('messageCreated', { workspaceId: requireWorkspaceId(), messageId: message.id, projectId })
    return message
  },

  getEvent: (id: string) => messageRepository.findById(id)
}
