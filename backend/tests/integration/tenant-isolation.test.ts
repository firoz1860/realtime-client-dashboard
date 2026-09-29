import type { PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma, TENANT_MODELS } from '../../src/lib/prisma'
import { runInTenant } from '../../src/lib/tenant-context'
import { cleanup, hasTestDatabase, rawClient, seedTwoWorkspaces, type Fixture } from './fixture'

/**
 * Tenant isolation, against a real database, with two workspaces.
 *
 * Spec: docs/superpowers/specs/2026-09-28-multi-tenant-workspaces-design.md §8
 *
 * `prisma` here is the extended client the application uses. Every assertion
 * runs it inside one workspace's scope and checks it cannot observe the other's
 * rows — which is the property the whole feature exists to provide.
 */
const describeIfDb = hasTestDatabase() ? describe : describe.skip

describeIfDb('tenant isolation (real database, two workspaces)', () => {
  let db: PrismaClient
  let fx: Fixture

  beforeAll(async () => {
    db = rawClient()
    fx = await seedTwoWorkspaces(db)
  }, 120_000)

  afterAll(async () => {
    await cleanup(db)
    await db.$disconnect()
  }, 120_000)

  // ---------------------------------------------------------------- fail-closed
  it('throws rather than returning every workspace when no scope is open', async () => {
    await expect(prisma.project.findMany()).rejects.toThrow(/no workspace context/i)
    await expect(prisma.user.findMany()).rejects.toThrow(/no workspace context/i)
    await expect(prisma.message.findMany()).rejects.toThrow(/no workspace context/i)
  })

  it('covers every model that carries a workspaceId column', async () => {
    const columns = await db.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.columns " +
        "WHERE column_name = 'workspaceId' AND table_schema = 'public'"
    )
    const withColumn = columns.map((c) => c.table_name).sort()
    expect(withColumn).toEqual([...TENANT_MODELS].sort())
  })

  // ------------------------------------------------------------------- per-model
  it('cannot read another workspace records, for any tenant model', async () => {
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      expect(await prisma.project.findFirst({ where: { id: fx.b.projectId } })).toBeNull()
      expect(await prisma.task.findFirst({ where: { id: fx.b.taskId } })).toBeNull()
      expect(await prisma.client.findFirst({ where: { id: fx.b.clientId } })).toBeNull()
      expect(await prisma.message.findFirst({ where: { id: fx.b.messageId } })).toBeNull()
      expect(await prisma.activityLog.findFirst({ where: { id: fx.b.activityId } })).toBeNull()
      expect(await prisma.notification.findFirst({ where: { id: fx.b.notificationId } })).toBeNull()
      expect(await prisma.user.findFirst({ where: { id: fx.b.adminId } })).toBeNull()

      // ...while its own rows stay reachable, so the filter is not simply
      // breaking every read.
      expect(await prisma.project.findFirst({ where: { id: fx.a.projectId } })).not.toBeNull()
      expect(await prisma.message.findFirst({ where: { id: fx.a.messageId } })).not.toBeNull()
    })
  })

  it('findUnique by id cannot cross a workspace', async () => {
    // findUnique is rewritten to findFirst so the non-unique tenant filter can
    // be applied; this proves the rewrite did not lose the filter.
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      expect(await prisma.project.findUnique({ where: { id: fx.b.projectId } })).toBeNull()
      expect(await prisma.task.findUnique({ where: { id: fx.b.taskId } })).toBeNull()
      expect(await prisma.project.findUnique({ where: { id: fx.a.projectId } })).not.toBeNull()
    })
  })

  it('cannot update or delete another workspace records', async () => {
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      const updated = await prisma.project.updateMany({
        where: { id: fx.b.projectId },
        data: { name: 'HIJACKED' }
      })
      expect(updated.count).toBe(0)

      const deleted = await prisma.task.deleteMany({ where: { id: fx.b.taskId } })
      expect(deleted.count).toBe(0)
    })

    // Verified from outside any scope: B's rows are untouched.
    const bProject = await db.project.findUnique({ where: { id: fx.b.projectId } })
    expect(bProject?.name).toBe('Beta Project')
    expect(await db.task.findUnique({ where: { id: fx.b.taskId } })).not.toBeNull()
  })

  // ----------------------------------------------------------------- enumeration
  it('never includes another workspace rows in list results or counts', async () => {
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      const projects = await prisma.project.findMany()
      expect(projects.map((p) => p.id)).not.toContain(fx.b.projectId)
      expect(projects.every((p) => p.workspaceId === fx.a.id)).toBe(true)

      const messages = await prisma.message.findMany()
      expect(messages.map((m) => m.body)).not.toContain('Beta confidential message')

      // Aggregates are the easiest thing to leave unscoped (spec §4.5).
      expect(await prisma.project.count()).toBe(1)
      expect(await prisma.task.count()).toBe(1)
      expect(await prisma.user.count()).toBe(3)

      const byStatus = await prisma.task.groupBy({ by: ['status'], _count: { _all: true } })
      expect(byStatus.reduce((sum, row) => sum + row._count._all, 0)).toBe(1)
    })
  })

  it('scopes writes to the active workspace even when the caller omits it', async () => {
    await runInTenant({ workspaceId: fx.b.id }, async () => {
      // workspaceId is intentionally omitted: the extension must supply it.
      // Prisma's generated input type still requires the field, so the argument
      // is cast while the RESULT keeps its type, unlike `as never`.
      const created = await prisma.client.create({
        data: { name: 'Scoped Client', email: 'scoped@beta.isolation.test' } as unknown as {
          name: string
          email: string
          workspaceId: string
        }
      })
      expect(created.workspaceId).toBe(fx.b.id)
      await prisma.client.deleteMany({ where: { id: created.id } })
    })
  })

  // --------------------------------------------------------------- admin bypass
  it('an ADMIN of one workspace cannot reach another workspace project', async () => {
    // policy.service grants ADMIN a blanket pass on ownership checks, so the
    // only thing standing between an admin and another company's data is the
    // tenant filter. This is the test that retires that concern.
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      const admin = await prisma.user.findFirst({ where: { id: fx.a.adminId } })
      expect(admin?.role).toBe('ADMIN')
      expect(await prisma.project.findFirst({ where: { id: fx.b.projectId } })).toBeNull()
      expect(await prisma.user.findFirst({ where: { id: fx.b.developerId } })).toBeNull()
    })
  })

  it('keeps both workspaces symmetric', async () => {
    await runInTenant({ workspaceId: fx.b.id }, async () => {
      expect(await prisma.project.findFirst({ where: { id: fx.a.projectId } })).toBeNull()
      expect(await prisma.project.findFirst({ where: { id: fx.b.projectId } })).not.toBeNull()
      expect(await prisma.project.count()).toBe(1)
    })
  })

  // ------------------------------------------------------------ db invariants
  it('refuses a non-SUPER_ADMIN user without a workspace', async () => {
    await expect(
      db.user.create({
        data: {
          name: 'No Workspace',
          email: 'noworkspace@isolation.test',
          passwordHash: 'x',
          role: 'ADMIN'
        }
      })
    ).rejects.toThrow(/user_workspace_role_ck|check constraint/i)
  })

  it('refuses a SUPER_ADMIN that is attached to a workspace', async () => {
    await expect(
      db.user.create({
        data: {
          name: 'Bad Super',
          email: 'badsuper@isolation.test',
          passwordHash: 'x',
          role: 'SUPER_ADMIN',
          workspaceId: fx.a.id
        }
      })
    ).rejects.toThrow(/user_workspace_role_ck|check constraint/i)
  })

  it('accepts a SUPER_ADMIN with no workspace', async () => {
    const su = await db.user.create({
      data: {
        name: 'Platform Admin',
        email: 'super@isolation.test',
        passwordHash: 'x',
        role: 'SUPER_ADMIN'
      }
    })
    expect(su.workspaceId).toBeNull()
    await db.user.delete({ where: { id: su.id } })
  })

  it('cascades tenant rows when a workspace is deleted', async () => {
    const throwaway = await db.workspace.create({
      data: { name: 'Throwaway', slug: 'throwaway-isolation' }
    })
    const user = await db.user.create({
      data: {
        name: 'Throwaway User',
        email: 'throwaway@isolation.test',
        passwordHash: 'x',
        role: 'ADMIN',
        workspaceId: throwaway.id
      }
    })
    await db.workspace.delete({ where: { id: throwaway.id } })
    expect(await db.user.findUnique({ where: { id: user.id } })).toBeNull()
  })
})
