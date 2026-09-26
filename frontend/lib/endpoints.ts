// Domain API calls built on the typed client.
import { api } from './api'
import type {
  ActivityItem,
  AdminDashboard,
  DeveloperDashboard,
  NotificationItem,
  PmDashboard,
  Role,
} from './types'

export const dashboardApi = {
  admin: () => api.request<AdminDashboard>('/dashboard/admin'),
  pm: () => api.request<PmDashboard>('/dashboard/pm'),
  developer: () => api.request<DeveloperDashboard>('/dashboard/developer'),
  byRole: (role: Role) => {
    if (role === 'ADMIN') return dashboardApi.admin()
    if (role === 'PROJECT_MANAGER') return dashboardApi.pm()
    return dashboardApi.developer()
  },
}

export const activityApi = {
  list: (params: { page?: number; limit?: number; projectId?: string; taskId?: string } = {}) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    if (params.projectId) q.set('projectId', params.projectId)
    if (params.taskId) q.set('taskId', params.taskId)
    const qs = q.toString()
    // List endpoints return { success, data: [...], pagination }, so the client
    // unwraps `data` to the array (pagination is not needed for the feed).
    return api.request<ActivityItem[]>(`/activity${qs ? `?${qs}` : ''}`)
  },
}

export const notificationApi = {
  list: (params: { page?: number; limit?: number; isRead?: boolean } = {}) => {
    const q = new URLSearchParams()
    if (params.page) q.set('page', String(params.page))
    if (params.limit) q.set('limit', String(params.limit))
    if (params.isRead !== undefined) q.set('isRead', String(params.isRead))
    const qs = q.toString()
    return api.request<NotificationItem[]>(`/notifications${qs ? `?${qs}` : ''}`)
  },
  unreadCount: () => api.request<{ count: number }>('/notifications/unread-count'),
  markRead: (id: string) => api.request<NotificationItem>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllRead: () => api.request<{ updated: number }>('/notifications/read-all', { method: 'PATCH' }),
}

// ---- Projects / Tasks / Clients / Users ----
import type { Client, Project, Task, TaskStatus, TeamUser } from './types'

export const projectApi = {
  list: (params: { status?: string; search?: string } = {}) => {
    const q = new URLSearchParams({ limit: '100' })
    if (params.status) q.set('status', params.status)
    if (params.search) q.set('search', params.search)
    return api.request<Project[]>(`/projects?${q.toString()}`)
  },
  create: (body: { name: string; clientId: string; description?: string; status?: string; createdById?: string }) =>
    api.request<Project>('/projects', { method: 'POST', body }),
}

export const taskApi = {
  list: (params: { status?: string; priority?: string; projectId?: string; dueDateFrom?: string; dueDateTo?: string } = {}) => {
    const q = new URLSearchParams({ limit: '100' })
    Object.entries(params).forEach(([k, v]) => { if (v) q.set(k, String(v)) })
    return api.request<Task[]>(`/tasks?${q.toString()}`)
  },
  update: (id: string, body: { status?: TaskStatus; priority?: string; assignedDeveloperId?: string | null; title?: string; dueDate?: string | null }) =>
    api.request<Task>(`/tasks/${id}`, { method: 'PATCH', body }),
  create: (projectId: string, body: { title: string; assignedDeveloperId?: string | null; status?: string; priority?: string; dueDate?: string | null; description?: string }) =>
    api.request<Task>(`/projects/${projectId}/tasks`, { method: 'POST', body }),
}

export const clientApi = {
  list: () => api.request<Client[]>('/clients?limit=100'),
}

export const userApi = {
  developers: () => api.request<TeamUser[]>('/users/developers'),
  list: (params: { role?: string } = {}) => {
    const q = new URLSearchParams({ limit: '100' })
    if (params.role) q.set('role', params.role)
    return api.request<TeamUser[]>(`/users?${q.toString()}`)
  },
}

// ---- Project chat ----
import type { Message } from './types'

export const messageApi = {
  list: (projectId: string) => api.request<Message[]>(`/projects/${projectId}/messages?limit=100`),
  create: (projectId: string, body: string) =>
    api.request<Message>(`/projects/${projectId}/messages`, { method: 'POST', body: { body } }),
}
