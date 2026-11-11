<template>
  <bookshelf-lazy-bookshelf page="series-books" :series-id="seriesId" @downloadSeriesClick="downloadSeriesClick" />
</template>

<script setup lang="ts">
import type { LibraryItem, LocalFolder, SeriesEntity } from '~/types'
import { Dialog } from '@capacitor/dialog'
import { AbsDownloader } from '~/plugins/capacitor'
import { useCellularPermission } from '~/composables/useCellularPermission'

const route = useRoute()
const platform = usePlatform()
const eventBus = useEventBus()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const toast = useToast()
const { hapticsImpact } = useHaptics()
const { encode } = useUtils()

const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()

const { checkCellularPermission } = useCellularPermission()

const params = route.params
const seriesId = params.id as string

// asyncData equivalent: fetch series at setup time
const isNetworkAvailable = !appStore.isOffline && !!userStore.user
let series: SeriesEntity | null = null

if (isNetworkAvailable) {
  series = (await nativeHttp.get(`/api/series/${seriesId}`, { connectTimeout: 10000 }).catch((error: unknown) => {
    console.error('Failed to load series', error)
    return null
  })) as SeriesEntity | null

  if (series) {
    await localStore.setCachedSeries(series)
  }
}

if (!series) {
  series = (await localStore.getCachedSeries(seriesId)) as SeriesEntity | null
}

if (!series) {
  await navigateTo('/oops?message=Series not found')
}

globalsStore.series = series

const seriesData = ref<SeriesEntity | null>(series)
const startingDownload = ref(false)
const mediaType = ref('book')
const booksPerFetch = ref(20)
const books = ref(0)
const missingFiles = ref(0)
const missingFilesSize = ref(0)
const libraryIds = ref<string[]>([])

const isIos = computed(() => platform === 'ios')
const networkConnected = computed(() => !appStore.isOffline)

async function downloadSeriesClick() {
  console.log('Download Series clicked')
  if (startingDownload.value) return

  if (!networkConnected.value) {
    toast.error(useStrings().MessageNoNetworkConnection)
    return
  }

  const hasPermission = await checkCellularPermission('download')
  if (!hasPermission) return

  startingDownload.value = true
  setTimeout(() => {
    startingDownload.value = false
  }, 1000)

  await hapticsImpact()
  void download()
}

const downloadSeriesClickListener = asVoidHandler(downloadSeriesClick)

function buildSearchParams() {
  let searchParams = new URLSearchParams()
  searchParams.set('filter', `series.${encode(seriesId)}`)
  return searchParams.toString()
}

async function fetchSeriesEntities(page: number) {
  const startIndex = page * booksPerFetch.value

  const currentSFQueryString = buildSearchParams()

  const entityPath = `items`
  const sfQueryString = currentSFQueryString ? currentSFQueryString + '&' : ''
  const fullQueryString = `?${sfQueryString}limit=${booksPerFetch.value}&page=${page}&minified=1&include=rssfeed,numEpisodesIncomplete`

  if (!networkConnected.value) {
    const bookList = seriesData.value?.books ?? []
    books.value = bookList.length
    const slice = bookList.slice(startIndex, startIndex + booksPerFetch.value)
    for (const book of slice) {
      const hasLocal = await db.getLocalLibraryItem(`local_${book.id}`)
      if (!hasLocal) {
        missingFiles.value += book.numFiles || 0
        missingFilesSize.value += book.size || 0
        libraryIds.value.push(book.id)
      }
    }
    return true
  }

  const payload = await nativeHttp.get(`/api/libraries/${seriesData.value?.libraryId}/${entityPath}${fullQueryString}`, { connectTimeout: 10000 }).catch((error: unknown) => {
    console.error('failed to fetch books', error)
    return null
  })

  const typedPayload = payload as Record<string, unknown> | null
  if (typedPayload && typedPayload.results) {
    console.log('Received payload', typedPayload)
    books.value = typedPayload.total as number

    const results = typedPayload.results as LibraryItem[]
    for (const result of results) {
      if (!(await db.getLocalLibraryItem(`local_${result.id}`))) {
        missingFiles.value += result.numFiles ?? 0
        missingFilesSize.value += result.size ?? 0
        libraryIds.value.push(result.id)
      }
    }
  }
  const totalPages = Math.ceil(books.value / booksPerFetch.value)
  if (totalPages > page + 1) {
    return false
  }
  return true
}

async function download(selectedLocalFolder: LocalFolder | null = null) {
  const strings = useStrings()
  let localFolder = selectedLocalFolder
  if (!isIos.value && !localFolder) {
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
        name: strings.LabelInternalAppStorage,
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

  let page = 0
  let fetchFinished = false
  missingFiles.value = 0
  missingFilesSize.value = 0
  while (!fetchFinished) {
    fetchFinished = await fetchSeriesEntities(page)
    page += 1
  }
  if (missingFiles.value == 0) {
    alert(useNuxtApp().$getString('MessageSeriesAlreadyDownloaded'))
  }

  let startDownloadMessage = useNuxtApp().$getString('MessageSeriesDownloadConfirmIos', [libraryIds.value.length, missingFiles.value, useNuxtApp().$bytesPretty(missingFilesSize.value)])
  if (!isIos.value) {
    startDownloadMessage = useNuxtApp().$getString('MessageSeriesDownloadConfirm', [libraryIds.value.length, missingFiles.value, useNuxtApp().$bytesPretty(missingFilesSize.value), localFolder?.name ?? ''])
  }

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: startDownloadMessage
  })
  if (value) {
    for (let i = 0; i < libraryIds.value.length; i++) {
      const libraryItemId = libraryIds.value[i]
      if (libraryItemId) void startDownload(localFolder, libraryItemId)
    }
  }
  libraryIds.value = []
}

async function startDownload(localFolder: LocalFolder | null, libraryItemId: string) {
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

onMounted(() => {
  eventBus.on('download-series-click', downloadSeriesClickListener)
})

onBeforeUnmount(() => {
  eventBus.off('download-series-click', downloadSeriesClickListener)
})
</script>
