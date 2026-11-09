<template>
  <div ref="card" :id="`book-card-${index}`" :style="{ minWidth: width + 'px', maxWidth: width + 'px', height: height + 'px' }" class="rounded-sm z-10 cursor-pointer py-1" @click="clickCard">
    <div class="h-full flex relative">
      <div class="list-card-cover relative">
        <!-- When cover image does not fill -->
        <div v-show="showCoverBg" class="absolute top-0 left-0 w-full h-full overflow-hidden rounded-sm bg-md-surface-3">
          <div class="absolute cover-bg" ref="coverBg" />
        </div>

        <div class="w-full h-full absolute top-0 left-0">
          <img v-show="libraryItem" ref="cover" :src="bookCoverSrc" class="w-full h-full transition-opacity duration-300" :class="showCoverBg ? 'object-contain' : 'object-fill'" @load="imageLoaded" :style="{ opacity: imageReady ? 1 : 0 }" />
        </div>

        <!-- No progress shown for collapsed series or podcasts in library -->
        <div v-if="!isPodcast && !collapsedSeries" class="absolute bottom-0 left-0 h-1 shadow-sm max-w-full z-10 rounded-b" :class="itemIsFinished ? 'bg-md-primary/50' : 'bg-md-primary'" :style="{ width: coverWidth * userProgressPercent + 'px' }"></div>
      </div>
      <div class="flex-grow pl-2" :class="showPlayButton ? 'pr-12' : 'pr-2'">
        <p class="whitespace-normal line-clamp-2" :style="{ fontSize: 0.8 * sizeMultiplier + 'rem' }">
          <span v-if="seriesSequence">#{{ seriesSequence }}&nbsp;</span>{{ displayTitle }}
        </p>
        <p class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.7 * sizeMultiplier + 'rem' }">{{ displayAuthor }}</p>
        <p v-if="displaySortLine" class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.7 * sizeMultiplier + 'rem' }">{{ displaySortLine }}</p>
        <p v-if="duration" class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.7 * sizeMultiplier + 'rem' }">{{ utils.elapsedPretty(duration) }}</p>

        <p v-if="numEpisodesIncomplete" class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.7 * sizeMultiplier + 'rem' }">
          {{ getString('LabelNumEpisodesIncomplete', [numEpisodes, numEpisodesIncomplete]) }}
        </p>
        <p v-else-if="numEpisodes" class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.7 * sizeMultiplier + 'rem' }">
          {{ getString('LabelNumEpisodes', [numEpisodes]) }}
        </p>
      </div>
      <div v-if="showPlayButton" class="absolute top-0 bottom-0 right-0 h-full flex items-center justify-center z-20 pr-1">
        <button type="button" class="relative rounded-full bg-md-on-surface-variant/50" :class="{ 'p-2': !playerIsStartingForThisMedia }" @click.stop.prevent="play">
          <span v-if="!playerIsStartingForThisMedia" class="material-symbols text-2xl fill text-white">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
          <div v-else class="p-2 text-md-on-surface w-10 h-10 flex items-center justify-center bg-md-on-surface-variant/80 rounded-full overflow-hidden">
            <svg class="animate-spin" style="width: 24px; height: 24px" viewBox="0 0 24 24">
              <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
            </svg>
          </div>
        </button>
      </div>

      <div v-if="localLibraryItem || isLocal" class="absolute top-0 right-0 z-20" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem` }">
        <span class="material-symbols text-2xl text-md-primary">download_done</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { getString } from '~/composables/useStrings'

const props = defineProps<{
  index?: number
  width?: number
  height?: number
  bookCoverAspectRatio?: number
  showSequence?: boolean
  bookshelfView?: number
  bookMount?: Record<string, unknown> | null
  orderBy?: string
  filterBy?: string
  sortingIgnorePrefix?: boolean
}>()

const appStore = useAppStore()
const userStore = useUserStore()
const globalsStore = useGlobalsStore()
const router = useRouter()
const utils = useUtils()
const { impact } = useHaptics()
const eventBus = useEventBus()

// State
const libraryItem = ref<Record<string, unknown> | null>(null)
const imageReady = ref(false)
const selected = ref(false)
const isSelectionMode = ref(false)
const showCoverBg = ref(false)
const localLibraryItem = ref<Record<string, unknown> | null>(null)

// Refs
const card = ref<HTMLElement | null>(null)
const cover = ref<HTMLImageElement | null>(null)
const coverBg = ref<HTMLElement | null>(null)

// Watch
watch(() => props.bookMount, (newVal) => {
  if (newVal) {
    libraryItem.value = newVal
  }
})
watch(() => props.bookCoverAspectRatio, () => {
  setCSSProperties()
})

// Computed
const _libraryItem = computed(() => libraryItem.value || {})
const isLocal = computed(() => !!_libraryItem.value.isLocal)
const media = computed(() => (_libraryItem.value.media as Record<string, unknown>) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown>) || {})
const mediaType = computed(() => _libraryItem.value.mediaType as string | undefined)
const duration = computed(() => (media.value.duration as number) || null)
const isPodcast = computed(() => mediaType.value === 'podcast')
const numEpisodes = computed(() => {
  if (isLocal.value && isPodcast.value && media.value.episodes) return (media.value.episodes as unknown[]).length
  return media.value.numEpisodes as number
})
const numEpisodesIncomplete = computed(() => {
  if (isLocal.value) return 0
  return (_libraryItem.value.numEpisodesIncomplete as number) || 0
})
const placeholderUrl = computed(() => '/book_placeholder.jpg')
const bookCoverSrc = computed(() => {
  if (isLocal.value) {
    if (libraryItem.value?.coverContentUrl) return Capacitor.convertFileSrc(libraryItem.value.coverContentUrl as string)
    return placeholderUrl.value
  }
  return globalsStore.getLibraryItemCoverSrc(_libraryItem.value, placeholderUrl.value)
})
const libraryItemId = computed(() => _libraryItem.value.id as string)
const localLibraryItemId = computed(() => localLibraryItem.value?.id as string | undefined)
const series = computed(() => mediaMetadata.value.series as Record<string, unknown> | undefined)
const numTracks = computed(() => media.value.numTracks as number)
const processingBatch = computed(() => appStore.playerIsStartingPlayback)
const collapsedSeries = computed(() => _libraryItem.value.collapsedSeries as Record<string, unknown> | undefined)
const booksInSeries = computed(() => (collapsedSeries.value?.numBooks as number) || 0)
const sizeMultiplier = computed(() => Math.min(1, (props.width || 364) / 364))
const title = computed(() => (mediaMetadata.value.title as string) || '')
const author = computed(() => {
  if (isPodcast.value) return (mediaMetadata.value.author as string) || 'Unknown'
  return (mediaMetadata.value.authorName as string) || 'Unknown'
})
const authorLF = computed(() => (mediaMetadata.value.authorNameLF as string) || 'Unknown')
const seriesSequence = computed(() => series.value?.sequence as string || null)
const displayTitle = computed(() => {
  const ignorePrefix = props.orderBy === 'media.metadata.title' && props.sortingIgnorePrefix
  if (collapsedSeries.value) return ignorePrefix ? collapsedSeries.value.nameIgnorePrefix as string : collapsedSeries.value.name as string
  return ignorePrefix ? mediaMetadata.value.titleIgnorePrefix as string : title.value
})
const displayAuthor = computed(() => {
  if (isPodcast.value) return author.value
  if (collapsedSeries.value) return `${booksInSeries.value} books in series`
  if (props.orderBy === 'media.metadata.authorNameLF') return authorLF.value
  return author.value
})
const displaySortLine = computed(() => {
  if (collapsedSeries.value) return null
  if (props.orderBy === 'mtimeMs') return 'Modified ' + utils.formatDate(_libraryItem.value.mtimeMs as number)
  if (props.orderBy === 'birthtimeMs') return 'Born ' + utils.formatDate(_libraryItem.value.birthtimeMs as number)
  if (props.orderBy === 'addedAt') return getString('LabelAddedDate', [utils.formatDate(_libraryItem.value.addedAt as number)])
  if (props.orderBy === 'size') return 'Size: ' + utils.bytesPretty(_libraryItem.value.size as number)
  return null
})
const userProgress = computed(() => userStore.getUserMediaProgress(libraryItemId.value))
const userProgressPercent = computed(() => (userProgress.value as Record<string, unknown>)?.progress as number || 0)
const itemIsFinished = computed(() => !!(userProgress.value as Record<string, unknown>)?.isFinished)
const isPlaying = computed(() => {
  if (localLibraryItemId.value && appStore.getIsMediaStreaming(localLibraryItemId.value as string)) return true
  return appStore.getIsMediaStreaming(libraryItemId.value)
})
const isStreaming = computed(() => isPlaying.value && !appStore.getIsCurrentSessionLocal)
const playerIsPlaying = computed(() => appStore.playerIsPlaying && (isStreaming.value || isPlaying.value))
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  return mediaId === libraryItemId.value
})
const isCasting = computed(() => appStore.isCasting)
const showPlayButton = computed(() => !isSelectionMode.value && !isMissing.value && !isInvalid.value && numTracks.value && !isPodcast.value)
const isMissing = computed(() => _libraryItem.value.isMissing as boolean)
const isInvalid = computed(() => _libraryItem.value.isInvalid as boolean)
const coverWidth = computed(() => 80 / (props.bookCoverAspectRatio || 1.6))

// Methods
function setSelectionMode(val: boolean) {
  isSelectionMode.value = val
  if (!val) selected.value = false
}

function setEntity(item: Record<string, unknown>) {
  libraryItem.value = item
}

function setLocalLibraryItem(item: Record<string, unknown>) {
  localLibraryItem.value = item
}

function clickCard(e: MouseEvent) {
  if (isSelectionMode.value) {
    e.stopPropagation()
    e.preventDefault()
    selectBtnClick()
  } else {
    if (collapsedSeries.value) void router.push(`/bookshelf/series/${collapsedSeries.value.id}`)
    else void router.push(`/item/${libraryItemId.value}`)
  }
}

function selectBtnClick() {
  if (processingBatch.value) return
  selected.value = !selected.value
}

async function play() {
  if (playerIsStartingPlayback.value) return

  await impact()

  if (playerIsPlaying.value) {
    eventBus.emit('pause-item')
  } else {
    let itemId = libraryItemId.value

    if (localLibraryItem.value && !isCasting.value) {
      itemId = localLibraryItem.value.id as string
    }

    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = libraryItemId.value
    eventBus.emit('play-item', { libraryItemId: itemId, serverLibraryItemId: libraryItemId.value })
  }
}

function setCoverBg() {
  if (coverBg.value) {
    coverBg.value.style.backgroundImage = `url("${bookCoverSrc.value}")`
  }
}

function imageLoaded() {
  imageReady.value = true

  if (cover.value && bookCoverSrc.value !== placeholderUrl.value) {
    const { naturalWidth, naturalHeight } = cover.value
    const aspectRatio = naturalHeight / naturalWidth
    const arDiff = Math.abs(aspectRatio - (props.bookCoverAspectRatio || 1.6))

    if (arDiff > 0.15) {
      showCoverBg.value = true
      void nextTick(setCoverBg)
    } else {
      showCoverBg.value = false
    }
  }
}

function setCSSProperties() {
  document.documentElement.style.setProperty('--list-card-cover-width', coverWidth.value + 'px')
}

onMounted(() => {
  setCSSProperties()
  if (props.bookMount) {
    setEntity(props.bookMount)

    if (props.bookMount.localLibraryItem) {
      setLocalLibraryItem(props.bookMount.localLibraryItem as Record<string, unknown>)
    }
  }
})

defineExpose({ setSelectionMode, setEntity, setLocalLibraryItem, isHovering: false })
</script>

<style>
:root {
  --list-card-cover-width: 80px;
}

.list-card-cover {
  height: 80px;
  max-height: 80px;
  width: var(--list-card-cover-width);
  min-width: var(--list-card-cover-width);
  max-width: var(--list-card-cover-width);
}
</style>
