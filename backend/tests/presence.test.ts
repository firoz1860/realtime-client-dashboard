import { afterEach, describe, expect, it } from 'vitest'
import { presenceService } from '../src/services/presence.service'

describe('multi-tab presence', () => {
  afterEach(() => presenceService.clear())

  it('keeps a user online until every socket disconnects', () => {
    presenceService.connect('user-1', 'socket-1')
    presenceService.connect('user-1', 'socket-2')
    expect(presenceService.count()).toBe(1)
    expect(presenceService.isOnline('user-1')).toBe(true)

    presenceService.disconnect('user-1', 'socket-1')
    expect(presenceService.isOnline('user-1')).toBe(true)
    expect(presenceService.count()).toBe(1)

    presenceService.disconnect('user-1', 'socket-2')
    expect(presenceService.isOnline('user-1')).toBe(false)
    expect(presenceService.count()).toBe(0)
  })
})
