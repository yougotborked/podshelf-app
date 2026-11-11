<template>
  <div id="epub-frame" class="w-full">
    <div id="viewer" class="h-full w-full"></div>

    <div class="fixed left-0 h-8 w-full px-4 flex items-center" :class="isLightTheme ? 'bg-white text-black' : isDarkTheme ? 'bg-[#232323] text-white/80' : 'bg-black text-white/80'" :style="{ bottom: isPlayerOpen ? '120px' : '0px' }">
      <p v-if="totalLocations" class="text-xs text-md-on-surface-variant">Location {{ currentLocationNum }} of {{ totalLocations }}</p>
      <div class="flex-grow" />
      <p class="text-xs">{{ progress }}%</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getScreenOrientation } from '~/composables/useScreenOrientation'
import { ref, shallowRef, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import ePub, { type Book, type Contents, type Rendition } from 'epubjs'
import type { BookOptions } from 'epubjs/types/book'

const props = defineProps<{
  url: string
  libraryItem: Record<string, unknown>
  isLocal: boolean
  keepProgress: boolean
}>()

const emit = defineEmits<{
  touchstart: [event: TouchEvent]
  touchend: [event: TouchEvent]
}>()

const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()
const nativeHttp = useNativeHttp()
const db = useDb()

// The one internal this reaches into: the continuous manager's snapper, which epubjs does not type.
interface EpubSnapper {
  needsSnap: (this: { scrollLeft: number; layout: { pageWidth: number; divisor: number } }) => boolean
}

// shallowRef: epubjs objects are classes with their own internals; Vue wrapping them in proxies
// breaks identity checks inside the library.
const book = shallowRef<Book | null>(null)
const rendition = shallowRef<Rendition | null>(null)
const progress = ref(0)
const totalLocations = ref(0)
const currentLocationNum = ref(0)
const currentLocationCfi = ref<string | null>(null)
const inittingDisplay = ref(true)
const isRefreshingUI = ref(false)
const ereaderSettings = ref({
  theme: 'dark',
  font: 'serif',
  fontScale: 100,
  lineSpacing: 115,
  textStroke: 0,
  spread: undefined as string | undefined
})

const libraryItemId = computed(() => props.libraryItem.id as string)
const localLibraryItem = computed(() => {
  if (props.isLocal) return props.libraryItem
  return (props.libraryItem.localLibraryItem as Record<string, unknown> | null | undefined) || null
})
const localLibraryItemId = computed(() => localLibraryItem.value?.id as string)
const serverLibraryItemId = computed(() => {
  if (!props.isLocal) return props.libraryItem.id as string
  if (!props.libraryItem.serverAddress || !props.libraryItem.libraryItemId) return null
  if (userStore.getServerAddress === props.libraryItem.serverAddress) {
    return props.libraryItem.libraryItemId as string
  }
  return null
})
const isPlayerOpen = computed(() => appStore.getIsPlayerOpen)
const readerHeightOffset = computed(() => isPlayerOpen.value ? 204 : 104)
const chapters = computed(() => (book.value as unknown as { navigation?: { toc?: unknown[] } } | null | undefined)?.navigation?.toc || [])
const userItemProgress = computed(() => props.isLocal ? localItemProgress.value : serverItemProgress.value)
const localItemProgress = computed(() => globalsStore.getLocalMediaProgressById(localLibraryItemId.value))
const serverItemProgress = computed(() => userStore.getUserMediaProgress(serverLibraryItemId.value || ''))
const localStorageLocationsKey = computed(() => `ebookLocations-${libraryItemId.value}`)
const savedEbookLocation = computed(() => {
  if (!props.keepProgress) return null
  if (!userItemProgress.value?.ebookLocation) return null
  if (!String(userItemProgress.value.ebookLocation).startsWith('epubcfi')) return null
  return userItemProgress.value.ebookLocation
})
const isLightTheme = computed(() => ereaderSettings.value.theme === 'light')
const isDarkTheme = computed(() => ereaderSettings.value.theme === 'dark')
const themeRules = computed(() => {
  const isDark = ereaderSettings.value.theme === 'dark'
  const isBlack = ereaderSettings.value.theme === 'black'
  const fontColor = isDark ? '#fff' : isBlack ? '#fff' : '#000'
  const backgroundColor = isDark ? 'rgb(35 35 35)' : isBlack ? 'rgb(0 0 0)' : 'rgb(255, 255, 255)'

  return {
    '*': {
      color: `${fontColor}!important`,
      'background-color': `${backgroundColor}!important`,
      'line-height': ereaderSettings.value.lineSpacing + '%!important',
      '-webkit-text-stroke': ereaderSettings.value.textStroke / 100 + 'px ' + fontColor + '!important'
    },
    a: {
      color: `${fontColor}!important`
    }
  }
})

watch(isPlayerOpen, () => {
  refreshUI()
})

function updateSettings(settings: typeof ereaderSettings.value) {
  ereaderSettings.value = settings

  if (!rendition.value) return

  applyTheme()

  const fontScale = settings.fontScale || 100
  ;rendition.value.themes.fontSize(`${fontScale}%`)
  ;rendition.value.themes.font(settings.font)
  ;rendition.value.spread(settings.spread || 'auto')
}

function goToChapter(href: string) {
  return rendition.value?.display(href)
}

function prev() {
  if (rendition.value) {
    ;void rendition.value.prev()
  }
}

function next() {
  if (rendition.value) {
    ;void rendition.value.next()
  }
}

async function updateProgress(payload: { ebookLocation: string; ebookProgress?: number }) {
  if (!props.keepProgress) return

  // Update local item
  if (localLibraryItemId.value) {
    const localPayload = {
      localLibraryItemId: localLibraryItemId.value,
      ...payload
    }
    const localResponse = await db.updateLocalEbookProgress(localPayload)
    if ((localResponse as Record<string, unknown> | null | undefined)?.localMediaProgress) {
      globalsStore.updateLocalMediaProgress((localResponse as Record<string, unknown>).localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
    }
  }

  // Update server item
  if (serverLibraryItemId.value) {
    nativeHttp.patch(`/api/me/progress/${serverLibraryItemId.value}`, payload, { connectTimeout: 10000 }).catch((error: Error) => {
      console.error('EpubReader.updateProgress failed:', error)
    })
  }
}

function getAllEbookLocationData() {
  const locations: Array<{ key: string; lastAccessed: number; locations: string; size: number }> = []
  let totalSize = 0

  for (const key in localStorage) {
    if (!Object.prototype.hasOwnProperty.call(localStorage, key) || !key.startsWith('ebookLocations-')) {
      continue
    }

    try {
      const ebookLocations = JSON.parse(localStorage[key])
      if (!ebookLocations.locations) throw new Error('Invalid locations object')

      ebookLocations.key = key
      ebookLocations.size = (localStorage[key].length + key.length) * 2
      locations.push(ebookLocations)
      totalSize += ebookLocations.size
    } catch (error) {
      console.error('Failed to parse ebook locations', key, error)
      localStorage.removeItem(key)
    }
  }

  locations.sort((a, b) => a.lastAccessed - b.lastAccessed)

  return {
    locations,
    totalSize
  }
}

function checkSaveLocations(locationString: string) {
  const maxSizeInBytes = 3000000
  const newLocationsSize = JSON.stringify({ lastAccessed: Date.now(), locations: locationString }).length * 2

  if (newLocationsSize > maxSizeInBytes) {
    console.error('Epub locations are too large to store. Size =', newLocationsSize)
    return
  }

  const ebookLocationsData = getAllEbookLocationData()

  let availableSpace = maxSizeInBytes - ebookLocationsData.totalSize

  while (availableSpace < newLocationsSize && ebookLocationsData.locations.length) {
    const oldestLocation = ebookLocationsData.locations.shift()!
    console.log(`Removing cached locations for epub "${oldestLocation.key}" taking up ${oldestLocation.size} bytes`)
    availableSpace += oldestLocation.size
    localStorage.removeItem(oldestLocation.key)
  }

  console.log(`Cacheing epub locations with key "${localStorageLocationsKey.value}" taking up ${newLocationsSize} bytes`)
  saveLocations(locationString)
}

function saveLocations(locationString: string) {
  localStorage.setItem(
    localStorageLocationsKey.value,
    JSON.stringify({
      lastAccessed: Date.now(),
      locations: locationString
    })
  )
}

function loadLocations() {
  const locationsObjString = localStorage.getItem(localStorageLocationsKey.value)
  if (!locationsObjString) return null

  const locationsObject = JSON.parse(locationsObjString)

  if (!locationsObject.locations) {
    console.error('Invalid epub locations stored', localStorageLocationsKey.value)
    localStorage.removeItem(localStorageLocationsKey.value)
    return null
  }

  saveLocations(locationsObject.locations)

  return locationsObject.locations
}

function relocated(location: { start: { cfi: string; location: number }; end: { percentage: number } }) {
  console.log(`[EpubReader] relocated ${location.start.cfi}`)
  if (inittingDisplay.value) {
    console.log(`[EpubReader] relocated but initting display ${location.start.cfi}`)
    return
  }
  currentLocationNum.value = location.start.location

  if (currentLocationCfi.value === location.start.cfi) {
    console.log(`[EpubReader] location already saved`, location.start.cfi)
    return
  }

  console.log(`[EpubReader] Saving new location ${location.start.cfi}`)
  currentLocationCfi.value = location.start.cfi

  if (location.end.percentage) {
    void updateProgress({
      ebookLocation: location.start.cfi,
      ebookProgress: location.end.percentage
    })
    progress.value = Math.round(location.end.percentage * 100)
  } else {
    void updateProgress({
      ebookLocation: location.start.cfi
    })
  }
}

function initEpub() {
  progress.value = Math.round(((userItemProgress.value as Record<string, unknown> | null | undefined)?.ebookProgress as number || 0) * 100)

  const customRequest = async (url: string) => {
    try {
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${userStore.getToken}` }
      })
      return await response.arrayBuffer()
    } catch (error) {
      console.error('EpubReader.initEpub customRequest failed:', error)
      throw error
    }
  }

  console.log('[EpubReader] initEpub', props.url)
  // width and height are read by epubjs but missing from its BookOptions.
  const options = {
    width: window.innerWidth,
    height: window.innerHeight - readerHeightOffset.value,
    openAs: 'epub',
    requestMethod: props.isLocal ? undefined : customRequest
  } as BookOptions
  const b = ePub(props.url, options)
  book.value = b

  const rend = b.renderTo('viewer', {
    width: window.innerWidth,
    height: window.innerHeight - readerHeightOffset.value,
    snap: true,
    manager: 'continuous',
    flow: 'paginated'
  })
  rendition.value = rend

  void b.ready.then(() => {
    console.log('%c [EpubReader] Book ready', 'color:cyan;')

    let displayCfi = (b.locations as unknown as { start?: string }).start
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- epubjs types Spine.get as always returning a Section, but it returns null for a location that is not in this book
    if (savedEbookLocation.value && b.spine.get(savedEbookLocation.value)) {
      displayCfi = savedEbookLocation.value
    }

    rend.on('displayed', () => {
      console.log('%c [EpubReader] Rendition displayed', 'color:blue;')

      const snapper = (rend as unknown as { manager?: { snapper?: EpubSnapper } }).manager?.snapper
      if (snapper) {
        snapper.needsSnap = function () {
          const left = Math.round(this.scrollLeft)
          const snapWidth = this.layout.pageWidth * this.layout.divisor
          return left % snapWidth !== 0
        }
      }
    })

    rend.on('rendered', (section: unknown, view: unknown) => {
      applyTheme()
      console.log('%c [EpubReader] Rendition rendered', 'color:red;', section, view)
    })

    rend.on('relocated', relocated)

    rend.on('displayError', (err: unknown) => {
      console.log('[EpubReader] Display error', err)
    })

    rend.on('touchstart', (event: TouchEvent) => {
      emit('touchstart', event)
    })
    rend.on('touchend', (event: TouchEvent) => {
      emit('touchend', event)
    })

    const savedLocations = loadLocations()
    if (savedLocations) {
      ;b.locations.load(savedLocations)
      totalLocations.value = b.locations.length() || 0
    } else {
      ;void b.locations.generate(100).then(() => {
        totalLocations.value = b.locations.length() || 0
        currentLocationNum.value = (rend.currentLocation() as unknown as { start?: { location?: number } } | null)?.start?.location || 0
        checkSaveLocations(b.locations.save())
      })
    }

    console.log(`[EpubReader] Displaying cfi ${displayCfi}`)
    currentLocationCfi.value = displayCfi ?? null
    void rend.display(displayCfi).then(() => {
      void rend.display(displayCfi).then(() => {
        inittingDisplay.value = false
      })
    })
  })
}

function applyTheme() {
  if (!rendition.value) return
  // epubjs's types require a stylesheet key; the library treats it as optional (it prefixes it onto
  // the element id) and one shared sheet per page is what this wants.
  ;(rendition.value.getContents() as unknown as Array<Contents & { addStylesheetRules(rules: object): void }>).forEach((c) => {
    c.addStylesheetRules(themeRules.value)
  })
}

async function screenOrientationChange() {
  if (isRefreshingUI.value) return
  isRefreshingUI.value = true
  const windowWidth = window.innerWidth
  refreshUI()

  for (let i = 0; i < 5; i++) {
    await new Promise((resolve) => setTimeout(resolve, 50))
    if (window.innerWidth !== windowWidth) {
      refreshUI()
      break
    }
  }

  isRefreshingUI.value = false
}

const screenOrientationChangeListener = asVoidHandler(screenOrientationChange)

function refreshUI() {
  if (rendition.value) {
    ;rendition.value.resize(window.innerWidth, window.innerHeight - readerHeightOffset.value)
  }
}

defineExpose({ updateSettings, goToChapter, prev, next, chapters })

onMounted(() => {
  initEpub()

  if (getScreenOrientation()) {
    getScreenOrientation()?.addEventListener('change', screenOrientationChangeListener)
  } else {
    document.addEventListener('orientationchange', screenOrientationChangeListener)
  }
  window.addEventListener('resize', screenOrientationChangeListener)
})

onBeforeUnmount(() => {
  ;book.value?.destroy()

  if (getScreenOrientation()) {
    getScreenOrientation()?.removeEventListener('change', screenOrientationChangeListener)
  } else {
    document.removeEventListener('orientationchange', screenOrientationChangeListener)
  }
  window.removeEventListener('resize', screenOrientationChangeListener)
})
</script>

<style>
#epub-frame {
  height: calc(100% - 32px);
  max-height: calc(100% - 32px);
  overflow: hidden;
}
.reader-player-open #epub-frame {
  height: calc(100% - 132px);
  max-height: calc(100% - 132px);
  overflow: hidden;
}
</style>
