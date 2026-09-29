import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import bcrypt from 'bcryptjs'
import { PrismaClient, ProjectStatus, Role, TaskPriority, TaskStatus } from '@prisma/client'

/**
 * Two fully separate workspaces, for proving isolation.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §8
 *
 * These tests talk to a REAL database, which is the whole point: the 16 existing
 * specs mock `lib/prisma`, so they prove unit logic and nothing about tenancy.
 *
 * The connection comes from TEST_DATABASE_URL, never DATABASE_URL, so the suite
 * cannot be pointed at production by accident. When it is unset the suite skips
 * rather than fails, keeping `npm test` runnable with no database.
 */
export const testDatabaseUrl = (): string | null => {
  if (process.env.TEST_DATABASE_URL) return process.env.TEST_DATABASE_URL
  try {
    const envFile = readFileSync(join(__dirname, '..', '..', '.env.test'), 'utf8')
    const match = envFile.match(/^TEST_DATABASE_URL=(.+)$/m)
    return match ? match[1].trim() : null
  } catch {
    return null
  }
}

export const hasTestDatabase = (): boolean => testDatabaseUrl() !== null

/** Unscoped client. The suite sets up data and asserts raw truth with it. */
export const rawClient = (): PrismaClient => {
  const url = testDatabaseUrl()
  if (!url) throw new Error('TEST_DATABASE_URL is not configured.')
  return new PrismaClient({ datasources: { db: { url } } })
}

export interface SeededWorkspace {
  id: string
  slug: string
  adminId: string
  pmId: string
  developerId: string
  clientId: string
  projectId: string
  taskId: string
  messageId: string
  activityId: string
  notificationId: string
}

export interface Fixture {
  a: SeededWorkspace
  b: SeededWorkspace
}

const seedWorkspace = async (
  db: PrismaClient,
  slug: string,
  name: string
): Promise<SeededWorkspace> => {
  const passwordHash = await bcrypt.hash('Isolation123', 4)
  const workspace = await db.workspace.create({ data: { name, slug } })
  const w = workspace.id

  const mk = (role: Role, who: string) =>
    db.user.create({
      data: {
        name: `${name} ${who}`,
        email: `${who}@${slug}.isolation.test`,
        passwordHash,
        role,
        workspaceId: w
      }
    })

  const admin = await mk(Role.ADMIN, 'admin')
  const pm = await mk(Role.PROJECT_MANAGER, 'pm')
  const developer = await mk(Role.DEVELOPER, 'dev')

  const client = await db.client.create({
    data: { workspaceId: w, name: `${name} Client`, email: `client@${slug}.isolation.test` }
  })

  const project = await db.project.create({
    data: {
      workspaceId: w,
      name: `${name} Project`,
      clientId: client.id,
      createdById: pm.id,
      status: ProjectStatus.ACTIVE
    }
  })

  const task = await db.task.create({
    data: {
      workspaceId: w,
      projectId: project.id,
      title: `${name} Task`,
      assignedDeveloperId: developer.id,
      status: TaskStatus.TODO,
      priority: TaskPriority.HIGH
    }
  })

  const message = await db.message.create({
    data: {
      workspaceId: w,
      projectId: project.id,
      senderId: pm.id,
      body: `${name} confidential message`
    }
  })

  const activity = await db.activityLog.create({
    data: {
      workspaceId: w,
      projectId: project.id,
      taskId: task.id,
      actorId: pm.id,
      eventType: 'TASK_CREATED',
      message: `${name} activity`
    }
  })

  const notification = await db.notification.create({
    data: {
      workspaceId: w,
      recipientId: developer.id,
      actorId: pm.id,
      projectId: project.id,
      taskId: task.id,
      type: 'TASK_ASSIGNED',
      message: `${name} notification`
    }
  })

  return {
    id: w,
    slug,
    adminId: admin.id,
    pmId: pm.id,
    developerId: developer.id,
    clientId: client.id,
    projectId: project.id,
    taskId: task.id,
    messageId: message.id,
    activityId: activity.id,
    notificationId: notification.id
  }
}

/** Deletes only what this suite created; identified by the slug suffix. */
export const cleanup = async (db: PrismaClient): Promise<void> => {
  const mine = await db.workspace.findMany({
    where: { slug: { endsWith: '-isolation' } },
    select: { id: true }
  })
  if (mine.length === 0) return
  const ids = mine.map((w) => w.id)
  // Tenant rows cascade from Workspace, but delete explicitly so a missing
  // cascade would surface here rather than leaving orphans behind.
  await db.notification.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.activityLog.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.message.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.task.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.project.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.client.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.refreshToken.deleteMany({ where: { user: { workspaceId: { in: ids } } } })
  await db.user.deleteMany({ where: { workspaceId: { in: ids } } })
  await db.workspace.deleteMany({ where: { id: { in: ids } } })
}

export const seedTwoWorkspaces = async (db: PrismaClient): Promise<Fixture> => {
  await cleanup(db)
  const a = await seedWorkspace(db, 'alpha-isolation', 'Alpha')
  const b = await seedWorkspace(db, 'beta-isolation', 'Beta')
  return { a, b }
}
