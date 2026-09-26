'use client'

// Fetches real backend data for each workspace module (Projects, Tasks,
// Activity, Notifications, Team, Calendar), role-scoped. Non-backed views
// (Chat, Settings, Help) report supported=false so the UI keeps its static
// content for them.
import { useCallback, useEffect, useState } from 'react'
import { activityApi, notificationApi, projectApi, taskApi, userApi } from './endpoints'
import { activityLine, priorityLabel, relativeTime, roleLabel, statusLabel, toneFor } from './format'
import type { AuthUser } from './types'

export interface ModuleItem {
  id: string
  title: string
  meta: string
  tone: string
  value: string
  kind?: 'task' | 'notification' | 'project' | 'activity' | 'team'
  status?: string
  isRead?: boolean
}

export interface ModuleData {
  items: ModuleItem[]
  loading: boolean
  error: string | null
  supported: boolean
  refetch: () => void
}

const STATUS_TONE: Record<string, string> = { TODO: 'blue', IN_PROGRESS: 'purple', IN_REVIEW: 'orange', DONE: 'green' }
const PRIORITY_TONE: Record<string, string> = { LOW: 'green', MEDIUM: 'blue', HIGH: 'orange', CRITICAL: 'purple' }

const BACKED = new Set(['Projects', 'Tasks', 'Activity', 'Notifications', 'Team', 'Calendar'])

const projectStatusLabel = (s: string): string =>
  s.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ')

const fmtDate = (d: string | null): string => {
  if (!d) return 'No due date'
  const dt = new Date(d)
  return Number.isNaN(dt.getTime()) ? '—' : dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function useModuleData(view: string, user: AuthUser | null): ModuleData {
  const [items, setItems] = useState<ModuleItem[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)
  const refetch = useCallback(() => setTick((t) => t + 1), [])

  const role = user?.role
  const supported =
    !!user &&
    BACKED.has(view) &&
    !(view === 'Projects' && role === 'DEVELOPER') &&
    !(view === 'Team' && role === 'DEVELOPER')

  useEffect(() => {
    if (!supported || !user) { setItems([]); setError(null); setLoading(false); return }
    let active = true
    setLoading(true)
    setError(null)

    const load = async (): Promise<ModuleItem[]> => {
      if (view === 'Projects') {
        const rows = await projectApi.list()
        return rows.map((p) => ({
          id: p.id,
          title: p.name,
          meta: `${p.client?.company || p.client?.name || 'Client'} · ${p._count?.tasks ?? 0} tasks${p.createdBy ? ` · ${p.createdBy.name}` : ''}`,
          tone: toneFor(p.id),
          value: projectStatusLabel(p.status),
          kind: 'project',
        }))
      }
      if (view === 'Tasks') {
        const rows = await taskApi.list()
        return rows.map((t) => ({
          id: t.id,
          title: t.title,
          meta: `${t.project.name} · ${priorityLabel(t.priority)} · Due ${fmtDate(t.dueDate)}${t.isOverdue ? ' · Overdue' : ''}`,
          tone: STATUS_TONE[t.status] || 'blue',
          value: statusLabel(t.status),
          kind: 'task',
          status: t.status,
        }))
      }
      if (view === 'Activity') {
        const rows = await activityApi.list({ limit: 50 })
        return rows.map((a) => ({ id: a.id, title: activityLine(a), meta: relativeTime(a.createdAt), tone: toneFor(a.id), value: 'Live', kind: 'activity' }))
      }
      if (view === 'Notifications') {
        const rows = await notificationApi.list({ limit: 50 })
        return rows.map((n) => ({
          id: n.id,
          title: n.message,
          meta: `${n.actor?.name ? n.actor.name + ' · ' : ''}${relativeTime(n.createdAt)}`,
          tone: n.isRead ? 'blue' : 'orange',
          value: n.isRead ? 'Read' : 'Unread',
          kind: 'notification',
          isRead: n.isRead,
        }))
      }
      if (view === 'Team') {
        const rows = role === 'ADMIN' ? await userApi.list() : await userApi.developers()
        return rows.map((u) => ({ id: u.id, title: u.name, meta: `${roleLabel(u.role)} · ${u.email}`, tone: toneFor(u.id), value: u.isActive ? 'Active' : 'Inactive', kind: 'team' }))
      }
      if (view === 'Calendar') {
        const today = new Date().toISOString().slice(0, 10)
        const rows = await taskApi.list({ dueDateFrom: today })
        return rows
          .filter((t) => t.dueDate)
          .sort((a, b) => (a.dueDate! < b.dueDate! ? -1 : 1))
          .map((t) => ({ id: t.id, title: t.title, meta: `${fmtDate(t.dueDate)} · ${t.project.name}`, tone: PRIORITY_TONE[t.priority] || 'blue', value: priorityLabel(t.priority), kind: 'task', status: t.status }))
      }
      return []
    }

    load()
      .then((rows) => { if (active) { setItems(rows); setLoading(false) } })
      .catch((e: unknown) => { if (active) { setError(e instanceof Error ? e.message : 'Failed to load.'); setLoading(false) } })

    return () => { active = false }
  }, [view, user, role, supported, tick])

  return { items, loading, error, supported, refetch }
}
