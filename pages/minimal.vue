<template>
  <div class="w-full h-full flex flex-col items-center justify-between px-6 py-5 bg-md-surface-1 overflow-hidden">
    <!-- The only chrome: a way out, and how much is left -->
    <div class="w-full flex items-center justify-between shrink-0">
      <button type="button" :aria-label="strings.ButtonLeaveMinimalMode" class="h-11 w-11 -ml-2 flex items-center justify-center rounded-md-full text-md-on-surface-variant active:opacity-60" @click="leave">
        <span class="material-symbols text-2xl">close_fullscreen</span>
      </button>
      <p v-if="remainingCount" class="text-md-label-l text-md-on-surface-variant tabular-nums">{{ remainingLabel }}</p>
    </div>

    <template v-if="isLoading">
      <widgets-loading-spinner />
      <div class="shrink-0" />
    </template>

    <!-- Nothing queued. Said plainly, because there is no list here to go and look at -->
    <template v-else-if="!current">
      <div class="flex-1 min-h-0 flex flex-col items-center justify-center text-center gap-3">
        <span class="material-symbols text-6xl text-md-primary">check_circle</span>
        <p class="text-md-title-l text-md-on-surface">{{ strings.MessageMinimalModeCaughtUp }}</p>
        <p class="text-md-body-m text-md-on-surface-variant max-w-xs">{{ strings.MessageMinimalModeCaughtUpSub }}</p>
      </div>
      <button type="button" class="shrink-0 h-12 px-6 rounded-md-full bg-md-surface-3 text-md-on-surface text-md-label-l active:opacity-60" @click="refresh">{{ strings.ButtonCheckForNewEpisodes }}</button>
    </template>

    <template v-else>
      <!-- What is playing. Two lines, both large enough to read at arm's length -->
      <div class="flex-1 min-h-0 w-full flex flex-col items-center justify-center gap-5">
        <div v-if="coverSrc" class="shrink min-h-0 aspect-square max-h-72 rounded-md-lg overflow-hidden elevation-2 bg-md-surface-3">
          <img :src="coverSrc" :alt="showTitle" class="w-full h-full object-cover" @error="coverFailed = true" />
        </div>
        <div v-else class="shrink-0 h-28 w-28 rounded-md-lg flex items-center justify-center bg-md-surface-3 text-md-primary">
          <ui-podshelf-mark class="w-14 h-14" />
        </div>

        <div class="w-full text-center">
          <p class="text-md-title-m text-md-on-surface font-semibold leading-snug line-clamp-2">{{ episodeTitle }}</p>
          <p class="text-md-body-m text-md-on-surface-variant mt-1 truncate">{{ showTitle }}</p>
        </div>
      </div>

      <!-- Controls. One size says "this is the button": the rest are deliberately quieter -->
      <div class="w-full shrink-0 flex flex-col items-center gap-4">
        <div class="w-full">
          <div class="w-full h-1.5 rounded-md-full bg-md-surface-4 overflow-hidden">
            <div class="h-full bg-md-primary rounded-md-full transition-all duration-500" :style="{ width: `${progressPercent}%` }" />
          </div>
          <div class="w-full flex items-center justify-between mt-1.5">
            <span class="text-md-label-m text-md-on-surface-variant tabular-nums">{{ elapsedLabel }}</span>
            <span class="text-md-label-m text-md-on-surface-variant tabular-nums">-{{ remainingTimeLabel }}</span>
          </div>
        </div>

        <div class="w-full flex items-center justify-between">
          <button type="button" :aria-label="strings.LabelJumpBackwards" class="h-14 w-14 flex items-center justify-center rounded-md-full text-md-on-surface active:opacity-60 disabled:opacity-30" :disabled="!hasSession" @click="jumpBackwards">
            <span class="material-symbols text-3xl">replay</span>
          </button>

          <button type="button" :aria-label="strings.LabelPlay" class="h-24 w-24 flex items-center justify-center rounded-md-full bg-md-primary text-md-on-primary elevation-2 active:scale-95 transition-transform disabled:opacity-50" :disabled="isStarting" @click="togglePlay">
            <span class="material-symbols" style="font-size: 3.25rem; line-height: 1">{{ isPlaying ? 'pause' : 'play_arrow' }}</span>
          </button>

          <button type="button" :aria-label="strings.LabelJumpForward" class="h-14 w-14 flex items-center justify-center rounded-md-full text-md-on-surface active:opacity-60 disabled:opacity-30" :disabled="!hasSession" @click="jumpForward">
            <span class="material-symbols text-3xl">forward_media</span>
          </button>
        </div>

        <div class="w-full flex items-center justify-between">
          <button type="button" :aria-label="strings.LabelPlaybackSpeed" class="h-11 px-4 rounded-md-full bg-md-surface-3 text-md-on-surface font-mono text-md-label-l active:opacity-60" @click="cycleSpeed">{{ playbackRate }}x</button>
          <button type="button" :aria-label="strings.ButtonNextEpisode" class="h-11 px-4 rounded-md-full bg-md-surface-3 text-md-on-surface text-md-label-l flex items-center gap-1.5 active:opacity-60 disabled:opacity-30" :disabled="!hasNext" @click="skipNext">
            <span class="material-symbols text-xl leading-none">skip_next</span>
            {{ strings.ButtonNextEpisode }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Minimal mode: the whole app reduced to one play control over the catch-up queue.
 *
 * It decides what to play by reading the library, so there is nothing here to browse. The
 * ordering is `orderListeningQueue` with `resumeFirst` - the same rules as the Catch up list, the
 * one difference being that a half-heard episode comes first, because a single play button that
 * starts something new while an episode is part-listened is the one thing it must not do.
 *
 * Playback is the app's existing path: the queue goes to the store and `play-item` to the player
 * the layout already mounts. Nothing here opens a stream itself.
 */
import { Capacitor } from '@capacitor/core'
import { AbsAudioPlayer } from '~/plugins/capacitor'
import { buildLocalCoverMap, resolveCoverSrc } from '~/composables/useCoverSource'
import { localEpisodesAsQueueCandidates, orderListeningQueue, queueItemStartTime, restrictToDownloaded, toPlayQueueItems, type ListeningEpisode, type ProgressLookup, type QueueProgress } from '~/composables/useListeningQueue'
import { useAutoPlaylistPodcastRules } from '~/composables/useAutoPlaylist'

// Speeds worth reaching with a single tap. The full set lives behind the normal player's modal;
// a surface with one button should not grow a picker.
const SPEED_CYCLE = [1, 1.25, 1.5, 1.75, 2]

const appStore = useAppStore()
const userStore = useUserStore()
const globalsStore = useGlobalsStore()
const librariesStore = useLibrariesStore()
const localStore = useLocalStore()
const nativeHttp = useNativeHttp()
const eventBus = useEventBus()
const db = useDb()
const strings = useStrings()
const router = useRouter()
const { secondsToTimestamp } = useUtils()
const { impact: hapticsImpact } = useHaptics()
const { rules: podcastRules, refresh: refreshPodcastRules } = useAutoPlaylistPodcastRules()

const episodes = ref<ListeningEpisode[]>([])
const localLibraryItems = ref<Record<string, unknown>[]>([])
const isLoading = ref(true)
const currentTime = ref(0)
const totalDuration = ref(0)
const playbackRate = ref(1)
const coverFailed = ref(false)

const isPlaying = computed(() => appStore.playerIsPlaying)
const isStarting = computed(() => appStore.playerIsStartingPlayback)
const hasSession = computed(() => !!appStore.currentPlaybackSession)

// Keyed by server episode id, which is what both a server episode and a normalised download
// carry - so one lookup serves the online queue and the offline one
const localEpisodeMap = computed(() => {
  const map: Record<string, Record<string, unknown>> = {}
  for (const item of localLibraryItems.value) {
    const media = item.media as Record<string, unknown> | undefined
    const mediaEpisodes = (media?.episodes as Record<string, unknown>[] | null | undefined) || []
    for (const localEpisode of mediaEpisodes) {
      if (localEpisode.serverEpisodeId) {
        map[localEpisode.serverEpisodeId as string] = { ...localEpisode, localLibraryItemId: item.id }
      }
    }
  }
  return map
})

const progressLookup = computed<ProgressLookup>(() => ({
  server: (libraryItemId: string, episodeId: string | null) => userStore.getUserMediaProgress(libraryItemId, episodeId) as QueueProgress | null,
  local: (libraryItemId: string, episodeId: string | null) => globalsStore.getLocalMediaProgressByServerItemId(libraryItemId, episodeId) as QueueProgress | null
}))

/** The queue, resume-first: an episode already started is finished before anything new begins. */
const queue = computed(() => orderListeningQueue(episodes.value, { rules: podcastRules.value, lookup: progressLookup.value, resumeFirst: true }))

/**
 * What is on screen: whatever the player has open, else the head of the queue.
 *
 * Preferring the session matters once playback has moved on - the native player advances the
 * queue itself, and the episode it moved to is still unfinished, so the queue's own head would
 * name the episode behind it.
 */
const current = computed<ListeningEpisode | null>(() => {
  const session = appStore.currentPlaybackSession as Record<string, unknown> | null
  const sessionEpisodeId = (session?.episodeId || session?.localEpisodeId) as string | undefined
  if (sessionEpisodeId) {
    const match = queue.value.find((episode) => episode.id === sessionEpisodeId)
    if (match) return match
  }
  return queue.value[0] || null
})

const currentIndex = computed(() => (current.value ? queue.value.indexOf(current.value) : -1))
const hasNext = computed(() => currentIndex.value >= 0 && currentIndex.value < queue.value.length - 1)
const remainingCount = computed(() => (currentIndex.value < 0 ? queue.value.length : queue.value.length - currentIndex.value))
const remainingLabel = computed(() => getString('LabelNumEpisodes', [remainingCount.value]))

const episodeTitle = computed(() => {
  const session = appStore.currentPlaybackSession as Record<string, unknown> | null
  if (session?.displayTitle) return session.displayTitle as string
  return (current.value?.title as string) || ''
})

const showTitle = computed(() => {
  const podcast = (current.value?.podcast as Record<string, unknown> | null | undefined) || {}
  const metadata = (podcast.metadata as Record<string, unknown> | null | undefined) || {}
  if (metadata.title) return metadata.title as string
  const session = appStore.currentPlaybackSession as Record<string, unknown> | null
  return (session?.displayAuthor as string) || ''
})

const localCoverMap = computed(() => buildLocalCoverMap(localLibraryItems.value))

const coverSrc = computed(() => {
  if (coverFailed.value) return null
  const libraryItemId = current.value?.libraryItemId
  if (!libraryItemId) return null
  // The downloaded cover first: offline, the server URL is a request that cannot succeed, and
  // the fallback is a blank placeholder beside audio that plays perfectly well
  return resolveCoverSrc({
    localCoverUrl: localCoverMap.value[libraryItemId],
    serverCoverSrc: globalsStore.getLibraryItemCoverSrcById(libraryItemId),
    toFileUrl: (path) => Capacitor.convertFileSrc(path)
  })
})

// Duration falls back to the episode's own figure so the bar is not empty before the first
// metadata event arrives
const durationSeconds = computed(() => totalDuration.value || Number(current.value?.duration || 0) || 0)
const progressPercent = computed(() => {
  if (!durationSeconds.value) return 0
  return Math.min(100, Math.max(0, (currentTime.value / durationSeconds.value) * 100))
})
const elapsedLabel = computed(() => secondsToTimestamp(currentTime.value))
const remainingTimeLabel = computed(() => secondsToTimestamp(Math.max(0, durationSeconds.value - currentTime.value)))

async function loadLocalItems() {
  localLibraryItems.value = ((await db.getLocalLibraryItems('podcast')) as Record<string, unknown>[] | null | undefined) || []
}

async function loadEpisodes() {
  const libraryId = librariesStore.currentLibraryId
  if (!libraryId) {
    isLoading.value = false
    return
  }

  // Offline is not a failure to report here: there is no list and no indicator on this screen,
  // so the useful thing is simply to play what is on the device.
  if (appStore.isOffline) {
    await useCachedOrLocalEpisodes(libraryId)
    isLoading.value = false
    return
  }

  try {
    const payload = (await nativeHttp.get(`/api/libraries/${libraryId}/recent-episodes?limit=200`, { connectTimeout: 10000 })) as Record<string, unknown> | null
    if (!payload) throw new Error('Empty response payload')
    episodes.value = (payload.episodes as ListeningEpisode[] | null | undefined) || []
    void localStore.setCachedLatestEpisodes(libraryId, episodes.value)
  } catch (error) {
    console.error('[minimal] Failed to get recent episodes', error)
    await useCachedOrLocalEpisodes(libraryId)
  } finally {
    isLoading.value = false
  }
}

/**
 * The queue with no server: only what is on disk.
 *
 * The cached list is the library's recent episodes, most of which are streams - offering one
 * offline starts a connection that cannot be made, and on a surface with one button there is
 * nothing to do about it. So the cache is kept for its metadata (titles, dates, progress) but
 * filtered to downloads, and the download folder itself is the fallback when there is no cache.
 */
async function useCachedOrLocalEpisodes(libraryId: string) {
  const downloaded = localEpisodesAsQueueCandidates(localLibraryItems.value)
  const downloadedServerIds = new Set(downloaded.map((episode) => episode.id))

  const cached = ((await localStore.getCachedLatestEpisodes(libraryId)) as ListeningEpisode[] | null | undefined) || []
  const playableFromCache = restrictToDownloaded(cached, (episode) => downloadedServerIds.has(episode.id))
  if (playableFromCache.length) {
    episodes.value = playableFromCache
    return
  }

  episodes.value = downloaded
}

/** Hands the whole queue to the player, starting at `index`, resuming where it was left off. */
function startQueueAt(index: number) {
  const items = toPlayQueueItems(queue.value, (episode) => localEpisodeMap.value[episode.id || ''])
  if (!items.length) return
  const start = Math.min(Math.max(index, 0), items.length - 1)
  const first = items[start]
  if (!first) return
  const startTime = queueItemStartTime(first, progressLookup.value)

  appStore.setPlayQueue(items)
  appStore.setQueueIndex(start)
  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = first.serverEpisodeId || first.episodeId

  eventBus.emit('play-item', {
    libraryItemId: first.libraryItemId,
    episodeId: first.episodeId,
    serverLibraryItemId: first.serverLibraryItemId,
    serverEpisodeId: first.serverEpisodeId,
    queue: items,
    queueIndex: start,
    ...(startTime ? { startTime } : {})
  })
}

async function togglePlay() {
  await hapticsImpact()
  // The first tap has no session to toggle - it is what starts the queue
  if (!hasSession.value) {
    startQueueAt(Math.max(currentIndex.value, 0))
    return
  }
  AbsAudioPlayer.playPause()
}

async function skipNext() {
  await hapticsImpact()
  if (!hasNext.value) return
  if (hasSession.value) {
    eventBus.emit('skip-next-queue')
    return
  }
  startQueueAt(currentIndex.value + 1)
}

async function jumpBackwards() {
  await hapticsImpact()
  AbsAudioPlayer.seekBackward({ value: appStore.getJumpBackwardsTime })
}

async function jumpForward() {
  await hapticsImpact()
  AbsAudioPlayer.seekForward({ value: appStore.getJumpForwardTime })
}

async function cycleSpeed() {
  await hapticsImpact()
  const next = SPEED_CYCLE[(SPEED_CYCLE.indexOf(playbackRate.value) + 1) % SPEED_CYCLE.length] ?? 1
  playbackRate.value = next
  AbsAudioPlayer.setPlaybackSpeed({ value: next })
}

async function refresh() {
  isLoading.value = true
  await loadLocalItems()
  await loadEpisodes()
}

async function leave() {
  await hapticsImpact()
  // Turn the launch preference off on the way out, so "leave" is not undone by the next start.
  // Someone pressing this wants the full app back, not the full app until they close it.
  await localStore.setMinimalModeOnLaunch(false)
  void router.replace('/bookshelf')
}

function onPlayingUpdate(data: { value?: boolean }) {
  appStore.playerIsPlaying = !!data.value
}

function onMetadata(data: { duration?: number; currentTime?: number }) {
  if (typeof data.duration === 'number') totalDuration.value = data.duration
  if (typeof data.currentTime === 'number') currentTime.value = data.currentTime
}

function onPlaybackSpeedChanged(data: { value?: number }) {
  if (!data.value || isNaN(data.value)) return
  playbackRate.value = Number(data.value)
}

watch(current, () => {
  coverFailed.value = false
})

// On a cold start the layout is still bringing the libraries up when this page mounts, so the
// first load has no library to ask about. Without this it reports "nothing left to play" and
// stays there: there is no list to pull down and no second thing to tap.
watch(
  () => librariesStore.currentLibraryId,
  (libraryId) => {
    if (libraryId) void refresh()
  }
)

onMounted(async () => {
  appStore.minimalModeActive = true
  // Extra listeners alongside the player's own: this page needs the time and the playing state,
  // and the player component that already receives them is not mounted while minimal mode is on.
  AbsAudioPlayer.addListener('onPlayingUpdate', onPlayingUpdate as never)
  AbsAudioPlayer.addListener('onMetadata', onMetadata as never)
  AbsAudioPlayer.addListener('onPlaybackSpeedChanged', onPlaybackSpeedChanged as never)

  await refreshPodcastRules()
  await loadLocalItems()
  await loadEpisodes()
})

onBeforeUnmount(() => {
  appStore.minimalModeActive = false
})
</script>
