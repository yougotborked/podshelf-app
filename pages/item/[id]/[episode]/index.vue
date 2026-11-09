<template>
  <div v-if="!libraryItem || !episode" class="w-full h-full relative flex items-center justify-center bg-md-surface-0">
    <ui-loading-indicator />
  </div>
  <div v-else class="w-full h-full px-3 py-4 overflow-y-auto overflow-x-hidden relative bg-md-surface-0">
    <div class="flex mb-2">
      <div class="w-10 min-w-10">
        <covers-preview-cover :src="coverUrl" :width="40" :book-cover-aspect-ratio="bookCoverAspectRatio" :show-resolution="false" class="md:hidden" />
      </div>
      <div class="flex-grow px-2">
        <div class="-mt-0.5 mb-0.5">
          <nuxt-link :to="`/item/${libraryItemId}`" class="text-sm text-md-on-surface underline">{{ podcast.metadata.title }}</nuxt-link>
        </div>
        <p v-if="publishedAt" class="text-xs text-md-on-surface-variant">{{ $dateDistanceFromNow(publishedAt) }}</p>
      </div>
    </div>

    <p class="text-lg font-semibold text-md-on-surface">{{ title }}</p>

    <div v-if="episodeNumber || season || episodeType" class="flex py-2 items-center -mx-0.5">
      <div v-if="episodeNumber" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface">{{ $strings.LabelEpisode }} #{{ episodeNumber }}</div>
      <div v-if="season" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface">{{ $strings.LabelSeason }} #{{ season }}</div>
      <div v-if="episodeType" class="px-2 pt-px pb-0.5 mx-0.5 bg-md-secondary-container rounded-full text-xs font-light text-md-on-surface capitalize">{{ episodeType }}</div>
    </div>

    <!-- user progress card -->
    <!-- A bar filled to the progress: drawn as a solid block it read as "finished" at 9% -->
    <div v-if="progressPercent > 0" class="bg-md-surface-2 text-sm font-semibold rounded-md-md text-md-on-surface mt-4 relative overflow-hidden" :class="resettingProgress ? 'opacity-25' : ''">
      <div class="absolute inset-y-0 left-0 bg-md-primary-container" :style="{ width: `${Math.min(Number(progressPercent), 1) * 100}%` }" />
      <div class="relative px-4 py-2">
        <p class="leading-6">{{ $strings.LabelYourProgress }}: {{ Math.round(progressPercent * 100) }}%</p>
        <p v-if="progressPercent < 1" class="text-md-on-surface-variant text-xs">{{ timeRemainingLabel }}</p>
        <p v-else class="text-md-on-surface-variant text-xs">{{ $strings.LabelFinished }} {{ $formatDate(userProgressFinishedAt) }}</p>
      </div>
    </div>

    <!-- action buttons -->
    <div class="flex mt-4 -mx-1">
      <ui-btn color="success" class="flex items-center justify-center flex-grow mx-1" :loading="playerIsStartingForThisMedia" :padding-x="4" @click="playClick">
        <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
        <span class="px-1 text-sm">{{ playerIsPlaying ? $strings.ButtonPause : localEpisodeId ? $strings.ButtonPlay : $strings.ButtonStream }}</span>
      </ui-btn>
      <ui-btn v-if="showDownload" :color="downloadItem ? 'warning' : 'primary'" class="flex items-center justify-center mx-1" :padding-x="2" @click="downloadClick">
        <span class="material-symbols text-2xl" :class="downloadItem || startingDownload ? 'animate-pulse' : ''">{{ downloadItem || startingDownload ? 'downloading' : 'download' }}</span>
      </ui-btn>
      <ui-btn color="primary" class="flex items-center justify-center mx-1" :padding-x="2" @click="showMoreMenu = true">
        <span class="material-symbols text-2xl">more_vert</span>
      </ui-btn>
    </div>

    <p class="text-sm text-md-on-surface mt-1.5 mb-0.5 default-style description-container" v-html="transformedDescription"></p>

    <!-- loading overlay -->
    <div v-if="processing" class="absolute top-0 left-0 w-full h-full bg-black/30 flex items-center justify-center">
      <ui-loading-indicator />
    </div>

    <modals-dialog v-model="showMoreMenu" :items="moreMenuItems" @action="moreMenuAction" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'
