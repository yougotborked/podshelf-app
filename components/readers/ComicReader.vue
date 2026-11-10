<template>
  <div id="comic-reader" class="w-full h-full relative">
    <modals-modal v-model="showInfoMenu" height="90%">
      <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click.stop="showInfoMenu = false">
        <div class="w-full overflow-x-hidden overflow-y-auto bg-md-surface-1 rounded-lg border border-md-outline-variant text-md-on-surface" style="max-height: 75%" @click.stop>
          <div v-for="key in comicMetadataKeys" :key="key" class="w-full px-2 py-1">
            <p class="text-xs">
              <strong>{{ key }}</strong>
              : {{ comicMetadata?.[key] }}
            </p>
          </div>
        </div>
      </div>
    </modals-modal>

    <div class="overflow-hidden m-auto comicwrapper relative">
      <div class="h-full flex justify-center">
        <img v-if="mainImg" :src="mainImg" class="object-contain comicimg" />
      </div>

      <div v-show="loading" class="w-full h-full absolute top-0 left-0 flex items-center justify-center z-10">
        <ui-loading-indicator />
      </div>
    </div>

    <div class="fixed left-0 h-8 w-full bg-md-surface-1 px-4 flex items-center text-md-on-surface-variant transition-transform" :class="showingToolbar ? 'translate-y-0' : isPlayerOpen ? 'translate-y-[120px]' : 'translate-y-32'" :style="{ bottom: isPlayerOpen ? '120px' : '0px' }">
      <div class="flex-grow" />
      <p class="text-xs">{{ page }} / {{ numPages }}</p>
    </div>

    <modals-dialog v-model="showPageMenu" :items="pageItems" :selected="page" :width="360" item-padding-y="8px" @action="setPage" />
  </div>
</template>

<script setup lang="ts">
import Path from 'path'
import { ref, computed, watch } from 'vue'
// @ts-expect-error libarchive.js ships no types
import { Archive } from 'libarchive.js/main.js'
// @ts-expect-error libarchive.js ships no types
import { CompressedFile } from 'libarchive.js/src/compressed-file'

Archive.init({
  workerUrl: '/libarchive/worker-bundle.js'
})

const props = defineProps<{
  url: string
  libraryItem: Record<string, unknown>
  isLocal: boolean
  keepProgress: boolean
  showingToolbar: boolean
}>()

const emit = defineEmits<{
  loaded: [data: { hasMetadata: unknown }]
}>()

const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()
const nativeHttp = useNativeHttp()
const db = useDb()
const toast = useToast()
const utils = useUtils()

const loading = ref(false)
const pages = ref<string[] | null>(null)
const filesObject = ref<Record<string, InstanceType<typeof CompressedFile>> | null>(null)
const mainImg = ref<string | null>(null)
const page = ref(0)
const numPages = ref(0)
const showPageMenu = ref(false)
const showInfoMenu = ref(false)
const loadTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const loadedFirstPage = ref(false)
const comicMetadata = ref<Record<string, unknown> | null>(null)
const pageMenuWidth = ref(256)

