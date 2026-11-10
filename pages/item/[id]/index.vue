<template>
  <div v-if="!libraryItem" class="w-full h-full relative flex items-center justify-center bg-md-surface-0">
    <ui-loading-indicator />
  </div>
  <div v-else id="item-page" class="w-full h-full overflow-y-auto overflow-x-hidden relative bg-md-surface-0">
    <!-- cover -->
    <div class="w-full flex justify-center relative">
      <div style="width: 0; transform: translateX(-50vw); overflow: visible">
        <div style="width: 150vw; overflow: hidden">
          <div id="coverBg" style="filter: blur(5vw)">
            <covers-book-cover :library-item="libraryItem" :width="coverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" @imageLoaded="coverImageLoaded" />
          </div>
        </div>
      </div>
      <div class="relative" @click="showFullscreenCover = true">
        <covers-book-cover :library-item="libraryItem" :width="coverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" no-bg raw @imageLoaded="coverImageLoaded" />
        <div v-if="!isPodcast" class="absolute bottom-0 left-0 h-1 z-10 rounded-r-md-full" :class="userIsFinished ? 'bg-success' : 'bg-md-primary'" :style="{ width: coverWidth * progressPercent + 'px' }"></div>
      </div>
    </div>

    <div class="relative">
      <!-- background gradient -->
      <div id="item-page-bg-gradient" class="absolute top-0 left-0 w-full pointer-events-none z-0" :style="{ opacity: coverRgb ? 1 : 0 }">
        <div class="w-full h-full" :style="{ backgroundColor: coverRgb } as any" />
        <div class="w-full h-full absolute top-0 left-0" style="background: var(--gradient-item-page)" />
      </div>

      <div class="relative z-10 px-3 py-4">
        <!-- title -->
        <div class="text-center mb-2">
          <div class="flex items-center justify-center">
            <h1 class="text-md-headline-s font-medium">{{ title }}</h1>
            <widgets-explicit-indicator v-if="isExplicit" />
            <widgets-abridged-indicator v-if="isAbridged" />
          </div>
          <p v-if="subtitle" class="text-md-on-surface text-base">{{ subtitle }}</p>
        </div>

        <div v-if="hasLocal" class="mx-1">
          <div v-if="currentServerConnectionConfigId && !isLocalMatchingServerAddress" class="w-full rounded-md bg-warning/10 border border-warning p-4">
            <p class="text-sm">{{ $getString('MessageMediaLinkedToADifferentServer', [localLibraryItem?.serverAddress ?? '']) }}</p>
          </div>
          <div v-else-if="currentServerConnectionConfigId && !isLocalMatchingUser" class="w-full rounded-md bg-warning/10 border border-warning p-4">
            <p class="text-sm">{{ $strings.MessageMediaLinkedToADifferentUser }}</p>
          </div>
          <div v-else-if="currentServerConnectionConfigId && !isLocalMatchingConnectionConfig" class="w-full rounded-md bg-warning/10 border border-warning p-4">
            <p class="text-sm">Media is linked to a different server connection config. Downloaded User Id: {{ localLibraryItem?.serverUserId }}. Downloaded Server Address: {{ localLibraryItem?.serverAddress }}. Currently connected User Id: {{ user?.id }}. Currently connected server address: {{ currentServerAddress }}.</p>
          </div>
        </div>

        <!-- action buttons -->
        <div class="col-span-full">
          <div v-if="showPlay || showRead" class="flex mt-4 -mx-1">
            <ui-btn v-if="showPlay" color="success" class="flex items-center justify-center flex-grow mx-1" :loading="playerIsStartingForThisMedia" :padding-x="4" @click="playClick">
              <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
              <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : isPodcast ? $strings.ButtonNextEpisode : hasLocal ? $strings.ButtonPlay : $strings.ButtonStream }}</span>
            </ui-btn>
            <ui-btn v-if="showRead" color="info" class="flex items-center justify-center mx-1" :class="showPlay ? '' : 'flex-grow'" :padding-x="2" @click="readBook">
              <span class="material-symbols text-2xl">auto_stories</span>
              <span v-if="!showPlay" class="px-2 text-base">{{ $strings.ButtonRead }} {{ ebookFormat }}</span>
            </ui-btn>
            <ui-btn v-if="showDownload" :color="downloadItem ? 'warning' : 'primary'" class="flex items-center justify-center mx-1" :padding-x="2" @click="downloadClick">
              <span class="material-symbols text-2xl" :class="downloadItem || startingDownload ? 'animate-pulse' : ''">{{ downloadItem || startingDownload ? 'downloading' : 'download' }}</span>
            </ui-btn>
            <ui-btn color="primary" class="flex items-center justify-center mx-1" :padding-x="2" @click="moreButtonPress">
              <span class="material-symbols text-2xl">more_vert</span>
            </ui-btn>
          </div>
          <ui-btn v-else-if="isMissing" color="error" :padding-x="4" small class="mt-4 flex items-center justify-center w-full" @click="clickMissingButton">
            <span class="material-symbols">error</span>
            <span class="px-1 text-base">{{ $strings.LabelMissing }}</span>
          </ui-btn>

          <div v-if="!isPodcast && progressPercent > 0" class="px-4 py-2 bg-md-surface-2 text-md-body-m rounded-md-md text-md-on-surface mt-4 text-center">
            <p>{{ $strings.LabelYourProgress }}: {{ Math.round(progressPercent * 100) }}%</p>
            <p v-if="!useEBookProgress && !userIsFinished" class="text-md-on-surface-variant text-xs">{{ timeRemainingText(userTimeRemaining, playbackRate) }}</p>
            <p v-else-if="userIsFinished" class="text-md-on-surface-variant text-xs">{{ $strings.LabelFinished }} {{ $formatDate(userProgressFinishedAt) }}</p>
          </div>
        </div>

        <div v-if="downloadItem" class="py-3">
          <p v-if="downloadItem.itemProgress == 1" class="text-center text-lg">{{ $strings.MessageDownloadCompleteProcessing }}</p>
          <p v-else class="text-center text-lg">{{ $strings.MessageDownloading }} ({{ Math.round(downloadItem.itemProgress * 100) }}%)</p>
        </div>

        <!-- metadata -->
        <div id="metadata" class="grid gap-2 my-2">
          <div v-if="podcastAuthor || bookAuthors?.length" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelAuthor }}</div>
          <div v-if="podcastAuthor" class="text-sm">{{ podcastAuthor }}</div>
          <div v-else-if="bookAuthors?.length" class="text-sm">
            <template v-for="(author, index) in bookAuthors" :key="author.id">
              <nuxt-link :to="`/bookshelf/library?filter=authors.${encode(author.id ?? '')}`" class="underline whitespace-nowrap">{{ author.name }}</nuxt-link
              ><span v-if="(index as number) < bookAuthors.length - 1">, </span>
            </template>
          </div>

          <div v-if="podcastType" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelType }}</div>
          <div v-if="podcastType" class="text-sm capitalize">{{ podcastType }}</div>

          <div v-if="series?.length" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelSeries }}</div>
          <div v-if="series?.length" class="text-sm">
            <template v-for="(series, index) in seriesList" :key="series.id">
              <nuxt-link :to="`/bookshelf/series/${series.id}`" class="underline whitespace-nowrap">{{ series.text }}</nuxt-link
              ><span v-if="(index as number) < (seriesList?.length ?? 0) - 1">, </span>
            </template>
          </div>

          <div v-if="numTracks" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelDuration }}</div>
          <div v-if="numTracks" class="text-sm">{{ $elapsedPretty(duration ?? 0) }}</div>

          <div v-if="narrators?.length" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelNarrators }}</div>
          <div v-if="narrators?.length" class="text-sm">
            <template v-for="(narrator, index) in narrators" :key="narrator">
              <nuxt-link :to="`/bookshelf/library?filter=narrators.${encode(narrator)}`" class="underline whitespace-nowrap">{{ narrator }}</nuxt-link
              ><span v-if="(index as number) < narrators.length - 1">, </span>
            </template>
          </div>

          <div v-if="genres.length" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelGenres }}</div>
          <div v-if="genres.length" class="text-sm">
            <template v-for="(genre, index) in genres" :key="genre">
              <nuxt-link :to="`/bookshelf/library?filter=genres.${encode(genre)}`" class="underline whitespace-nowrap">{{ genre }}</nuxt-link
              ><span v-if="(index as number) < genres.length - 1">, </span>
            </template>
          </div>

          <div v-if="tags.length" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelTags }}</div>
          <div v-if="tags.length" class="text-sm">
            <template v-for="(tag, index) in tags" :key="tag">
              <nuxt-link :to="`/bookshelf/library?filter=tags.${encode(tag)}`" class="underline whitespace-nowrap">{{ tag }}</nuxt-link
              ><span v-if="(index as number) < tags.length - 1">, </span>
            </template>
          </div>

          <div v-if="publishedYear" class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide">{{ $strings.LabelPublishYear }}</div>
          <div v-if="publishedYear" class="text-sm">{{ publishedYear }}</div>
        </div>

        <div v-if="description" class="w-full py-2">
          <div ref="descriptionEl" class="default-style less-spacing text-sm text-justify whitespace-pre-line font-light" :class="{ 'line-clamp-4': !showFullDescription }" style="hyphens: auto" v-html="description" />

          <div v-if="descriptionClamped" class="text-md-on-surface text-sm py-2" @click="showFullDescription = !showFullDescription">
            {{ showFullDescription ? $strings.ButtonReadLess : $strings.ButtonReadMore }}
            <span class="material-symbols !align-middle text-base -mt-px">{{ showFullDescription ? 'arrow_drop_up' : 'arrow_drop_down' }}</span>
          </div>
        </div>

        <!-- tables -->
        <tables-podcast-episodes-table v-if="isPodcast" :library-item="libraryItem" :local-library-item-id="localLibraryItemId ?? undefined" :episodes="episodes" :local-episodes="localLibraryItemEpisodes" :is-local="isLocal" />

        <tables-chapters-table v-if="numChapters" :library-item="libraryItem" @playAtTimestamp="playAtTimestamp" />

        <tables-tracks-table v-if="numTracks" :tracks="tracks" :library-item-id="libraryItemId" />

        <tables-ebook-files-table v-if="ebookFiles.length" :library-item="libraryItem" />
      </div>
    </div>

    <!-- modals -->
    <modals-item-more-menu-modal v-model="showMoreMenu" :library-item="libraryItem" :rss-feed="rssFeed" v-model:processing="processing" />

    <modals-select-local-folder-modal v-model="showSelectLocalFolder" :media-type="mediaType" @select="selectedLocalFolder" />

    <modals-fullscreen-cover v-model="showFullscreenCover" :library-item="libraryItem" />

    <div v-show="processing" class="fixed top-0 left-0 w-screen h-screen flex items-center justify-center bg-black/50 z-50">
      <ui-loading-indicator />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Dialog } from '@capacitor/dialog'
