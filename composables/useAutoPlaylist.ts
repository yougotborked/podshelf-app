// Utility functions ported from mixins/autoPlaylistHelpers.js
import { ref } from 'vue'

/**
 * How a single podcast feeds the auto playlist.
 *
 * - `include` (the default) - every unplayed episode
 * - `latest`  - only the newest `limit` unplayed episodes, so one show with a long backlog cannot
 *               flood the list
 * - `exclude` - nothing at all
 */
export type AutoPlaylistPodcastMode = 'include' | 'latest' | 'exclude'

export interface AutoPlaylistPodcastRule {
  mode: AutoPlaylistPodcastMode
  limit?: number
}

export const AUTO_PLAYLIST_LATEST_LIMITS = [1, 3, 5, 10]

const DEFAULT_RULE: AutoPlaylistPodcastRule = { mode: 'include' }

// Mirrors what is on disk so menus can render the active rule without re-reading Preferences.
const podcastRules = ref<Record<string, AutoPlaylistPodcastRule>>({})

function normalizeRule(rule: AutoPlaylistPodcastRule | undefined | null): AutoPlaylistPodcastRule {
  if (!rule || rule.mode === 'include') return DEFAULT_RULE
  if (rule.mode === 'exclude') return { mode: 'exclude' }
  const limit = Number(rule.limit)
  // A `latest` rule without a usable limit would silently drop every episode
  if (!Number.isFinite(limit) || limit < 1) return DEFAULT_RULE
  return { mode: 'latest', limit: Math.floor(limit) }
}

/** Reads the stored rules from disk. Always hits Preferences so a user switch cannot go stale. */
export async function refreshAutoPlaylistPodcastRules(): Promise<Record<string, AutoPlaylistPodcastRule>> {
  const localStore = useLocalStore()
  podcastRules.value = await localStore.getAutoPlaylistPodcastRules()
  return podcastRules.value
}

export async function setAutoPlaylistPodcastRule(
  libraryItemId: string,
  rule: AutoPlaylistPodcastRule | null
): Promise<void> {
  if (!libraryItemId) return
  const localStore = useLocalStore()
  const rules = { ...(await localStore.getAutoPlaylistPodcastRules()) }
  const normalized = normalizeRule(rule)
  // The default is represented by the absence of an entry, keeping the stored object small
  if (normalized.mode === 'include') delete rules[libraryItemId]
  else rules[libraryItemId] = normalized
  await localStore.setAutoPlaylistPodcastRules(rules)
  podcastRules.value = rules
}

export function getAutoPlaylistPodcastRule(
  rules: Record<string, AutoPlaylistPodcastRule>,
  libraryItemId: string
): AutoPlaylistPodcastRule {
  return normalizeRule(rules?.[libraryItemId])
}

/**
 * Applies the per-podcast rules to a flat list of episodes.
 *
 * Episodes from an excluded podcast are dropped; a podcast with a `latest` rule keeps only its
 * newest N. Items with no podcast id pass through untouched.
 *
 * Capped podcasts are appended after the rest, so the caller re-sorts.
 */
export function applyPodcastRules<T>(
  items: T[],
  rules: Record<string, AutoPlaylistPodcastRule>,
  getPodcastId: (item: T) => string | undefined | null,
  getSortDate: (item: T) => number
): T[] {
  const kept: T[] = []
  const cappedByPodcast = new Map<string, { limit: number; items: T[] }>()

  for (const item of items) {
    const podcastId = getPodcastId(item)
    if (!podcastId) {
      kept.push(item)
      continue
    }
    const rule = getAutoPlaylistPodcastRule(rules, podcastId)
    if (rule.mode === 'exclude') continue
    if (rule.mode !== 'latest' || !rule.limit) {
      kept.push(item)
      continue
    }
    const existing = cappedByPodcast.get(podcastId)
    if (existing) existing.items.push(item)
    else cappedByPodcast.set(podcastId, { limit: rule.limit, items: [item] })
  }

  for (const { limit, items: podcastItems } of cappedByPodcast.values()) {
    if (podcastItems.length > limit) {
      podcastItems.sort((a, b) => getSortDate(b) - getSortDate(a))
      podcastItems.length = limit
    }
    for (const item of podcastItems) kept.push(item)
  }

  return kept
}