const localLibraryItem = computed(() => {
  if (props.isLocal) return props.libraryItem
  return (props.libraryItem.localLibraryItem as Record<string, unknown> | null | undefined) || null
})
const localLibraryItemId = computed(() => (localLibraryItem.value as Record<string, unknown> | null | undefined)?.id as string)
const serverLibraryItemId = computed(() => {
  if (!props.isLocal) return props.libraryItem.id as string
  if (!props.libraryItem.serverAddress || !props.libraryItem.libraryItemId) return null
  if (userStore.getServerAddress === props.libraryItem.serverAddress) {
    return props.libraryItem.libraryItemId as string
  }
  return null
})
const comicMetadataKeys = computed(() => comicMetadata.value ? Object.keys(comicMetadata.value) : [])
const canGoNext = computed(() => page.value < numPages.value)
const canGoPrev = computed(() => page.value > 1)
const userItemProgress = computed(() => props.isLocal ? localItemProgress.value : serverItemProgress.value)
const localItemProgress = computed(() => globalsStore.getLocalMediaProgressById(localLibraryItemId.value))
const serverItemProgress = computed(() => userStore.getUserMediaProgress(serverLibraryItemId.value || ''))
const savedPage = computed(() => {
  if (!props.keepProgress) return 0
  if (!userItemProgress.value?.ebookLocation || isNaN(userItemProgress.value.ebookLocation as number)) return 0
  return Number(userItemProgress.value.ebookLocation)
})
const cleanedPageNames = computed(() => {
  return (
    pages.value?.map((p) => {
      if (p.length > 40) {
        const firstHalf = p.slice(0, 18)
        const lastHalf = p.slice(p.length - 17)
        return `${firstHalf} ... ${lastHalf}`
      }
      return p
    }) || []
  )
})
const pageItems = computed(() => {
  let index = 1
  return cleanedPageNames.value.map((p) => ({
    text: p,
    value: index++
  }))
})
const isPlayerOpen = computed(() => appStore.getIsPlayerOpen)

watch(() => props.url, () => {
  void extract()
}, { immediate: true })

async function updateProgress() {
  if (!props.keepProgress) return

  if (!numPages.value) {
    console.error('Num pages not loaded')
    return
  }
  if (savedPage.value === page.value) {
    return
  }

  const payload = {
    ebookLocation: String(page.value),
    ebookProgress: Math.max(0, Math.min(1, (Number(page.value) - 1) / Number(numPages.value)))
  }

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
      console.error('ComicReader.updateProgress failed:', error)
    })
  }
}

function clickShowInfoMenu() {
  showInfoMenu.value = !showInfoMenu.value
  showPageMenu.value = false
}

function clickShowPageMenu() {
  if (!numPages.value) return
  showPageMenu.value = !showPageMenu.value
  showInfoMenu.value = false
}

function next() {
  if (!canGoNext.value) return
  void setPage(page.value + 1)
}

function prev() {
  if (!canGoPrev.value) return
  void setPage(page.value - 1)
}

function setPage(p: number) {
  if (p <= 0 || p > numPages.value) {
    return
  }
  showPageMenu.value = false
  const filename = pages.value![p - 1]
  page.value = p

  void updateProgress()
  return extractFile(filename)
}

function setLoadTimeout() {
  loadTimeout.value = setTimeout(() => {
    loading.value = true
  }, 150)
}

async function extractFile(filename: string) {
  setLoadTimeout()
  // An async Promise executor loses a rejection from extract(): the outer promise would never
  // settle and the page would sit on its loading state. Awaiting it here lets the caller see it.
  const file = await filesObject.value![filename].extract()
  await new Promise<void>((resolve) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      mainImg.value = (e.target as FileReader).result as string
      loading.value = false
      resolve()
    }
    reader.onerror = (e) => {
      console.error(e)
      toast.error('Read page file failed')
      loading.value = false
      resolve()
    }
    reader.readAsDataURL(file as Blob)
    clearTimeout(loadTimeout.value!)
  })
}

