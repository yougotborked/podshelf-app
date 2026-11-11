import { ref, readonly, onMounted, onBeforeUnmount } from 'vue'
import { registerPlugin } from '@capacitor/core'

/**
 * Fold posture, as reported by the native side.
 *
 * "Posture" is only about a half-opened device. A foldable lying flat is `flat`, same as a phone:
 * there is a hinge either way, and nothing the layout should do about it.
 */
export type FoldPosture = 'flat' | 'tabletop' | 'book'

export type FoldState = {
  posture: FoldPosture
  /** Centre of the hinge along the axis it divides, 0..1. Zero when flat. */
  hingeFraction: number
  /** How much of that axis the hinge occupies. Zero on a seamless fold. */
  hingeThicknessFraction: number
}

export const FLAT: FoldState = { posture: 'flat', hingeFraction: 0, hingeThicknessFraction: 0 }

/**
 * Smallest share of the screen a pane may get before splitting stops being worth it.
 *
 * A hinge near an edge would leave a sliver that fits neither artwork nor controls, so the layout
 * stays whole rather than produce two panes one of which is unusable. Phones that report a hinge
 * at the very top or bottom exist - a cover screen on some devices does exactly that.
 */
export const MIN_PANE_FRACTION = 0.3

/**
 * Normalises whatever the bridge hands over.
 *
 * Defensive because this crosses the native boundary: an older build of the app, a plugin that
 * failed to load, or the web fallback can all produce something that is not a FoldState, and the
 * right answer to all of them is to lay out as if the device were flat.
 */
export function parseFoldState(raw: unknown): FoldState {
  if (!raw || typeof raw !== 'object') return FLAT
  const value = raw as Record<string, unknown>

  const posture = value.posture
  if (posture !== 'tabletop' && posture !== 'book') return FLAT

  const hingeFraction = Number(value.hingeFraction)
  const hingeThicknessFraction = Number(value.hingeThicknessFraction)
  if (!Number.isFinite(hingeFraction)) return FLAT

  return {
    posture,
    hingeFraction: Math.min(Math.max(hingeFraction, 0), 1),
    hingeThicknessFraction: Number.isFinite(hingeThicknessFraction)
      ? Math.min(Math.max(hingeThicknessFraction, 0), 1)
      : 0
  }
}

/**
 * Whether a screen should be split across the hinge.
 *
 * Tabletop only. In book posture the two halves sit side by side and the player has nothing to
 * put in a second column - a second pane there would be empty space with a seam down it.
 */
export function shouldSplitAtHinge(state: FoldState): boolean {
  if (state.posture !== 'tabletop') return false

  const half = state.hingeThicknessFraction / 2
  const top = state.hingeFraction - half
  const bottom = 1 - (state.hingeFraction + half)

  return top >= MIN_PANE_FRACTION && bottom >= MIN_PANE_FRACTION
}

/**
 * The two panes either side of the hinge, as percentages for `flex-basis`.
 *
 * Returns null when the screen should not be split, so a caller can use one branch for both
 * cases rather than checking the posture itself.
 */
export function hingeSplit(state: FoldState): { topPercent: number; bottomPercent: number; hingePercent: number } | null {
  if (!shouldSplitAtHinge(state)) return null

  const half = state.hingeThicknessFraction / 2
  return {
    topPercent: (state.hingeFraction - half) * 100,
    hingePercent: state.hingeThicknessFraction * 100,
    bottomPercent: (1 - (state.hingeFraction + half)) * 100
  }
}

type FoldPosturePlugin = {
  getPosture(): Promise<FoldState>
  addListener(
    event: 'onFoldPostureChanged',
    cb: (state: FoldState) => void
  ): Promise<{ remove: () => void }>
}

let plugin: FoldPosturePlugin | null = null

/**
 * Registered on first use rather than at module scope, so the pure exports above can be imported
 * - by a test, or by a module that only wants the rules - without a bridge existing.
 */
function foldPosturePlugin(): FoldPosturePlugin {
  if (!plugin) {
    plugin = registerPlugin<FoldPosturePlugin>('AbsFoldPosture', {
      // Every non-Android platform, and the browser the screenshot harness runs in.
      web: () => ({
        getPosture: () => Promise.resolve(FLAT),
        addListener: () => Promise.resolve({ remove: () => undefined })
      })
    })
  }
  return plugin
}

/**
 * The device's current fold posture, kept up to date.
 *
 * Asks for the posture on mount as well as subscribing: a page that mounts after the last fold
 * would otherwise sit on `flat` until the device was folded again.
 */
export function useFoldPosture() {
  const state = ref<FoldState>(FLAT)
  let remove: (() => void) | null = null

  onMounted(async () => {
    const api = foldPosturePlugin()

    try {
      const handle = await api.addListener('onFoldPostureChanged', (next) => {
        state.value = parseFoldState(next)
      })
      remove = handle.remove
    } catch (error) {
      console.warn('[useFoldPosture] Could not subscribe to posture changes', error)
    }

    try {
      state.value = parseFoldState(await api.getPosture())
    } catch (error) {
      console.warn('[useFoldPosture] Could not read the current posture', error)
    }
  })

  onBeforeUnmount(() => {
    remove?.()
    remove = null
  })

  return { foldState: readonly(state) }
}
