/**
 * Delays between attempts to reach the server again, in milliseconds.
 *
 * Patchy coverage - driving through mountains, a lift, a tunnel - can flap for a long time. The
 * reconnect loop used to retry every 2s and then every 5s indefinitely, and each attempt spends
 * its timeout against a dead link, so the app stayed busy failing for the whole journey. Backing
 * off keeps the early attempts quick, for the common case where the link returns within seconds,
 * then settles to a cheap heartbeat.
 */
export const RECONNECT_BACKOFF_MS = [2000, 5000, 15000, 30000, 60000]

/**
 * The delay to wait before attempt number `attempts` (0-based), holding at the longest delay
 * rather than growing without bound.
 *
 * Out-of-range and malformed inputs clamp to the first delay: a bad count should retry sooner
 * than intended, never strand the app offline waiting for a delay that never elapses.
 */
export function reconnectDelayMs(attempts: number): number {
  const first = RECONNECT_BACKOFF_MS[0] ?? 2000
  if (!Number.isFinite(attempts) || attempts < 0) return first
  const index = Math.min(Math.floor(attempts), RECONNECT_BACKOFF_MS.length - 1)
  return RECONNECT_BACKOFF_MS[index] ?? first
}
