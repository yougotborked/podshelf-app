/**
 * Which copy of an item to play: the download on this device, or the server's stream.
 *
 * A download wins whenever there is one. It used to win only offline, so every downloaded
 * episode started from the catch-up list, minimal mode or an item page was streamed anyway -
 * buffering at speed, spending data, and making auto-download pointless while online. Only
 * playlists escaped, because they passed `forceLocal` to get round exactly this.
 *
 * Casting is the one exception: a Cast device fetches the audio itself, from the server, and
 * cannot reach a file on the phone.
 */
export interface PlaybackIds {
  serverLibraryItemId?: string | null
  localLibraryItemId?: string | null
  fallbackLibraryItemId?: string | null
  serverEpisodeId?: string | null
  localEpisodeId?: string | null
  fallbackEpisodeId?: string | null
}

export interface PlaybackTarget {
  libraryItemId: string | null | undefined
  episodeId: string | null | undefined
  /** A server copy existed and the download was chosen over it. */
  usingLocalFallback: boolean
  /** Only a server copy exists and the server cannot be reached. */
  blockedByOffline: boolean
}

export const isLocalId = (id: unknown): boolean => typeof id === 'string' && id.startsWith('local')

export function resolvePlaybackTarget({ ids, preferServerIds = false, isOffline = false }: { ids: PlaybackIds; preferServerIds?: boolean; isOffline?: boolean }): PlaybackTarget {
  const hasServerTarget = !!ids.serverLibraryItemId && !isLocalId(ids.serverLibraryItemId)
  const hasLocalTarget = !!ids.localLibraryItemId

  if (preferServerIds && hasServerTarget && !isOffline) {
    return { libraryItemId: ids.serverLibraryItemId, episodeId: ids.serverEpisodeId ?? null, usingLocalFallback: false, blockedByOffline: false }
  }

  if (hasLocalTarget) {
    return {
      libraryItemId: ids.localLibraryItemId,
      episodeId: ids.localEpisodeId ?? ids.serverEpisodeId ?? ids.fallbackEpisodeId,
      usingLocalFallback: hasServerTarget,
      blockedByOffline: false
    }
  }

  if (hasServerTarget) {
    return { libraryItemId: ids.serverLibraryItemId, episodeId: ids.serverEpisodeId ?? null, usingLocalFallback: false, blockedByOffline: isOffline }
  }

  return { libraryItemId: ids.fallbackLibraryItemId, episodeId: ids.fallbackEpisodeId, usingLocalFallback: false, blockedByOffline: isOffline }
}
