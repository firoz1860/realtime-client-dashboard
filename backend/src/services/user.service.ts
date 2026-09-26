import bcrypt from 'bcryptjs'
import { Role } from '@prisma/client'
import { eventBus } from '../lib/events'
import { userRepository } from '../repositories/user.repository'
import { paginationMeta } from '../utils/pagination'
import { AppError } from '../utils/app-error'

export const userService = {
  activeDevelopers: () => userRepository.listActiveDevelopers(),

  list: async (input: { page: number; limit: number; role?: Role; isActive?: boolean; search?: string }) => {
    const result = await userRepository.list(input)
    return { data: result.data, pagination: paginationMeta(input.page, input.limit, result.total) }
  },

  get: async (id: string) => {
    const user = await userRepository.findSafeById(id)
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found.')
    return user
  },

  create: async (input: { name: string; email: string; password: string; role: Role; isActive?: boolean }) => {
    const passwordHash = await bcrypt.hash(input.password, 12)
    return userRepository.create({
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role,
      isActive: input.isActive ?? true
    })
  },

  update: async (id: string, input: { name?: string; email?: string; password?: string; role?: Role; isActive?: boolean }) => {
    const existing = await userRepository.findById(id)
    if (!existing) throw new AppError(404, 'USER_NOT_FOUND', 'User was not found.')

    if (input.role && input.role !== existing.role) {
      const [ownedProjects, assignedTasks] = await Promise.all([
        userRepository.countOwnedProjects(id),
        userRepository.countAssignedTasks(id)
      ])
      if (input.role !== Role.PROJECT_MANAGER && ownedProjects > 0) {
        throw new AppError(409, 'ROLE_CHANGE_BLOCKED', 'Reassign this project manager’s projects before changing their role.')
      }
      if (input.role !== Role.DEVELOPER && assignedTasks > 0) {
        throw new AppError(409, 'ROLE_CHANGE_BLOCKED', 'Reassign this developer’s tasks before changing their role.')
      }
    }

    const { password, ...rest } = input
    const passwordHash = password ? await bcrypt.hash(password, 12) : undefined
    const updated = await userRepository.update(id, { ...rest, ...(passwordHash ? { passwordHash } : {}) })
    const authorizationChanged =
      (input.role !== undefined && input.role !== existing.role) ||
      (input.isActive !== undefined && input.isActive !== existing.isActive)
    if (authorizationChanged) eventBus.emit('userAuthorizationChanged', { userId: id })
    return updated
  }
}
