/**
 * What the app re-reads when it comes back to the foreground.
 *
 * The screen can be off for an hour mid-drive, and while it is the device keeps playing and
 * reporting progress straight to the server over HTTP. None of that reaches the webview: the
 * native player's progress events are dropped while the app is backgrounded, and the socket that
 * would otherwise deliver user_item_progress_updated is not connected.
 *
 * So on resume the webview's copy of the user's media progress can be badly out of date, and it
 * is what the catch-up feed and the auto playlist read - to decide which episodes are unplayed
 * and what time to resume them at. An episode listened to the end while backgrounded came back
 * at the position it held before the screen went off, sitting at the top of Catch up.
 *
 * Local progress was already reloaded on resume; the server's copy was not. These are the rules
 * for both.
 */

/**
 * How long out of focus before the app treats what it holds as stale.
 *
 * Short enough that a drive, a pocket or a charging break lands past it, long enough that
 * flipping to another app and straight back does not re-fetch anything.
 */
export const RESUME_STALE_AFTER_MS = 30000

/** Whether enough time passed out of focus to be worth re-reading anything. */
export function isResumeStale(elapsedMs: number): boolean {
  if (!Number.isFinite(elapsedMs)) return true
  return elapsedMs > RESUME_STALE_AFTER_MS
}

export interface ResumeServerContext {
  elapsedMs: number
  offlineModeEnabled: boolean
  networkConnected: boolean
  hasServerConnectionConfig: boolean
}

/**
 * Whether resuming should reach for the server at all.
 *
 * Offline mode is a deliberate choice, so it is never overridden here. With no connection or no
 * server configured there is nothing to ask.
 */
export function shouldCheckServerOnResume({
  elapsedMs,
  offlineModeEnabled,
  networkConnected,
  hasServerConnectionConfig
}: ResumeServerContext): boolean {
  if (!isResumeStale(elapsedMs)) return false
  if (offlineModeEnabled) return false
  if (!networkConnected) return false
  return hasServerConnectionConfig
}

/**
 * What happened to a refresh of the user's server-side media progress.
 *
 * - `refreshed`: the server's set was fetched and applied.
 * - `server-unreachable`: it was due, but the probe found no server (a phone that has just woken on
 *   mobile data usually cannot reach anything for a few seconds).
 * - `refresh-failed`: the server answered the probe, then the progress request itself failed.
 * - `socket-down-long`: the socket was down long enough that its progress updates were missed.
 */
export type ProgressRefreshEvent = 'refreshed' | 'server-unreachable' | 'refresh-failed' | 'socket-down-long'

/**
 * Whether a refresh of the server's progress is owed after `event`.
 *
 * It used to be a single attempt at the moment of resume. If that attempt met no server, the
 * scheduled retry reconnected the socket and synced *local* progress, but nothing ever asked the
 * server for its own again - so Catch up kept showing an episode with no progress, at its full
 * length, while the player (which knows the real position) sat at 58% of the same episode. A
 * refresh that could not happen is a debt, and it stays one until a refresh succeeds.
 */
export function progressRefreshOwedAfter(event: ProgressRefreshEvent): boolean {
  return event !== 'refreshed'
}

/**
 * Whether a socket that has just reconnected missed progress updates worth re-reading.
 *
 * `socketDownMs` is how long it was down, or 0/negative when it was never known to be down (the
 * first connection of a session), in which case there is nothing missed.
 */
export function shouldRefreshProgressOnReconnect(socketDownMs: number, offlineModeEnabled: boolean): boolean {
  if (offlineModeEnabled) return false
  if (!(socketDownMs > 0)) return false
  return isResumeStale(socketDownMs)
}
