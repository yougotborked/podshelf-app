<template>
  <div class="w-full h-full px-3 py-4 overflow-y-auto relative bg-md-surface-0">
    <p class="mb-4 text-lg font-semibold">History for {{ displayTitle }}</p>

    <div v-if="!mediaEvents.length" class="text-center py-8">
      <p class="text-md-on-surface">No History</p>
    </div>

    <div v-for="(events, name) in groupedMediaEvents" :key="name" class="py-2">
      <p class="my-2 text-md-on-surface-variant font-semibold">{{ name }}</p>
      <div v-for="(evt, index) in events" :key="index" class="py-3 flex items-center">
        <p class="text-sm text-md-on-surface-variant w-12">{{ $formatDate(evt.timestamp, 'HH:mm') }}</p>
        <span class="material-symbols fill px-2" :class="`text-${getEventColor(evt.name)}`">{{ getEventIcon(evt.name) }}</span>
        <p class="text-sm text-md-on-surface px-1">{{ evt.name }}</p>

        <span v-if="evt.serverSyncAttempted && evt.serverSyncSuccess" class="material-symbols px-1 text-base text-success">cloud_done</span>
        <span v-if="evt.serverSyncAttempted && !evt.serverSyncSuccess" class="material-symbols px-1 text-base text-error">error_outline</span>

        <p v-if="evt.num" class="text-sm text-md-on-surface-variant italic px-1">+{{ evt.num }}</p>

        <div class="flex-grow" />
        <p class="text-base text-md-on-surface" @click="clickPlaybackTime(evt.currentTime ?? 0)">{{ $secondsToTimestampFull(evt.currentTime ?? 0) }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { MediaHistoryEvent, MediaItemHistory } from '~/types'
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { AbsAudioPlayer } from '@/plugins/capacitor'

const route = useRoute()
const eventBus = useEventBus()
const db = useDb()
const { hapticsImpact } = useHaptics()
const globalsStore = useGlobalsStore()
const appStore = useAppStore()

const id = route.params.id as string

// State
const title = ref((route.query.title as string) || 'Unknown')
const mediaItemHistory = ref<MediaItemHistory | null>(null)
const onMediaItemHistoryUpdatedListener = ref<{ remove(): void } | null>(null)

// Computed
const displayTitle = computed(() => {
  if (!mediaItemHistory.value) return title.value
  return mediaItemHistory.value.mediaDisplayTitle
})
const mediaEvents = computed(() => {
  if (!mediaItemHistory.value) return []
  return [...(mediaItemHistory.value.events || [])].sort((a, b) => b.timestamp - a.timestamp)
})
const mediaItemLibraryItemId = computed(() => {
  if (!mediaItemHistory.value) return null
  return mediaItemHistory.value.libraryItemId
})
const mediaItemEpisodeId = computed(() => {
  if (!mediaItemHistory.value) return null
  return mediaItemHistory.value.episodeId
})
const groupedMediaEvents = computed(() => {
  const groups: Record<string, MediaHistoryEvent[]> = {}
  const nuxtApp = useNuxtApp()

  const today = nuxtApp.$formatDate(new Date(), 'MMM dd, yyyy')
  const yesterday = nuxtApp.$formatDate(Date.now() - 1000 * 60 * 60 * 24, 'MMM dd, yyyy')

  let lastKey: string | null = null
  let numSaves = 0
  let numSyncs = 0
  let lastSaveName: string | null = null

  mediaEvents.value.forEach((evt) => {
    const date = nuxtApp.$formatDate(evt.timestamp, 'MMM dd, yyyy')
    let include = true
    let keyUpdated = false

    let key = date
    if (date === today) key = 'Today'
    else if (date === yesterday) key = 'Yesterday'

    if (!groups[key]) groups[key] = []

    if (!lastKey || lastKey !== key) {
      lastKey = key
      keyUpdated = true
    }

    // Collapse saves
    if (evt.name === 'Save') {
      const saveName = evt.name + '-' + evt.serverSyncAttempted + '-' + evt.serverSyncSuccess
      if (lastSaveName === saveName && numSaves > 0 && !keyUpdated) {
        include = false
        const lastInGroup = groups[key]?.at(-1)
        if (lastInGroup) lastInGroup.num = numSaves
        numSaves++
      } else {
        numSaves = 1
      }
      lastSaveName = saveName
    } else {
      numSaves = 0
    }

    // Collapse syncs
    if (evt.name === 'Sync') {
      if (numSyncs > 0 && !keyUpdated) {
        include = false
        const lastInGroup = groups[key]?.at(-1)
        if (lastInGroup) lastInGroup.num = numSyncs
        numSyncs++
      } else {
        numSyncs = 1
      }
    } else {
      numSyncs = 0
    }

    if (include) {
      groups[key]?.push(evt)
    }
  })

  return groups
})
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)

// Methods
async function clickPlaybackTime(time: number) {
  if (playerIsStartingPlayback.value) return

  await hapticsImpact()
  playAtTime(time)
}

function playAtTime(startTime: number) {
  appStore.playerIsStartingPlayback = true
  const libraryItemId = mediaItemLibraryItemId.value
  if (!libraryItemId) return
  appStore.playerStartingPlaybackMediaId = mediaItemEpisodeId.value || libraryItemId
  const localProg = globalsStore.getLocalMediaProgressByServerItemId(libraryItemId, mediaItemEpisodeId.value ?? null)
  if (localProg) {
    eventBus.emit('play-item', { libraryItemId: localProg.localLibraryItemId, episodeId: localProg.localEpisodeId, serverLibraryItemId: libraryItemId, serverEpisodeId: mediaItemEpisodeId.value, startTime })
  } else {
    eventBus.emit('play-item', { libraryItemId, episodeId: mediaItemEpisodeId.value, startTime })
  }
}

function getEventIcon(name: string | undefined) {
  switch (name) {
    case 'Play':
      return 'play_circle'
    case 'Pause':
      return 'pause_circle'
    case 'Stop':
      return 'stop_circle'
    case 'Save':
      return 'sync'
    case 'Seek':
      return 'commit'
    case 'Sync':
      return 'cloud_download'
    default:
      return 'info'
  }
}

function getEventColor(name: string | undefined) {
  switch (name) {
    case 'Play':
      return 'success'
    case 'Pause':
      return 'gray-300'
    case 'Stop':
      return 'error'
    case 'Save':
      return 'info'
    case 'Seek':
      return 'gray-200'
    case 'Sync':
      return 'accent'
    default:
      return 'info'
  }
}

function onMediaItemHistoryUpdated(updatedHistory: MediaItemHistory | null) {
  if (!updatedHistory || !updatedHistory.id) {
    console.error('Invalid media item history', updatedHistory)
    return
  }
  if (updatedHistory.id !== mediaItemHistory.value?.id) {
    return
  }
  console.log('Media Item History updated')
  mediaItemHistory.value = updatedHistory
}

onMounted(async () => {
  mediaItemHistory.value = await db.getMediaItemHistory(id)
  onMediaItemHistoryUpdatedListener.value = await AbsAudioPlayer.addListener('onMediaItemHistoryUpdated', onMediaItemHistoryUpdated)
})

onBeforeUnmount(() => {
  onMediaItemHistoryUpdatedListener.value?.remove()
})
</script>
