import { ActivityEventType, Role, TaskStatus, type ProjectStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { clientRepository } from '../repositories/client.repository'
import { projectRepository } from '../repositories/project.repository'
import { userRepository } from '../repositories/user.repository'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'
import { paginationMeta } from '../utils/pagination'
import { eventBus } from '../lib/events'

const resolveOwnerId = async (user: AuthUser, requestedOwnerId?: string): Promise<string> => {
  if (user.role === Role.PROJECT_MANAGER) return user.id
  if (user.role !== Role.ADMIN) throw new AppError(403, 'FORBIDDEN', 'Only admins and project managers can create projects.')
  if (!requestedOwnerId) throw new AppError(422, 'PROJECT_OWNER_REQUIRED', 'createdById is required when an admin creates a project.')
  const owner = await userRepository.findById(requestedOwnerId)
  if (!owner || !owner.isActive || owner.role !== Role.PROJECT_MANAGER) {
    throw new AppError(422, 'INVALID_PROJECT_OWNER', 'Project owner must be an active project manager.')
  }
  return owner.id
}

export const projectService = {
  list: async (input: { user: AuthUser; page: number; limit: number; status?: ProjectStatus; clientId?: string; search?: string }) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(input.user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Project access is limited to admins and project managers.')
    }
    const result = await projectRepository.list(input)
    // Enrich each project with a real completion percentage (done / total tasks).
    const ids = result.data.map((p) => p.id)
    let doneMap: Record<string, number> = {}
    if (ids.length) {
      const grouped = await prisma.task.groupBy({
        by: ['projectId'],
        where: { projectId: { in: ids }, status: TaskStatus.DONE },
        _count: { _all: true }
      })
      doneMap = Object.fromEntries(grouped.map((g) => [g.projectId, g._count._all]))
    }
    const data = result.data.map((p) => {
      const total = p._count?.tasks ?? 0
      const done = doneMap[p.id] ?? 0
      return { ...p, doneTasks: done, progress: total ? Math.round((done / total) * 100) : 0 }
    })
    return { data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },

  get: async (id: string, user: AuthUser) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Project access is limited to admins and project managers.')
    }
    const project = await projectRepository.findScopedById(id, user)
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found or is not accessible.')
    return project
  },

  create: async (user: AuthUser, input: { name: string; description?: string | null; clientId: string; status?: ProjectStatus; createdById?: string }) => {
    const ownerId = await resolveOwnerId(user, input.createdById)
    if (!(await clientRepository.findById(input.clientId))) throw new AppError(422, 'INVALID_CLIENT', 'Client does not exist.')

    const created = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name: input.name,
          description: input.description,
          clientId: input.clientId,
          createdById: ownerId,
          status: input.status
        },
        include: { client: true, createdBy: { select: { id: true, name: true, email: true, role: true } }, _count: { select: { tasks: true } } }
      })
      const activity = await tx.activityLog.create({
        data: { projectId: project.id, actorId: user.id, eventType: ActivityEventType.PROJECT_CREATED, message: `Project ${project.name} created` }
      })
      return { project, activity }
    })

    eventBus.emit('activityCreated', { activityId: created.activity.id, projectId: created.project.id, taskId: null, pmOwnerId: ownerId, developerId: null })
    return created.project
  },

  update: async (id: string, user: AuthUser, input: { name?: string; description?: string | null; clientId?: string; status?: ProjectStatus }) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Only admins and project managers can update projects.')
    }
    const existing = await projectRepository.findById(id)
    if (!existing) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    if (user.role !== Role.ADMIN && !(user.role === Role.PROJECT_MANAGER && existing.createdById === user.id)) {
      throw new AppError(403, 'FORBIDDEN', 'You do not have permission to update this project.')
    }
    if (input.clientId && !(await clientRepository.findById(input.clientId))) throw new AppError(422, 'INVALID_CLIENT', 'Client does not exist.')

    const result = await prisma.$transaction(async (tx) => {
      const project = await tx.project.update({
        where: { id },
        data: input,
        include: { client: true, createdBy: { select: { id: true, name: true, email: true, role: true } }, _count: { select: { tasks: true } } }
      })
      const activity = await tx.activityLog.create({
        data: { projectId: id, actorId: user.id, eventType: ActivityEventType.PROJECT_UPDATED, message: `Project ${project.name} updated` }
      })
      return { project, activity }
    })

    eventBus.emit('activityCreated', { activityId: result.activity.id, projectId: id, taskId: null, pmOwnerId: existing.createdById, developerId: null })
    return result.project
  },

  remove: async (id: string, user: AuthUser) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Only admins and project managers can delete projects.')
    }
    const project = await projectRepository.findById(id)
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    if (user.role === Role.PROJECT_MANAGER && project.createdById !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Project managers can only delete their own projects.')
    }
    return projectRepository.remove(id)
  },

  canJoinRoom: async (projectId: string, user: AuthUser): Promise<boolean> => {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdById: true } })
    if (!project) return false
    if (user.role === Role.ADMIN) return true
    if (user.role === Role.PROJECT_MANAGER) return project.createdById === user.id
    return (await prisma.task.count({ where: { projectId, assignedDeveloperId: user.id } })) > 0
  },

  ownerId: async (projectId: string): Promise<string> => {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { createdById: true } })
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    return project.createdById
  }
}
