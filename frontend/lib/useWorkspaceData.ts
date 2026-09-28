'use client'

// Centralizes all live backend data for the dashboard: role KPIs, the
// role-filtered activity feed (with missed-event catch-up), the live
// notification list + unread count, the online-users presence count, and
// cross-project chat-unread tracking.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { getAccessToken } from './api'
import { mergeActivity } from './activity-feed'
import { dashboardApi, notificationApi, projectApi, taskApi } from './endpoints'
import { catchupActivity, connectSocket, type AppSocket } from './socket'
import type { ActivityItem, AdminDashboard, AuthUser, DeveloperDashboard, NotificationItem, PmDashboard, TaskStatus } from './types'

export interface Kpi {
  label: string
  value: string
  tone: 'blue' | 'purple' | 'orange' | 'green'
  iconKey: 'projects' | 'tasks' | 'users' | 'overdue' | 'progress' | 'review' | 'week'
}

export interface WorkspaceData {
  kpis: Kpi[]
  feed: ActivityItem[]
  unread: number
  onlineUsers: number | null
  loading: boolean
  error: string | null
  chatUnread: number
  notificationPulse: number
  chatPulse: number
  notifications: NotificationItem[]
  markNotificationRead: (id: string) => void
  markAllNotificationsRead: () => void
  /** Shared realtime connection (one per signed-in session). */
  socket: AppSocket | null
  /** Re-fetch KPIs after a local mutation. */
  reload: () => void
}

const FEED_CAP = 50
const NOTIF_CAP = 20

const sumCount = (rows: Array<{ _count: { _all: number } }>): number =>
  rows.reduce((total, row) => total + row._count._all, 0)

const buildKpis = (role: AuthUser['role'], payload: unknown, onlineUsers: number | null): Kpi[] => {
  if (role === 'ADMIN') {
    const d = payload as AdminDashboard
    const totalTasks = sumCount(d.taskStatus)
    return [
      { label: 'Total projects', value: String(d.totalProjects), tone: 'blue', iconKey: 'projects' },
      { label: 'Total tasks', value: String(totalTasks), tone: 'purple', iconKey: 'tasks' },
      { label: 'Overdue tasks', value: String(d.overdueCount), tone: 'orange', iconKey: 'overdue' },
      { label: 'Online now', value: String(onlineUsers ?? d.onlineUsers), tone: 'green', iconKey: 'users' },
    ]
  }
  if (role === 'PROJECT_MANAGER') {
    const d = payload as PmDashboard
    const totalTasks = sumCount(d.tasksByPriority)
    const highCritical = d.tasksByPriority
      .filter((row) => row.priority === 'HIGH' || row.priority === 'CRITICAL')
      .reduce((total, row) => total + row._count._all, 0)
    return [
      { label: 'My projects', value: String(d.projects.length), tone: 'blue', iconKey: 'projects' },
      { label: 'My tasks', value: String(totalTasks), tone: 'purple', iconKey: 'tasks' },
      { label: 'Due this week', value: String(d.upcomingDueDates.length), tone: 'orange', iconKey: 'week' },
      { label: 'High / Critical', value: String(highCritical), tone: 'green', iconKey: 'overdue' },
    ]
  }
  const tasks = payload as DeveloperDashboard
  const countBy = (status: TaskStatus) => tasks.filter((task) => task.status === status).length
  return [
    { label: 'Assigned tasks', value: String(tasks.length), tone: 'blue', iconKey: 'tasks' },
    { label: 'In progress', value: String(countBy('IN_PROGRESS')), tone: 'purple', iconKey: 'progress' },
    { label: 'In review', value: String(countBy('IN_REVIEW')), tone: 'orange', iconKey: 'review' },
    { label: 'Overdue', value: String(tasks.filter((task) => task.isOverdue).length), tone: 'green', iconKey: 'overdue' },
  ]
}

const dedupePrepend = <T extends { id: string }>(list: T[], incoming: T, cap: number): T[] => {
  if (list.some((item) => item.id === incoming.id)) return list
  return [incoming, ...list].slice(0, cap)
}