import { AbsFileSystem, AbsDownloader, AbsLogger } from '@/plugins/capacitor'
import { useCellularPermission } from '~/composables/useCellularPermission'

const route = useRoute()
const router = useRouter()
const eventBus = useEventBus()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const { hapticsImpact } = useHaptics()
const toast = useToast()
const platform = usePlatform()
const globalsStore = useGlobalsStore()
const appStore = useAppStore()
const { checkCellularPermission } = useCellularPermission()

const libraryItemIdParam = route.params.id as string
const episodeIdParam = route.params.episode as string

const userStore = useUserStore()

// State
const libraryItem = ref<any>(null)
const episode = ref<any>(null)
const loadedFromCache = ref(false)
const showMoreMenu = ref(false)
const processing = ref(false)
const resettingProgress = ref(false)
const startingDownload = ref(false)

// Computed
const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const isAdminOrUp = computed(() => userStore.getIsAdminOrUp)
const isIos = computed(() => platform === 'ios')
const mediaType = 'podcast'
const userCanDownload = computed(() => userStore.getUserCanDownload)
const isLocal = computed(() => libraryItem.value?.isLocal)
const localLibraryItem = computed(() => {
  if (isLocal.value) return libraryItem.value
  return libraryItem.value?.localLibraryItem
})
const libraryItemId = computed(() => libraryItem.value?.id)
const isConnectedToServer = computed(() => {
  if (!isLocal.value) return true
  if (!libraryItem.value?.serverAddress) return false
  return userStore.getServerAddress === libraryItem.value.serverAddress
})
const serverLibraryItemId = computed(() => {
  if (!isLocal.value) return libraryItemId.value
  if (!libraryItem.value?.libraryItemId) return null
  if (isConnectedToServer.value) {
    return libraryItem.value.libraryItemId
  }
  return null
})
const localLibraryItemId = computed(() => localLibraryItem.value?.id || null)
const localEpisode = computed(() => {
  if (isLocal.value) return episode.value
  return episode.value?.localEpisode
})
const localEpisodeId = computed(() => {
  if (localEpisode.value) return localEpisode.value.id
  return null
})
const serverEpisodeId = computed(() => {
  if (!isLocal.value) return episode.value?.id
  if (isConnectedToServer.value) {
    return episode.value?.serverEpisodeId
  }
  return null
})
const podcast = computed(() => libraryItem.value?.media)
const title = computed(() => episode.value?.title || '')
const description = computed(() => episode.value?.description || '')
const episodeNumber = computed(() => episode.value?.episode)
const season = computed(() => episode.value?.season)
const episodeType = computed(() => {
  if (episode.value?.episodeType === 'full') return null
  return episode.value?.episodeType
})
const coverUrl = computed(() => {
  if (isLocal.value) {
    if (!libraryItem.value?.coverContentUrl) return '/book_placeholder.jpg'
    return Capacitor.convertFileSrc(libraryItem.value.coverContentUrl)
  }
  return globalsStore.getLibraryItemCoverSrcById(libraryItemId.value)
})
const isPlaying = computed(() => appStore.getIsMediaStreaming(libraryItemId.value, episode.value?.id))
const playerIsPlaying = computed(() => appStore.playerIsPlaying && isPlaying.value)
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  if (!mediaId) return false
  return mediaId === localEpisodeId.value || mediaId === serverEpisodeId.value
})
const userItemProgress = computed(() => {
  if (isLocal.value) return localItemProgress.value
  const serverProg = serverItemProgress.value
  const localProg = localItemProgress.value
  if (!localProg) return serverProg
  if (!serverProg) return localProg
  const serverUpdate = (serverProg as Record<string, unknown>).lastUpdate as number || 0
  const localUpdate = (localProg as Record<string, unknown>).lastUpdate as number || 0
  return localUpdate > serverUpdate ? localProg : serverProg
})
const localItemProgress = computed(() => {
  if (!localLibraryItemId.value || !localEpisodeId.value) return null
  return globalsStore.getLocalMediaProgressById(localLibraryItemId.value, localEpisodeId.value)
})
const serverItemProgress = computed(() => {
  if (!serverLibraryItemId.value || !serverEpisodeId.value) return null
  return userStore.getUserMediaProgress(serverLibraryItemId.value, serverEpisodeId.value)
})
const progressPercent = computed(() => userItemProgress.value?.progress || 0)
const userIsFinished = computed(() => !!userItemProgress.value?.isFinished)
const userProgressFinishedAt = computed(() => userItemProgress.value?.finishedAt || 0)
const playbackRate = computed(() => Number(userStore.getUserSetting('playbackRate')) || 1)
const userTimeRemaining = computed(() => {
  if (!userItemProgress.value) return 0
  const dur = userItemProgress.value.duration || episode.value?.duration
  return Math.max(0, Number(dur) - Number(userItemProgress.value.currentTime))
})
const timeRemainingText = useTimeRemainingText()
const timeRemainingLabel = computed(() => timeRemainingText(userTimeRemaining.value, playbackRate.value))
const publishedAt = computed(() => episode.value?.publishedAt)
const downloadItem = computed(() => globalsStore.getDownloadItem(libraryItemId.value, episode.value?.id))
const showDownload = computed(() => userCanDownload.value && !localEpisode.value)
const transformedDescription = computed(() => parseDescription(description.value))

