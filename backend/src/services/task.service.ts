import { ActivityEventType, NotificationType, Prisma, Role, TaskPriority, TaskStatus } from '@prisma/client'
import { eventBus } from '../lib/events'
import { prisma } from '../lib/prisma'
import { requireWorkspaceId } from '../lib/tenant-context'
import { projectRepository } from '../repositories/project.repository'
import { taskInclude, taskRepository } from '../repositories/task.repository'
import { userRepository } from '../repositories/user.repository'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'
import { paginationMeta } from '../utils/pagination'
import { assertTaskAccess, assertSameWorkspace } from './policy.service'

export type TaskFilters = {
  page: number
  limit: number
  search?: string
  status?: TaskStatus
  priority?: TaskPriority
  dueDateFrom?: Date
  dueDateTo?: Date
  projectId?: string
  assignedDeveloperId?: string
}

export type TaskMutation = {
  title?: string
  description?: string | null
  assignedDeveloperId?: string | null
  status?: TaskStatus
  priority?: TaskPriority
  dueDate?: Date | null
  version?: number
}

type TaskWithRelations = Prisma.TaskGetPayload<{ include: typeof taskInclude }>

const taskForResponse = (task: TaskWithRelations, user: AuthUser) => {
  if (user.role !== Role.DEVELOPER) return task
  return {
    ...task,
    project: { id: task.project.id, name: task.project.name },
    assignedDeveloper: task.assignedDeveloper
      ? { id: task.assignedDeveloper.id, name: task.assignedDeveloper.name }
      : null
  }
}

const validateDeveloper = async (developerId: string | null | undefined): Promise<void> => {
  if (!developerId) return
  const developer = await userRepository.findActiveDeveloper(developerId)
  if (!developer) {
    throw new AppError(422, 'INVALID_DEVELOPER', 'Assigned developer must be an active developer account.')
  }
  assertSameWorkspace(developer, 'INVALID_DEVELOPER', 'Assigned developer must be an active developer account.')
}

/**
 * The transaction client handed to `prisma.$transaction`. Derived from the
 * extended client rather than written as `Prisma.TransactionClient`, because the
 * tenant extension changes that type — and deriving it keeps tenant filtering
 * active inside transactions instead of widening it away.
 */
type TenantTransactionClient = Parameters<Parameters<typeof prisma.$transaction>[0]>[0]

const validateDeveloperInTransaction = async (
  tx: TenantTransactionClient,
  developerId: string | null | undefined
): Promise<void> => {
  if (!developerId) return
  const developer = await tx.user.findFirst({
    where: { id: developerId, role: Role.DEVELOPER, isActive: true },
    select: { id: true, workspaceId: true }
  })
  if (!developer) {
    throw new AppError(422, 'INVALID_DEVELOPER', 'Assigned developer must be an active developer account.')
  }
  assertSameWorkspace(developer, 'INVALID_DEVELOPER', 'Assigned developer must be an active developer account.')
}

