import { describe, expect, it } from 'vitest'
import { RESUME_STALE_AFTER_MS, isResumeStale, progressRefreshOwedAfter, shouldCheckServerOnResume, shouldRefreshProgressOnReconnect } from '~/composables/useResumeRefresh'

// The bug this guards: after an hour backgrounded, the webview's copy of the user's media
// progress was an hour old, so Catch up offered a finished episode from where it stood before
// the screen went off. Local progress was reloaded on resume; the server's copy was not.
describe('isResumeStale', () => {
  it('treats a long time away as stale', () => {
    expect(isResumeStale(60 * 60 * 1000)).toBe(true)
    expect(isResumeStale(RESUME_STALE_AFTER_MS + 1)).toBe(true)
  })

  it('does not treat flipping away and back as stale', () => {
    expect(isResumeStale(0)).toBe(false)
    expect(isResumeStale(1500)).toBe(false)
    expect(isResumeStale(RESUME_STALE_AFTER_MS)).toBe(false)
  })

  it('treats a missing or malformed elapsed time as stale', () => {
    // Better to re-read than to keep an hour-old position on a bad clock reading.
    expect(isResumeStale(Number.NaN)).toBe(true)
    expect(isResumeStale(Number.POSITIVE_INFINITY)).toBe(true)
  })
})

describe('shouldCheckServerOnResume', () => {
  const online = {
    elapsedMs: 60 * 60 * 1000,
    offlineModeEnabled: false,
    networkConnected: true,
    hasServerConnectionConfig: true
  }

  it('checks the server after a long time away', () => {
    expect(shouldCheckServerOnResume(online)).toBe(true)
  })

  it('does not check after a brief switch away', () => {
    expect(shouldCheckServerOnResume({ ...online, elapsedMs: 2000 })).toBe(false)
  })

  it('never overrides offline mode', () => {
    expect(shouldCheckServerOnResume({ ...online, offlineModeEnabled: true })).toBe(false)
  })

  it('does not reach out with no connection', () => {
    expect(shouldCheckServerOnResume({ ...online, networkConnected: false })).toBe(false)
  })

  it('does not reach out with no server configured', () => {
    expect(shouldCheckServerOnResume({ ...online, hasServerConnectionConfig: false })).toBe(false)
  })
})

// The bug this guards: the user listened to an episode with the screen off, and on waking the
// phone could not reach the server for a few seconds, so the one refresh of the server's progress
// was skipped. The retry that later reached the server never asked again, and Catch up kept
// showing that episode with no progress at its full length while the player, which knows the real
// position, sat at 58% of it.
describe('progressRefreshOwedAfter', () => {
  it('stays owed when the server could not be reached', () => {
    expect(progressRefreshOwedAfter('server-unreachable')).toBe(true)
  })

  it('stays owed when the progress request itself failed', () => {
    expect(progressRefreshOwedAfter('refresh-failed')).toBe(true)
  })

  it('becomes owed when the socket missed updates', () => {
    expect(progressRefreshOwedAfter('socket-down-long')).toBe(true)
  })

  it('is settled only by a refresh that succeeded', () => {
    expect(progressRefreshOwedAfter('refreshed')).toBe(false)
  })

  it('a failed attempt after an unreachable one is still owed, a success then settles it', () => {
    expect(progressRefreshOwedAfter('server-unreachable')).toBe(true)
    expect(progressRefreshOwedAfter('refresh-failed')).toBe(true)
    expect(progressRefreshOwedAfter('refreshed')).toBe(false)
  })
})

describe('shouldRefreshProgressOnReconnect', () => {
  it('refreshes after the socket was down long enough to miss updates', () => {
    expect(shouldRefreshProgressOnReconnect(RESUME_STALE_AFTER_MS + 1, false)).toBe(true)
    expect(shouldRefreshProgressOnReconnect(10 * 60 * 1000, false)).toBe(true)
  })

  it('ignores a blip', () => {
    expect(shouldRefreshProgressOnReconnect(2000, false)).toBe(false)
    expect(shouldRefreshProgressOnReconnect(RESUME_STALE_AFTER_MS, false)).toBe(false)
  })

  it('has nothing to refresh on the first connection of a session', () => {
    expect(shouldRefreshProgressOnReconnect(0, false)).toBe(false)
    expect(shouldRefreshProgressOnReconnect(-5, false)).toBe(false)
    expect(shouldRefreshProgressOnReconnect(Number.NaN, false)).toBe(false)
  })

  it('never overrides offline mode', () => {
    expect(shouldRefreshProgressOnReconnect(10 * 60 * 1000, true)).toBe(false)
  })
})
