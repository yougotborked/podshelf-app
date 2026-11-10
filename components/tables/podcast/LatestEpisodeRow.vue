<template>
  <div class="w-full py-4 overflow-hidden relative border-b border-md-outline-variant" @click.stop="goToEpisodePage">
    <div v-if="episode" class="w-full px-1">
      <div class="flex mb-2">
        <div class="w-10 min-w-10">
          <covers-preview-cover :src="coverSrc" :width="40" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" class="md:hidden" />
        </div>
        <div class="flex-grow px-2">
          <div class="flex items-center">
            <div class="-mt-0.5 mb-0.5" @click.stop>
              <nuxt-link :to="`/item/${libraryItemId}`" class="text-sm text-md-on-surface underline">{{ (podcast.metadata as any).title }}</nuxt-link>
            </div>
            <widgets-explicit-indicator v-if="(podcast.metadata as any).explicit" />
          </div>
          <p v-if="publishedAt" class="text-xs text-md-on-surface-variant">{{ utils.dateDistanceFromNow(publishedAt) }}</p>
        </div>
      </div>

      <p class="text-sm font-semibold">{{ title }}</p>

      <p class="text-sm text-md-on-surface episode-subtitle mt-1.5 mb-0.5" v-html="subtitle" />

      <div v-if="episodeNumber || season || episodeType" class="flex pt-2 items-center -mx-0.5">
        <div v-if="episodeNumber" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface">{{ strings.LabelEpisode }} #{{ episodeNumber }}</div>
        <div v-if="season" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface">{{ strings.LabelSeason }} #{{ season }}</div>
        <div v-if="episodeType" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface capitalize">{{ episodeType }}</div>
      </div>

      <div class="flex items-center pt-2">
        <!-- Play/Pause Button -->
        <div class="h-9 px-4 border border-md-outline-variant hover:bg-white/10 rounded-full flex items-center justify-center cursor-pointer" :class="userIsFinished ? 'text-md-on-surface/40' : ''" @click.stop="playClick">
          <span v-if="!playerIsStartingForThisMedia" class="material-symbols text-2xl fill leading-none" :class="streamIsPlaying ? '' : 'text-md-primary'">
            {{ streamIsPlaying ? 'pause' : 'play_arrow' }}
          </span>
          <svg v-else class="animate-spin" style="width: 22px; height: 22px" viewBox="0 0 24 24">
            <path fill="currentColor" d="M12,4V2A10,10 0 0,0 2,12H4A8,8 0 0,1 12,4Z" />
          </svg>
          <p class="pl-2 pr-1 text-sm font-semibold">{{ timeRemaining }}</p>
        </div>

        <!-- Read Status Button -->
        <ui-read-icon-btn :disabled="isProcessingReadUpdate" :is-read="userIsFinished" borderless class="mx-1" @click="toggleFinished" />

        <!-- Add to Playlist Button -->
        <button v-if="!isLocal" class="mx-1.5" @click.stop="addToPlaylist">
          <span class="material-symbols text-2xl leading-none">playlist_add</span>
        </button>

        <!-- Download Section -->
        <div v-if="userCanDownload" class="flex items-center">
          <span v-if="isLocal" class="material-symbols px-2 text-md-primary text-2xl leading-none">audio_file</span>
          <span v-else-if="!localEpisode" class="material-symbols mx-1.5 text-2xl leading-none" :class="downloadItem || pendingDownload ? 'animate-bounce text-warning/75' : ''" @click.stop="downloadClick">
            {{ downloadItem || pendingDownload ? 'downloading' : 'download' }}
          </span>
          <span v-else class="material-symbols px-2 text-md-primary text-2xl leading-none">download_done</span>
        </div>

        <!-- Spacer to push elements left -->
        <div class="flex-grow" />
      </div>
    </div>

    <div v-if="processing" class="absolute top-0 left-0 w-full h-full bg-black/30 flex items-center justify-center">
      <widgets-loading-spinner size="la-lg" />
    </div>

    <div v-if="!userIsFinished" class="absolute bottom-0 left-0 h-0.5 bg-warning" :style="{ width: itemProgressPercent * 100 + '%' }" />
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import { resolveCoverSrc } from '~/composables/useCoverSource'
import { AbsDownloader } from '@/plugins/capacitor'

const props = defineProps<{
  libraryItemId?: string
  episode: Record<string, unknown>
  localLibraryItemId?: string
  localEpisode?: Record<string, unknown>
  localCoverUrl?: string | null
  isLocal?: boolean
}>()