export const taskService = {
  list: async (user: AuthUser, filters: TaskFilters) => {
    if (user.role === Role.DEVELOPER && filters.assignedDeveloperId && filters.assignedDeveloperId !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Developers can only query their own assigned tasks.')
    }
    const result = await taskRepository.list({ user, ...filters })
    return {
      data: result.data.map((task) => taskForResponse(task, user)),
      pagination: paginationMeta(filters.page, filters.limit, result.total)
    }
  },

  listForProject: async (projectId: string, user: AuthUser, filters: TaskFilters) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Project task listing is limited to admins and project managers.')
    }
    const project = await projectRepository.findById(projectId)
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    if (user.role === Role.PROJECT_MANAGER && project.createdById !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Project managers can only access tasks in their own projects.')
    }
    const result = await taskRepository.list({ user, ...filters, projectId })
    return {
      data: result.data.map((task) => taskForResponse(task, user)),
      pagination: paginationMeta(filters.page, filters.limit, result.total)
    }
  },

  get: async (id: string, user: AuthUser) => {
    const task = await taskRepository.findScopedById(id, user)
    if (!task) throw new AppError(404, 'TASK_NOT_FOUND', 'Task was not found or is not accessible.')
    return taskForResponse(task, user)
  },

  create: async (projectId: string, user: AuthUser, input: {
    title: string
    description?: string | null
    assignedDeveloperId?: string | null
    status?: TaskStatus
    priority?: TaskPriority
    dueDate?: Date | null
  }) => {
    if (!([Role.ADMIN, Role.PROJECT_MANAGER] as Role[]).includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Only admins and project managers can create tasks.')
    }
    const project = await projectRepository.findById(projectId)
    if (!project) throw new AppError(404, 'PROJECT_NOT_FOUND', 'Project was not found.')
    if (user.role === Role.PROJECT_MANAGER && project.createdById !== user.id) {
      throw new AppError(403, 'FORBIDDEN', 'Project managers can only create tasks in their own projects.')
    }
    await validateDeveloper(input.assignedDeveloperId)

    const result = await prisma.$transaction(async (tx) => {
      const task = await tx.task.create({
        data: {
          workspaceId: requireWorkspaceId(),
          projectId,
          title: input.title,
          description: input.description,
          assignedDeveloperId: input.assignedDeveloperId,
          status: input.status,
          priority: input.priority,
          dueDate: input.dueDate,
          isOverdue: Boolean(input.dueDate && input.dueDate < new Date() && input.status !== TaskStatus.DONE)
        },
        include: taskInclude
      })
      const activity = await tx.activityLog.create({
        data: {
          workspaceId: requireWorkspaceId(),
          taskId: task.id,
          projectId,
          actorId: user.id,
          eventType: ActivityEventType.TASK_CREATED,
          toStatus: task.status,
          message: `Task ${task.title} created`
        }
      })
      const notifications: Array<{ id: string; recipientId: string }> = []
      if (task.assignedDeveloperId) {
        const notification = await tx.notification.create({
          data: {
            workspaceId: requireWorkspaceId(),
            recipientId: task.assignedDeveloperId,
            actorId: user.id,
            taskId: task.id,
            projectId,
            type: NotificationType.TASK_ASSIGNED,
            message: `You were assigned to ${task.title}`
          }
        })
        notifications.push({ id: notification.id, recipientId: notification.recipientId })
      }
      return { task, activity, notifications }
    })

    eventBus.emit('activityCreated', {
      activityId: result.activity.id,
      projectId,
      taskId: result.task.id,
      pmOwnerId: project.createdById,
      developerId: result.task.assignedDeveloperId
    })
    for (const notification of result.notifications) {
      eventBus.emit('notificationCreated', { notificationId: notification.id, recipientId: notification.recipientId })
      eventBus.emit('notificationsChanged', { recipientId: notification.recipientId })
    }
    return result.task
  },

  update: async (id: string, user: AuthUser, input: TaskMutation) => {
    if (user.role === Role.DEVELOPER) {
      const developerFields = Object.keys(input).filter((key) => !['status', 'version'].includes(key))
      if (developerFields.length > 0 || !input.status) {
        throw new AppError(403, 'FORBIDDEN', 'Developers can only update the status of tasks assigned to them.')
      }
    }

    const executeUpdate = () => prisma.$transaction(async (tx) => {
      const existing = await tx.task.findUnique({ where: { id }, include: taskInclude })
      if (!existing) throw new AppError(404, 'TASK_NOT_FOUND', 'Task was not found.')
      assertTaskAccess(user, existing)

      if (user.role === Role.PROJECT_MANAGER && existing.project.createdById !== user.id) {
        throw new AppError(403, 'FORBIDDEN', 'Project managers can only update tasks in their own projects.')
      }

      await validateDeveloperInTransaction(tx, input.assignedDeveloperId)

      if (input.version !== undefined && input.version !== existing.version) {
        throw new AppError(409, 'STALE_TASK_VERSION', 'Task was changed by another request. Reload and try again.')
      }

      const isUnchanged = Object.entries(input)
        .filter(([key]) => key !== 'version')
        .every(([key, value]) => {
          const previous = existing[key as keyof typeof existing]
          return value instanceof Date && previous instanceof Date
            ? value.getTime() === previous.getTime()
            : value === previous
        })
      if (isUnchanged) return {
        task: existing,
        activityId: undefined,
        projectId: existing.projectId,
        pmOwnerId: existing.project.createdById,
        developerId: existing.assignedDeveloperId,
        notificationIds: [] as Array<{ id: string; recipientId: string }>
      }

      const changedStatus = input.status !== undefined && input.status !== existing.status
      const changedAssignee = input.assignedDeveloperId !== undefined && input.assignedDeveloperId !== existing.assignedDeveloperId
      const nextStatus = input.status ?? existing.status
      const nextDueDate = input.dueDate === undefined ? existing.dueDate : input.dueDate
      const nextOverdue = Boolean(nextDueDate && nextDueDate < new Date() && nextStatus !== TaskStatus.DONE)
      const updateData = { ...input }
      delete updateData.version

      const updateResult = await tx.task.updateMany({
        where: { id, version: existing.version },
        data: { ...updateData, isOverdue: nextOverdue, version: { increment: 1 } }
      })
      if (updateResult.count !== 1) {
        throw new AppError(409, 'CONCURRENT_UPDATE', 'Task was changed concurrently. Reload and try again.')
      }

      const updated = await tx.task.findUniqueOrThrow({ where: { id }, include: taskInclude })
      let activityId: string | undefined
      if (changedStatus) {
        const activity = await tx.activityLog.create({
          data: {
            workspaceId: requireWorkspaceId(),
            taskId: id,
            projectId: existing.projectId,
            actorId: user.id,
            eventType: ActivityEventType.TASK_STATUS_CHANGED,
            fromStatus: existing.status,
            toStatus: updated.status,
            message: `${updated.title} moved from ${existing.status} to ${updated.status}`
          }
        })
        activityId = activity.id
      } else if (changedAssignee) {
        const activity = await tx.activityLog.create({
          data: {
            workspaceId: requireWorkspaceId(),
            taskId: id,
            projectId: existing.projectId,
            actorId: user.id,
            eventType: ActivityEventType.TASK_ASSIGNED,
            message: updated.assignedDeveloperId ? `${updated.title} assigned` : `${updated.title} unassigned`
          }
        })
        activityId = activity.id
      } else {
        const activity = await tx.activityLog.create({
          data: {
            workspaceId: requireWorkspaceId(),
            taskId: id,
            projectId: existing.projectId,
            actorId: user.id,
            eventType: ActivityEventType.TASK_UPDATED,
            message: `${updated.title} updated`
          }
        })
        activityId = activity.id
      }

      const notificationIds: Array<{ id: string; recipientId: string }> = []
      if (changedAssignee && updated.assignedDeveloperId && updated.assignedDeveloperId !== user.id) {
        const notification = await tx.notification.create({
          data: {
            workspaceId: requireWorkspaceId(),
            recipientId: updated.assignedDeveloperId,
            actorId: user.id,
            taskId: id,
            projectId: existing.projectId,
            type: NotificationType.TASK_ASSIGNED,
            message: `You were assigned to ${updated.title}`
          }
        })
        notificationIds.push({ id: notification.id, recipientId: notification.recipientId })
      }
      if (changedStatus && updated.status === TaskStatus.IN_REVIEW && existing.project.createdById !== user.id) {
        const notification = await tx.notification.create({
          data: {
            workspaceId: requireWorkspaceId(),
            recipientId: existing.project.createdById,
            actorId: user.id,
            taskId: id,
            projectId: existing.projectId,
            type: NotificationType.TASK_REVIEW_REQUESTED,
            message: `${updated.title} is ready for review`
          }
        })
        notificationIds.push({ id: notification.id, recipientId: notification.recipientId })
      }
      if (
        changedStatus &&
        updated.assignedDeveloperId &&
        updated.assignedDeveloperId !== user.id &&
        updated.status !== TaskStatus.IN_REVIEW
      ) {
        const notification = await tx.notification.create({
          data: {
            workspaceId: requireWorkspaceId(),
            recipientId: updated.assignedDeveloperId,
            actorId: user.id,
            taskId: id,
            projectId: existing.projectId,
            type: NotificationType.TASK_STATUS_CHANGED,
            message: `${updated.title} status changed to ${updated.status}`
          }
        })
        notificationIds.push({ id: notification.id, recipientId: notification.recipientId })
      }

      return {
        task: updated,
        activityId,
        projectId: existing.projectId,
        pmOwnerId: existing.project.createdById,
        developerId: updated.assignedDeveloperId,
        notificationIds
      }
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable })

    let result: Awaited<ReturnType<typeof executeUpdate>>
    try {
      result = await executeUpdate()
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
        throw new AppError(409, 'CONCURRENT_UPDATE', 'Task was changed concurrently. Reload and try again.')
      }
      throw error
    }

    if (result.activityId) {
      eventBus.emit('activityCreated', {
        activityId: result.activityId,
        projectId: result.projectId,
        taskId: result.task.id,
        pmOwnerId: result.pmOwnerId,
        developerId: result.developerId
      })
    }
    for (const notification of result.notificationIds) {
      eventBus.emit('notificationCreated', { notificationId: notification.id, recipientId: notification.recipientId })
      eventBus.emit('notificationsChanged', { recipientId: notification.recipientId })
    }
    return taskForResponse(result.task, user)
  }
}