import { AbsDownloader, AbsLogger } from '@/plugins/capacitor'
import { useCellularPermission } from '~/composables/useCellularPermission'
import type { LibraryItem, LibraryItemMedia, LocalFolder } from '~/types'

const route = useRoute()
const router = useRouter()
const eventBus = useEventBus()
const socket = useSocket()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const { hapticsImpact } = useHaptics()
const toast = useToast()
const { encode } = useUtils()
const platform = usePlatform()
const globalsStore = useGlobalsStore()
const librariesStore = useLibrariesStore()
const appStore = useAppStore()
const userStore = useUserStore()
const { checkCellularPermission } = useCellularPermission()

const libraryItemId = route.params.id as string

// State
const libraryItem = ref<LibraryItem | null>(null)
const loadedFromCache = ref(false)
const processing = ref(false)
const showSelectLocalFolder = ref(false)
const showMoreMenu = ref(false)
const showFullscreenCover = ref(false)
const coverRgb = ref<string | null>(null)
const coverBgIsLight = ref(false)
const windowWidth = ref(0)
const descriptionClamped = ref(false)
const showFullDescription = ref(false)
const episodeStartingPlayback = ref<string | null>(null)
const startingDownload = ref(false)
const descriptionEl = ref<HTMLElement | null>(null)

