<template>
  <div class="relative rounded-sm overflow-hidden" :style="{ height: height + 'px', width: width + 'px', maxWidth: width + 'px', minWidth: width + 'px' }">
    <div class="w-full h-full relative" :class="{ 'bg-md-surface-1': !noBg }">
      <div v-show="showCoverBg" class="absolute top-0 left-0 w-full h-full overflow-hidden rounded-sm bg-md-surface-3">
        <div class="absolute cover-bg" ref="coverBg" />
      </div>

      <img v-if="fullCoverUrl" ref="cover" :src="fullCoverUrl" loading="lazy" @error="imageError" @load="imageLoaded" class="w-full h-full absolute top-0 left-0 z-10 duration-300 transition-opacity" :style="{ opacity: imageReady ? 1 : 0 }" :class="(showCoverBg && hasCover) || noBg ? 'object-contain' : 'object-fill'" />

      <div v-show="loading && libraryItem" class="absolute top-0 left-0 h-full w-full flex items-center justify-center">
        <p class="text-center" :style="{ fontSize: 0.75 * sizeMultiplier + 'rem' }">{{ title }}</p>
        <div class="absolute top-2 right-2">
          <widgets-loading-spinner />
        </div>
      </div>
    </div>

    <div v-if="imageFailed && appStore.isOffline" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full bg-md-surface-3 flex flex-col items-center justify-center gap-1" :style="{ padding: placeholderCoverPadding + 'rem' }">
      <span class="material-symbols text-md-on-surface-variant/50" :style="{ fontSize: 1.5 * sizeMultiplier + 'rem' }">cloud_off</span>
      <p class="text-center text-md-on-surface-variant/70 line-clamp-2" :style="{ fontSize: 0.6 * sizeMultiplier + 'rem' }">{{ title }}</p>
    </div>

    <div v-else-if="imageFailed" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full bg-md-error-container" :style="{ padding: placeholderCoverPadding + 'rem' }">
      <div class="w-full h-full border-2 border-error flex flex-col items-center justify-center">
        <ui-podshelf-mark class="mb-2 text-md-primary" :style="{ height: 64 * sizeMultiplier + 'px', width: 64 * sizeMultiplier + 'px' }" />
        <p class="text-centertext-error" :style="{ fontSize: titleFontSize + 'rem' }">Invalid Cover</p>
      </div>
    </div>

    <div v-if="!hasCover" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full flex items-center justify-center z-10" :style="{ padding: placeholderCoverPadding + 'rem' }">
      <div>
        <p class="text-centertruncate leading-none origin-center" style="color: rgb(var(--md-on-primary-container)); font-size: 0.8rem" :style="{ transform: `scale(${sizeMultiplier})` }">{{ titleCleaned }}</p>
      </div>
    </div>
    <div v-if="!hasCover" class="absolute left-0 right-0 w-full flex items-center justify-center z-10" :style="{ padding: placeholderCoverPadding + 'rem', bottom: authorBottom + 'rem' }">
      <p class="text-centertruncate leading-none origin-center" style="color: rgb(var(--md-on-primary-container)); opacity: 0.75; font-size: 0.6rem" :style="{ transform: `scale(${sizeMultiplier})` }">{{ authorCleaned }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'

const props = defineProps<{
  libraryItem?: Record<string, unknown>
  width?: number
  bookCoverAspectRatio?: number
  downloadCover?: string
  raw?: boolean
  noBg?: boolean
}>()

const emit = defineEmits<{
  imageLoaded: [src: string]
}>()

const appStore = useAppStore()
const globalsStore = useGlobalsStore()

// State
const loading = ref(true)
const imageFailed = ref(false)
const showCoverBg = ref(false)
const imageReady = ref(false)

// Refs
const cover = ref<HTMLImageElement | null>(null)
const coverBg = ref<HTMLElement | null>(null)

// Watch
watch(cover, () => {
  imageFailed.value = false
})

// Computed
const isLocal = computed(() => {
  if (!props.libraryItem) return false
  return props.libraryItem.isLocal as boolean
})
const localCover = computed(() => (props.libraryItem?.coverContentUrl as string) || null)
const squareAspectRatio = computed(() => (props.bookCoverAspectRatio || 0) === 1)
const height = computed(() => (props.width || 120) * (props.bookCoverAspectRatio || 1.6))
const media = computed(() => props.libraryItem?.media as Record<string, unknown> || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown>) || {})
const title = computed(() => (mediaMetadata.value.title as string) || 'No Title')
const titleCleaned = computed(() => {
  if (title.value.length > 60) {
    return title.value.slice(0, 57) + '...'
  }
  return title.value
})
const authors = computed(() => (mediaMetadata.value.authors as Record<string, unknown>[]) || [])
const author = computed(() => authors.value.map((au) => au.name).join(', '))
const authorCleaned = computed(() => {
  if (author.value.length > 30) {
    return author.value.slice(0, 27) + '...'
  }
  return author.value
})
const placeholderUrl = computed(() => '/book_placeholder.jpg')
const fullCoverUrl = computed(() => {
  if (isLocal.value) {
    if (localCover.value) return Capacitor.convertFileSrc(localCover.value)
    return placeholderUrl.value
  }
  if (props.downloadCover) return props.downloadCover
  if (!props.libraryItem) return null
  return globalsStore.getLibraryItemCoverSrc(props.libraryItem, placeholderUrl.value, props.raw)
})
const coverPath = computed(() => (media.value.coverPath as string) || placeholderUrl.value)
const hasCover = computed(() => (!!media.value.coverPath && !isLocal.value) || !!localCover.value || !!props.downloadCover)
const sizeMultiplier = computed(() => {
  const baseSize = squareAspectRatio.value ? 128 : 96
  return (props.width || 120) / baseSize
})
const titleFontSize = computed(() => 0.75 * sizeMultiplier.value)
const placeholderCoverPadding = computed(() => {
  if (sizeMultiplier.value < 0.5) return 0
  return sizeMultiplier.value
})
const authorBottom = computed(() => 0.75 * sizeMultiplier.value)

// Methods
function setCoverBg() {
  if (coverBg.value) {
    coverBg.value.style.backgroundImage = `url("${fullCoverUrl.value}")`
  }
}

function imageLoaded() {
  loading.value = false
  void nextTick(() => {
    imageReady.value = true
  })
  if (!props.noBg && cover.value && coverPath.value !== placeholderUrl.value) {
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

  emit('imageLoaded', fullCoverUrl.value || '')
}

function imageError(err: Event) {
  loading.value = false
  console.error('ImgError', err)
  imageFailed.value = true
}
</script>
