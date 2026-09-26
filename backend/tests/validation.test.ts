import { describe, expect, it } from 'vitest'
import { taskQuerySchema } from '../src/schemas/task.schema'

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

})
