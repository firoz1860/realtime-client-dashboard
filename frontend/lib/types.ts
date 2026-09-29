// Shared types mirroring the backend response contracts.

export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'PROJECT_MANAGER' | 'DEVELOPER'
export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'IN_REVIEW' | 'DONE'
export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

/** The company a user belongs to. Null only for SUPER_ADMIN. */
export interface Workspace {
  id: string
  name: string
  slug: string
}

export interface AuthUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
  workspaceId: string | null
  workspace: Workspace | null
  createdAt?: string
  updatedAt?: string
}

/** Item returned by /api/activity and activity:catchup (has task/project detail). */
export interface ActivityItem {
  id: string
  projectId: string | null
  taskId: string | null
  eventType: string
  message: string
  createdAt: string
  fromStatus?: TaskStatus | null
  toStatus?: TaskStatus | null
  actor?: { id: string; name: string } | null
  task?: { id: string; title: string } | null
  project?: { id: string; name: string } | null
}

export interface NotificationItem {
  id: string
  type: string
  message: string
  isRead: boolean
  createdAt: string
  actor?: { id: string; name: string } | null
  task?: { id: string; title: string } | null
  project?: { id: string; name: string } | null
}

export interface Paginated<T> {
  data: T[]
  pagination: { page: number; limit: number; total: number; totalPages: number }
}

// ---- Dashboard payloads (role-specific) ----

export interface AdminDashboard {
  totalProjects: number
  taskStatus: Array<{ status: TaskStatus; _count: { _all: number } }>
  overdueCount: number
  onlineUsers: number
  globalActivity: ActivityItem[]
}

export interface PmDashboard {
  projects: Array<{ id: string; name: string; status: string; _count: { tasks: number } }>
  tasksByPriority: Array<{ priority: TaskPriority; _count: { _all: number } }>
  upcomingDueDates: Array<{
    id: string
    title: string
    dueDate: string | null
    priority: TaskPriority
    status: TaskStatus
    projectId: string
  }>
}

export type DeveloperDashboard = Array<{
  id: string
  title: string
  priority: TaskPriority
  dueDate: string | null
  status: TaskStatus
  isOverdue: boolean
  project: { id: string; name: string }
}>

// ---- Projects / Tasks / Team / Clients ----

export interface Project {
  id: string
  name: string
  description?: string | null
  status: string
  clientId: string
  createdById: string
  createdAt: string
  client?: { id: string; name: string; company?: string | null }
  createdBy?: { id: string; name: string; email: string; role: Role }
  _count?: { tasks: number }
  doneTasks?: number
  progress?: number
}

export interface Task {
  id: string
  createdAt?: string
  title: string
  description?: string | null
  status: TaskStatus
  priority: TaskPriority
  dueDate: string | null
  isOverdue?: boolean
  version?: number
  assignedDeveloperId?: string | null
  project: { id: string; name: string }
  assignedDeveloper?: { id: string; name: string } | null
}

export interface TeamUser {
  id: string
  name: string
  email: string
  role: Role
  isActive: boolean
}

export interface Client {
  id: string
  name: string
  company?: string | null
  email?: string | null
}

export interface Message {
  id: string
  body: string
  createdAt: string
  projectId: string
  senderId?: string
  sender?: { id: string; name: string; role: Role }
}
