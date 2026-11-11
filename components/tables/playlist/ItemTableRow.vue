<template>
  <div data-playlist-row class="w-full px-1.5 pb-1.5">
    <div class="w-full h-full p-2 rounded-lg relative bg-md-surface-1 overflow-hidden">
      <nuxt-link v-if="libraryItem" :to="itemUrl" class="flex items-center w-full">
        <div class="h-full relative" :style="{ width: '50px' }">
          <covers-book-cover :library-item="libraryItem" :width="50" :book-cover-aspect-ratio="bookCoverAspectRatio" />
        </div>
        <div class="item-table-content h-full px-2 flex items-center">
          <div class="max-w-full">
            <div class="flex items-center max-w-full">
              <p class="truncate text-sm flex-grow">{{ itemTitle }}</p>
              <span v-if="localLibraryItem" class="material-symbols text-md-primary text-base flex-shrink-0 ml-1">download_done</span>
            </div>
            <p v-if="authorName" class="truncate block text-md-on-surface-variant text-xs">{{ authorName }}</p>
            <p class="text-xxs text-md-on-surface-variant">{{ itemDuration }}</p>
          </div>
        </div>
        <div class="w-8 min-w-8 flex justify-center">
          <button v-if="showPlayBtn" class="w-8 h-8 rounded-full border border-md-outline-variant flex items-center justify-center" @click.stop.prevent="playClick">
            <span v-if="!playerIsStartingForThisMedia" class="material-symbols text-2xl fill" :class="streamIsPlaying ? '' : 'text-md-primary'">{{ streamIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <svg v-else class="animate-spin" style="width: 18px; height: 18px" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
            </svg>
          </button>
        </div>
        <div class="w-8 min-w-8 flex justify-center">
          <button class="w-8 h-8 rounded-full flex items-center justify-center" @click.stop.prevent="showMoreMenu">
            <span class="material-symbols text-2xl">more_vert</span>
          </button>
        </div>
      </nuxt-link>
      <div class="absolute bottom-0 left-0 h-0.5 shadow-sm z-10" :class="userIsFinished ? 'bg-md-primary/50' : 'bg-md-primary'" :style="{ width: progressPercent * 100 + '%' }"></div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  playlistId?: string
  item: Record<string, unknown>
}>()

const emit = defineEmits<{
  showMore: [item: Record<string, unknown>]
}>()

const utils = useUtils()
const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()
const { impact } = useHaptics()
const eventBus = useEventBus()

const libraryItem = computed(() => (props.item.libraryItem as Record<string, unknown> | null | undefined) || {})
const libraryItemId = computed(() => (props.item.libraryItemId as string) || (libraryItem.value.id as string))
const localLibraryItem = computed(() => props.item.localLibraryItem as Record<string, unknown> | undefined)
const episode = computed(() => props.item.episode as Record<string, unknown> | undefined)
const episodeId = computed(() => {
  // Prefer the server episode id so progress can be looked up correctly
  return (props.item.episodeId as string) || (episode.value?.serverEpisodeId as string) || (episode.value?.id as string) || null
})
const localEpisode = computed(() => props.item.localEpisode as Record<string, unknown> | undefined)
const media = computed(() => (libraryItem.value.media as Record<string, unknown> | null | undefined) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown> | null | undefined) || {})
const tracks = computed(() => {
  if (episode.value) return []
  return (media.value.tracks as unknown[] | null | undefined) || []
})
const itemTitle = computed(() => {
  if (episode.value) return episode.value.title as string
  return (mediaMetadata.value.title as string) || ''
})
const bookAuthors = computed(() => {
  if (episode.value) return []
  return (mediaMetadata.value.authors as Record<string, unknown>[] | null | undefined) || []
})
const bookAuthorName = computed(() => bookAuthors.value.map((au) => au.name as string).join(', '))
const authorName = computed(() => {
  if (episode.value) return mediaMetadata.value.author as string
  return bookAuthorName.value
})
const itemDuration = computed(() => {
  if (episode.value) return utils.elapsedPretty(episode.value.duration as number)
  return utils.elapsedPretty(media.value.duration as number)
})
const isMissing = computed(() => libraryItem.value.isMissing as boolean)
const isInvalid = computed(() => libraryItem.value.isInvalid as boolean)
const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const showPlayBtn = computed(() => !isMissing.value && !isInvalid.value && (tracks.value.length || episode.value))
const itemUrl = computed(() => {
  if (episodeId.value) return `/item/${libraryItemId.value}/${episodeId.value}`
  return `/item/${libraryItemId.value}`
})

const isOpenInPlayer = computed(() => {
  if (localLibraryItem.value && localEpisode.value && appStore.getIsMediaStreaming(localLibraryItem.value.id as string, localEpisode.value.id as string))
    return true
  return appStore.getIsMediaStreaming(libraryItemId.value, episodeId.value)
})
const streamIsPlaying = computed(() => appStore.playerIsPlaying && isOpenInPlayer.value)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  if (!mediaId) return false
  const thisMediaId = episodeId.value || libraryItemId.value
  return mediaId === thisMediaId
})

const userItemProgress = computed(() =>
  globalsStore.getLocalMediaProgressByServerItemId(libraryItemId.value, episodeId.value) ||
  userStore.getUserMediaProgress(libraryItemId.value, episodeId.value)
)
const progressPercent = computed(() => Math.max(Math.min(1, (userItemProgress.value as Record<string, unknown> | null | undefined)?.progress as number || 0), 0))
const userIsFinished = computed(() => {
  if ((userItemProgress.value as Record<string, unknown> | null | undefined)?.isFinished) return true
  return progressPercent.value >= FINISHED_PROGRESS_THRESHOLD
})

function showMoreMenu() {
  const playlistItem: Record<string, unknown> = {
    libraryItem: { ...libraryItem.value },
    episode: episode.value ? { ...episode.value } : undefined
  }
  if (localLibraryItem.value) {
    (playlistItem.libraryItem as Record<string, unknown>).localLibraryItem = localLibraryItem.value
  }
  if (localEpisode.value && playlistItem.episode) {
    (playlistItem.episode as Record<string, unknown>).localEpisode = localEpisode.value
  }
  emit('showMore', playlistItem)
}

async function playClick() {
  if (playerIsStartingPlayback.value) return

  await impact()
  const mediaId = episodeId.value || libraryItemId.value
  if (streamIsPlaying.value) {
    eventBus.emit('pause-item')
  } else if (localLibraryItem.value) {
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = mediaId
    eventBus.emit('play-item', {
      libraryItemId: localLibraryItem.value.id as string,
      episodeId: (localEpisode.value?.id as string | undefined) ?? null,
      serverLibraryItemId: libraryItemId.value,
      serverEpisodeId: episodeId.value
    })
  } else {
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = mediaId
    eventBus.emit('play-item', {
      libraryItemId: libraryItemId.value,
      episodeId: episodeId.value
    })
  }
}
</script>

<style>
.item-table-content {
  width: calc(100% - 114px);
  max-width: calc(100% - 114px);
}
</style>
