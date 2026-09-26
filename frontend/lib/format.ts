// Presentation helpers for statuses, relative time, and activity-feed lines.
import type { ActivityItem, Role, TaskPriority, TaskStatus } from './types'

export const statusLabel = (status?: TaskStatus | null): string => {
  switch (status) {
    case 'TODO':
      return 'To Do'
    case 'IN_PROGRESS':
      return 'In Progress'
    case 'IN_REVIEW':
      return 'In Review'
    case 'DONE':
      return 'Done'
    default:
      return status ?? ''
  }
}

export const priorityLabel = (priority?: TaskPriority | null): string => {
  if (!priority) return ''
  return priority.charAt(0) + priority.slice(1).toLowerCase()
}

export const roleLabel = (role?: Role): string => {
  switch (role) {
    case 'ADMIN':
      return 'Admin'
    case 'PROJECT_MANAGER':
      return 'Project Manager'
    case 'DEVELOPER':
      return 'Developer'
    default:
      return 'Member'
  }
}

/** "just now", "2 mins ago", "3 hrs ago", "5 days ago". */
export const relativeTime = (input: string | Date): string => {
  const date = typeof input === 'string' ? new Date(input) : input
  const seconds = Math.round((Date.now() - date.getTime()) / 1000)
  if (Number.isNaN(seconds)) return ''
  if (seconds < 45) return 'just now'
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins} min${mins === 1 ? '' : 's'} ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} hr${hrs === 1 ? '' : 's'} ago`
  const days = Math.round(hrs / 24)
  if (days < 7) return `${days} day${days === 1 ? '' : 's'} ago`
  const weeks = Math.round(days / 7)
  return `${weeks} wk${weeks === 1 ? '' : 's'} ago`
}

/**
 * Feed line, e.g. "Ravi moved Nova Task 12 from In Progress → In Review".
 * Falls back to the server-stored message when detail is missing (live
 * socket payloads carry taskId but not the task title).
 */
export const activityLine = (item: ActivityItem): string => {
  const actor = item.actor?.name ?? 'Someone'
  const taskTitle = item.task?.title
  if (item.eventType === 'TASK_STATUS_CHANGED' && item.fromStatus && item.toStatus) {
    const subject = taskTitle ? `“${taskTitle}”` : 'a task'
    return `${actor} moved ${subject} from ${statusLabel(item.fromStatus)} → ${statusLabel(item.toStatus)}`
  }
  if (item.eventType === 'TASK_CREATED' && taskTitle) return `${actor} created “${taskTitle}”`
  if (item.eventType === 'TASK_ASSIGNED' && taskTitle) return `${actor} updated assignment on “${taskTitle}”`
  if (item.eventType === 'PROJECT_CREATED' && item.project?.name) return `${actor} created project “${item.project.name}”`
  if (item.eventType === 'PROJECT_UPDATED' && item.project?.name) return `${actor} updated project “${item.project.name}”`
  // Fallback: the human-readable message the backend stored.
  return item.message
}

const TONES = ['blue', 'purple', 'orange', 'green'] as const
/** Deterministic tone from an id so avatars/badges stay stable per item. */
export const toneFor = (seed: string): (typeof TONES)[number] => {
  let hash = 0
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
  return TONES[hash % TONES.length]
}

export const initials = (name: string): string =>
  name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