const emit = defineEmits<{
  addToPlaylist: [episode: Record<string, unknown>]
}>()

const strings = useStrings()
const utils = useUtils()
const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()
const platform = usePlatform()
const { impact } = useHaptics()
const eventBus = useEventBus()
const db = useDb()
const nativeHttp = useNativeHttp()

// A downloaded episode has its cover on disk; using it keeps the list looking the same with no
// server, and avoids a doomed request per row
const coverSrc = computed(
  () =>
    resolveCoverSrc({
      localCoverUrl: props.localCoverUrl,
      serverCoverSrc: globalsStore.getLibraryItemCoverSrcById(props.libraryItemId || ''),
      toFileUrl: (path) => Capacitor.convertFileSrc(path)
    }) || ''
)
const toast = useToast()
const router = useRouter()
const { checkCellularPermission } = useCellularPermission()

const isProcessingReadUpdate = ref(false)
const pendingDownload = ref(false)
const processing = ref(false)

const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const isIos = computed(() => platform === 'ios')
const mediaType = 'podcast'
const userCanDownload = computed(() => userStore.getUserCanDownload)
const title = computed(() => (props.episode.title as string) || '')
const subtitle = computed(() => (props.episode.subtitle as string) || (props.episode.description as string) || '')
const episodeNumber = computed(() => props.episode.episode)
const season = computed(() => props.episode.season)
const episodeType = computed(() => {
  if (props.episode.episodeType === 'full') return null // only show Trailer/Bonus
  return props.episode.episodeType as string | null
})
const isStreaming = computed(() => {
  if (props.localEpisode && props.localLibraryItemId) {
    if (appStore.getIsMediaStreaming(props.localLibraryItemId, props.localEpisode.id as string)) return true
  }
  return appStore.getIsMediaStreaming(props.libraryItemId || '', props.episode.id as string)
})
const streamIsPlaying = computed(() => appStore.playerIsPlaying && isStreaming.value)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  if (!props.episode?.id) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  return mediaId === props.episode.id
})
const itemProgress = computed(() => {
  if (props.isLocal) return globalsStore.getLocalMediaProgressById(props.libraryItemId || '', props.episode.id as string)
  const serverProg = userStore.getUserMediaProgress(props.libraryItemId || '', props.episode.id as string)
  const localProg = globalsStore.getLocalMediaProgressByServerItemId(props.libraryItemId || '', props.episode.id as string)
  if (!localProg) return serverProg
  if (!serverProg) return localProg
  const serverUpdate = ((serverProg as Record<string, unknown>).lastUpdate as number) || 0
  const localUpdate = ((localProg as Record<string, unknown>).lastUpdate as number) || 0
  return localUpdate > serverUpdate ? localProg : serverProg
})
const itemProgressPercent = computed(() => ((itemProgress.value as Record<string, unknown> | null | undefined)?.progress as number) || 0)
const userIsFinished = computed(() => isProgressFinished(itemProgress.value as MaybeProgress))
const timeRemaining = computed(() => {
  if (streamIsPlaying.value) return 'Playing'
  if (!itemProgressPercent.value) return utils.elapsedPretty(props.episode.duration as number)
  if (userIsFinished.value) return 'Finished'
  const prog = itemProgress.value as Record<string, unknown>
  const remaining = Math.floor((prog.duration as number) - (prog.currentTime as number))
  // A played position at or past the end means finished, whatever isFinished says. Without this
  // a rounding overshoot renders as "-1 sec left".
  if (!(remaining > 0)) return 'Finished'
  return `${utils.elapsedPretty(remaining)} left`
})
const publishedAt = computed(() => props.episode.publishedAt as number | null)
const downloadItem = computed(() => globalsStore.getDownloadItem(props.libraryItemId || '', props.episode.id as string))
const podcast = computed(() => (props.episode.podcast as Record<string, unknown> | null | undefined) || {})

function goToEpisodePage() {
  void router.push(`/item/${props.libraryItemId}/${props.episode.id}`)
}

function addToPlaylist() {
  emit('addToPlaylist', props.episode)
}

async function downloadClick() {
  if (downloadItem.value || pendingDownload.value) return

  const hasPermission = await checkCellularPermission('download')
  if (!hasPermission) return

  pendingDownload.value = true
  await impact()
  if (isIos.value) {
    // no local folders on iOS
    await startDownload(null)
  } else {
    await download(null)
  }

  setTimeout(() => {
    pendingDownload.value = false
  }, 1000)
}