// Computed
const isIos = computed(() => platform === 'ios')

const userCanDownload = computed(() => userStore.getUserCanDownload)
const isLocal = computed(() => libraryItem.value?.isLocal)
const hasLocal = computed(() => isLocal.value || libraryItem.value?.localLibraryItem)
const localLibraryItem = computed(() => {
  if (isLocal.value) return libraryItem.value
  return libraryItem.value?.localLibraryItem || null
})
const localLibraryItemId = computed(() => localLibraryItem.value?.id || null)
const localLibraryItemEpisodes = computed(() => {
  if (!isPodcast.value || !localLibraryItem.value) return []
  const podcastMedia = localLibraryItem.value.media
  return podcastMedia?.episodes || []
})
const serverLibraryItemId = computed(() => {
  if (!isLocal.value) return libraryItem.value?.id
  if (!libraryItem.value?.serverAddress || !libraryItem.value?.libraryItemId) return null
  if (currentServerAddress.value === libraryItem.value.serverAddress) {
    return libraryItem.value.libraryItemId
  }
  return null
})
const localLibraryItemServerConnectionConfigId = computed(() => localLibraryItem.value?.serverConnectionConfigId)
const currentServerAddress = computed(() => userStore.getServerAddress)
const currentServerConnectionConfigId = computed(() => userStore.getServerConnectionConfigId)
const isLocalMatchingServerAddress = computed(() => {
  if (!localLibraryItem.value || !currentServerAddress.value) return false
  return localLibraryItem.value.serverAddress === currentServerAddress.value
})
const isLocalMatchingUser = computed(() => {
  if (!localLibraryItem.value || !user.value) return false
  return localLibraryItem.value.serverUserId === user.value.id || localLibraryItem.value.serverUserId === user.value.oldUserId
})
const isLocalMatchingConnectionConfig = computed(() => {
  if (!localLibraryItemServerConnectionConfigId.value || !currentServerConnectionConfigId.value) return false
  return localLibraryItemServerConnectionConfigId.value === currentServerConnectionConfigId.value
})
const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const rssFeed = computed(() => libraryItem.value?.rssFeed)
const mediaType = computed(() => libraryItem.value?.mediaType)
const isPodcast = computed(() => mediaType.value == 'podcast')
// A shared empty value, so `media.value.tags` is typed and an item still loading reads as
// "nothing yet" instead of failing.
const EMPTY_MEDIA: LibraryItemMedia = { metadata: {} }
const media = computed(() => libraryItem.value?.media ?? EMPTY_MEDIA)
const tags = computed(() => media.value.tags || [])
const mediaMetadata = computed(() => media.value.metadata || {})
const title = computed(() => mediaMetadata.value.title)
const subtitle = computed(() => mediaMetadata.value.subtitle)
const genres = computed(() => mediaMetadata.value.genres || [])
const publishedYear = computed(() => mediaMetadata.value.publishedYear)
const podcastType = computed(() => mediaMetadata.value.type)
const podcastAuthor = computed(() => {
  if (!isPodcast.value) return null
  return mediaMetadata.value.author || ''
})
const bookAuthors = computed(() => {
  if (isPodcast.value) return null
  return mediaMetadata.value.authors || []
})
const narrators = computed(() => {
  if (isPodcast.value) return null
  return mediaMetadata.value.narrators || []
})
const description = computed(() => mediaMetadata.value.description || '')
const series = computed(() => mediaMetadata.value.series || [])
const seriesList = computed(() => {
  if (isPodcast.value) return null
  return series.value.map((se) => {
    let text = se.name
    if (se.sequence) text += ` #${se.sequence}`
    return { ...se, text }
  })
})
const duration = computed(() => media.value.duration)
const user = computed(() => userStore.user)
const userItemProgress = computed(() => {
  if (isPodcast.value) return null
  if (isLocal.value) return localItemProgress.value
  return serverItemProgress.value
})
const localItemProgress = computed(() => {
  if (isPodcast.value || !localLibraryItemId.value) return null
  return globalsStore.getLocalMediaProgressById(localLibraryItemId.value)
})
const serverItemProgress = computed(() => {
  if (isPodcast.value || !serverLibraryItemId.value) return null
  return userStore.getUserMediaProgress(serverLibraryItemId.value)
})
const userIsFinished = computed(() => !!userItemProgress.value?.isFinished)
const playbackRate = computed(() => Number(userStore.getUserSetting('playbackRate')) || 1)
const timeRemainingText = useTimeRemainingText()
const userTimeRemaining = computed(() => {
  if (!userItemProgress.value) return 0
  const dur = userItemProgress.value.duration || duration.value
  return Math.max(0, Number(dur) - Number(userItemProgress.value.currentTime))
})
const useEBookProgress = computed(() => {
  if (!userItemProgress.value || userItemProgress.value.progress) return false
  return Number(userItemProgress.value.ebookProgress) > 0
})
const progressPercent = computed(() => {
  if (useEBookProgress.value) return Math.max(Math.min(1, Number(userItemProgress.value?.ebookProgress)), 0)
  return Math.max(Math.min(1, Number(userItemProgress.value?.progress) || 0), 0)
})
const userProgressFinishedAt = computed(() => Number(userItemProgress.value?.finishedAt) || 0)
const isStreaming = computed(() => isPlaying.value && !appStore.getIsCurrentSessionLocal)
const isPlaying = computed(() => {
  if (localLibraryItemId.value && appStore.getIsMediaStreaming(localLibraryItemId.value)) return true
  return appStore.getIsMediaStreaming(libraryItemId)
})
const playerIsPlaying = computed(() => appStore.playerIsPlaying && (isStreaming.value || isPlaying.value))
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  if (!mediaId) return false
  if (isPodcast.value) {
    return mediaId === episodeStartingPlayback.value
  } else {
    return mediaId === serverLibraryItemId.value || mediaId === localLibraryItemId.value
  }
})
const tracks = computed(() => media.value.tracks || [])
const numTracks = computed(() => tracks.value.length || 0)
const numChapters = computed(() => {
  if (!media.value.chapters) return 0
  return media.value.chapters.length || 0
})
const isMissing = computed(() => libraryItem.value?.isMissing)
const isInvalid = computed(() => libraryItem.value?.isInvalid)
const isExplicit = computed(() => !!mediaMetadata.value.explicit)
const isAbridged = computed(() => !!mediaMetadata.value.abridged)
const showPlay = computed(() => !isMissing.value && !isInvalid.value && (numTracks.value || episodes.value.length))
const showRead = computed(() => ebookFile.value)
const showDownload = computed(() => {
  if (isPodcast.value || hasLocal.value) return false
  return user.value && userCanDownload.value && (showPlay.value || showRead.value)
})
const libraryFiles = computed(() => libraryItem.value?.libraryFiles || [])
const ebookFiles = computed(() => libraryFiles.value.filter((lf) => lf.fileType === 'ebook'))
const ebookFile = computed(() => media.value.ebookFile)
const ebookFormat = computed(() => {
  if (!ebookFile.value) return null
  return ebookFile.value.ebookFormat
})
const downloadItem = computed(() => globalsStore.getDownloadItem(libraryItemId))
const episodes = computed(() => media.value.episodes || [])
const isCasting = computed(() => appStore.isCasting)
const coverWidth = computed(() => {
  let width = windowWidth.value - 94
  if (width > 325) return 325
  else if (width < 0) return 175
  if (width * bookCoverAspectRatio.value > 325) width = 325 / bookCoverAspectRatio.value
  return width
})
const coverHeight = computed(() => coverWidth.value * bookCoverAspectRatio.value)