const moreMenuItems = computed(() => {
  const items: any[] = []

  if (!userIsFinished.value) {
    items.push({
      text: useNuxtApp().$strings.MessageMarkAsFinished,
      value: 'markFinished',
      icon: 'beenhere'
    })
  }

  if (progressPercent.value > 0) {
    items.push({
      text: useNuxtApp().$strings.MessageDiscardProgress,
      value: 'discardProgress',
      icon: 'backspace'
    })
  }

  if (!isLocal.value) {
    items.push({
      text: useNuxtApp().$strings.LabelAddToPlaylist,
      value: 'playlist',
      icon: 'playlist_add'
    })
  }

  if (localEpisodeId.value) {
    items.push({
      text: useNuxtApp().$strings.ButtonDeleteLocalEpisode,
      value: 'deleteLocal',
      icon: 'delete'
    })
  }

  if (isAdminOrUp.value && serverEpisodeId.value) {
    items.push({
      text: useNuxtApp().$strings.ButtonRemoveFromServer,
      value: 'remove_from_server',
      icon: 'delete_forever'
    })
  }

  return items
})

// Methods
function parseDescription(desc: string) {
  const timeMarkerLinkRegex = /<a href="#([^"]*?\b\d{1,2}:\d{1,2}(?::\d{1,2})?)">(.*?)<\/a>/g
  const timeMarkerRegex = /\b\d{1,2}:\d{1,2}(?::\d{1,2})?\b/g

  function convertToSeconds(time: string) {
    const timeParts = time.split(':').map(Number)
    return timeParts.reduce((acc, part) => acc * 60 + part, 0)
  }

  return desc
    .replace(timeMarkerLinkRegex, (match: string, href: string, displayTime: string) => {
      const timeMatch = displayTime.match(timeMarkerRegex)
      if (!timeMatch) return match
      const time = timeMatch[0]
      const seekTimeInSeconds = convertToSeconds(time)
      return `<span class="time-marker cursor-pointer text-md-primary hover:text-md-primary/80" data-time="${seekTimeInSeconds}">${displayTime}</span>`
    })
    .replace(timeMarkerRegex, (match: string) => {
      const seekTimeInSeconds = convertToSeconds(match)
      return `<span class="time-marker cursor-pointer text-md-primary hover:text-md-primary/80" data-time="${seekTimeInSeconds}">${match}</span>`
    })
}