async function download(selectedLocalFolder: Record<string, unknown> | null = null) {
  let localFolder = selectedLocalFolder
  if (!localFolder) {
    const localFolders = ((await db.getLocalFolders()) as Record<string, unknown>[] | null | undefined) || []
    console.log('Local folders loaded', localFolders.length)
    const foldersWithMediaType = localFolders.filter((lf) => {
      console.log('Checking local folder', lf.mediaType)
      return lf.mediaType == mediaType
    })
    console.log('Folders with media type', mediaType, foldersWithMediaType.length)
    const internalStorageFolder = foldersWithMediaType.find((f) => f.id === `internal-${mediaType}`)
    if (!foldersWithMediaType.length) {
      localFolder = {
        id: `internal-${mediaType}`,
        name: 'Internal App Storage',
        mediaType
      }
    } else if (foldersWithMediaType.length === 1 && internalStorageFolder) {
      localFolder = internalStorageFolder
    } else {
      globalsStore.showSelectLocalFolderModalAction({
        mediaType,
        callback: (folder: Record<string, unknown>) => {
          void download(folder)
        }
      })
      return
    }
  }

  console.log('Local folder', JSON.stringify(localFolder))
  return startDownload(localFolder)
}

async function startDownload(localFolder: Record<string, unknown> | null) {
  const payload: Record<string, unknown> = {
    libraryItemId: props.libraryItemId,
    episodeId: props.episode.id
  }
  if (localFolder) {
    payload.localFolderId = localFolder.id
  }
  const downloadRes = await AbsDownloader.downloadLibraryItem(payload as Parameters<typeof AbsDownloader.downloadLibraryItem>[0])
  if (downloadRes && (downloadRes as Record<string, unknown>).error) {
    const errorMsg = ((downloadRes as Record<string, unknown>).error as string) || 'Unknown error'
    console.error('Download error', errorMsg)
    toast.error(errorMsg)
  } else {
    console.log('Download completed', JSON.stringify(downloadRes))
  }
}

async function playClick() {
  if (playerIsStartingPlayback.value) return

  await impact()
  if (streamIsPlaying.value) {
    eventBus.emit('pause-item')
  } else {
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = props.episode.id as string

    if (props.localEpisode && props.localLibraryItemId) {
      console.log('Play local episode', props.localEpisode.id, props.localLibraryItemId)
      eventBus.emit('play-item', {
        libraryItemId: props.localLibraryItemId,
        episodeId: props.localEpisode.id as string,
        serverLibraryItemId: props.libraryItemId,
        serverEpisodeId: props.episode.id as string
      })
    } else {
      eventBus.emit('play-item', {
        libraryItemId: props.libraryItemId || '',
        episodeId: props.episode.id as string
      })
    }
  }
}

async function toggleFinished() {
  await impact()

  isProcessingReadUpdate.value = true
  if (props.isLocal || props.localEpisode) {
    const isFinished = !userIsFinished.value
    const localLibraryItemId = props.isLocal ? props.libraryItemId : props.localLibraryItemId
    const localEpisodeId = props.isLocal ? (props.episode.id as string) : (props.localEpisode?.id as string)
    const payload = (await db.updateLocalMediaProgressFinished({
      localLibraryItemId,
      localEpisodeId,
      isFinished
    })) as Record<string, unknown>
    console.log('toggleFinished payload', JSON.stringify(payload))
    if (payload?.error) {
      toast.error((payload?.error as string) || 'Unknown error')
    } else {
      const localMediaProg = payload.localMediaProgress
      console.log('toggleFinished localMediaProgress', JSON.stringify(localMediaProg))
      if (localMediaProg) {
        globalsStore.updateLocalMediaProgress(localMediaProg as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
      }
    }
    isProcessingReadUpdate.value = false
  } else {
    const updatePayload = {
      isFinished: !userIsFinished.value
    }
    nativeHttp
      .patch(`/api/me/progress/${props.libraryItemId}/${props.episode.id}`, updatePayload)
      .catch((error: Error) => {
        console.error('Failed', error)
        toast.error(`Failed to mark as ${updatePayload.isFinished ? 'Finished' : 'Not Finished'}`)
      })
      .finally(() => {
        isProcessingReadUpdate.value = false
      })
  }
}
</script>
