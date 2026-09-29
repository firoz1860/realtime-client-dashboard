import { afterEach, describe, expect, it } from 'vitest'
import { presenceService } from '../src/services/presence.service'

const WS_A = 'workspace-a'
const WS_B = 'workspace-b'

describe('presence tracking', () => {
  afterEach(() => presenceService.clear())

  it('counts a user once across multiple sockets and clears on the last disconnect', () => {
    presenceService.connect(WS_A, 'user-1', 'socket-1')
    presenceService.connect(WS_A, 'user-1', 'socket-2')
    expect(presenceService.count(WS_A)).toBe(1)
    expect(presenceService.isOnline(WS_A, 'user-1')).toBe(true)

    presenceService.disconnect(WS_A, 'user-1', 'socket-1')
    expect(presenceService.isOnline(WS_A, 'user-1')).toBe(true)
    expect(presenceService.count(WS_A)).toBe(1)

    presenceService.disconnect(WS_A, 'user-1', 'socket-2')
    expect(presenceService.isOnline(WS_A, 'user-1')).toBe(false)
    expect(presenceService.count(WS_A)).toBe(0)
  })

  // The reason this service is partitioned at all: an unpartitioned count was
  // surfaced as the admin dashboard's "Online now" KPI, so one company would
  // have seen another company's headcount.
  it('does not leak presence between workspaces', () => {
    presenceService.connect(WS_A, 'user-1', 'socket-1')
    presenceService.connect(WS_B, 'user-2', 'socket-2')
    presenceService.connect(WS_B, 'user-3', 'socket-3')

    expect(presenceService.count(WS_A)).toBe(1)
    expect(presenceService.count(WS_B)).toBe(2)

    expect(presenceService.isOnline(WS_A, 'user-2')).toBe(false)
    expect(presenceService.isOnline(WS_B, 'user-1')).toBe(false)

    // A disconnect in one workspace must not disturb the other.
    presenceService.disconnect(WS_B, 'user-2', 'socket-2')
    expect(presenceService.count(WS_B)).toBe(1)
    expect(presenceService.count(WS_A)).toBe(1)
  })

  it('reports zero for a workspace with no connections', () => {
    presenceService.connect(WS_A, 'user-1', 'socket-1')
    expect(presenceService.count('workspace-never-seen')).toBe(0)
    expect(presenceService.isOnline('workspace-never-seen', 'user-1')).toBe(false)
  })

  it('reuses the same user id independently in two workspaces', () => {
    // Emails are globally unique so this cannot happen today, but the store must
    // not silently merge identities if that constraint is ever relaxed.
    presenceService.connect(WS_A, 'shared-id', 'socket-a')
    presenceService.connect(WS_B, 'shared-id', 'socket-b')

    expect(presenceService.count(WS_A)).toBe(1)
    expect(presenceService.count(WS_B)).toBe(1)

    presenceService.disconnect(WS_A, 'shared-id', 'socket-a')
    expect(presenceService.isOnline(WS_A, 'shared-id')).toBe(false)
    expect(presenceService.isOnline(WS_B, 'shared-id')).toBe(true)
  })
})
