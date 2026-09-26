import assert from 'node:assert/strict'
import test from 'node:test'
import { datePresetRange, isInDateRange } from '../lib/date-filter.ts'

test('date presets follow the current calendar month and handle year rollover', () => {
  const now = new Date(2027, 0, 15)
  assert.deepEqual(datePresetRange('Last month', now), { from: '2026-12-01', to: '2026-12-31' })
  assert.deepEqual(datePresetRange('This month', now), { from: '2027-01-01', to: '2027-01-31' })
})

test('date range includes its last calendar day and excludes other days', () => {
  assert.equal(isInDateRange('2026-09-30T23:55:00Z', '2026-09-01', '2026-09-30'), true)
  assert.equal(isInDateRange('2026-10-01T00:00:00Z', '2026-09-01', '2026-09-30'), false)
  assert.equal(isInDateRange(null, '2026-09-01', '2026-09-30'), false)
})
