import { Role, type PrismaClient } from '@prisma/client'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { prisma } from '../../src/lib/prisma'
import { runInTenant } from '../../src/lib/tenant-context'
import { cleanup, hasTestDatabase, rawClient, seedTwoWorkspaces, type Fixture } from './fixture'

/**
 * Email is unique per workspace, not globally.
 *
 * The same person may work for more than one company, so shared@example.test
 * must be creatable in both workspaces while still being rejected twice inside
 * one. These run against a real database because the guarantee is a database
 * constraint — a mock would only prove the test's own assumptions.
 */
const describeIfDb = hasTestDatabase() ? describe : describe.skip

const SHARED = 'shared@example.test'
const SHARED_NAME = 'Shared Person'
const DUPLICATE = /Unique constraint|User_workspaceId_email_key|duplicate key/i

describeIfDb('user email uniqueness is per workspace', () => {
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

  const mk = (workspaceId: string, role: Role, email = SHARED, name = SHARED_NAME) =>
    db.user.create({ data: { name, email, passwordHash: 'x', role, workspaceId } })

  // 1
  it('rejects the same email twice in the SAME workspace', async () => {
    await mk(fx.a.id, Role.DEVELOPER)
    await expect(mk(fx.a.id, Role.DEVELOPER)).rejects.toThrow(DUPLICATE)
  })

  // 2
  it('allows the same email in a DIFFERENT workspace', async () => {
    const inB = await mk(fx.b.id, Role.DEVELOPER)
    expect(inB.email).toBe(SHARED)
    expect(inB.workspaceId).toBe(fx.b.id)

    // Both rows exist, one per workspace.
    const rows = await db.user.findMany({ where: { email: SHARED }, select: { workspaceId: true } })
    expect(rows).toHaveLength(2)
    expect(new Set(rows.map((r) => r.workspaceId))).toEqual(new Set([fx.a.id, fx.b.id]))
  })

  // 3
  it('allows the same NAME in a different workspace', async () => {
    const a = await mk(fx.a.id, Role.DEVELOPER, 'namecheck@example.test', 'Same Name')
    const b = await mk(fx.b.id, Role.DEVELOPER, 'namecheck@example.test', 'Same Name')
    expect(a.name).toBe(b.name)
    expect(a.workspaceId).not.toBe(b.workspaceId)
  })

  // 4 — name carries no uniqueness rule in this application, by design: two
  // colleagues may share a name. Only email identifies an account.
  it('allows the same NAME twice in one workspace, with distinct emails', async () => {
    const first = await mk(fx.a.id, Role.DEVELOPER, 'dupname1@example.test', 'Duplicate Name')
    const second = await mk(fx.a.id, Role.DEVELOPER, 'dupname2@example.test', 'Duplicate Name')
    expect(first.name).toBe(second.name)
    expect(first.workspaceId).toBe(second.workspaceId)
    expect(first.id).not.toBe(second.id)
  })

  // 5, 6, 7 — the rule holds for every role, and roles do not interact with it.
  it.each([
    ['admin', Role.ADMIN],
    ['pm', Role.PROJECT_MANAGER],
    ['developer', Role.DEVELOPER]
  ])('a %s email in A does not conflict with the same %s email in B', async (label, role) => {
    const email = `${label}@roles.example.test`
    const a = await mk(fx.a.id, role, email, `A ${label}`)
    const b = await mk(fx.b.id, role, email, `B ${label}`)
    expect(a.email).toBe(b.email)
    expect(a.role).toBe(b.role)
    expect(a.workspaceId).not.toBe(b.workspaceId)

    // ...and still rejected a second time within one workspace.
    await expect(mk(fx.a.id, role, email, `A ${label} again`)).rejects.toThrow(DUPLICATE)
  })

  // 8
  it('keeps cross-workspace access impossible', async () => {
    const inA = await mk(fx.a.id, Role.DEVELOPER, 'cross@example.test', 'Cross A')
    const inB = await mk(fx.b.id, Role.DEVELOPER, 'cross@example.test', 'Cross B')

    await runInTenant({ workspaceId: fx.a.id }, async () => {
      expect(await prisma.user.findFirst({ where: { id: inA.id } })).not.toBeNull()
      // Same email, other workspace: invisible.
      expect(await prisma.user.findFirst({ where: { id: inB.id } })).toBeNull()
      const byEmail = await prisma.user.findMany({ where: { email: 'cross@example.test' } })
      expect(byEmail).toHaveLength(1)
      expect(byEmail[0]?.workspaceId).toBe(fx.a.id)
    })
  })

  // 9
  it('a matching email does not grant a workspace A user access to workspace B', async () => {
    const inB = await mk(fx.b.id, Role.ADMIN, 'twin@example.test', 'Twin B')
    await mk(fx.a.id, Role.ADMIN, 'twin@example.test', 'Twin A')

    // Acting as workspace A, holding an identical address, B's row and B's
    // project both remain unreachable — including for an ADMIN.
    await runInTenant({ workspaceId: fx.a.id }, async () => {
      expect(await prisma.user.findFirst({ where: { id: inB.id } })).toBeNull()
      expect(await prisma.project.findFirst({ where: { id: fx.b.projectId } })).toBeNull()
      const updated = await prisma.user.updateMany({
        where: { id: inB.id },
        data: { name: 'HIJACKED' }
      })
      expect(updated.count).toBe(0)
    })
    const untouched = await db.user.findUnique({ where: { id: inB.id } })
    expect(untouched?.name).toBe('Twin B')
  })

  // 10
  it('leaves refresh-token behaviour keyed on the user, not the email', async () => {
    const a = await mk(fx.a.id, Role.DEVELOPER, 'token@example.test', 'Token A')
    const b = await mk(fx.b.id, Role.DEVELOPER, 'token@example.test', 'Token B')

    const tokenA = await db.refreshToken.create({
      data: {
        userId: a.id,
        tokenHash: `hash-a-${Date.now()}`,
        expiresAt: new Date(Date.now() + 86_400_000)
      }
    })

    // The identical address in B has no session of its own.
    expect(await db.refreshToken.count({ where: { userId: b.id } })).toBe(0)
    const loaded = await db.refreshToken.findUnique({
      where: { id: tokenA.id },
      include: { user: { select: { id: true, workspaceId: true } } }
    })
    expect(loaded?.user.id).toBe(a.id)
    expect(loaded?.user.workspaceId).toBe(fx.a.id)

    await db.refreshToken.delete({ where: { id: tokenA.id } })
  })

  it('enforces the composite key in the database, not just in Prisma', async () => {
    const email = 'dblevel@example.test'
    await mk(fx.b.id, Role.DEVELOPER, email, 'DB Level')
    // Raw SQL bypasses Prisma entirely: the constraint must be the database's.
    await expect(
      db.$executeRawUnsafe(
        'INSERT INTO "User" ("id","name","email","passwordHash","role","workspaceId","updatedAt") ' +
          "VALUES (gen_random_uuid(), 'Raw', $1, 'x', 'DEVELOPER', $2::uuid, now())",
        email,
        fx.b.id
      )
      // Postgres unique_violation. Prisma wraps raw failures, so the code and
      // the offending key are what surface rather than its own wording.
    ).rejects.toThrow(/23505|Key \("workspaceId", email\)/i)
  })
})
