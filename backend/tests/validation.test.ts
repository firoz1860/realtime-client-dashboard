import { describe, expect, it } from 'vitest'
import { taskQuerySchema } from '../src/schemas/task.schema'
import { updateProfileBodySchema } from '../src/schemas/auth.schema'

describe('task query validation', () => {
  it('rejects inverted due-date ranges', () => {
    const parsed = taskQuerySchema.safeParse({
      dueDateFrom: '2026-09-30T00:00:00.000Z',
      dueDateTo: '2026-09-01T00:00:00.000Z'
    })
    expect(parsed.success).toBe(false)
  })

  it('limits page size to 100', () => {
    expect(taskQuerySchema.safeParse({ limit: '101' }).success).toBe(false)
  })

  it('accepts the date-only filter format used by the API contract', () => {
    const parsed = taskQuerySchema.safeParse({
      dueDateFrom: '2026-09-01',
      dueDateTo: '2026-09-30'
    })
    expect(parsed.success).toBe(true)
    if (parsed.success) {
      expect(parsed.data.dueDateFrom?.toISOString()).toBe('2026-09-01T00:00:00.000Z')
      expect(parsed.data.dueDateTo?.toISOString()).toBe('2026-09-30T23:59:59.999Z')
    }
  })

  it('rejects impossible calendar dates', () => {
    expect(taskQuerySchema.safeParse({ dueDateFrom: '2026-02-30' }).success).toBe(false)
  })

  it('accepts a bounded task search term and rejects empty searches', () => {
    const parsed = taskQuerySchema.safeParse({ search: '  launch  ' })
    expect(parsed.success).toBe(true)
    if (parsed.success) expect(parsed.data.search).toBe('launch')
    expect(taskQuerySchema.safeParse({ search: '  ' }).success).toBe(false)
  })

})

describe('profile validation', () => {
  it('allows only a trimmed display name and rejects role or password updates', () => {
    expect(updateProfileBodySchema.parse({ name: '  Firoz Ahmad  ' })).toEqual({ name: 'Firoz Ahmad' })
    expect(updateProfileBodySchema.safeParse({ name: 'Firoz', role: 'ADMIN' }).success).toBe(false)
    expect(updateProfileBodySchema.safeParse({ name: 'Firoz', password: 'new-password' }).success).toBe(false)
  })
})