// Methods
function clickMissingButton() {
  void Dialog.alert({
    title: useNuxtApp().$strings.LabelMissing,
    message: useNuxtApp().$strings.MessageItemMissing,
    buttonTitle: useNuxtApp().$strings.ButtonOk
  })
}

async function coverImageLoaded(fullCoverUrl: string) {
  if (!fullCoverUrl) return
  const color = await getAverageColorFromCoverUrl(fullCoverUrl)
  if (!color) return
  coverRgb.value = color.rgba
  coverBgIsLight.value = color.isLight
}

function moreButtonPress() {
  showMoreMenu.value = true
}

function readBook() {
  if (localLibraryItem.value?.media?.ebookFile) {
    appStore.selectedLibraryItem = localLibraryItem.value
    appStore.ereaderKeepProgress = true
    appStore.showReader = true
  } else {
    appStore.selectedLibraryItem = libraryItem.value
    appStore.ereaderKeepProgress = true
    appStore.showReader = true
  }
}

function playAtTimestamp(seconds: number) {
  void play(seconds)
}

async function playClick() {
  await hapticsImpact()
  if (playerIsPlaying.value) {
    eventBus.emit('pause-item')
  } else {
    void play()
  }
}

async function play(startTime: number | null = null) {
  if (playerIsStartingPlayback.value) return

  if (isPodcast.value) {
    episodes.value.sort((a, b) => {
      if (podcastType.value === 'serial') {
        return String(a.publishedAt).localeCompare(String(b.publishedAt), undefined, { numeric: true, sensitivity: 'base' })
      } else {
        return String(b.publishedAt).localeCompare(String(a.publishedAt), undefined, { numeric: true, sensitivity: 'base' })
      }
    })

    let episode = episodes.value.find((ep) => {
      let podcastProgress = null
      if (!isLocal.value) {
        podcastProgress = userStore.getUserMediaProgress(libraryItemId, ep.id)
      } else {
        podcastProgress = globalsStore.getLocalMediaProgressById(libraryItemId, ep.id)
      }
      return !podcastProgress?.isFinished
    })

    if (!episode) episode = episodes.value[0]

    if (!episode) return
    const episodeId = episode.id

    let localEpisode = null
    if (hasLocal.value && !isLocal.value) {
      localEpisode = localLibraryItem.value?.media.episodes?.find((ep) => ep.serverEpisodeId == episodeId)
    } else if (isLocal.value) {
      localEpisode = episode
    }
    const serverEpisodeId = !isLocal.value ? episodeId : localEpisode?.serverEpisodeId || null

    episodeStartingPlayback.value = serverEpisodeId
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = serverEpisodeId
    if (serverEpisodeId && serverLibraryItemId.value && isCasting.value) {
      eventBus.emit('play-item', { libraryItemId: serverLibraryItemId.value, episodeId: serverEpisodeId })
    } else if (localEpisode && localLibraryItem.value) {
      eventBus.emit('play-item', { libraryItemId: localLibraryItem.value.id, episodeId: localEpisode.id, serverLibraryItemId: serverLibraryItemId.value, serverEpisodeId })
    } else {
      eventBus.emit('play-item', { libraryItemId, episodeId })
    }
  } else {
    // Audiobook
    let playLibraryItemId = libraryItemId

    if (hasLocal.value && serverLibraryItemId.value && isCasting.value) {
      playLibraryItemId = serverLibraryItemId.value
    } else if (hasLocal.value && localLibraryItem.value) {
      playLibraryItemId = localLibraryItem.value.id
    }

    if (startTime !== null && startTime !== undefined && !appStore.getIsMediaStreaming(playLibraryItemId, null)) {
      const { value } = await Dialog.confirm({
        title: useNuxtApp().$strings.HeaderConfirm,
        message: useNuxtApp().$getString('MessageConfirmPlaybackTime', [title.value ?? '', useNuxtApp().$secondsToTimestamp(startTime)])
      })
      if (!value) return
    }

    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = playLibraryItemId
    eventBus.emit('play-item', { libraryItemId: playLibraryItemId, serverLibraryItemId: serverLibraryItemId.value, startTime: startTime ?? undefined })
  }
}

