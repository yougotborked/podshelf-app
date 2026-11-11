/**
 * Where an episode's cover comes from, on a device that may have no server.
 *
 * A downloaded episode keeps its cover on disk. Asking the server for it instead is a request
 * that cannot succeed offline, and the fallback is a blank placeholder next to audio that plays
 * perfectly well - which is how minimal mode came to show its own mark while the real artwork sat
 * in the download folder.
 *
 * The rule lived in three places and behaved differently in each: the episode row preferred the
 * local file, the Catch up feed built a map of local covers to hand the row, and minimal mode
 * knew only about the server. This is the one definition.
 */

/** A local library item, as the device database returns it. */
export interface LocalLibraryItemCover {
  /** The id of the server item this download came from - what episodes carry. */
  libraryItemId?: string
  /** Where the cover was written on disk. */
  coverContentUrl?: string
  [key: string]: unknown
}

/**
 * Covers held on disk, keyed by *server* library item id.
 *
 * Keyed by the server id on purpose: that is the id an episode carries, so a list of episodes
 * from the server can be matched against downloads without another lookup.
 */
export function buildLocalCoverMap(localLibraryItems: (LocalLibraryItemCover | null | undefined)[] = []): Record<string, string> {
  const map: Record<string, string> = {}
  for (const item of localLibraryItems) {
    if (item?.libraryItemId && item.coverContentUrl) map[item.libraryItemId] = item.coverContentUrl
  }
  return map
}

export interface CoverSourceOptions {
  /** The cover on disk, if this episode is downloaded. */
  localCoverUrl?: string | null
  /** The server's cover URL, if there is a server to ask. */
  serverCoverSrc?: string | null
  /**
   * Turns a file path into something a webview can load. Injected rather than imported so the
   * rule can be exercised without Capacitor.
   */
  toFileUrl?: (path: string) => string
}

/**
 * The best cover available: the downloaded file first, the server second, nothing if neither.
 *
 * Local wins even when the server is reachable - the file is already there, so fetching the same
 * image over the network buys nothing.
 */
export function resolveCoverSrc({ localCoverUrl, serverCoverSrc, toFileUrl = (path) => path }: CoverSourceOptions = {}): string | null {
  if (localCoverUrl) return toFileUrl(localCoverUrl)
  return serverCoverSrc || null
}
