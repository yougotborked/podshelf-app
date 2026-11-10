<template>
  <div class="w-full">
    <!-- Podcast episode downloads queue -->
    <div v-if="episodeDownloadsQueued.length" class="px-4 py-2 my-2 bg-info/40 text-sm font-semibold rounded-md text-md-on-surface relative w-full">
      <div class="flex items-center">
        <p class="text-sm py-1">{{ getString('MessageEpisodesQueuedForDownload', [episodeDownloadsQueued.length]) }}</p>
        <div class="flex-grow" />
        <span v-if="isAdminOrUp" class="material-symbols text-xl ml-3 cursor-pointer" @click="clearDownloadQueue">close</span>
      </div>
    </div>

    <!-- Podcast episodes currently downloading -->
    <div v-if="episodesDownloading.length" class="px-4 py-2 my-2 bg-md-primary/20 text-sm font-semibold rounded-md text-md-on-surface relative w-full">
      <div v-for="episode in episodesDownloading" :key="(episode.id as string)" class="flex items-center">
        <widgets-loading-spinner />
        <p class="text-sm py-1 pl-4">{{ strings.MessageDownloadingEpisode }} "{{ (episode as any).episodeDisplayTitle }}"</p>
      </div>
    </div>

    <div class="flex items-center">
      <p class="text-lg mb-1 font-semibold">{{ strings.HeaderEpisodes }} ({{ episodesFiltered.length }})</p>

      <div class="flex-grow" />

      <button v-if="isAdminOrUp && !fetchingRSSFeed" class="outline:none mx-1 pt-0.5 relative" @click="searchEpisodes">
        <span class="material-symbols text-xl text-md-on-surface">search</span>
      </button>
      <widgets-loading-spinner v-else-if="fetchingRSSFeed" class="mx-1" />

      <button class="outline:none mx-3 pt-0.5 relative" @click="showFilters">
        <span class="material-symbols text-xl text-md-on-surface">filter_alt</span>
        <div v-show="filterKey !== 'all' && episodesAreFiltered" class="absolute top-0 right-0 w-1.5 h-1.5 rounded-full bg-md-primary border border-md-surface-4 shadow-sm z-10 pointer-events-none" />
      </button>

      <div class="flex items-center border border-white/25 rounded px-2" @click="clickSort">
        <p class="text-sm text-md-on-surface">{{ sortText }}</p>
        <span class="material-symbols ml-1 text-md-on-surface">{{ sortDesc ? 'arrow_drop_down' : 'arrow_drop_up' }}</span>
      </div>
    </div>

    <template v-for="episode in episodesSorted" :key="(episode.id as string)">
      <tables-podcast-episode-row :episode="episode" :local-episode="localEpisodeMap[episode.id as string]" :library-item-id="libraryItemId" :local-library-item-id="localLibraryItemId" :is-local="isLocal" :sort-key="sortKey" @addToPlaylist="addEpisodeToPlaylist" />
    </template>

    <div v-if="!episodesSorted.length" class="py-6 text-center text-md-on-surface-variant text-sm">
      <p v-if="filterKey !== 'all'">{{ strings.LabelNoEpisodesMatchingFilter || 'No episodes match the current filter.' }}</p>
      <p v-else>{{ strings.LabelNoEpisodes || 'No episodes found.' }}</p>
      <button v-if="filterKey !== 'all'" class="mt-2 underline text-md-primary text-sm" @click="filterKey = 'all'">Show all episodes</button>
    </div>

    <!-- Huhhh?
        Without anything below the template it will not re-render -->
    <p>&nbsp;</p>

    <modals-dialog v-model="showFiltersModal" title="Episode Filter" :items="filterItems" :selected="filterKey" @action="setFilter" />

    <modals-podcast-episodes-feed-modal v-model="showPodcastEpisodeFeed" :library-item="libraryItem" :episodes="podcastFeedEpisodes" />

    <modals-order-modal v-model="showSortModal" :order-by="sortKey" @update:order-by="sortKey = $event" :descending="sortDesc" @update:descending="sortDesc = $event" episodes />
  </div>
</template>

<script setup lang="ts">
import { Dialog } from '@capacitor/dialog'
import { getString } from '@/composables/useStrings'