function itemUpdated(updatedLibraryItem: LibraryItem) {
  if (updatedLibraryItem.id === serverLibraryItemId.value) {
    console.log('Item Updated')
    libraryItem.value = updatedLibraryItem
    checkDescriptionClamped()
  }
}

function selectedLocalFolder(localFolder: LocalFolder) {
  showSelectLocalFolder.value = false
  void download(localFolder)
}

async function downloadClick() {
  if (downloadItem.value || startingDownload.value) return

  const hasPermission = await checkCellularPermission('download')
  if (!hasPermission) return

  startingDownload.value = true
  setTimeout(() => {
    startingDownload.value = false
  }, 1000)

  await hapticsImpact()
  if (isIos.value) {
    void startDownload()
  } else {
    void download()
  }
}

async function download(selectedLocalFolder: LocalFolder | null = null) {
  let localFolder = selectedLocalFolder
  if (!localFolder) {
    const localFolders = (await db.getLocalFolders()) || []
    console.log('Local folders loaded', localFolders.length)
    const foldersWithMediaType = localFolders.filter((lf) => {
      console.log('Checking local folder', lf.mediaType)
      return lf.mediaType == mediaType.value
    })
    console.log('Folders with media type', mediaType.value, foldersWithMediaType.length)
    const internalStorageFolder = foldersWithMediaType.find((f) => f.id === `internal-${mediaType.value}`)
    if (!foldersWithMediaType.length) {
      localFolder = {
        id: `internal-${mediaType.value}`,
        name: useNuxtApp().$strings.LabelInternalAppStorage,
        mediaType: mediaType.value
      }
    } else if (foldersWithMediaType.length === 1 && internalStorageFolder) {
      localFolder = internalStorageFolder
    } else {
      globalsStore.showSelectLocalFolderModalAction({
        mediaType: mediaType.value,
        callback: (folder: LocalFolder) => {
          void download(folder)
        }
      })
      return
    }
  }

  console.log('Local folder', JSON.stringify(localFolder))
  let startDownloadMessage = `Start download for "${title.value}" with ${numTracks.value} audio track${numTracks.value == 1 ? '' : 's'} to folder ${localFolder.name}?`
  if (!isIos.value && showRead.value) {
    if (numTracks.value > 0) {
      startDownloadMessage = `Start download for "${title.value}" with ${numTracks.value} audio track${numTracks.value == 1 ? '' : 's'} and ebook file to folder ${localFolder.name}?`
    } else {
      startDownloadMessage = `Start download for "${title.value}" with ebook file to folder ${localFolder.name}?`
    }
  }
  const { value } = await Dialog.confirm({
    title: useNuxtApp().$strings.HeaderConfirm,
    message: startDownloadMessage
  })
  if (value) {
    void startDownload(localFolder)
  }
}

