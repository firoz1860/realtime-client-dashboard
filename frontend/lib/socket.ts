// Socket.io client wrapper for the realtime feed, notifications, and presence.
import { io, type Socket } from 'socket.io-client'
import { API_BASE, api, getAccessToken } from './api'
import type { ActivityItem, Message, NotificationItem } from './types'

// Server -> client events (mirrors backend ServerToClientEvents).
interface ServerToClientEvents {
  'task:status-updated': (payload: ActivityItem) => void
  'activity:new': (payload: ActivityItem) => void
  'notification:new': (payload: NotificationItem) => void
  'notification:read': (payload: { id: string }) => void
  'notification:read-all': (payload: { success: true }) => void
  'notification:unread-count': (payload: { count: number }) => void
  'presence:count': (payload: { onlineUsers: number }) => void
  'message:new': (payload: Message) => void
}

interface ClientToServerEvents {
  'project:join': (projectId: string, cb: (r: { ok: boolean; error?: string }) => void) => void
  'project:leave': (projectId: string) => void
  'activity:catchup': (limit: number, cb: (r: { ok: boolean; data?: ActivityItem[]; error?: string }) => void) => void
}

export type AppSocket = Socket<ServerToClientEvents, ClientToServerEvents>

/** Connect with the in-memory access token. Backend authenticates the handshake. */
export const connectSocket = (accessToken: string): AppSocket => {
  const socket: AppSocket = io(API_BASE, {
    auth: { token: accessToken },
    transports: ['websocket'],
    withCredentials: true,
    autoConnect: true,
  })
  socket.on('connect_error', () => {
    void api.me().then(() => {
      const token = getAccessToken()
      if (token && token !== (socket.auth as { token: string }).token) {
        socket.auth = { token }
        socket.connect()
      }
    }).catch(() => undefined)
  })
  return socket
}

/** Promise wrapper around the activity:catchup ack (last N missed events). */
export const catchupActivity = (socket: AppSocket, limit = 20): Promise<ActivityItem[]> =>
  new Promise((resolve) => {
    socket.emit('activity:catchup', limit, (res) => {
      resolve(res.ok && res.data ? res.data : [])
    })
  })