export function useWorkspaceData(user: AuthUser | null, chatActive = false): WorkspaceData {
  const [socket, setSocket] = useState<AppSocket | null>(null)
  const [reloadTick, setReloadTick] = useState(0)
  const reload = useCallback(() => setReloadTick((n) => n + 1), [])
  const [kpis, setKpis] = useState<Kpi[]>([])
  const [feed, setFeed] = useState<ActivityItem[]>([])
  const [unread, setUnread] = useState(0)
  const [onlineUsers, setOnlineUsers] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [chatUnread, setChatUnread] = useState(0)
  const [notificationPulse, setNotificationPulse] = useState(0)
  const [chatPulse, setChatPulse] = useState(0)
  const seenNotifications = useRef(new Set<string>())
  const seenMessages = useRef(new Set<string>())
  const [notifications, setNotifications] = useState<NotificationItem[]>([])
  const socketRef = useRef<AppSocket | null>(null)
  const chatActiveRef = useRef(chatActive)

  // Viewing the Chat page clears chat unread; keep a ref so socket handlers see it.
  useEffect(() => {
    chatActiveRef.current = chatActive
    if (chatActive) setChatUnread(0)
  }, [chatActive])

  const markNotificationRead = useCallback((id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, isRead: true } : n)))
    void notificationApi.markRead(id)
      .then(() => notificationApi.unreadCount())
      .then(({ count }) => setUnread(count))
      .catch(() => { void notificationApi.list({ limit: 8 }).then(setNotifications).catch(() => undefined) })
  }, [])

  const markAllNotificationsRead = useCallback(() => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })))
    void notificationApi.markAllRead()
      .then(() => notificationApi.unreadCount())
      .then(({ count }) => setUnread(count))
      .catch(() => { void notificationApi.list({ limit: 8 }).then(setNotifications).catch(() => undefined) })
  }, [])

  useEffect(() => {
    if (!user) {
      setKpis([]); setFeed([]); setUnread(0); setOnlineUsers(null); setChatUnread(0); setNotifications([])
      setNotificationPulse(0); setChatPulse(0)
      seenNotifications.current.clear(); seenMessages.current.clear()
      return
    }

    let active = true
    setLoading(true)
    setError(null)

    // Keep dashboard metrics usable even if notification delivery is temporarily unavailable.
    void dashboardApi.byRole(user.role)
      .then((dashboard) => {
        if (!active) return
        const online = user.role === 'ADMIN' ? (dashboard as AdminDashboard).onlineUsers : null
        setOnlineUsers(online)
        setKpis(buildKpis(user.role, dashboard, online))
        if (user.role === 'ADMIN') setFeed((prev) => mergeActivity(prev, (dashboard as AdminDashboard).globalActivity ?? [], FEED_CAP))
      })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : 'Failed to load dashboard.') })
      .finally(() => { if (active) setLoading(false) })
    void notificationApi.unreadCount().then(({ count }) => { if (active) setUnread(count) }).catch(() => undefined)
    void notificationApi.list({ limit: 8 }).then((items) => { if (active) setNotifications(items) }).catch(() => undefined)

    // 2. Socket: catch-up + live updates.
    const token = getAccessToken()
    if (!token) return () => { active = false }

    const socket = connectSocket(token)
    socketRef.current = socket
    setSocket(socket)

    const loadCatchup = () => {
      void catchupActivity(socket, 20).then((events) => {
        if (active && events.length) setFeed((prev) => mergeActivity(prev, events, FEED_CAP))
      })
    }
    // Join every accessible project room so chat messages arrive workspace-wide.
    const joinChatRooms = async () => {
      try {
        const ids = user.role === 'DEVELOPER'
          ? [...new Set((await taskApi.list()).map((t) => t.project.id))]
          : (await projectApi.list()).map((p) => p.id)
        ids.forEach((id) => socket.emit('project:join', id, () => undefined))
      } catch { /* ignore */ }
    }
    const onConnect = () => { loadCatchup(); void joinChatRooms() }
    socket.on('connect', onConnect)
    if (socket.connected) onConnect()

    socket.on('activity:new', (item) => { if (active) setFeed((prev) => dedupePrepend(prev, item, FEED_CAP)) })
    socket.on('notification:unread-count', ({ count }) => { if (active) setUnread(count) })
    socket.on('notification:new', (n) => {
      if (!active) return
      if (!seenNotifications.current.has(n.id)) {
        seenNotifications.current.add(n.id)
        if (seenNotifications.current.size > 1000) seenNotifications.current.clear()
        setNotificationPulse((count) => count + 1)
      }
      setNotifications((prev) => dedupePrepend(prev, n, NOTIF_CAP))
    })
    socket.on('notification:read', ({ id }) => {
      if (active) setNotifications((prev) => prev.map((x) => (x.id === id ? { ...x, isRead: true } : x)))
    })
    socket.on('notification:read-all', () => {
      if (active) setNotifications((prev) => prev.map((x) => ({ ...x, isRead: true })))
    })
    socket.on('presence:count', ({ onlineUsers: count }) => {
      if (!active) return
      setOnlineUsers(count)
      setKpis((prev) => prev.map((kpi) => (kpi.iconKey === 'users' ? { ...kpi, value: String(count) } : kpi)))
    })
    socket.on('message:new', (msg) => {
      if (!active) return
      if ((msg.senderId ?? msg.sender?.id) === user.id) return
      if (seenMessages.current.has(msg.id)) return
      seenMessages.current.add(msg.id)
      if (seenMessages.current.size > 1000) seenMessages.current.clear()
      setChatPulse((count) => count + 1)
      if (chatActiveRef.current) return
      setChatUnread((n) => n + 1)
    })

    return () => {
      active = false
      socket.removeAllListeners()
      socket.disconnect()
      socketRef.current = null
      setSocket(null)
    }
  }, [user])

  // Lightweight KPI refresh after local changes (does not reconnect the socket).
  useEffect(() => {
    if (!user || reloadTick === 0) return
    let active = true
    void dashboardApi.byRole(user.role)
      .then((dashboard) => { if (active) setKpis(buildKpis(user.role, dashboard, user.role === 'ADMIN' ? (dashboard as AdminDashboard).onlineUsers : null)) })
      .catch(() => undefined)
    return () => { active = false }
  }, [user, reloadTick])

  return useMemo(
    () => ({ kpis, feed, unread, onlineUsers, loading, error, chatUnread, notificationPulse, chatPulse, notifications, markNotificationRead, markAllNotificationsRead, socket, reload }),
    [kpis, feed, unread, onlineUsers, loading, error, chatUnread, notificationPulse, chatPulse, notifications, markNotificationRead, markAllNotificationsRead, socket, reload],
  )
}
