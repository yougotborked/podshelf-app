import { describe, expect, it } from 'vitest'
import { resolvePlaybackTarget } from '../composables/usePlaybackTarget'

const downloaded = {
  serverLibraryItemId: 'li_server',
  serverEpisodeId: 'ep_server',
  localLibraryItemId: 'local_li',
  localEpisodeId: 'local_ep'
}

describe('resolvePlaybackTarget', () => {
  it('plays the download while online, rather than streaming what is already on the phone', () => {
    // The regression: catch-up "play next" on an auto-downloaded episode streamed it.
    expect(resolvePlaybackTarget({ ids: downloaded, isOffline: false })).toMatchObject({
      libraryItemId: 'local_li',
      episodeId: 'local_ep',
      usingLocalFallback: true,
      blockedByOffline: false
    })
  })

  it('plays the download offline', () => {
    expect(resolvePlaybackTarget({ ids: downloaded, isOffline: true }).libraryItemId).toBe('local_li')
  })

  it('streams to a Cast device, which cannot reach a file on the phone', () => {
    expect(resolvePlaybackTarget({ ids: downloaded, preferServerIds: true, isOffline: false })).toMatchObject({
      libraryItemId: 'li_server',
      episodeId: 'ep_server'
    })
  })

  it('streams what was never downloaded', () => {
    const ids = { serverLibraryItemId: 'li_server', serverEpisodeId: 'ep_server' }
    expect(resolvePlaybackTarget({ ids, isOffline: false })).toMatchObject({ libraryItemId: 'li_server', blockedByOffline: false })
  })

  it('says so when only the stream exists and the server is out of reach', () => {
    const ids = { serverLibraryItemId: 'li_server', serverEpisodeId: 'ep_server' }
    expect(resolvePlaybackTarget({ ids, isOffline: true }).blockedByOffline).toBe(true)
  })

  it('falls back to the server episode id when the download carries none of its own', () => {
    const ids = { serverLibraryItemId: 'li_server', serverEpisodeId: 'ep_server', localLibraryItemId: 'local_li' }
    expect(resolvePlaybackTarget({ ids }).episodeId).toBe('ep_server')
  })
})