const props = defineProps<{
  libraryItem: Record<string, unknown>
  episodes: Record<string, unknown>[]
  localLibraryItemId?: string
  localEpisodes?: Record<string, unknown>[]
  isLocal?: boolean
}>()

const strings = useStrings()
const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()
const nativeHttp = useNativeHttp()
const toast = useToast()
const route = useRoute()
const socketInstance = useSocket()

const episodesCopy = ref<Record<string, unknown>[]>([])
const showFiltersModal = ref(false)
const showSortModal = ref(false)
const sortKey = ref('publishedAt')
const sortDesc = ref(true)
const filterKey = ref('incomplete')
const fetchingRSSFeed = ref(false)
const podcastFeedEpisodes = ref<Record<string, unknown>[]>([])
const showPodcastEpisodeFeed = ref(false)
const episodesDownloading = ref<Record<string, unknown>[]>([])
const episodeDownloadsQueued = ref<Record<string, unknown>[]>([])

const isAdminOrUp = computed(() => userStore.getIsAdminOrUp)
const socketConnected = computed(() => appStore.socketConnected)
const networkConnected = computed(() => !appStore.isOffline)
const libraryItemId = computed(() => (props.libraryItem?.id as string) || null)
const media = computed(() => (props.libraryItem?.media as Record<string, unknown> | null | undefined) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown> | null | undefined) || {})

const episodeSortItems = computed(() => [
  { text: strings.LabelPubDate, value: 'publishedAt' },
  { text: strings.LabelTitle, value: 'title' },
  { text: strings.LabelSeason, value: 'season' },
  { text: strings.LabelEpisode, value: 'episode' },
  { text: strings.LabelFilename, value: 'audioFile.metadata.filename' }
])

const filterItems = computed(() => [
  { text: strings.LabelShowAll, value: 'all' },
  { text: strings.LabelIncomplete, value: 'incomplete' },
  { text: strings.LabelInProgress, value: 'inProgress' },
  { text: strings.LabelComplete, value: 'complete' },
  { text: strings.LabelDownloaded, value: 'downloaded' }
])

const localEpisodeMap = computed(() => {
  const epmap: Record<string, Record<string, unknown>> = {}
  ;(props.localEpisodes || []).forEach((localEp) => {
    if (localEp.serverEpisodeId) {
      epmap[localEp.serverEpisodeId as string] = localEp
    }
  })
  return epmap
})

function getEpisodeProgress(episode: Record<string, unknown>) {
  if (props.isLocal) return globalsStore.getLocalMediaProgressById(libraryItemId.value || '', episode.id as string)
  return userStore.getUserMediaProgress(libraryItemId.value || '', episode.id as string)
}

const episodesFiltered = computed(() => {
  return episodesCopy.value.filter((ep) => {
    if (filterKey.value === 'downloaded') {
      return !!localEpisodeMap.value[ep.id as string]
    }
    const mediaProgress = getEpisodeProgress(ep) as Record<string, unknown> | null
    if (filterKey.value === 'incomplete') {
      return !mediaProgress?.isFinished
    } else if (filterKey.value === 'complete') {
      return mediaProgress?.isFinished
    } else if (filterKey.value === 'inProgress') {
      return mediaProgress && !mediaProgress.isFinished
    }
    return true
  })
})

const episodesAreFiltered = computed(() => episodesFiltered.value.length !== episodesCopy.value.length)

const episodesSorted = computed(() => {
  return [...episodesFiltered.value].sort((a, b) => {
    let aValue: unknown
    let bValue: unknown

    if (sortKey.value.includes('.')) {
      const getNestedValue = (ob: Record<string, unknown>, s: string): unknown => s.split('.').reduce((o: unknown, k: string) => (o as Record<string, unknown> | null | undefined)?.[k], ob)
      aValue = getNestedValue(a, sortKey.value)
      bValue = getNestedValue(b, sortKey.value)
    } else {
      aValue = a[sortKey.value]
      bValue = b[sortKey.value]
    }

    // Sort episodes with no pub date as the oldest
    if (sortKey.value === 'publishedAt') {
      if (!aValue) aValue = Number.MAX_VALUE
      if (!bValue) bValue = Number.MAX_VALUE
    }

    if (sortDesc.value) {
      return String(bValue).localeCompare(String(aValue), undefined, { numeric: true, sensitivity: 'base' })
    }
    return String(aValue).localeCompare(String(bValue), undefined, { numeric: true, sensitivity: 'base' })
  })
})

