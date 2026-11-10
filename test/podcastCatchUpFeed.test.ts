import { describe, expect, it, vi } from 'vitest'
import PodcastCatchUpFeed from '~/components/bookshelf/PodcastCatchUpFeed.vue'

// The bug this guards: disconnecting to offline mode left Catch up spinning forever. The offline
// branch of loadEpisodes returns before the `finally` that clears isLoading, so the episodes were
// loaded and then never shown.
//
// Only the method is exercised - nothing is mounted and setup() never runs.
const loadEpisodes = (PodcastCatchUpFeed as unknown as { methods: Record<string, unknown> }).methods.loadEpisodes as (this: unknown) => Promise<void>

function feed({ isOffline, offlineEpisodes = vi.fn().mockResolvedValue(undefined) }: { isOffline: boolean; offlineEpisodes?: ReturnType<typeof vi.fn> }) {
  return {
    currentLibraryId: 'lib-1',
    isLoading: false,
    episodes: [] as unknown[],
    offlineToastShown: false,
    appStore: { isOffline, offlineModeEnabled: isOffline },
    localStore: { setCachedLatestEpisodes: vi.fn() },
    nativeHttp: { get: vi.fn().mockResolvedValue({ episodes: [{ id: 'ep-1' }] }) },
    useOfflineEpisodes: offlineEpisodes
  }
}

describe('PodcastCatchUpFeed.loadEpisodes', () => {
  it('stops spinning after falling back to offline episodes', async () => {
    const vm = feed({ isOffline: true })

    await loadEpisodes.call(vm)

    expect(vm.useOfflineEpisodes).toHaveBeenCalledOnce()
    expect(vm.isLoading).toBe(false)
  })

  it('stops spinning even when the offline fallback throws', async () => {
    const vm = feed({ isOffline: true, offlineEpisodes: vi.fn().mockRejectedValue(new Error('db unavailable')) })

    await expect(loadEpisodes.call(vm)).rejects.toThrow('db unavailable')

    expect(vm.isLoading).toBe(false)
  })

  it('stops spinning after a successful server fetch', async () => {
    const vm = feed({ isOffline: false })

    await loadEpisodes.call(vm)

    expect(vm.episodes).toEqual([{ id: 'ep-1' }])
    expect(vm.isLoading).toBe(false)
  })

  it('stops spinning after the server fetch fails', async () => {
    const vm = feed({ isOffline: false })
    vm.nativeHttp.get = vi.fn().mockRejectedValue(new Error('timeout'))

    await loadEpisodes.call(vm)

    expect(vm.useOfflineEpisodes).toHaveBeenCalledOnce()
    expect(vm.isLoading).toBe(false)
  })

  it('does nothing without a library', async () => {
    const vm = feed({ isOffline: true })
    vm.currentLibraryId = ''

    await loadEpisodes.call(vm)

    expect(vm.isLoading).toBe(false)
    expect(vm.useOfflineEpisodes).not.toHaveBeenCalled()
  })
})
