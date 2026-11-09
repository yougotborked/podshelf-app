<template>
  <div class="w-full h-full overflow-y-auto">
    <div
      v-if="autoCacheUnplayedEpisodes"
      class="px-4 pt-4"
    >
      <div class="mb-4 border border-md-on-surface/20 rounded p-4 flex items-center">
        <nuxt-link to="/playlist/unfinished" class="flex items-center flex-grow">
          <covers-playlist-cover :items="autoPlaylist.items" :width="64" :height="64" />
          <p class="text-lg ml-4">{{ autoPlaylist.name }}</p>
        </nuxt-link>
      </div>
    </div>
    <bookshelf-lazy-bookshelf page="playlists" />
  </div>
</template>

<script setup lang="ts">
import { AbsDownloader } from '~/plugins/capacitor'
import {
  buildUnfinishedAutoPlaylist,
  collectDownloadedEpisodeKeys,
  toCacheablePlaylist
} from '~/composables/useAutoPlaylist'

const strings = useStrings()
const db = useDb()
const localStore = useLocalStore()

const appStore = useAppStore()

const networkConnected = computed(() => !appStore.isOffline)
const autoCacheUnplayedEpisodes = computed(() => appStore.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes)

const defaultAutoPlaylist = { id: 'unfinished', name: strings.LabelAutoUnfinishedPodcasts, items: [], totalItems: 0 }

// Load cached playlist at setup time (replaces asyncData)
const autoPlaylist = ref<{ id: string; name: string; items: any[]; totalItems: number }>(defaultAutoPlaylist)
const downloadedEpisodeKeys = ref<Set<string> | null>(null)

const enabled = autoCacheUnplayedEpisodes.value
if (enabled) {
  const cached = await localStore.getCachedPlaylist('unfinished')
  if (cached) {
    autoPlaylist.value = {
      ...(cached as any),
      totalItems: (cached.totalItems as number) || ((cached.items as any[])?.length ?? 0)
    }
  }
}

watch(networkConnected, (newVal) => {
  if (newVal && autoCacheUnplayedEpisodes.value) {
    if (!autoPlaylist.value.items.length) {
      setTimeout(() => {
        fetchAutoPlaylist()
      }, 1000)
    } else {
      checkAutoDownload()
    }
  }
})

watch(autoCacheUnplayedEpisodes, (newVal) => {
  if (newVal && !autoPlaylist.value.items.length) {
    fetchAutoPlaylist()
  }
})

async function fetchAutoPlaylist() {
  try {
    const { items, downloadedEpisodeKeys: keys, totalItems } = await buildUnfinishedAutoPlaylist(networkConnected.value)

    downloadedEpisodeKeys.value = keys

    autoPlaylist.value = {
      id: 'unfinished',
      name: strings.LabelAutoUnfinishedPodcasts,
      items,
      totalItems
    }

    await localStore.setCachedPlaylist(toCacheablePlaylist(autoPlaylist.value))
    checkAutoDownload()
  } catch (error) {
    console.error('Failed to fetch auto playlist', error)
  }
}

async function ensureDownloadedKeySet(): Promise<Set<string>> {
  if (downloadedEpisodeKeys.value instanceof Set) {
    return downloadedEpisodeKeys.value
  }

  const localLibraries = await db.getLocalLibraryItems('podcast')
  downloadedEpisodeKeys.value = collectDownloadedEpisodeKeys(localLibraries as Record<string, unknown>[])
  return downloadedEpisodeKeys.value!
}

async function checkAutoDownload() {
  if (!networkConnected.value) return
  if (!appStore.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes) return

  const downloadedKeys = await ensureDownloadedKeySet()

  for (const qi of autoPlaylist.value.items) {
    const liId = qi.libraryItemId || qi.libraryItem?.libraryItemId || qi.libraryItem?.id
    const epId = qi.episodeId || qi.episode?.serverEpisodeId || qi.episode?.id
    if (!liId || !epId) continue

    const key = `${liId}_${epId}`
    if (downloadedKeys.has(key)) continue

    AbsDownloader.downloadLibraryItem({ libraryItemId: liId, episodeId: epId })
    downloadedKeys.add(key)
  }
}

onMounted(() => {
  if (autoCacheUnplayedEpisodes.value) fetchAutoPlaylist()
})
</script>
