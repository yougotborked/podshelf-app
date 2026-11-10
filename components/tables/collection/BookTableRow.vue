<template>
  <div class="w-full px-2 py-2 overflow-hidden relative">
    <nuxt-link v-if="book" :to="`/item/${book.id}`" class="flex items-center w-full">
      <div class="h-full relative" :style="{ width: bookWidth + 'px' }">
        <covers-book-cover :library-item="book" :width="bookWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" />
      </div>
      <div class="book-table-content h-full px-2 flex items-center">
        <div class="max-w-full">
          <div class="flex items-center max-w-full">
            <p class="truncate text-sm flex-grow">{{ bookTitle }}</p>
            <span v-if="localLibraryItem" class="material-symbols text-md-primary text-base flex-shrink-0 ml-1">download_done</span>
          </div>
          <p class="truncate block text-md-on-surface-variant text-xs">{{ bookAuthor }}</p>
          <p v-if="media.duration" class="text-xxs text-md-on-surface-variant">{{ bookDuration }}</p>
        </div>
      </div>
      <div class="w-8 min-w-8 flex justify-center">
        <button v-if="showPlayBtn" class="w-8 h-8 rounded-full border border-white/20 flex items-center justify-center" @click.stop.prevent="playClick">
          <span class="material-symbols text-2xl fill" :class="streamIsPlaying ? '' : 'text-md-primary'">{{ streamIsPlaying ? 'pause' : 'play_arrow' }}</span>
        </button>
      </div>
    </nuxt-link>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  collectionId?: string
  book: Record<string, unknown>
}>()

const utils = useUtils()
const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const { impact } = useHaptics()
const eventBus = useEventBus()

const libraryItemId = computed(() => props.book.id as string)
const localLibraryItem = computed(() => props.book.localLibraryItem as Record<string, unknown> | undefined)
const media = computed(() => (props.book.media as Record<string, unknown> | null | undefined) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown> | null | undefined) || {})
const tracks = computed(() => (media.value.tracks as unknown[] | null | undefined) || [])
const bookTitle = computed(() => (mediaMetadata.value.title as string) || '')
const bookAuthor = computed(() => (mediaMetadata.value.authorName as string) || '')
const bookDuration = computed(() => utils.elapsedPretty(media.value.duration as number))
const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const bookWidth = computed(() => 50)
const isMissing = computed(() => props.book.isMissing as boolean)
const isInvalid = computed(() => props.book.isInvalid as boolean)
const showPlayBtn = computed(() => !isMissing.value && !isInvalid.value && tracks.value.length)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const isOpenInPlayer = computed(() => {
  if (localLibraryItem.value && appStore.getIsMediaStreaming(localLibraryItem.value.id as string)) return true
  return appStore.getIsMediaStreaming(libraryItemId.value)
})
const streamIsPlaying = computed(() => appStore.playerIsPlaying && isOpenInPlayer.value)

async function playClick() {
  if (playerIsStartingPlayback.value) return
  await impact()

  if (streamIsPlaying.value) {
    eventBus.emit('pause-item')
    return
  }

  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = libraryItemId.value
  if (localLibraryItem.value) {
    eventBus.emit('play-item', {
      libraryItemId: localLibraryItem.value.id as string,
      serverLibraryItemId: libraryItemId.value
    })
  } else {
    eventBus.emit('play-item', {
      libraryItemId: libraryItemId.value
    })
  }
}
</script>

<style>
.book-table-content {
  width: calc(100% - 82px);
  max-width: calc(100% - 82px);
}
</style>