const sortText = computed(() => {
  if (!sortKey.value) return ''
  const _sel = episodeSortItems.value.find((i) => i.value === sortKey.value)
  return _sel?.text || ''
})

async function clearDownloadQueue() {
  if (!networkConnected.value) {
    toast.error(strings.MessageNoNetworkConnection)
    return
  }

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: strings.MessageConfirmDeleteEpisodeDownloadQueue
  })

  if (value) {
    nativeHttp
      .get(`/api/podcasts/${libraryItemId.value}/clear-queue`)
      .then(() => {
        toast.success('Episode download queue cleared')
        episodeDownloadsQueued.value = []
      })
      .catch((error: Error) => {
        console.error('Failed to clear queue', error)
        toast.error('Failed to clear queue')
      })
  }
}

async function searchEpisodes() {
  if (!networkConnected.value || !socketConnected.value) {
    toast.error(strings.MessageNoNetworkConnection)
    return
  }

  if (!mediaMetadata.value.feedUrl) {
    toast.error('Podcast does not have an RSS Feed')
    return
  }
  fetchingRSSFeed.value = true
  const payload = await nativeHttp.post(`/api/podcasts/feed`, { rssFeed: mediaMetadata.value.feedUrl }, { connectTimeout: 10000 }).catch((error: Error) => {
    console.error('Failed to get feed', error)
    toast.error('Failed to get podcast feed')
    return null
  }) as Record<string, unknown> | null
  fetchingRSSFeed.value = false
  if (!payload) return

  console.log('Podcast feed', payload)
  const podcastfeed = payload.podcast as Record<string, unknown>
  if (!(podcastfeed.episodes as unknown[] | null | undefined)?.length) {
    toast.info('No episodes found in RSS feed')
    return
  }

  podcastFeedEpisodes.value = podcastfeed.episodes as Record<string, unknown>[]
  showPodcastEpisodeFeed.value = true
}

function addEpisodeToPlaylist(episode: Record<string, unknown>) {
  globalsStore.selectedPlaylistItems = [{ libraryItem: props.libraryItem, episode }]
  globalsStore.showPlaylistsAddCreateModal = true
}

function setFilter(filter: string) {
  filterKey.value = filter
  showFiltersModal.value = false
}

function showFilters() {
  showFiltersModal.value = true
}

function clickSort() {
  showSortModal.value = true
}

function init() {
  sortDesc.value = mediaMetadata.value.type === 'episodic'
  episodesCopy.value = props.episodes.map((ep) => ({ ...ep }))
}

function episodeDownloadQueued(episodeDownload: Record<string, unknown>) {
  if (episodeDownload.libraryItemId === libraryItemId.value) {
    episodeDownloadsQueued.value.push(episodeDownload)
  }
}

function episodeDownloadStarted(episodeDownload: Record<string, unknown>) {
  if (episodeDownload.libraryItemId === libraryItemId.value) {
    episodeDownloadsQueued.value = episodeDownloadsQueued.value.filter((d) => d.id !== episodeDownload.id)
    episodesDownloading.value.push(episodeDownload)
  }
}

function episodeDownloadFinished(episodeDownload: Record<string, unknown>) {
  if (episodeDownload.libraryItemId === libraryItemId.value) {
    episodeDownloadsQueued.value = episodeDownloadsQueued.value.filter((d) => d.id !== episodeDownload.id)
    episodesDownloading.value = episodesDownloading.value.filter((d) => d.id !== episodeDownload.id)
  }
}

watch(() => props.episodes, () => {
  init()
}, { immediate: true })

onMounted(() => {
  if (route.query['episodefilter'] === 'downloaded') {
    filterKey.value = 'downloaded'
  }
  socketInstance.$on('episode_download_queued', episodeDownloadQueued)
  socketInstance.$on('episode_download_started', episodeDownloadStarted)
  socketInstance.$on('episode_download_finished', episodeDownloadFinished)
})

onBeforeUnmount(() => {
  socketInstance.$off('episode_download_queued', episodeDownloadQueued)
  socketInstance.$off('episode_download_started', episodeDownloadStarted)
  socketInstance.$off('episode_download_finished', episodeDownloadFinished)
})
</script>