async function startDownload(localFolder: LocalFolder | null = null) {
  const payload: { libraryItemId: string; localFolderId?: string } = {
    libraryItemId
  }
  if (localFolder) {
    console.log('Starting download to local folder', localFolder.name)
    payload.localFolderId = localFolder.id
  }
  const downloadRes = await AbsDownloader.downloadLibraryItem(payload)
  if (downloadRes && downloadRes.error) {
    const errorMsg = downloadRes.error || 'Unknown error'
    console.error('Download error', errorMsg)
    toast.error(errorMsg)
  }
}

function newLocalLibraryItem(item: LibraryItem) {
  if (item.libraryItemId == libraryItemId) {
    console.log('New local library item', item.id)
    if (libraryItem.value) {
      libraryItem.value = { ...libraryItem.value, localLibraryItem: item }
    }
  }
}

function libraryChanged(changedLibraryId: string) {
  const itemLibraryId = libraryItem.value?.libraryId
  if (itemLibraryId !== changedLibraryId) {
    void router.replace('/bookshelf')
  }
}

function checkDescriptionClamped() {
  if (showFullDescription.value) return
  if (!descriptionEl.value) {
    descriptionClamped.value = false
  } else {
    descriptionClamped.value = descriptionEl.value.scrollHeight > descriptionEl.value.clientHeight
  }
}