async function extract() {
  loading.value = true

  // TODO: Handle JWT auth refresh
  // Use fetch directly as $axios is not available in script setup
  const response = await fetch(props.url, {
    headers: {
      Authorization: `Bearer ${userStore.getToken}`
    }
  })
  const blobData = await response.blob()

  const archive = await Archive.open(blobData)
  const originalFilesObject = await archive.getFilesObject()
  filesObject.value = flattenFilesObject(originalFilesObject)
  console.log('Extracted files object', filesObject.value)
  const filenames = Object.keys(filesObject.value)
  parseFilenames(filenames)

  const xmlFile = filenames.find((f) => (Path.extname(f) || '').toLowerCase() === '.xml')
  if (xmlFile) await extractXmlFile(xmlFile)

  numPages.value = pages.value!.length

  // Calculate page menu size
  const largestFilename = cleanedPageNames.value
    .map((p) => p)
    .sort((a, b) => a.length - b.length)
    .pop()
  if (largestFilename) {
    const pEl = document.createElement('p')
    pEl.innerText = largestFilename
    pEl.style.fontSize = '0.875rem'
    pEl.style.opacity = '0'
    pEl.style.position = 'absolute'
    document.body.appendChild(pEl)
    const textWidth = pEl.getBoundingClientRect()?.width
    if (textWidth) {
      pageMenuWidth.value = textWidth + (16 + 5 + 2 + 5)
    }
    pEl.remove()
  }

  if (pages.value!.length) {
    loading.value = false

    const startPage = savedPage.value > 0 && savedPage.value <= numPages.value ? savedPage.value : 1
    await setPage(startPage)
    loadedFirstPage.value = true

    emit('loaded', {
      hasMetadata: comicMetadata.value
    })
  } else {
    toast.error('Unable to extract pages')
    loading.value = false
  }
}

function flattenFilesObject(filesObj: Record<string, unknown>): Record<string, InstanceType<typeof CompressedFile>> {
  const flattenObject = (obj: Record<string, unknown>, prefix = ''): Record<string, InstanceType<typeof CompressedFile>> => {
    let _obj: Record<string, InstanceType<typeof CompressedFile>> = {}
    for (const key in obj) {
      const newKey = prefix ? prefix + '/' + key : key
      if (obj[key] instanceof CompressedFile) {
        _obj[newKey] = obj[key] as InstanceType<typeof CompressedFile>
      } else if (!key.startsWith('_') && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
        _obj = {
          ..._obj,
          ...flattenObject(obj[key] as Record<string, unknown>, newKey)
        }
      } else {
        _obj[newKey] = obj[key] as InstanceType<typeof CompressedFile>
      }
    }
    return _obj
  }
  return flattenObject(filesObj)
}

async function extractXmlFile(filename: string) {
  try {
    const file = await filesObject.value![filename].extract()
    const reader = new FileReader()
    reader.onload = (e) => {
      const xmlStr = (e.target as FileReader).result as string
      comicMetadata.value = utils.xmlToJson(xmlStr)
      console.log('Metadata', comicMetadata.value)
    }
    reader.onerror = (e) => {
      console.error(e)
    }
    reader.readAsText(file as Blob)
  } catch (error) {
    console.error(error)
  }
}

function parseImageFilename(filename: string) {
  const basename = Path.basename(filename, Path.extname(filename))
  const numbersinpath = basename.match(/\d+/g)
  if (!numbersinpath?.length) {
    return {
      index: -1,
      filename
    }
  } else {
    return {
      index: Number(numbersinpath[numbersinpath.length - 1]),
      filename
    }
  }
}

function parseFilenames(filenames: string[]) {
  const acceptableImages = ['.jpeg', '.jpg', '.png', '.webp']
  const imageFiles = filenames.filter((f) => {
    return acceptableImages.includes((Path.extname(f) || '').toLowerCase())
  })
  const imageFileObjs = imageFiles.map((img) => {
    return parseImageFilename(img)
  })

  const imagesWithNum = imageFileObjs.filter((i) => i.index >= 0)
  let orderedImages = imagesWithNum.sort((a, b) => a.index - b.index).map((i) => i.filename)
  const noNumImages = imageFileObjs.filter((i) => i.index < 0)
  orderedImages = orderedImages.concat(noNumImages.map((i) => i.filename))

  pages.value = orderedImages
}

defineExpose({ clickShowInfoMenu, clickShowPageMenu, next, prev })
</script>

<style scoped>
#comic-reader {
  height: 100%;
  max-height: 100%;
}
.reader-player-open #comic-reader {
  height: calc(100% - 120px);
  max-height: calc(100% - 120px);
}

.comicimg {
  height: 100%;
  margin: auto;
}
.comicwrapper {
  width: 100vw;
  height: 100%;
}
</style>