export function useAutoPlaylistPodcastRules() {
  return {
    rules: podcastRules,
    refresh: refreshAutoPlaylistPodcastRules,
    setRule: setAutoPlaylistPodcastRule,
    getRule: getAutoPlaylistPodcastRule
  }
}

function toEpisodeMetadataMap(metadataEntries: Record<string, unknown>[] = []): Map<string, Record<string, unknown>> {
  const map = new Map<string, Record<string, unknown>>()
  metadataEntries.forEach((entry) => {
    if (entry && entry.id) map.set(entry.id as string, entry)
  })
  return map
}

function mergeEpisodeMetadata(
  episodes: Record<string, unknown>[] = [],
  metadataMap: Map<string, Record<string, unknown>> | undefined
): Record<string, unknown>[] {
  if (!metadataMap || !metadataMap.size) return [...episodes]
  return episodes.map((episode) => {
    const serverId = (episode?.serverEpisodeId || episode?.id) as string | undefined
    if (!serverId) return episode
    if (episode.publishedAt || episode.pubDate) return episode
    const metadata = metadataMap.get(serverId)
    if (!metadata) return episode
    return { ...episode, publishedAt: metadata.publishedAt, pubDate: metadata.pubDate }
  })
}

async function fetchServerEpisodesInBatches(
  contexts: Array<{
    libraryId: string
    localEpisodeMap: Map<string, Record<string, unknown>>
    episodes: Record<string, unknown>[]
    useLocalEpisodesFallback(): void
  }>,
  nativeHttp: ReturnType<typeof useNativeHttp>,
  localStore: ReturnType<typeof useLocalStore>
): Promise<void> {
  if (!contexts.length) return
  const metadataWrites: Promise<void>[] = []
  const batchSize = 4

  for (let i = 0; i < contexts.length; i += batchSize) {
    const batch = contexts.slice(i, i + batchSize)
    const responses = await Promise.allSettled(
      batch.map((context) => nativeHttp.get(`/api/items/${context.libraryId}?expanded=1`, { connectTimeout: 10000 }))
    )
    responses.forEach((result, index) => {
      const context = batch[index]
      if (result.status !== 'fulfilled') { context.useLocalEpisodesFallback(); return }
      const serverItem = result.value as Record<string, unknown>
      const serverEpisodes = (serverItem?.media as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | undefined
      if (!Array.isArray(serverEpisodes) || !serverEpisodes.length) { context.useLocalEpisodesFallback(); return }

      context.episodes = serverEpisodes.map((serverEpisode) => {
        const localEpisode = context.localEpisodeMap.get(serverEpisode.id as string)
        return localEpisode ? { ...serverEpisode, localEpisode } : serverEpisode
      })
      const metadataForCache = serverEpisodes.map((serverEpisode) => ({
        id: serverEpisode.id,
        pubDate: serverEpisode.pubDate,
        publishedAt: serverEpisode.publishedAt
      }))
      metadataWrites.push(localStore.setEpisodeMetadata(context.libraryId, metadataForCache))
    })
  }
  if (metadataWrites.length) await Promise.allSettled(metadataWrites)
}

function getEpisodeSortDate(episode: Record<string, unknown>): number {
  if (!episode) return 0
  let value = episode.publishedAt ?? episode.pubDate
  if (!value) return 0
  if (typeof value === 'string') {
    const numeric = Number(value)
    if (!Number.isNaN(numeric)) value = numeric
  }
  if (typeof value === 'number') return value < 1e12 ? value * 1000 : value
  const parsed = Date.parse(value as string)
  return Number.isNaN(parsed) ? 0 : parsed
}

const MAX_AUTO_PLAYLIST_ITEMS = 400

function sanitizeTracks(tracks: Record<string, unknown>[] = []): Record<string, unknown>[] {
  if (!Array.isArray(tracks) || !tracks.length) return tracks
  return tracks.map((track) => {
    if (!track || typeof track !== 'object') return track
    const { chapters: _chapters, ...rest } = track as { chapters?: unknown; [k: string]: unknown }
    return rest
  })
}

function createPlaylistLibraryItem(libraryItem: Record<string, unknown> | null, libraryId: string): Record<string, unknown> {
  const resolvedLibraryId = libraryId || (libraryItem?.libraryItemId as string) || (libraryItem?.id as string)
  if (!libraryItem) return { id: resolvedLibraryId, libraryItemId: resolvedLibraryId }
  const { media, ...rest } = libraryItem as { media?: Record<string, unknown>; [k: string]: unknown }
  const sanitizedMedia = media ? { ...media } : undefined
  if (sanitizedMedia) {
    delete sanitizedMedia.episodes
    delete sanitizedMedia.chapters
    // A podcast description is several KB of HTML and nothing in the playlist renders it
    if (sanitizedMedia.metadata) sanitizedMedia.metadata = stripDescriptions(sanitizedMedia.metadata as Record<string, unknown>)
    if (sanitizedMedia.tracks) sanitizedMedia.tracks = sanitizeTracks(sanitizedMedia.tracks as Record<string, unknown>[])
  }
  return { ...rest, id: resolvedLibraryId, libraryItemId: resolvedLibraryId, media: sanitizedMedia }
}

/**
 * Drops the description fields.
 *
 * These are the single largest part of a playlist item - several KB of HTML per episode, times
 * hundreds of episodes - and the whole playlist is JSON-stringified into Preferences on every
 * refresh.  Nothing in the playlist UI reads them; the item page fetches its own copy.
 */
function stripDescriptions(source: Record<string, unknown>): Record<string, unknown> {
  const { description: _description, descriptionPlain: _descriptionPlain, ...rest } = source
  return rest
}

function createPlaylistEpisode(episode: Record<string, unknown>): Record<string, unknown> | null {
  if (!episode) return null
  const { localEpisode: _localEpisode, chapters: _chapters, waveform: _waveform, ...rest } = episode as {
    localEpisode?: unknown; chapters?: unknown; waveform?: unknown; [k: string]: unknown
  }
  return stripDescriptions(rest)
}

function sanitizeLocalEpisode(localEpisode: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!localEpisode) return null
  const { id, serverEpisodeId, localLibraryItemId, title, pubDate, publishedAt, duration, fileSize, audioTrack } = localEpisode as Record<string, unknown>
  return {
    id, serverEpisodeId, localLibraryItemId, title, pubDate, publishedAt, duration, fileSize,
    audioTrack: audioTrack ? { ...(audioTrack as Record<string, unknown>) } : undefined
  }
}

