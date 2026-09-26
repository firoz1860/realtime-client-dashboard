import { Role } from '@prisma/client'
import { describe, expect, it } from 'vitest'
import { assertProjectManageAccess, assertTaskAccess } from '../src/services/policy.service'

const admin = { id: 'admin', email: 'a@test.com', role: Role.ADMIN, isActive: true }
const pmA = { id: 'pm-a', email: 'pma@test.com', role: Role.PROJECT_MANAGER, isActive: true }
const pmB = { id: 'pm-b', email: 'pmb@test.com', role: Role.PROJECT_MANAGER, isActive: true }
const devA = { id: 'dev-a', email: 'da@test.com', role: Role.DEVELOPER, isActive: true }
const devB = { id: 'dev-b', email: 'db@test.com', role: Role.DEVELOPER, isActive: true }

describe('resource authorization', () => {
  it('allows admin to manage any project', () => {
    expect(() => assertProjectManageAccess(admin, { createdById: pmA.id })).not.toThrow()
  })

  it('allows PM to manage own project and denies another PM project', () => {
    expect(() => assertProjectManageAccess(pmA, { createdById: pmA.id })).not.toThrow()
    expect(() => assertProjectManageAccess(pmB, { createdById: pmA.id })).toThrowError(/permission/i)
  })

  it('allows developer assigned-task access and denies another developer task', () => {
    const task = { assignedDeveloperId: devA.id, project: { createdById: pmA.id } }
    expect(() => assertTaskAccess(devA, task)).not.toThrow()
    expect(() => assertTaskAccess(devB, task)).toThrowError(/permission/i)
  })

  it('denies developer access to PM project task unless assigned', () => {
    const task = { assignedDeveloperId: null, project: { createdById: pmA.id } }
    expect(() => assertTaskAccess(devA, task)).toThrowError(/permission/i)
  })
})
