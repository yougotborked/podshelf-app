<template>
  <div class="w-full h-full">
    <div class="w-full h-full overflow-y-auto py-6 md:p-8">
      <div class="w-full flex justify-center">
        <covers-playlist-cover :items="playlistItems" :width="180" :height="180" />
      </div>
      <div class="flex-grow px-1 py-6">
        <div class="flex items-center px-3">
          <h1 class="text-xl font-sans">
            {{ playlistName }}
          </h1>
          <div class="flex-grow" />
          <ui-btn
            v-if="showPlayButton"
            color="success"
            :padding-x="4"
            :loading="playerIsStartingForThisMedia"
            small
            class="flex items-center justify-center mx-1 w-24"
            @click.stop="playClick"
          >
            <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : $strings.ButtonPlay }}</span>
          </ui-btn>
        </div>

        <div class="my-8 max-w-2xl px-3">
          <p class="text-base text-md-on-surface">{{ description }}</p>
        </div>

        <tables-playlist-items-table
          :items="playlistItems"
          :total-items="playlistTotalItems"
          :playlist-id="playlist.id"
          @showMore="showMore"
        />
      </div>
    </div>

    <modals-item-more-menu-modal
      v-model="showMoreMenu"
      :library-item="selectedLibraryItem ?? NO_LIBRARY_ITEM"
      :episode="selectedEpisode ?? undefined"
      :playlist="playlist"
      hide-rss-feed-option
      v-model:processing="processing"
      @removed-from-auto-playlist="onAutoPlaylistItemRemoved"
      @auto-playlist-rule-changed="onAutoPlaylistRuleChanged"
    />
    <div v-show="processing" class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center bg-md-scrim/50 z-50">
      <ui-loading-indicator />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryItem, Playlist, PlaylistItem, PodcastEpisode } from '~/types'
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { AbsDownloader, AbsLogger } from '@/plugins/capacitor'
import {
  buildUnfinishedAutoPlaylist,
  collectDownloadedEpisodeKeys,
  toCacheablePlaylist
} from '@/composables/useAutoPlaylist'

const MAX_QUEUE_ITEMS = 400
const MAX_LOG_LENGTH = 2000

function formatForLog(payload: unknown) {
  try {
    const json = JSON.stringify(payload)
    if (json.length > MAX_LOG_LENGTH) {
      return `${json.substring(0, MAX_LOG_LENGTH)}... (truncated)`
    }
    return json
  } catch (error) {
    return '[unserializable payload]'
  }
}

const route = useRoute()
const router = useRouter()
const eventBus = useEventBus()
const socket = useSocket()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const { hapticsImpact } = useHaptics()
const toast = useToast()
const strings = useStrings()
const appStore = useAppStore()
const userStore = useUserStore()

const id = route.params.id as string

// State
// shallowRef: the auto playlist holds hundreds of items, each with a nested library item and
// episode. Deep reactivity would proxy every one of those objects on assignment for no benefit -
// the list is always replaced wholesale, never mutated in place.
const playlist = shallowRef<Playlist>({ id, name: '', description: '', items: [], totalItems: 0 })
const showMoreMenu = ref(false)
const processing = ref(false)
// What the more-menu modal is given while nothing is selected; it is closed then.
const NO_LIBRARY_ITEM: LibraryItem = { id: '', media: { metadata: {} } }
const selectedLibraryItem = ref<LibraryItem | null>(null)
const selectedLibraryItemId = ref<string | null>(null)
const selectedEpisode = ref<PodcastEpisode | null>(null)
const selectedEpisodeId = ref<string | null>(null)
const mediaIdStartingPlayback = ref<string | null>(null)
const downloadedEpisodeKeys = ref<Set<string> | null>(null)