/**
 * Sizes the cover-tinted wash behind the page header.
 *
 * innerHeight, not outerHeight: outerHeight includes the system chrome, so the block was sized
 * against something taller than the viewport it is drawn in. Recomputed on resize because a fold
 * or a rotation changes both terms.
 */
function updateBgGradientHeight() {
  const height = Math.max(window.innerHeight - 64 - coverHeight.value, 0)
  document.documentElement.style.setProperty('--item-page-bg-gradient-height', height + 'px')
}

function windowResized() {
  windowWidth.value = window.innerWidth
  updateBgGradientHeight()
  checkDescriptionClamped()
}

function rssFeedOpen(data: { entityId?: string; [key: string]: unknown }) {
  if (data.entityId === serverLibraryItemId.value) {
    console.log('RSS Feed Opened', data)
    if (libraryItem.value) libraryItem.value = { ...libraryItem.value, rssFeed: data }
  }
}

function rssFeedClosed(data: { entityId?: string; [key: string]: unknown }) {
  if (data.entityId === serverLibraryItemId.value) {
    console.log('RSS Feed Closed', data)
    if (libraryItem.value) libraryItem.value = { ...libraryItem.value, rssFeed: null }
  }
}

async function setLibrary() {
  if (!libraryItem.value?.libraryId) return
  await librariesStore.fetch(libraryItem.value.libraryId)
  void localStore.setLastLibraryId(libraryItem.value.libraryId)
}

function init() {
  if (librariesStore.currentLibraryId !== libraryItem.value?.libraryId) {
    void setLibrary()
  }

  windowWidth.value = window.innerWidth
  window.addEventListener('resize', windowResized)
  eventBus.on('library-changed', libraryChanged)
  eventBus.on('new-local-library-item', newLocalLibraryItem)
  socket.$on('item_updated', itemUpdated)
  socket.$on('rss_feed_open', rssFeedOpen)
  socket.$on('rss_feed_closed', rssFeedClosed)
  checkDescriptionClamped()

  updateBgGradientHeight()

  const scroller = document.getElementById('item-page')
  if (appStore.lastItemScrollData.id === libraryItemId && scroller) {
    scroller.scrollTop = Number(appStore.lastItemScrollData.scrollTop) || 0
  }
}

async function loadServerLibraryItem() {
  let fetchedItem: LibraryItem | null = null

  if (!appStore.isOffline && userStore.serverConnectionConfig) {
    fetchedItem = (await nativeHttp.get(`/api/items/${libraryItemId}?expanded=1&include=rssfeed`, { connectTimeout: 10000 }).catch((error: unknown) => {
      console.error('Failed to fetch library item', error)
      AbsLogger.error({ tag: 'ItemPage', message: `Failed to fetch library item ${libraryItemId}: ${(error as Error | null | undefined)?.message || error}` })
      return null
    })) as LibraryItem | null

    if (fetchedItem) {
      await localStore.setCachedLibraryItem(fetchedItem as Record<string, unknown>)
    }
  }

  if (!fetchedItem) {
    fetchedItem = (await localStore.getCachedLibraryItem(libraryItemId)) as LibraryItem | null
    if (fetchedItem) {
      loadedFromCache.value = true
    }
  }

  if (!fetchedItem && route.query.localLibraryItemId) {
    await router.replace(`/item/${route.query.localLibraryItemId as string}?noredirect=1`)
    return
  }

  if (!fetchedItem) {
    const fallbackLocal = (await db.getLocalLibraryItemByLId(libraryItemId).catch(() => null)) as LibraryItem | null
    if (fallbackLocal) {
      fetchedItem = fallbackLocal
      loadedFromCache.value = true
    }
  }

  if (!fetchedItem) {
    toast.error('Failed to get library item from server')
    await leaveUnloadablePage(router, '/bookshelf')
    return
  }

  try {
    const localLibraryItemCheck = (await db.getLocalLibraryItemByLId(libraryItemId)) as LibraryItem | null
    if (localLibraryItemCheck) {
      fetchedItem.localLibraryItem = localLibraryItemCheck
    }
  } catch (e: unknown) {
    console.error('Failed to get local library item', e)
  }

  libraryItem.value = fetchedItem
}