export function toCacheablePlaylist(playlist: Record<string, unknown>): Record<string, unknown> {
  if (!playlist) return playlist
  return {
    ...playlist,
    items: ((playlist.items as Record<string, unknown>[] | null | undefined) || []).map((item) => {
      const { localLibraryItem, localEpisode, ...rest } = (item || {}) as {
        localLibraryItem?: Record<string, unknown>; localEpisode?: Record<string, unknown>; [k: string]: unknown
      }
      const sanitized: Record<string, unknown> = { ...rest }
      // Server playlists arrive with full descriptions attached; they are never rendered here and
      // the whole playlist is stringified into Preferences on every refresh
      if (sanitized.libraryItem) {
        sanitized.libraryItem = createPlaylistLibraryItem(
          sanitized.libraryItem as Record<string, unknown>,
          ((sanitized.libraryItem as Record<string, unknown>).libraryItemId ||
            (sanitized.libraryItem as Record<string, unknown>).id ||
            rest.libraryItemId) as string
        )
      }
      if (sanitized.episode) sanitized.episode = createPlaylistEpisode(sanitized.episode as Record<string, unknown>)
      if (localLibraryItem) {
        sanitized.localLibraryItem = createPlaylistLibraryItem(
          localLibraryItem,
          (localLibraryItem.libraryItemId || localLibraryItem.id || rest.libraryItemId) as string
        )
      }
      if (localEpisode) sanitized.localEpisode = sanitizeLocalEpisode(localEpisode)
      return sanitized
    })
  }
}

