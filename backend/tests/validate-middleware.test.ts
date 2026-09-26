import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'
import { validate } from '../src/validators/validate'

describe('validation middleware', () => {
  it('supports Express getter-backed query properties and preserves transformed values', () => {
    const req = {} as Record<string, unknown>
    Object.defineProperty(req, 'query', {
      get: () => ({ page: '2' }),
      configurable: true
    })
    req.body = {}
    req.params = {}
    const next = vi.fn()
    const middleware = validate({ query: z.object({ page: z.coerce.number().int() }) })

    middleware(req as never, {} as never, next)

    expect((req.query as { page: number }).page).toBe(2)
    expect(next).toHaveBeenCalledOnce()
  })
})
