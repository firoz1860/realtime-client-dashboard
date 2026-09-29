import { Role, TaskStatus } from '@prisma/client'
import { prisma } from '../lib/prisma'
import type { AuthUser } from '../types/auth'
import { AppError } from '../utils/app-error'
import { requireWorkspaceId } from '../lib/tenant-context'
import { presenceService } from './presence.service'
import { activityRepository } from '../repositories/activity.repository'

export const dashboardService = {
  admin: async (user: AuthUser) => {
    if (user.role !== Role.ADMIN) throw new AppError(403, 'FORBIDDEN', 'Admin access required.')
    const [totalProjects, taskStatus, overdueCount, globalActivity] = await Promise.all([
      prisma.project.count(),
      prisma.task.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.task.count({ where: { isOverdue: true, status: { not: TaskStatus.DONE } } }),
      activityRepository.recent(user, 20)
    ])
    return { totalProjects, taskStatus, overdueCount, onlineUsers: presenceService.count(requireWorkspaceId()), globalActivity }
  },

  pm: async (user: AuthUser) => {
    if (user.role !== Role.PROJECT_MANAGER) throw new AppError(403, 'FORBIDDEN', 'Project manager access required.')
    const taskWhere = { project: { createdById: user.id } }
    const weekEnd = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    const [projects, tasksByPriority, upcomingDueDates] = await Promise.all([
      prisma.project.findMany({
        where: { createdById: user.id },
        select: { id: true, name: true, status: true, _count: { select: { tasks: true } } },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.task.groupBy({ by: ['priority'], where: taskWhere, _count: { _all: true } }),
      prisma.task.findMany({
        where: { ...taskWhere, dueDate: { gte: new Date(), lte: weekEnd }, status: { not: TaskStatus.DONE } },
        select: { id: true, title: true, dueDate: true, priority: true, status: true, projectId: true },
        orderBy: { dueDate: 'asc' }
      })
    ])
    return { projects, tasksByPriority, upcomingDueDates }
  },

  developer: async (user: AuthUser) => {
    if (user.role !== Role.DEVELOPER) throw new AppError(403, 'FORBIDDEN', 'Developer access required.')
    return prisma.task.findMany({
      where: { assignedDeveloperId: user.id },
      select: { id: true, title: true, priority: true, dueDate: true, status: true, isOverdue: true, project: { select: { id: true, name: true } } },
      orderBy: [{ isOverdue: 'desc' }, { dueDate: 'asc' }]
    })
  }
}