export function collectDownloadedEpisodeKeys(localLibraries: Record<string, unknown>[] = []): Set<string> {
  const keys = new Set<string>()
  localLibraries.forEach((libraryItem) => {
    const libraryId = (libraryItem?.libraryItemId || libraryItem?.id) as string
    if (!libraryId) return
    const episodes = ((libraryItem?.media as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | null | undefined) || []
    episodes.forEach((episode) => {
      const serverId = (episode?.serverEpisodeId || episode?.id) as string
      if (!serverId) return
      keys.add(`${libraryId}_${serverId}`)
    })
  })
  return keys
}

export async function buildUnfinishedAutoPlaylist(networkConnected: boolean): Promise<{
  items: Record<string, unknown>[]
  downloadedEpisodeKeys: Set<string>
  totalItems: number
}> {
  const userStore = useUserStore()
  const globalsStore = useGlobalsStore()
  const db = useDb()
  const localStore = useLocalStore()
  const nativeHttp = useNativeHttp()

  const progressMap = new Map<string, Record<string, unknown>>()
  ;((userStore.user?.mediaProgress as Record<string, unknown>[] | null | undefined) || []).forEach((progress) => {
    if (progress?.episodeId) progressMap.set(progress.episodeId as string, progress)
  })
  ;(globalsStore.localMediaProgress || []).forEach((progress) => {
    if ((progress as Record<string, unknown> | null | undefined)?.episodeId) {
      progressMap.set((progress as Record<string, unknown>).episodeId as string, progress as Record<string, unknown>)
    }
  })

  const localLibraries = await db.getLocalLibraryItems('podcast') as Record<string, unknown>[]
  const downloadedEpisodeKeys = collectDownloadedEpisodeKeys(localLibraries)

  // Read from disk rather than the cached ref so a user switch cannot leave stale rules applied
  const podcastRuleMap = await refreshAutoPlaylistPodcastRules()

  const hasServerConnection = !!(userStore.serverConnectionConfig?.address && userStore.accessToken)
  const canFetchServerEpisodes = networkConnected && hasServerConnection

  const metadataResults = await Promise.allSettled(
    localLibraries.map((libraryItem) => {
      const libraryId = (libraryItem?.libraryItemId || libraryItem?.id) as string
      return libraryId ? localStore.getEpisodeMetadata(libraryId) : Promise.resolve([])
    })
  )

  const metadataByLibraryId = new Map<string, Map<string, Record<string, unknown>>>()
  metadataResults.forEach((result, index) => {
    const libraryItem = localLibraries[index]
    if (!libraryItem) return
    const libraryId = (libraryItem.libraryItemId || libraryItem.id) as string
    if (!libraryId) return
    const entries = result.status === 'fulfilled' && Array.isArray(result.value) ? result.value as Record<string, unknown>[] : []
    metadataByLibraryId.set(libraryId, toEpisodeMetadataMap(entries))
  })

  const playlistItems: Array<Record<string, unknown> & { sortDate: number }> = []
  const seen = new Set<string>()
  const libraryContexts: Array<{
    libraryItem: Record<string, unknown>
    libraryId: string
    rule: AutoPlaylistPodcastRule
    localEpisodeMap: Map<string, Record<string, unknown>>
    episodes: Record<string, unknown>[]
    needsServerDates: boolean
    useLocalEpisodesFallback(): void
  }> = []

  localLibraries.forEach((libraryItem) => {
    const libraryId = (libraryItem.libraryItemId || libraryItem.id) as string
    const rule = getAutoPlaylistPodcastRule(podcastRuleMap, libraryId)
    // Skip before the server round-trip below - an excluded podcast costs nothing
    if (rule.mode === 'exclude') return
    const localEpisodes = ((libraryItem?.media as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | null | undefined) || []
    const metadataMap = metadataByLibraryId.get(libraryId)

    const localEpisodeMap = new Map<string, Record<string, unknown>>()
    localEpisodes.forEach((episode) => {
      const serverId = (episode?.serverEpisodeId || episode?.id) as string
      if (serverId) localEpisodeMap.set(serverId, episode)
    })

    const context = {
      libraryItem,
      libraryId,
      rule,
      localEpisodeMap,
      episodes: mergeEpisodeMetadata(localEpisodes, metadataMap),
      needsServerDates: false,
      useLocalEpisodesFallback() {
        this.episodes = this.episodes.map((episode) => {
          const serverId = (episode?.serverEpisodeId || episode?.id) as string
          if (!serverId || episode.localEpisode) return episode
          const localEpisode = this.localEpisodeMap.get(serverId)
          return localEpisode ? { ...episode, localEpisode } : episode
        })
      }
    }

    const needsServerDates = canFetchServerEpisodes && context.episodes.some((episode) => !episode?.publishedAt && !episode?.pubDate)
    context.needsServerDates = needsServerDates
    if (!needsServerDates) context.useLocalEpisodesFallback()
    libraryContexts.push(context)
  })

  const contextsNeedingServerData = canFetchServerEpisodes ? libraryContexts.filter((c) => c.needsServerDates) : []
  if (contextsNeedingServerData.length) await fetchServerEpisodesInBatches(contextsNeedingServerData, nativeHttp, localStore)

  libraryContexts.forEach((context) => {
    const { libraryItem, libraryId, localEpisodeMap } = context
    // Built per podcast so a `latest` rule can cap this show without affecting the others
    const podcastItems: Array<Record<string, unknown> & { sortDate: number }> = []
    // One sanitized copy per podcast rather than one per episode
    const playlistLibraryItem = createPlaylistLibraryItem(libraryItem, libraryId)

    context.episodes.forEach((episode) => {
      const serverId = (episode?.serverEpisodeId || episode?.id) as string
      if (!serverId) return
      const progress = progressMap.get(serverId)
      if (isProgressFinished(progress as MaybeProgress)) return
      const key = `${libraryId}_${serverId}`
      if (seen.has(key)) return
      seen.add(key)
      const sortDate = getEpisodeSortDate(episode)
      const sanitizedEpisode = createPlaylistEpisode(episode)
      podcastItems.push({
        id: key,
        libraryItem: playlistLibraryItem,
        episode: sanitizedEpisode,
        libraryItemId: libraryId,
        episodeId: serverId,
        localLibraryItem: libraryItem,
        localEpisode: (episode.localEpisode as Record<string, unknown> | null | undefined) || localEpisodeMap.get(serverId) || null,
        sortDate
      })
    })

    const keptItems = applyPodcastRules(
      podcastItems,
      podcastRuleMap,
      () => libraryId,
      (item) => item.sortDate
    )

    // Avoid spreading into push - these arrays can be long enough to blow the argument limit
    for (const item of keptItems) playlistItems.push(item)
  })

  playlistItems.sort((a, b) => a.sortDate - b.sortDate)

  const totalItems = playlistItems.length
  let limitedItems: Record<string, unknown>[] = playlistItems
  if (playlistItems.length > MAX_AUTO_PLAYLIST_ITEMS) limitedItems = playlistItems.slice(-MAX_AUTO_PLAYLIST_ITEMS)
  limitedItems.forEach((item) => { delete item.sortDate })

  return { items: limitedItems, downloadedEpisodeKeys, totalItems }
}

export function useAutoPlaylist() {
  return {
    buildUnfinishedAutoPlaylist,
    toCacheablePlaylist,
    collectDownloadedEpisodeKeys,
    refreshAutoPlaylistPodcastRules,
    setAutoPlaylistPodcastRule,
    getAutoPlaylistPodcastRule,
    applyPodcastRules
  }
}
