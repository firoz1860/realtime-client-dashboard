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
import { runInTenant } from '../lib/tenant-context'
import { verifyAccessToken } from '../utils/jwt'

/**
 * Room names are workspace-prefixed.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md 6.1
 *
 * role:ADMIN was previously a single global room, so every admin of every
 * company shared it and would have received each other's broadcasts. Project
 * rooms need no prefix: project ids are workspace-owned and project:join is
 * authorised through the scoped client, so a cross-tenant join finds no
 * project and is refused.
 */
const adminRoom = (workspaceId: string): string => `ws:${workspaceId}:role:ADMIN`
const userRoom = (workspaceId: string, userId: string): string =>
  `ws:${workspaceId}:user:${userId}`

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
  // Same order as requireAuth: take the scope from the token, then read the
  // user through the scoped client. Keeps socket.ts off the prismaSystem
  // allowlist and proves the user belongs to the workspace it claims.
  if (!payload.ws) throw new Error('Session predates workspaces')
  const workspaceId = payload.ws
  const user = await runInTenant({ workspaceId }, () => userRepository.findById(payload.sub))
  if (!user || !user.isActive) throw new Error('Account unavailable')
  socket.data.user = {
    id: user.id,
    email: user.email,
    role: user.role,
    isActive: user.isActive,
    workspaceId: user.workspaceId
  }
}

const installDomainEventForwarding = (io: AppServer): void => {
  eventBus.on('activityCreated', (payload) => {
    void runInTenant({ workspaceId: payload.workspaceId }, () =>
      activityService.getEvent(payload.activityId)
    ).then((activity) => {
      const safePayload = safeActivityPayload(activity)
      if (!safePayload) return
      io.to(adminRoom(payload.workspaceId)).emit('activity:new', safePayload)
      io.to(userRoom(payload.workspaceId, payload.pmOwnerId)).emit('activity:new', safePayload)
      if (payload.developerId) {
        io.to(userRoom(payload.workspaceId, payload.developerId)).emit('activity:new', safePayload)
      }
      if (safePayload.eventType === 'TASK_STATUS_CHANGED') {
        io.to(adminRoom(payload.workspaceId)).emit('task:status-updated', safePayload)
        io.to(userRoom(payload.workspaceId, payload.pmOwnerId)).emit('task:status-updated', safePayload)
        if (payload.developerId) {
          io.to(userRoom(payload.workspaceId, payload.developerId)).emit('task:status-updated', safePayload)
        }
      }
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit activity event'))
  })

  eventBus.on('notificationCreated', (payload) => {
    void runInTenant({ workspaceId: payload.workspaceId }, () =>
      notificationService.get(payload.notificationId, payload.recipientId)
    ).then((notification) => {
      if (notification) {
        io.to(userRoom(payload.workspaceId, payload.recipientId)).emit('notification:new', notification)
      }
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit notification'))
  })

  eventBus.on('notificationRead', (payload) => {
    io.to(userRoom(payload.workspaceId, payload.recipientId))
      .emit('notification:read', { id: payload.notificationId })
  })

  eventBus.on('notificationReadAll', (payload) => {
    io.to(userRoom(payload.workspaceId, payload.recipientId))
      .emit('notification:read-all', { success: true })
  })

  eventBus.on('notificationsChanged', (payload) => {
    void runInTenant({ workspaceId: payload.workspaceId }, () =>
      notificationService.unreadCount(payload.recipientId)
    ).then((count) => {
      io.to(userRoom(payload.workspaceId, payload.recipientId))
        .emit('notification:unread-count', { count })
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit unread count'))
  })

  eventBus.on('userAuthorizationChanged', (payload) => {
    io.in(userRoom(payload.workspaceId, payload.userId)).disconnectSockets(true)
  })

  eventBus.on('messageCreated', (payload) => {
    void runInTenant({ workspaceId: payload.workspaceId }, () =>
      messageService.getEvent(payload.messageId)
    ).then((message) => {
      if (message) io.to(`project:${payload.projectId}`).emit('message:new', message)
    }).catch((error: unknown) => logger.error({ err: error }, 'Failed to emit message'))
  })
}

const registerConnection = (io: AppServer, socket: AppSocket): void => {
  const user = socket.data.user
  // A socket with no workspace cannot be placed in any tenant room.
  if (!user.workspaceId) {
    socket.disconnect(true)
    return
  }
  const workspaceId = user.workspaceId

  void socket.join(userRoom(workspaceId, user.id))
  if (user.role === Role.ADMIN) void socket.join(adminRoom(workspaceId))

  presenceService.connect(workspaceId, user.id, socket.id)
  io.to(adminRoom(workspaceId))
    .emit('presence:count', { onlineUsers: presenceService.count(workspaceId) })

  socket.on('project:join', (projectId, callback) => {
    const ack = typeof callback === 'function' ? callback : () => undefined
    if (!uuidSchema.safeParse(projectId).success) {
      ack({ ok: false, error: 'INVALID_PROJECT_ID' })
      return
    }
    void runInTenant({ workspaceId }, () => projectService.canJoinRoom(projectId, user))
      .then((allowed) => {
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
    void runInTenant({ workspaceId }, () => activityService.recent(user, safeLimit))
      .then((data) => ack({ ok: true, data }))
      .catch(() => ack({ ok: false, error: 'CATCHUP_FAILED' }))
  })

  socket.on('disconnect', () => {
    presenceService.disconnect(workspaceId, user.id, socket.id)
    io.to(adminRoom(workspaceId))
      .emit('presence:count', { onlineUsers: presenceService.count(workspaceId) })
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
