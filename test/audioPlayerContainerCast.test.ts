import { describe, expect, it, vi } from 'vitest'
import AudioPlayerContainer from '~/components/app/AudioPlayerContainer.vue'

// The bug this guards: the native onMediaPlayerChanged event carries a player name string, not a
// session. It was handed straight to setPlaybackSession, which replaced currentPlaybackSession
// with the string "cast-player" — the player went blank, and isCasting read
// `"cast-player".mediaPlayer === 'cast-player'` (undefined) and stayed false for the whole cast.
//
// Only the method is exercised; nothing is mounted and setup() never runs.
const onMediaPlayerChanged = (AudioPlayerContainer as unknown as { methods: Record<string, unknown> }).methods.onMediaPlayerChanged as (this: unknown, data: { value: string }) => void

function container() {
  return {
    appStore: {
      setMediaPlayer: vi.fn(),
      setPlaybackSession: vi.fn()
    }
  }
}

describe('AudioPlayerContainer.onMediaPlayerChanged', () => {
  it('records the player without touching the playback session', () => {
    const vm = container()

    onMediaPlayerChanged.call(vm, { value: 'cast-player' })

    expect(vm.appStore.setMediaPlayer).toHaveBeenCalledWith('cast-player')
    // Handing a player name to setPlaybackSession is what blanked the player.
    expect(vm.appStore.setPlaybackSession).not.toHaveBeenCalled()
  })

  it('records a switch back to the local player', () => {
    const vm = container()

    onMediaPlayerChanged.call(vm, { value: 'exo-player' })

    expect(vm.appStore.setMediaPlayer).toHaveBeenCalledWith('exo-player')
    expect(vm.appStore.setPlaybackSession).not.toHaveBeenCalled()
  })
})