async function deleteLocalEpisode() {
  await hapticsImpact()

  const localEpisodeAudioTrack = localEpisode.value?.audioTrack
  const localFile = localLibraryItem.value?.localFiles.find((lf: any) => lf.id === localEpisodeAudioTrack.localFileId)
  if (!localFile) {
    toast.error('Audio track does not have matching local file..')
    return
  }

  const { value } = await Dialog.confirm({
    title: useNuxtApp().$strings.HeaderConfirm,
    message: useNuxtApp().$getString('MessageConfirmDeleteLocalEpisode', [localFile.basePath])
  })
  if (value) {
    const res = await AbsFileSystem.deleteTrackFromItem({ id: localLibraryItemId.value, trackLocalFileId: localFile.id, trackContentUrl: localEpisodeAudioTrack.contentUrl })
    if (res?.id) {
      if (isLocal.value) {
        if (serverEpisodeId.value) {
          void router.replace(`/item/${serverLibraryItemId.value}/${serverEpisodeId.value}`)
        } else {
          void router.replace(`/item/${localLibraryItemId.value}`)
        }
      } else {
        libraryItem.value = { ...libraryItem.value, localLibraryItem: res }
        if (episode.value) {
          const { localEpisode: _le, ...rest } = episode.value
          episode.value = rest
        }
      }
    } else toast.error('Failed to delete')
  }
}

async function playClick() {
  if (playerIsStartingPlayback.value) return

  await hapticsImpact()
  if (playerIsPlaying.value) {
    eventBus.emit('pause-item')
  } else {
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = episode.value?.id

    const playbackData = generatePlaybackData()
    emitPlayItemEvent(playbackData)
  }
}

async function clickPlaybackTime(event: any) {
  const startTime = event.target.getAttribute('data-time')
  if (playerIsStartingPlayback.value) return

  await hapticsImpact()

  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = episode.value?.id

  const playbackData = generatePlaybackData(startTime)
  emitPlayItemEvent(playbackData)
}

function generatePlaybackData(startTime?: any) {
  const playbackData: any = {
    libraryItemId: libraryItemId.value,
    episodeId: episode.value?.id,
    serverLibraryItemId: serverLibraryItemId.value,
    serverEpisodeId: serverEpisodeId.value,
    startTime
  }

  if (localEpisodeId.value && localLibraryItemId.value && !isLocal.value) {
    playbackData.libraryItemId = localLibraryItemId.value
    playbackData.episodeId = localEpisodeId.value
  }

  return playbackData
}

function emitPlayItemEvent(playbackData: any) {
  eventBus.emit('play-item', playbackData)
}

