<template>
  <div ref="card" tabindex="0" :id="`book-card-${index}`" :style="{ minWidth: width + 'px', maxWidth: width + 'px', height: height + 'px' }" class="rounded-md-md z-10 bg-md-surface-1 cursor-pointer elevation-1 transition-md-standard active:bg-md-surface-2" @click="clickCard">
    <!-- When cover image does not fill -->
    <div v-show="showCoverBg" class="absolute top-0 left-0 w-full h-full overflow-hidden rounded-sm bg-md-surface-3">
      <div class="absolute cover-bg" ref="coverBg" />
    </div>

    <!-- Alternative bookshelf title/author/sort -->
    <div v-if="isAltViewEnabled" class="absolute left-0 z-50 w-full" :style="{ bottom: `-${titleDisplayBottomOffset}rem` }">
      <div :style="{ fontSize: 0.9 * sizeMultiplier + 'rem' }" class="flex items-center">
        <p class="truncate" :style="{ fontSize: 0.9 * sizeMultiplier + 'rem' }">
          {{ displayTitle }}
        </p>
        <widgets-explicit-indicator v-if="isExplicit" />
      </div>
      <p class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.8 * sizeMultiplier + 'rem' }">{{ displayLineTwo || '&nbsp;' }}</p>
      <p v-if="displaySortLine" class="truncate text-md-on-surface-variant" :style="{ fontSize: 0.8 * sizeMultiplier + 'rem' }">{{ displaySortLine }}</p>
    </div>

    <div v-if="seriesSequenceList" class="absolute bg-md-surface-4 text-md-on-surface rounded-md-xs z-20 text-right" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem`, fontSize: sizeMultiplier * 0.8 + 'rem' }">
      #{{ seriesSequenceList }}
    </div>
    <div v-else-if="booksInSeries" class="absolute bg-md-primary-container text-md-on-primary-container rounded-md-xs z-20" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem`, fontSize: sizeMultiplier * 0.8 + 'rem' }">
      {{ booksInSeries }}
    </div>

    <div class="w-full h-full absolute top-0 left-0 rounded overflow-hidden z-10">
      <div v-show="libraryItem && !imageReady" class="absolute top-0 left-0 w-full h-full flex items-center justify-center" :style="{ padding: sizeMultiplier * 0.5 + 'rem' }">
        <p :style="{ fontSize: sizeMultiplier * 0.8 + 'rem' }" class="text-md-on-surface-variant text-center">{{ title }}</p>
      </div>

      <img v-show="libraryItem" ref="cover" :src="bookCoverSrc" class="w-full h-full transition-opacity duration-300" :class="showCoverBg ? 'object-contain' : 'object-fill'" @load="imageLoaded" :style="{ opacity: imageReady ? 1 : 0 }" />

      <!-- Placeholder Cover Title & Author -->
      <div v-if="!hasCover" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full flex items-center justify-center" :style="{ padding: placeholderCoverPadding + 'rem' }">
        <div>
          <p class="text-center" style="color: rgb(var(--md-on-primary-container))" :style="{ fontSize: titleFontSize + 'rem' }">{{ titleCleaned }}</p>
        </div>
      </div>
      <div v-if="!hasCover" class="absolute left-0 right-0 w-full flex items-center justify-center" :style="{ padding: placeholderCoverPadding + 'rem', bottom: authorBottom + 'rem' }">
        <p class="text-center" style="color: rgb(var(--md-on-primary-container)); opacity: 0.75" :style="{ fontSize: authorFontSize + 'rem' }">{{ authorCleaned }}</p>
      </div>

      <div v-if="showPlayButton" class="absolute -bottom-16 -right-16 rotate-45 w-32 h-32 p-2 bg-gradient-to-r from-transparent to-black to-40% inline-flex justify-start items-center">
        <div class="hover:text-white text-md-on-surface hover:scale-110 transform duration-200 pointer-events-auto -rotate-45" @click.stop.prevent="play">
          <span class="material-symbols fill">{{ streamIsPlaying ? 'pause_circle' : 'play_circle' }}</span>
        </div>
      </div>
    </div>

    <!-- Play/pause button for podcast episode -->
    <div v-if="recentEpisode" class="absolute z-10 top-0 left-0 bottom-0 right-0 m-auto flex items-center justify-center w-12 h-12 rounded-full" :class="{ 'bg-white/70': !playerIsStartingForThisMedia }" @click.stop="playEpisode">
      <span v-if="!playerIsStartingForThisMedia" class="material-symbols fill text-6xl text-black/80">{{ streamIsPlaying ? 'pause_circle' : 'play_circle' }}</span>
      <div v-else class="text-md-on-surface absolute top-0 left-0 w-full h-full flex items-center justify-center bg-black/80 rounded-full overflow-hidden">
        <svg class="animate-spin" style="width: 24px; height: 24px" viewBox="0 0 24 24">
          <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
        </svg>
      </div>
    </div>

    <!-- No progress shown for collapsed series in library -->
    <div v-if="!collapsedSeries && (!isPodcast || recentEpisode)" class="absolute bottom-0 left-0 h-1 max-w-full z-10 bg-md-outline-variant/40 rounded-b-md-md overflow-hidden" :style="{ width: width + 'px' }">
      <div class="h-full rounded-md-full transition-md-standard" :class="itemIsFinished ? 'bg-md-primary' : 'bg-md-primary'" :style="{ width: (userProgressPercent * 100) + '%' }" />
    </div>

    <!-- Downloaded icon -->
    <div v-if="showHasLocalDownload" class="absolute right-0 top-0 z-20" :style="{ top: (isPodcast || (seriesSequence && showSequence) ? 1.75 : 0.375) * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem` }">
      <span class="material-symbols text-2xl text-md-primary">download_done</span>
    </div>

    <!-- Error widget -->
    <div v-if="showError" :style="{ height: 1.5 * sizeMultiplier + 'rem', width: 2.5 * sizeMultiplier + 'rem' }" class="bg-error rounded-r-full shadow-md flex items-center justify-end border-r border-b border-md-error absolute bottom-4 left-0 z-10">
      <span class="material-symbols text-md-on-error pr-1" :style="{ fontSize: 0.875 * sizeMultiplier + 'rem' }">priority_high</span>
    </div>

    <!-- rss feed icon -->
    <div v-if="rssFeed" class="absolute text-md-primary top-0 left-0 z-10" :style="{ padding: 0.375 * sizeMultiplier + 'rem' }">
      <span class="material-symbols" :style="{ fontSize: sizeMultiplier * 1.5 + 'rem' }">rss_feed</span>
    </div>

    <!-- Series sequence -->
    <div v-if="seriesSequence && showSequence && !isSelectionMode" class="absolute rounded-lg bg-black/90 text-white box-shadow-md z-10" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem` }">
      <p :style="{ fontSize: sizeMultiplier * 0.8 + 'rem' }">#{{ seriesSequence }}</p>
    </div>

    <!-- Podcast Episode # -->
    <div v-if="recentEpisodeNumber !== null && !isSelectionMode" class="absolute rounded-lg bg-black/90 box-shadow-md z-10" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', padding: `${0.1 * sizeMultiplier}rem ${0.25 * sizeMultiplier}rem` }">
      <p class="text-white" :style="{ fontSize: sizeMultiplier * 0.8 + 'rem' }">
        Episode<span v-if="recentEpisodeNumber"> #{{ recentEpisodeNumber }}</span>
      </p>
    </div>

    <!-- Podcast Num Episodes -->
    <div v-else-if="numEpisodes && !numEpisodesIncomplete && !isSelectionMode" class="absolute rounded-full bg-black/90 box-shadow-md z-10 flex items-center justify-center" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', width: 1.25 * sizeMultiplier + 'rem', height: 1.25 * sizeMultiplier + 'rem' }">
      <p class="text-white" :style="{ fontSize: sizeMultiplier * 0.8 + 'rem' }">{{ numEpisodes }}</p>
    </div>

    <!-- Podcast Num Episodes Incomplete -->
    <div v-else-if="numEpisodesIncomplete && !isSelectionMode" class="absolute rounded-full bg-md-primary box-shadow-md z-10 flex items-center justify-center" :style="{ top: 0.375 * sizeMultiplier + 'rem', right: 0.375 * sizeMultiplier + 'rem', width: 1.25 * sizeMultiplier + 'rem', height: 1.25 * sizeMultiplier + 'rem' }">
      <p class="text-black" :style="{ fontSize: sizeMultiplier * 0.8 + 'rem' }">{{ numEpisodesIncomplete }}</p>
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
  isAltViewEnabled?: boolean
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

// Computed
const _libraryItem = computed(() => libraryItem.value || {})
const isLocal = computed(() => !!_libraryItem.value.isLocal)
const media = computed(() => (_libraryItem.value.media as Record<string, unknown>) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown>) || {})
const mediaType = computed(() => _libraryItem.value.mediaType as string | undefined)
const isPodcast = computed(() => mediaType.value === 'podcast')
const placeholderUrl = computed(() => '/book_placeholder.jpg')
const bookCoverSrc = computed(() => {
  if (isLocal.value) {
    if (libraryItem.value?.coverContentUrl) return Capacitor.convertFileSrc(libraryItem.value.coverContentUrl as string)
    return placeholderUrl.value
  }
  return globalsStore.getLibraryItemCoverSrc(_libraryItem.value, placeholderUrl.value)
})
const libraryItemId = computed(() => _libraryItem.value.id as string)
const numEpisodes = computed(() => {
  if (isLocal.value && isPodcast.value && media.value.episodes) return (media.value.episodes as unknown[]).length
  return media.value.numEpisodes as number
})
const numEpisodesIncomplete = computed(() => {
  if (isLocal.value) return 0
  return (_libraryItem.value.numEpisodesIncomplete as number) || 0
})
const processingBatch = computed(() => appStore.playerIsStartingPlayback)
const collapsedSeries = computed(() => _libraryItem.value.collapsedSeries as Record<string, unknown> | undefined)
const booksInSeries = computed(() => (collapsedSeries.value?.numBooks as number) || 0)
const seriesSequenceList = computed(() => (collapsedSeries.value?.seriesSequenceList as string) || null)
const hasCover = computed(() => !!media.value.coverPath)
const squareAspectRatio = computed(() => (props.bookCoverAspectRatio || 0) === 1)
const sizeMultiplier = computed(() => {
  const baseSize = squareAspectRatio.value ? 192 : 120
  return (props.width || 120) / baseSize
})
const title = computed(() => (mediaMetadata.value.title as string) || '')
const author = computed(() => {
  if (isPodcast.value) return mediaMetadata.value.author as string
  return mediaMetadata.value.authorName as string
})
const authorLF = computed(() => mediaMetadata.value.authorNameLF as string)
const series = computed(() => mediaMetadata.value.series as Record<string, unknown> | undefined)
const seriesSequence = computed(() => series.value?.sequence as string || null)
const recentEpisode = computed(() => _libraryItem.value.recentEpisode as Record<string, unknown> | undefined)
const recentEpisodeNumber = computed(() => {
  if (!recentEpisode.value) return null
  if (recentEpisode.value.episode) {
    return (recentEpisode.value.episode as string).replace(/^#/, '')
  }
  return ''
})
const displayTitle = computed(() => {
  if (recentEpisode.value) return recentEpisode.value.title as string

  const ignorePrefix = props.orderBy === 'media.metadata.title' && props.sortingIgnorePrefix
  if (collapsedSeries.value) return ignorePrefix ? collapsedSeries.value.nameIgnorePrefix as string : collapsedSeries.value.name as string
  return ignorePrefix ? mediaMetadata.value.titleIgnorePrefix as string : title.value
})
const displayLineTwo = computed(() => {
  if (recentEpisode.value) return title.value
  if (collapsedSeries.value) return ''
  if (isPodcast.value) return author.value

  if (props.orderBy === 'media.metadata.authorNameLF') return authorLF.value
  return author.value
})
const displaySortLine = computed(() => {
  if (collapsedSeries.value) return null
  if (props.orderBy === 'mtimeMs') return 'Modified ' + utils.formatDate(_libraryItem.value.mtimeMs as number)
  if (props.orderBy === 'birthtimeMs') return 'Born ' + utils.formatDate(_libraryItem.value.birthtimeMs as number)
  if (props.orderBy === 'addedAt') return getString('LabelAddedDate', [utils.formatDate(_libraryItem.value.addedAt as number)])
  if (props.orderBy === 'media.duration') return 'Duration: ' + utils.elapsedPrettyExtended(media.value.duration as number, false)
  if (props.orderBy === 'size') return 'Size: ' + utils.bytesPretty(_libraryItem.value.size as number)
  if (props.orderBy === 'media.numTracks') return `${numEpisodes.value} Episodes`
  return null
})
const localLibraryItemId = computed(() => {
  if (isLocal.value) return libraryItemId.value
  return (localLibraryItem.value?.id as string) || null
})
const localEpisode = computed(() => {
  if (!recentEpisode.value || !localLibraryItem.value) return null
  const episodes = (localLibraryItem.value.media as Record<string, unknown>)?.episodes as Record<string, unknown>[] || []
  return episodes.find((ep) => ep.serverEpisodeId === recentEpisode.value?.id)
})
const episodeProgress = computed(() => {
  if (!recentEpisode.value) return null
  if (isLocal.value) return globalsStore.getLocalMediaProgressById(libraryItemId.value, recentEpisode.value.id as string)
  return userStore.getUserMediaProgress(libraryItemId.value, recentEpisode.value.id as string)
})
const userProgress = computed(() => {
  if (recentEpisode.value) return episodeProgress.value || null
  if (isLocal.value) return globalsStore.getLocalMediaProgressById(libraryItemId.value)
  return userStore.getUserMediaProgress(libraryItemId.value)
})
const useEBookProgress = computed(() => {
  if (!userProgress.value || (userProgress.value as Record<string, unknown>).progress) return false
  return ((userProgress.value as Record<string, unknown>).ebookProgress as number) > 0
})
const userProgressPercent = computed(() => {
  if (useEBookProgress.value) return Math.max(Math.min(1, (userProgress.value as Record<string, unknown>).ebookProgress as number), 0)
  return Math.max(Math.min(1, ((userProgress.value as Record<string, unknown>)?.progress as number) || 0), 0) || 0
})
const itemIsFinished = computed(() => !!(userProgress.value as Record<string, unknown>)?.isFinished)
const showError = computed(() => isMissing.value || isInvalid.value)
const isStreaming = computed(() => appStore.getIsMediaStreaming(libraryItemId.value, recentEpisode.value?.id as string))
const streamIsPlaying = computed(() => appStore.playerIsPlaying && isStreaming.value)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  return mediaId === recentEpisode.value?.id
})
const isMissing = computed(() => _libraryItem.value.isMissing as boolean)
const isInvalid = computed(() => _libraryItem.value.isInvalid as boolean)
const isExplicit = computed(() => !!( mediaMetadata.value.explicit))
const titleFontSize = computed(() => 0.75 * sizeMultiplier.value)
const authorFontSize = computed(() => 0.6 * sizeMultiplier.value)
const placeholderCoverPadding = computed(() => 0.8 * sizeMultiplier.value)
const authorBottom = computed(() => 0.75 * sizeMultiplier.value)
const titleCleaned = computed(() => {
  if (!title.value) return ''
  if (title.value.length > 60) {
    return title.value.slice(0, 57) + '...'
  }
  return title.value
})
const authorCleaned = computed(() => {
  if (!author.value) return ''
  if (author.value.length > 30) {
    return author.value.slice(0, 27) + '...'
  }
  return author.value
})
const titleDisplayBottomOffset = computed(() => {
  if (!props.isAltViewEnabled) return 0
  else if (!displaySortLine.value) return 3 * sizeMultiplier.value
  return 4.25 * sizeMultiplier.value
})
const showHasLocalDownload = computed(() => {
  if (localLibraryItem.value || isLocal.value) {
    if (recentEpisode.value && !isLocal.value) {
      return !!localEpisode.value
    } else {
      return true
    }
  }
  return false
})
const rssFeed = computed(() => {
  if (booksInSeries.value) return null
  return _libraryItem.value.rssFeed || null
})
const showPlayButton = computed(() => {
  return false
  // return !isMissing.value && !isInvalid.value && !isStreaming.value && (numTracks.value || recentEpisode.value)
})

// Methods
function setSelectionMode(val: boolean) {
  isSelectionMode.value = val
  if (!val) selected.value = false
}

function setEntity(_libraryItem: Record<string, unknown>) {
  let item = _libraryItem

  if (series.value) {
    item = {
      ..._libraryItem,
      media: {
        ..._libraryItem.media as Record<string, unknown>,
        metadata: {
          ...(_libraryItem.media as Record<string, unknown>).metadata as Record<string, unknown>
        }
      }
    }
    const meta = (item.media as Record<string, unknown>).metadata as Record<string, unknown>
    if (meta.series) {
      const newSeries = (meta.series as Record<string, unknown>[]).find((se) => se.id === series.value?.id)
      if (newSeries) {
        (item.media as Record<string, unknown>).metadata = { ...meta, series: newSeries }
        libraryItem.value = item
        return
      }
    }
  }

  libraryItem.value = item
}

function setLocalLibraryItem(item: Record<string, unknown>) {
  localLibraryItem.value = item
}

async function play() {}

async function playEpisode() {
  if (playerIsStartingPlayback.value) return

  await impact()
  if (streamIsPlaying.value) {
    eventBus.emit('pause-item')
    return
  }

  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = recentEpisode.value?.id as string

  if (localEpisode.value) {
    eventBus.emit('play-item', {
      libraryItemId: localLibraryItemId.value as string,
      episodeId: localEpisode.value.id as string,
      serverLibraryItemId: libraryItemId.value,
      serverEpisodeId: recentEpisode.value?.id as string
    })
    return
  }

  eventBus.emit('play-item', { libraryItemId: libraryItemId.value, episodeId: recentEpisode.value?.id as string })
}

async function clickCard(e: MouseEvent) {
  if (isSelectionMode.value) {
    e.stopPropagation()
    e.preventDefault()
    selectBtnClick()
  } else {
    if (collapsedSeries.value) router.push(`/bookshelf/series/${collapsedSeries.value.id}`)
    else if (localLibraryItem.value) {
      router.push(`/item/${libraryItemId.value}?localLibraryItemId=${localLibraryItemId.value}`)
    } else {
      router.push(`/item/${libraryItemId.value}`)
    }
  }
}

function selectBtnClick() {
  if (processingBatch.value) return
  selected.value = !selected.value
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
      nextTick(setCoverBg)
    } else {
      showCoverBg.value = false
    }
  }
}

onMounted(() => {
  if (props.bookMount) {
    setEntity(props.bookMount)

    if (props.bookMount.localLibraryItem) {
      setLocalLibraryItem(props.bookMount.localLibraryItem as Record<string, unknown>)
    }
  }
})

defineExpose({ setSelectionMode, setEntity, setLocalLibraryItem, isHovering: false })
</script>