// Computed
const networkConnected = computed(() => !appStore.isOffline)
const playlistItems = computed(() => playlist.value.items)
const playlistTotalItems = computed(() => playlist.value.totalItems || playlistItems.value.length)
const playlistName = computed(() => playlist.value.name || '')
const description = computed(() => playlist.value.description || '')
const playableItems = computed(() => playlistItems.value.filter((item) => {
  const libraryItem = item.libraryItem || item.localLibraryItem
  if (!libraryItem) return false

  const hasLocalFallback = !!(item.localLibraryItem || item.localEpisode)
  if (libraryItem.isMissing || libraryItem.isInvalid) {
    if (!hasLocalFallback) return false
  }

  if (item.episode || item.localEpisode) return true

  const tracks = item.localLibraryItem?.media.tracks || libraryItem.media.tracks || []
  return tracks.length
}))
const playerIsPlaying = computed(() => appStore.playerIsPlaying && isOpenInPlayer.value)
const isOpenInPlayer = computed(() => {
  return !!playableItems.value.find((i) => {
    if (i.localLibraryItem && appStore.getIsMediaStreaming(i.localLibraryItem.id, i.localEpisode?.id)) return true
    return appStore.getIsMediaStreaming(i.libraryItemId ?? '', i.episodeId)
  })
})
const autoContinuePlaylists = computed(() => appStore.deviceData?.deviceSettings?.autoContinuePlaylists)
const showPlayButton = computed(() => playableItems.value.length)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  if (!mediaIdStartingPlayback.value) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  return mediaId === mediaIdStartingPlayback.value
})
const autoCacheUnplayedEpisodes = computed(() => appStore.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes)

// Watchers
watch(networkConnected, (newVal) => {
  if (!newVal) return

  const isUnfinished = route.params.id === 'unfinished'
  if (!playlist.value.items.length) {
    if (!isUnfinished || autoCacheUnplayedEpisodes.value) {
      setTimeout(() => {
        void fetchPlaylist()
      }, 1000)
    }
    return
  }

  void checkAutoDownload()
})

watch(autoCacheUnplayedEpisodes, (newVal) => {
  if (
    newVal &&
    route.params.id === 'unfinished' &&
    !playlist.value.items.length
  ) {
    void fetchPlaylist()
  }
})

// Methods
function isLocalId(id: unknown) {
  return typeof id === 'string' && id.startsWith('local')
}

interface QueueItemIds {
  serverLibraryItemId: string | null
  localLibraryItemId: string | null
  fallbackLibraryItemId: string | null
  serverEpisodeId: string | null
  localEpisodeId: string | null
  fallbackEpisodeId: string | null
}