onMounted(async () => {
  const query = route.query
  const libItemId = libraryItemId

  if (libItemId.startsWith('local')) {
    const localItem = (await db.getLocalLibraryItem(libItemId)) as LibraryItem | null
    if (!localItem) {
      await navigateTo('/?error=Failed to get downloaded library item', { replace: true })
      return
    }

    if (localItem?.libraryItemId?.startsWith('li_')) {
      console.error('Local library item has old server library item id', localItem.libraryItemId)
    } else if (query.noredirect !== '1' && localItem?.libraryItemId && localItem?.serverAddress === userStore.getServerAddress && appStore.socketConnected) {
      const queryParams = new URLSearchParams()
      queryParams.set('localLibraryItemId', libItemId)
      if (localItem.mediaType === 'podcast') {
        queryParams.set('episodefilter', 'downloaded')
      }
      await navigateTo(`/item/${localItem.libraryItemId}?${queryParams.toString()}`, { replace: true })
      return
    }

    if (localItem && !localItem.isLocal) {
      const localLi = (await db.getLocalLibraryItemByLId(localItem.id || libItemId)) as LibraryItem | null
      if (localLi) {
        localItem.localLibraryItem = localLi
      }
    }

    libraryItem.value = localItem
  } else if (!userStore.serverConnectionConfig) {
    let cachedItem = (await localStore.getCachedLibraryItem(libItemId)) as LibraryItem | null
    if (cachedItem) {
      loadedFromCache.value = true
    } else {
      const fallbackLocal = (await db.getLocalLibraryItemByLId(libItemId)) as LibraryItem | null
      if (fallbackLocal) {
        cachedItem = fallbackLocal
        loadedFromCache.value = true
      } else {
        await navigateTo('/?error=No server connection to get library item', { replace: true })
        return
      }
    }

    if (cachedItem && !cachedItem.isLocal) {
      const localLi = (await db.getLocalLibraryItemByLId(cachedItem.id || libItemId)) as LibraryItem | null
      if (localLi) {
        cachedItem.localLibraryItem = localLi
      }
    }

    libraryItem.value = cachedItem
  }

  if (!libraryItemId.startsWith('local') && libraryItem.value && !appStore.isOffline && userStore.serverConnectionConfig) {
    await localStore.setCachedLibraryItem(libraryItem.value)
  }

  if (!libraryItem.value) {
    await loadServerLibraryItem()
  }

  if (libraryItem.value) {
    init()
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', windowResized)
  eventBus.off('library-changed', libraryChanged)
  eventBus.off('new-local-library-item', newLocalLibraryItem)
  socket.$off('item_updated', itemUpdated)
  socket.$off('rss_feed_open', rssFeedOpen)
  socket.$off('rss_feed_closed', rssFeedClosed)

  const scroller = document.getElementById('item-page')
  if (scroller) {
    appStore.setLastItemScrollData({ scrollTop: scroller.scrollTop || 0, id: libraryItemId })
  }
})
</script>

<style>
:root {
  --item-page-bg-gradient-height: 100%;
}

#item-page-bg-gradient {
  transition: opacity 0.5s ease-in-out;
  height: var(--item-page-bg-gradient-height);
}

.title-container {
  width: calc(100% - 64px);
  max-width: calc(100% - 64px);
}
#coverBg > div {
  width: 150vw !important;
  max-width: 150vw !important;
}

@media only screen and (max-width: 500px) {
  #metadata {
    grid-template-columns: auto 1fr;
  }
}
@media only screen and (min-width: 500px) {
  #metadata {
    grid-template-columns: auto 1fr auto 1fr;
  }
}
</style>