function bindTimeMarkerEvents() {
  const container = document.querySelector('.description-container')
  if (container) {
    container.addEventListener('click', (event: any) => {
      if (event.target.classList.contains('time-marker')) {
        void clickPlaybackTime(event)
      }
    })
  }
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

async function download(selectedLocalFolder: any = null) {
  let localFolder = selectedLocalFolder
  if (!localFolder) {
    const localFolders = (await db.getLocalFolders()) || []
    console.log('Local folders loaded', localFolders.length)
    const foldersWithMediaType = localFolders.filter((lf: any) => {
      console.log('Checking local folder', lf.mediaType)
      return lf.mediaType == mediaType
    })
    console.log('Folders with media type', mediaType, foldersWithMediaType.length)
    const internalStorageFolder = foldersWithMediaType.find((f: any) => f.id === `internal-${mediaType}`)
    if (!foldersWithMediaType.length) {
      localFolder = {
        id: `internal-${mediaType}`,
        name: useNuxtApp().$strings.LabelInternalAppStorage,
        mediaType
      }
    } else if (foldersWithMediaType.length === 1 && internalStorageFolder) {
      localFolder = internalStorageFolder
    } else {
      globalsStore.showSelectLocalFolderModalAction({
        mediaType,
        callback: (folder: any) => {
          void download(folder)
        }
      })
      return
    }
  }

  console.log('Local folder', JSON.stringify(localFolder))
  void startDownload(localFolder)
}

async function startDownload(localFolder?: any) {
  const payload: any = {
    libraryItemId: libraryItemId.value,
    episodeId: episode.value?.id
  }
  if (localFolder) {
    payload.localFolderId = localFolder.id
  }
  const downloadRes = await AbsDownloader.downloadLibraryItem(payload)
  if (downloadRes && downloadRes.error) {
    const errorMsg = downloadRes.error || 'Unknown error'
    console.error('Download error', errorMsg)
    toast.error(errorMsg)
  }
}

function moreMenuAction(action: string) {
  showMoreMenu.value = false
  if (action === 'markFinished') {
    void toggleFinished()
  } else if (action === 'discardProgress') {
    void discardProgress()
  } else if (action === 'playlist' && !isLocal.value) {
    globalsStore.selectedPlaylistItems = [{ libraryItem: libraryItem.value, episode: episode.value }]
    globalsStore.showPlaylistsAddCreateModal = true
  } else if (action === 'remove_from_server' && serverEpisodeId.value && isAdminOrUp.value) {
    void deleteEpisodeFromServerClick()
  } else if (action === 'deleteLocal') {
    void deleteLocalEpisode()
  }
}

async function discardProgress() {
  await hapticsImpact()

  const { value } = await Dialog.confirm({
    title: useNuxtApp().$strings.HeaderConfirm,
    message: useNuxtApp().$strings.MessageConfirmDiscardProgress
  })
  if (value) {
    resettingProgress.value = true

    const serverItemProgressId = serverItemProgress.value?.id
    if (localItemProgress.value) {
      await db.removeLocalMediaProgress(localItemProgress.value.id)
      globalsStore.removeLocalMediaProgress(localItemProgress.value.id)
    }

    if (serverItemProgressId) {
      await nativeHttp
        .delete(`/api/me/progress/${serverItemProgressId}`, { connectTimeout: 10000 })
        .then(() => {
          console.log('Progress reset complete')
          toast.success(`Your progress was reset`)
          userStore.removeMediaProgress(serverItemProgressId)
        })
        .catch((error: any) => {
          console.error('Progress reset failed', error)
        })
    }

    resettingProgress.value = false
  }
}

async function toggleFinished() {
  await hapticsImpact()

  if (isLocal.value || localEpisode.value) {
    const isFinished = !userIsFinished.value
    const lliId = localLibraryItemId.value
    const leId = localEpisodeId.value
    const payload = await db.updateLocalMediaProgressFinished({ localLibraryItemId: lliId, localEpisodeId: leId, isFinished }) as Record<string, unknown> | null
    console.log('toggleFinished payload', JSON.stringify(payload))

    if (payload?.error) {
      toast.error((payload?.error as string) || 'Unknown error')
    } else {
      const localMediaProgress = payload?.localMediaProgress
      console.log('toggleFinished localMediaProgress', JSON.stringify(localMediaProgress))
      if (localMediaProgress) {
        globalsStore.updateLocalMediaProgress(localMediaProgress)
      }
    }
  } else {
    const updatePayload = {
      isFinished: !userIsFinished.value
    }
    nativeHttp.patch(`/api/me/progress/${libraryItemId.value}/${episode.value?.id}`, updatePayload, { connectTimeout: 10000 }).catch((error: any) => {
      console.error('Failed', error)
      toast.error(updatePayload.isFinished ? useNuxtApp().$strings.ToastItemMarkedAsFinishedFailed : useNuxtApp().$strings.ToastItemMarkedAsNotFinishedFailed)
    })
  }
}

async function deleteEpisodeFromServerClick() {
  await hapticsImpact()

  const { value } = await Dialog.confirm({
    title: useNuxtApp().$strings.HeaderConfirm,
    message: useNuxtApp().$getString('MessageConfirmDeleteServerEpisode', [title.value])
  })

  if (value) {
    processing.value = true
    nativeHttp
      .delete(`/api/podcasts/${serverLibraryItemId.value}/episode/${serverEpisodeId.value}?hard=1`, { connectTimeout: 10000 })
      .then(() => {
        void router.replace(`/item/${serverLibraryItemId.value}`)
      })
      .catch((error: any) => {
        const errorMsg = error.response?.data || 'Failed to delete episode'
        console.error('Failed to delete episode', error)
        toast.error(errorMsg)
      })
      .finally(() => {
        processing.value = false
      })
  }
}

function newLocalLibraryItem(item: any) {
  if (item.libraryItemId == libraryItemId.value) {
    console.log('New local library item', item.id)
    libraryItem.value = { ...libraryItem.value, localLibraryItem: item }

    const matchedEpisode = item.media.episodes.find((ep: any) => ep.serverEpisodeId === episode.value?.id)
    if (matchedEpisode) {
      episode.value = { ...episode.value, localEpisode: matchedEpisode }
    }
  }
}

onMounted(async () => {
  const libItemId = libraryItemIdParam
  const epId = episodeIdParam

  let fetchedLibraryItem: any = null
  let fetchedEpisode: any = null
  let fetchedLocalEpisode: any = null

  if (libItemId.startsWith('local')) {
    fetchedLibraryItem = await db.getLocalLibraryItem(libItemId)
    console.log('Got lli', libItemId)
  } else {
    const canRequest = !appStore.isOffline && userStore.serverConnectionConfig

    if (canRequest) {
      fetchedLibraryItem = await nativeHttp.get(`/api/items/${libItemId}?expanded=1`, { connectTimeout: 10000 }).catch((error: any) => {
        console.error('Failed', error)
        AbsLogger.error({ tag: 'EpisodePage', message: `Failed to fetch library item ${libItemId}: ${error?.message || error}` })
        return null
      })

      if (fetchedLibraryItem) {
        await localStore.setCachedLibraryItem(fetchedLibraryItem)
      }
    }

    if (!fetchedLibraryItem) {
      fetchedLibraryItem = await localStore.getCachedLibraryItem(libItemId)
      loadedFromCache.value = !!fetchedLibraryItem
    }

    if (!fetchedLibraryItem) {
      fetchedLibraryItem = await db.getLocalLibraryItemByLId(libItemId)
      loadedFromCache.value = !!fetchedLibraryItem
    }

    if (fetchedLibraryItem) {
      const localLibraryItemCheck = await db.getLocalLibraryItemByLId(libItemId) as any
      if (localLibraryItemCheck) {
        console.log('Library item has local library item also', localLibraryItemCheck.id)
        fetchedLibraryItem.localLibraryItem = localLibraryItemCheck
        fetchedLocalEpisode = localLibraryItemCheck.media.episodes.find((ep: any) => ep.serverEpisodeId === epId)
      }
    }
  }

  if (!fetchedLibraryItem) {
    console.error('No item...', libItemId)
    toast.error('Failed to get library item from server')
    await leaveUnloadablePage(router, '/bookshelf')
    return
  }

  fetchedEpisode = fetchedLibraryItem.media.episodes.find((ep: any) => ep.id === epId)
  if (fetchedLocalEpisode) {
    fetchedEpisode.localEpisode = fetchedLocalEpisode
  }

  if (!fetchedEpisode) {
    console.error('No episode...', epId)
    await navigateTo(`/item/${libItemId}`, { replace: true })
    return
  }

  libraryItem.value = fetchedLibraryItem
  episode.value = fetchedEpisode

  eventBus.on('new-local-library-item', newLocalLibraryItem)
  bindTimeMarkerEvents()
})

onBeforeUnmount(() => {
  eventBus.off('new-local-library-item', newLocalLibraryItem)
  // The click listener is one delegated handler on .description-container (bindTimeMarkerEvents),
  // which goes with the page. The loop that used to be here removed clickPlaybackTime from each
  // marker, a listener that was never added to them.
})
</script>
