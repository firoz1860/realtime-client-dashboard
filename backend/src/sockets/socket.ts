import type { Server as HttpServer } from 'node:http'
import { Role } from '@prisma/client'
import { Server, type Socket } from 'socket.io'
import { env } from '../config/env'
import { eventBus } from '../lib/events'
import { logger } from '../lib/logger'
import { userRepository } from '../repositories/user.repository'
import { activityService } from '../services/activity.service'
import { messageService } from '../services/message.service'
import { notificationService } from '../services/notification.service'
import { presenceService } from '../services/presence.service'
import { projectService } from '../services/project.service'
import type { AuthUser } from '../types/auth'
import { verifyAccessToken } from '../utils/jwt'
import { uuidSchema } from '../schemas/common.schema'

interface ServerToClientEvents {
  'task:status-updated': (payload: unknown) => void
  'activity:new': (payload: unknown) => void
  'notification:new': (payload: unknown) => void
  'notification:read': (payload: { id: string }) => void
  'notification:read-all': (payload: { success: true }) => void
  'notification:unread-count': (payload: { count: number }) => void
  'presence:count': (payload: { onlineUsers: number }) => void
  'message:new': (payload: unknown) => void
}

interface ClientToServerEvents {
  'project:join': (projectId: string, callback: (result: { ok: boolean; error?: string }) => void) => void
  'project:leave': (projectId: string) => void
  'activity:catchup': (limit: number, callback: (result: { ok: boolean; data?: unknown; error?: string }) => void) => void
}

type InterServerEvents = Record<string, never>
interface SocketData { user: AuthUser }

type AppServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>
type AppSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>

let ioInstance: AppServer | null = null

const safeActivityPayload = (activity: Awaited<ReturnType<typeof activityService.getEvent>>) => {
  if (!activity) return null
  return {
    id: activity.id,
    projectId: activity.projectId,
    taskId: activity.taskId,
    eventType: activity.eventType,
    actor: { id: activity.actor.id, name: activity.actor.name },
    fromStatus: activity.fromStatus,
    toStatus: activity.toStatus,
    message: activity.message,
    createdAt: activity.createdAt
  }
}

const authenticateSocket = async (socket: AppSocket): Promise<void> => {
  const token = socket.handshake.auth.token
  if (typeof token !== 'string' || token.length === 0) throw new Error('Authentication required')
  const payload = verifyAccessToken(token)
  const user = await userRepository.findById(payload.sub)
  if (!user || !user.isActive) throw new Error('Account unavailable')
  socket.data.user = { id: user.id, email: user.email, role: user.role, isActive: user.isActive, workspaceId: user.workspaceId }
}

const installDomainEventForwarding = (io: AppServer): void => {
  eventBus.on('activityCreated', (payload) => {
    void activityService.getEvent(payload.activityId).then((activity) => {
      const safePayload = safeActivityPayload(activity)
      if (!safePayload) return
      io.to('role:ADMIN').emit('activity:new', safePayload)
      io.to(`user:${payload.pmOwnerId}`).emit('activity:new', safePayload)
      if (payload.developerId) io.to(`user:${payload.developerId}`).emit('activity:new', safePayload)
      if (safePayload.eventType === 'TASK_STATUS_CHANGED') {
        io.to('role:ADMIN').emit('task:status-updated', safePayload)
        io.to(`user:${payload.pmOwnerId}`).emit('task:status-updated', safePayload)
        if (payload.developerId) io.to(`user:${payload.developerId}`).emit('task:status-updated', safePayload)
      }
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit activity event'))
  })

  eventBus.on('notificationCreated', (payload) => {
    void notificationService.get(payload.notificationId, payload.recipientId).then((notification) => {
      if (notification) io.to(`user:${payload.recipientId}`).emit('notification:new', notification)
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit notification'))
  })

  eventBus.on('notificationRead', (payload) => {
    io.to(`user:${payload.recipientId}`).emit('notification:read', { id: payload.notificationId })
  })

  eventBus.on('notificationReadAll', (payload) => {
    io.to(`user:${payload.recipientId}`).emit('notification:read-all', { success: true })
  })

  eventBus.on('notificationsChanged', (payload) => {
    void notificationService.unreadCount(payload.recipientId).then((count) => {
      io.to(`user:${payload.recipientId}`).emit('notification:unread-count', { count })
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit unread count'))
  })

  eventBus.on('userAuthorizationChanged', (payload) => {
    io.in(`user:${payload.userId}`).disconnectSockets(true)
  })

  eventBus.on('messageCreated', (payload) => {
    void messageService.getEvent(payload.messageId).then((message) => {
      if (message) io.to(`project:${payload.projectId}`).emit('message:new', message)
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit message'))
  })
}

const registerConnection = (io: AppServer, socket: AppSocket): void => {
  const user = socket.data.user
  void socket.join(`user:${user.id}`)
  if (user.role === Role.ADMIN) void socket.join('role:ADMIN')

  presenceService.connect(user.id, socket.id)
  io.to('role:ADMIN').emit('presence:count', { onlineUsers: presenceService.count() })

  socket.on('project:join', (projectId, callback) => {
    const ack = typeof callback === 'function' ? callback : () => undefined
    if (!uuidSchema.safeParse(projectId).success) {
      ack({ ok: false, error: 'INVALID_PROJECT_ID' })
      return
    }
    void projectService.canJoinRoom(projectId, user).then((allowed) => {
      if (!allowed) return ack({ ok: false, error: 'FORBIDDEN' })
      void socket.join(`project:${projectId}`)
      ack({ ok: true })
    }).catch(() => ack({ ok: false, error: 'ROOM_JOIN_FAILED' }))
  })

  socket.on('project:leave', (projectId) => {
    void socket.leave(`project:${projectId}`)
  })

  socket.on('activity:catchup', (limit, callback) => {
    const ack = typeof callback === 'function' ? callback : () => undefined
    const safeLimit = Number.isInteger(limit) ? Math.min(Math.max(limit, 1), 50) : 20
    void activityService.recent(user, safeLimit)
      .then((data) => ack({ ok: true, data }))
      .catch(() => ack({ ok: false, error: 'CATCHUP_FAILED' }))
  })

  socket.on('disconnect', () => {
    presenceService.disconnect(user.id, socket.id)
    io.to('role:ADMIN').emit('presence:count', { onlineUsers: presenceService.count() })
  })
}

export const initializeSocket = (httpServer: HttpServer): AppServer => {
  const io: AppServer = new Server(httpServer, {
    cors: { origin: env.SOCKET_CORS_ORIGIN, credentials: true }
  })
  io.use((socket, next) => {
    void authenticateSocket(socket).then(() => next()).catch(() => next(new Error('Unauthorized')))
  })
  io.on('connection', (socket) => registerConnection(io, socket))
  installDomainEventForwarding(io)
  ioInstance = io
  return io
}

export const closeSocket = async (): Promise<void> => {
  if (!ioInstance) return
  await new Promise<void>((resolve) => ioInstance?.close(() => resolve()))
  ioInstance = null
  eventBus.removeAllListeners()
  presenceService.clear()
}
