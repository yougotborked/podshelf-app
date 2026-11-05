/**
 * The single definition of "finished" for media progress.
 *
 * The app had three, which is why one episode could read differently on different screens:
 *
 *   - the Android local progress record set isFinished at progress >= 0.99
 *   - ItemTableRow and ItemMoreMenuModal treated >= 0.97 as finished for display
 *   - the podcast rows, the Catch up feed, the auto playlist and auto-download looked only at
 *     the isFinished flag, with no threshold at all
 *
 * So an episode a few seconds from the end could show "Finished" in one place, "19 sec left" in
 * another, and still sit in Catch up waiting to be played.
 *
 * The threshold matches the one the native layer writes, so what is shown and what is stored
 * agree. It is computed from progress the device already has, which is what keeps it working
 * offline: nothing here needs the server to have confirmed anything.
 */
export const FINISHED_PROGRESS_THRESHOLD = 0.99

export interface MaybeProgress {
  isFinished?: boolean
  progress?: number
}

/** Whether a progress record counts as finished: the stored flag, or close enough to the end. */
export function isProgressFinished(progress: MaybeProgress | null | undefined): boolean {
  if (!progress) return false
  if (progress.isFinished) return true
  const value = progress.progress
  return typeof value === 'number' && value >= FINISHED_PROGRESS_THRESHOLD
}

/**
 * How long the rest will take to listen to at the current speed.
 *
 * The player shows its remaining time this way, divided by the playback rate; a details page
 * shows minutes of audio. At 1.7x the same position read "-41:00" in the player and "69 min
 * remaining" on the page, which looked impossible rather than differently measured. The page
 * keeps the real figure and adds this one beside it, labelled with the speed.
 */
export function listeningTimeRemaining(duration: number | null | undefined, currentTime: number | null | undefined, playbackRate: number | null | undefined): number {
  const remaining = (Number(duration) || 0) - (Number(currentTime) || 0)
  if (remaining <= 0) return 0
  const rate = typeof playbackRate === 'number' && playbackRate > 0 ? playbackRate : 1
  return remaining / rate
}