function resolveQueueItemIds(item: PlaylistItem | null | undefined): QueueItemIds {
  if (!item || typeof item !== 'object') {
    return {
      serverLibraryItemId: null,
      localLibraryItemId: null,
      fallbackLibraryItemId: null,
      serverEpisodeId: null,
      localEpisodeId: null,
      fallbackEpisodeId: null
    }
  }

  const libraryItem: Partial<LibraryItem> = item.libraryItem ?? {}
  const rawLibraryItemId =
    item.libraryItemId ??
    libraryItem.libraryItemId ??
    libraryItem.id ??
    item.id ??
    null
  const serverLibraryItemId =
    item.serverLibraryItemId ??
    (!isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
    (!isLocalId(libraryItem.id) ? libraryItem.id : null) ??
    (!isLocalId(libraryItem.libraryItemId) ? libraryItem.libraryItemId : null) ??
    null
  const localLibraryItemId =
    item.localEpisode?.localLibraryItemId ??
    item.localLibraryItem?.id ??
    item.localLibraryItemId ??
    (isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
    (isLocalId(libraryItem.id) ? libraryItem.id : null) ??
    null

  const episode: Partial<PodcastEpisode> = item.episode ?? {}
  const rawEpisodeId =
    item.episodeId ??
    episode.id ??
    item.localEpisodeId ??
    null
  const serverEpisodeId =
    item.serverEpisodeId ??
    episode.serverEpisodeId ??
    (!isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
    null
  const localEpisodeId =
    item.localEpisode?.id ??
    item.localEpisodeId ??
    (isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
    null

  const fallbackLibraryItemId =
    localLibraryItemId ??
    serverLibraryItemId ??
    rawLibraryItemId ??
    null
  const fallbackEpisodeId =
    localEpisodeId ??
    serverEpisodeId ??
    rawEpisodeId ??
    null

  return {
    serverLibraryItemId,
    localLibraryItemId,
    fallbackLibraryItemId,
    serverEpisodeId,
    localEpisodeId,
    fallbackEpisodeId
  }
}

function normalizeQueueItem(item: PlaylistItem | null | undefined) {
  if (!item) return null

  const libraryItem: Partial<LibraryItem> = item.libraryItem ?? {}
  const rawLibraryItemId =
    item.libraryItemId ??
    libraryItem.libraryItemId ??
    libraryItem.id ??
    item.id ??
    null
  const serverLibraryItemId =
    item.serverLibraryItemId ??
    (!isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
    (!isLocalId(libraryItem.id) ? libraryItem.id : null) ??
    (!isLocalId(libraryItem.libraryItemId) ? libraryItem.libraryItemId : null) ??
    null
  const localLibraryItemId =
    item.localEpisode?.localLibraryItemId ??
    item.localLibraryItem?.id ??
    item.localLibraryItemId ??
    (isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
    (isLocalId(libraryItem.id) ? libraryItem.id : null) ??
    null

  const episode: Partial<PodcastEpisode> = item.episode ?? {}
  const rawEpisodeId =
    item.episodeId ??
    episode.id ??
    item.localEpisodeId ??
    null
  const serverEpisodeId =
    item.serverEpisodeId ??
    episode.serverEpisodeId ??
    (!isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
    null
  const localEpisodeId =
    item.localEpisode?.id ??
    item.localEpisodeId ??
    (isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
    null

  const resolvedLibraryItemId = serverLibraryItemId ?? localLibraryItemId ?? rawLibraryItemId

  if (!resolvedLibraryItemId) return null

  const playbackLibraryItemId =
    item.localLibraryItem?.id || localLibraryItemId || serverLibraryItemId || rawLibraryItemId
  const playbackEpisodeId =
    item.localEpisode?.id || localEpisodeId || serverEpisodeId || rawEpisodeId || null

  if (!playbackLibraryItemId) return null

  return {
    ...item,
    libraryItemId: resolvedLibraryItemId,
    episodeId: serverEpisodeId ?? localEpisodeId ?? rawEpisodeId ?? null,
    serverLibraryItemId,
    serverEpisodeId,
    localLibraryItemId,
    localEpisodeId,
    playbackLibraryItemId,
    playbackEpisodeId
  }
}

function getNormalizedPlayableItems() {
  const normalized = playableItems.value.map(normalizeQueueItem).filter((n): n is NonNullable<typeof n> => n !== null)
  const normalizedDetails = {
    totalPlayable: playableItems.value.length,
    normalizedCount: normalized.length,
    sample: normalized.slice(0, 5).map((item) => ({
      libraryItemId: item.libraryItemId,
      episodeId: item.episodeId,
      serverLibraryItemId: item.serverLibraryItemId,
      serverEpisodeId: item.serverEpisodeId,
      localLibraryItemId: item.localLibraryItemId,
      localEpisodeId: item.localEpisodeId,
      playbackLibraryItemId: item.playbackLibraryItemId,
      playbackEpisodeId: item.playbackEpisodeId
    }))
  }
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Normalized playable items: ${formatForLog(normalizedDetails)}`
  })
  return normalized
}

function buildQueueItems() {
  const normalized = getNormalizedPlayableItems()
  const queueItems = normalized
    .map((item) => {
      const ids = resolveQueueItemIds(item)
      const playbackLibraryItemId =
        item.playbackLibraryItemId || ids.localLibraryItemId || ids.serverLibraryItemId || ids.fallbackLibraryItemId
      const playbackEpisodeId =
        item.playbackEpisodeId ?? ids.localEpisodeId ?? ids.serverEpisodeId ?? ids.fallbackEpisodeId ?? null

      if (!playbackLibraryItemId) return null

      return {
        ...item,
        libraryItemId: ids.fallbackLibraryItemId ?? playbackLibraryItemId,
        episodeId: ids.fallbackEpisodeId,
        serverLibraryItemId: ids.serverLibraryItemId,
        serverEpisodeId: ids.serverEpisodeId,
        localLibraryItemId: ids.localLibraryItemId,
        localEpisodeId: ids.localEpisodeId,
        playbackLibraryItemId,
        playbackEpisodeId
      }
    })
    .filter((q): q is NonNullable<typeof q> => q !== null)

  const queueSample = queueItems.slice(0, 5).map((item) => ({
    libraryItemId: item.libraryItemId,
    episodeId: item.episodeId,
    serverLibraryItemId: item.serverLibraryItemId,
    serverEpisodeId: item.serverEpisodeId,
    localLibraryItemId: item.localLibraryItemId,
    localEpisodeId: item.localEpisodeId,
    playbackLibraryItemId: item.playbackLibraryItemId,
    playbackEpisodeId: item.playbackEpisodeId
  }))
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `buildQueueItems complete: ${formatForLog({
      normalizedCount: normalized.length,
      queueCount: queueItems.length,
      sample: queueSample
    })}`
  })

  return queueItems
}

async function fetchPlaylist() {
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Fetch playlist start: ${formatForLog({
      id: route.params.id,
      networkConnected: networkConnected.value,
      autoCacheUnplayedEpisodes: autoCacheUnplayedEpisodes.value
    })}`
  })
  const playlistId = route.params.id as string
  let fetchedPlaylist: Playlist
  if (playlistId === 'unfinished') {
    if (!autoCacheUnplayedEpisodes.value) {
      fetchedPlaylist = {
        id: 'unfinished',
        name: strings.LabelAutoUnfinishedPodcasts,
        description: '',
        items: [],
        totalItems: 0
      }
    } else {
      const { items, downloadedEpisodeKeys: depKeys, totalItems } = await buildUnfinishedAutoPlaylist(networkConnected.value)

      fetchedPlaylist = {
        id: 'unfinished',
        name: strings.LabelAutoUnfinishedPodcasts,
        description: '',
        items,
        totalItems
      }

      downloadedEpisodeKeys.value = depKeys
    }
  } else {
    if (appStore.isOffline) {
      AbsLogger.info({
        tag: 'PlaylistPage',
        message: `Not connected, skip fetching remote playlist: ${formatForLog({ id: playlistId })}`
      })
      void checkAutoDownload()
      return
    }
    const serverPlaylist = (await nativeHttp.get(`/api/playlists/${playlistId}`, { connectTimeout: 10000 }).catch(() => null)) as Playlist | null
    if (!serverPlaylist) return
    fetchedPlaylist = serverPlaylist
  }

  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Playlist fetched: ${formatForLog({
      id: fetchedPlaylist.id,
      items: fetchedPlaylist.items.length || 0,
      totalItems: fetchedPlaylist.totalItems,
      hasLocalDownloads: !!downloadedEpisodeKeys.value
    })}`
  })

  if (fetchedPlaylist.items.length) {
    const localLibraryItems = (await db.getLocalLibraryItems(fetchedPlaylist.items[0]?.libraryItem?.mediaType ?? null))
    if (localLibraryItems.length) {
      const localLibraryItemMap = new Map()
      const localEpisodesByLibraryItemId = new Map()

      localLibraryItems.forEach((localItem) => {
        const libraryItemId = localItem.libraryItemId
        if (!libraryItemId) return
        localLibraryItemMap.set(libraryItemId, localItem)

        const episodes = localItem.media.episodes || []
        if (episodes.length) {
          const episodeMap = new Map()
          episodes.forEach((episode) => {
            const key = episode.serverEpisodeId || episode.id
            if (key) {
              episodeMap.set(key, episode)
            }
          })
          if (episodeMap.size) {
            localEpisodesByLibraryItemId.set(libraryItemId, episodeMap)
          }
        }
      })

      fetchedPlaylist.items.forEach((playlistItem) => {
        const libraryItemId =
          playlistItem.libraryItemId ||
          playlistItem.libraryItem?.id ||
          playlistItem.libraryItem?.libraryItemId ||
          null
        if (!libraryItemId) return

        const matchingLocalLibraryItem = localLibraryItemMap.get(libraryItemId)
        if (!matchingLocalLibraryItem) return

        if (playlistItem.episode) {
          const episodeKey =
            playlistItem.episodeId ||
            playlistItem.episode.serverEpisodeId ||
            playlistItem.episode.id ||
            null
          if (!episodeKey) {
            playlistItem.localLibraryItem = matchingLocalLibraryItem
            return
          }

          const matchingLocalEpisode = localEpisodesByLibraryItemId.get(libraryItemId)?.get(episodeKey)
          if (matchingLocalEpisode) {
            playlistItem.localLibraryItem = matchingLocalLibraryItem
            playlistItem.localEpisode = matchingLocalEpisode
          }
        } else {
          playlistItem.localLibraryItem = matchingLocalLibraryItem
        }
      })
    }

    if (!downloadedEpisodeKeys.value) {
      downloadedEpisodeKeys.value = collectDownloadedEpisodeKeys(localLibraryItems as Record<string, unknown>[])
    }
  }
  fetchedPlaylist.totalItems = fetchedPlaylist.totalItems || fetchedPlaylist.items.length
  await localStore.setCachedPlaylist(toCacheablePlaylist(fetchedPlaylist))
  playlist.value = fetchedPlaylist
  const playlistSummary = {
    id: fetchedPlaylist.id,
    itemCount: fetchedPlaylist.items.length,
    totalItems: fetchedPlaylist.totalItems,
    firstItem: fetchedPlaylist.items[0]
      ? {
          libraryItemId:
            fetchedPlaylist.items[0].libraryItemId ||
            fetchedPlaylist.items[0].libraryItem?.libraryItemId ||
            fetchedPlaylist.items[0].libraryItem?.id,
          episodeId:
            fetchedPlaylist.items[0].episodeId ||
            fetchedPlaylist.items[0].episode?.serverEpisodeId ||
            fetchedPlaylist.items[0].episode?.id,
          hasLocalLibraryItem: !!fetchedPlaylist.items[0].localLibraryItem,
          hasLocalEpisode: !!fetchedPlaylist.items[0].localEpisode
        }
      : null
  }
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Playlist ready: ${formatForLog(playlistSummary)}`
  })
  void checkAutoDownload()
}

function showMore(playlistItem: PlaylistItem) {
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Show more requested: ${formatForLog({
      playlistItemId: playlistItem.id,
      playlistLibraryItemId:
        playlistItem.libraryItemId ||
        playlistItem.libraryItem?.libraryItemId ||
        playlistItem.libraryItem?.id ||
        null,
      playlistEpisodeId:
        playlistItem.episodeId ||
        playlistItem.episode?.serverEpisodeId ||
        playlistItem.episode?.id ||
        null,
      hasLocalLibraryItem: !!playlistItem.localLibraryItem,
      hasLocalEpisode: !!playlistItem.localEpisode
    })}`
  })
  const playlistLibraryItemId =
    playlistItem.libraryItemId || playlistItem.libraryItem?.libraryItemId || playlistItem.libraryItem?.id || null
  const playlistEpisodeId =
    playlistItem.episodeId || playlistItem.episode?.serverEpisodeId || playlistItem.episode?.id || null

  const useLocal = !!playlistItem.localLibraryItem
  const libraryItem = useLocal ? playlistItem.localLibraryItem : playlistItem.libraryItem
  const episode = useLocal ? playlistItem.localEpisode || playlistItem.episode : playlistItem.episode

  selectedLibraryItem.value = libraryItem
    ? {
        ...libraryItem,
        isLocal: useLocal,
        libraryItemId: playlistLibraryItemId || libraryItem.libraryItemId || libraryItem.id,
        id: playlistLibraryItemId || libraryItem.id
      }
    : null
  selectedEpisode.value = episode
    ? {
        ...episode,
        serverEpisodeId: playlistEpisodeId || episode.serverEpisodeId,
        id: playlistEpisodeId || episode.id,
        localEpisode: useLocal ? playlistItem.localEpisode || episode.localEpisode : episode.localEpisode
      }
    : null
  selectedLibraryItemId.value =
    playlistLibraryItemId ||
    null
  selectedEpisodeId.value =
    playlistEpisodeId ||
    null
  showMoreMenu.value = true
}

async function playClick() {
  if (playerIsStartingPlayback.value) return
  await hapticsImpact()

  if (playerIsPlaying.value && isOpenInPlayer.value) {
    eventBus.emit('pause-item')
  } else {
    playAll()
  }
}

function playAll() {
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Play button clicked: ${formatForLog({
      playerIsPlaying: playerIsPlaying.value,
      isOpenInPlayer: isOpenInPlayer.value,
      playerIsStartingPlayback: playerIsStartingPlayback.value,
      playlistId: playlist.value.id,
      playlistItems: playlist.value.items.length,
      playableItems: playableItems.value.length
    })}`
  })
  const normalizedQueue = buildQueueItems()
  if (!normalizedQueue.length) {
    toast.error('No playable items found')
    return
  }

  const queue = normalizedQueue.slice(0, MAX_QUEUE_ITEMS)
  if (queue.length < normalizedQueue.length) {
    toast.info(`Queue limited to ${queue.length} items`)
  }

  const nextItem = queue[0]
  if (!nextItem) return
  const queueDetails = {
    normalizedCount: normalizedQueue.length,
    queueCount: queue.length,
    truncated: queue.length < normalizedQueue.length,
    nextItem: {
      playbackLibraryItemId: nextItem.playbackLibraryItemId,
      playbackEpisodeId: nextItem.playbackEpisodeId,
      serverLibraryItemId: nextItem.serverLibraryItemId,
      serverEpisodeId: nextItem.serverEpisodeId,
      localLibraryItemId: nextItem.localLibraryItemId,
      localEpisodeId: nextItem.localEpisodeId
    },
    queueSample: queue.slice(0, 5).map((item) => ({
      playbackLibraryItemId: item.playbackLibraryItemId,
      playbackEpisodeId: item.playbackEpisodeId,
      serverLibraryItemId: item.serverLibraryItemId,
      serverEpisodeId: item.serverEpisodeId,
      localLibraryItemId: item.localLibraryItemId,
      localEpisodeId: item.localEpisodeId
    }))
  }
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Queue built for play: ${formatForLog(queueDetails)}`
  })
  mediaIdStartingPlayback.value = nextItem.playbackEpisodeId || nextItem.playbackLibraryItemId
  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = mediaIdStartingPlayback.value
  appStore.setPlayQueue(queue)
  appStore.setQueueIndex(0)
  const payload = {
    libraryItemId: nextItem.playbackLibraryItemId,
    episodeId: nextItem.playbackEpisodeId,
    serverLibraryItemId: nextItem.serverLibraryItemId,
    serverEpisodeId: nextItem.serverEpisodeId,
    forceLocal: !!nextItem.localLibraryItemId,
    queue,
    queueIndex: 0
  }
  AbsLogger.info({
    tag: 'PlaylistPage',
    message: `Emitting play-item: ${formatForLog({ payload, queueSize: queue.length })}`
  })
  eventBus.emit('play-item', payload)
}

function playNextItem() {
  const normalizedQueue = buildQueueItems()
  const nowIndex = normalizedQueue.findIndex((i) => {
    return appStore.getIsMediaStreaming(
      i.playbackLibraryItemId,
      i.playbackEpisodeId
    )
  })

  const nextItem = normalizedQueue.slice(nowIndex + 1).find((i) => {
    const prog = userStore.getUserMediaProgress(
      i.serverLibraryItemId || i.playbackLibraryItemId,
      i.serverEpisodeId || i.playbackEpisodeId
    )
    return !prog?.isFinished
  })

  if (nextItem) {
    const nextIndex = normalizedQueue.findIndex((i) => i === nextItem)
    mediaIdStartingPlayback.value = nextItem.playbackEpisodeId || nextItem.playbackLibraryItemId
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = mediaIdStartingPlayback.value
    appStore.setPlayQueue(normalizedQueue)
    appStore.setQueueIndex(nextIndex)
    const payload = {
      libraryItemId: nextItem.playbackLibraryItemId,
      episodeId: nextItem.playbackEpisodeId,
      serverLibraryItemId: nextItem.serverLibraryItemId,
      serverEpisodeId: nextItem.serverEpisodeId,
      forceLocal: !!nextItem.localLibraryItemId,
      queue: normalizedQueue,
      queueIndex: nextIndex
    }
    eventBus.emit('play-item', payload)
  }
}

function onPlaybackEnded() {
  // Matches the collection page. Until now nothing emitted playback-ended, so this never ran and
  // the setting it declares was never consulted.
  if (!autoContinuePlaylists.value) return
  playNextItem()
}

function playlistUpdated(updatedPlaylist: Playlist) {
  if (playlist.value.id !== updatedPlaylist.id) return
  playlist.value = updatedPlaylist
  void localStore.setCachedPlaylist(toCacheablePlaylist(updatedPlaylist))
}

async function onAutoPlaylistItemRemoved(options: Record<string, unknown> = {}) {
  if (playlist.value.id !== 'unfinished') return

  const libraryItemId =
    selectedLibraryItemId.value || selectedLibraryItem.value?.libraryItemId || selectedLibraryItem.value?.id
  const episodeId = selectedEpisodeId.value || selectedEpisode.value?.serverEpisodeId || selectedEpisode.value?.id || null
  if (!libraryItemId) return

  const index = playlist.value.items.findIndex((item) => {
    const itemLibraryId = item.libraryItemId || item.libraryItem?.id
    const itemEpisodeId = item.episodeId || item.episode?.serverEpisodeId || item.episode?.id || null
    return itemLibraryId === libraryItemId && itemEpisodeId === episodeId
  })

  if (index >= 0) {
    const items = playlist.value.items.slice()
    items.splice(index, 1)
    playlist.value = {
      ...playlist.value,
      items,
      totalItems: Math.max(0, (playlist.value.totalItems || 0) - 1)
    }
    void localStore.setCachedPlaylist(toCacheablePlaylist(playlist.value))
  }

  showMoreMenu.value = false

  if (options.refresh) {
    await fetchPlaylist()
  }
}

async function onAutoPlaylistRuleChanged() {
  showMoreMenu.value = false
  if (playlist.value.id !== 'unfinished') return
  await fetchPlaylist()
}

function libraryChanged() {
  // The auto playlist is built from every podcast library, so it is not tied to the selection
  if (playlist.value.id === 'unfinished') return
  // A server playlist's contents are shown in the context of its library
  void router.replace('/bookshelf/playlists')
}

function playlistRemoved(removedPlaylist: Playlist) {
  if (playlist.value.id === removedPlaylist.id) {
    void localStore.removeCachedPlaylist(removedPlaylist.id)
    void router.replace('/bookshelf/playlists')
  }
}

async function ensureDownloadedKeySet(mediaType = 'podcast') {
  if (downloadedEpisodeKeys.value instanceof Set) {
    return downloadedEpisodeKeys.value
  }

  const localLibraries = await db.getLocalLibraryItems(mediaType)
  downloadedEpisodeKeys.value = collectDownloadedEpisodeKeys(localLibraries as Record<string, unknown>[])
  return downloadedEpisodeKeys.value
}

async function checkAutoDownload() {
  if (!networkConnected.value) return
  if (!appStore.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes) return

  const mediaType = playlist.value.items[0]?.libraryItem?.mediaType || 'podcast'
  const downloadedKeys = await ensureDownloadedKeySet(mediaType)

  for (const qi of playlist.value.items) {
    const liId = qi.libraryItemId || qi.libraryItem?.libraryItemId || qi.libraryItem?.id
    const epId = qi.episodeId || qi.episode?.serverEpisodeId || qi.episode?.id
    if (!liId || !epId) continue

    const key = `${liId}_${epId}`
    if (downloadedKeys.has(key)) continue

    AbsDownloader.downloadLibraryItem({ libraryItemId: liId, episodeId: epId })
    downloadedKeys.add(key)
  }
}

onMounted(async () => {
  // Load cached playlist initially
  const cached = await localStore.getCachedPlaylist(id)
  const user = userStore.user
  const serverConfig = userStore.serverConnectionConfig

  if (!user && !serverConfig && networkConnected.value && !cached) {
    await navigateTo(`/connect?redirect=${route.path}`)
    return
  }

  if (cached) {
    playlist.value = {
      ...(cached as Playlist),
      totalItems: (cached.totalItems as number) || ((cached.items as unknown[] | undefined)?.length ?? 0)
    }
  }

  socket.$on('playlist_updated', playlistUpdated)
  socket.$on('playlist_removed', playlistRemoved)
  eventBus.on('playback-ended', onPlaybackEnded)
  eventBus.on('library-changed', libraryChanged)
  void fetchPlaylist()
})

onBeforeUnmount(() => {
  socket.$off('playlist_updated', playlistUpdated)
  socket.$off('playlist_removed', playlistRemoved)
  eventBus.off('playback-ended', onPlaybackEnded)
  eventBus.off('library-changed', libraryChanged)
})
</script>
