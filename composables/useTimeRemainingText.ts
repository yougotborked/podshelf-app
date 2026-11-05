import { listeningTimeRemaining } from '~/composables/useMediaProgress'

/**
 * "69 min remaining · 41 min at 1.7x".
 *
 * The real remaining time always leads: a details page describes the episode, and its length
 * does not change with how fast someone listens. At any speed but 1x the time it will actually
 * take follows, labelled with that speed - the figure the player shows, so the two screens can
 * be read against each other instead of looking contradictory.
 */
export function useTimeRemainingText() {
  const { $getString, $elapsedPretty } = useNuxtApp() as any
  return (audioSecondsRemaining: number, playbackRate: number) => {
    const remaining = $getString('LabelTimeRemaining', [$elapsedPretty(audioSecondsRemaining)])
    if (!playbackRate || playbackRate === 1) return remaining
    const atSpeed = $elapsedPretty(listeningTimeRemaining(audioSecondsRemaining, 0, playbackRate))
    return `${remaining} · ${$getString('LabelTimeAtSpeed', [atSpeed, playbackRate])}`
  }
}
