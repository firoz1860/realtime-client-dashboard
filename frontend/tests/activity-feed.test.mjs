import assert from 'node:assert/strict'
import test from 'node:test'
import { mergeActivity } from '../lib/activity-feed.ts'

test('catch-up fills missed events alongside already rendered activity without duplicates', () => {
  const a = { id: 'a', createdAt: '2026-09-26T10:00:00Z' }
  const b = { id: 'b', createdAt: '2026-09-26T11:00:00Z' }
  const c = { id: 'c', createdAt: '2026-09-26T12:00:00Z' }
  assert.deepEqual(mergeActivity([c, a], [a, b], 3).map((item) => item.id), ['c', 'b', 'a'])
})
