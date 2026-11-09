<template>
  <div class="relative rounded-sm" :style="{ height: (width || 120) * (bookCoverAspectRatio || 1.6) + 'px', width: (width || 120) + 'px', maxWidth: (width || 120) + 'px', minWidth: (width || 120) + 'px' }" @mouseover="isHovering = true" @mouseleave="isHovering = false">
    <div class="w-full h-full relative overflow-hidden">
      <div v-show="showCoverBg" class="absolute top-0 left-0 w-full h-full overflow-hidden rounded-sm bg-md-surface-3">
        <div class="absolute cover-bg" ref="coverBg" />
      </div>
      <img ref="coverImg" :src="coverSrc" @error="imageError" @load="imageLoaded" class="w-full h-full absolute top-0 left-0" :class="showCoverBg ? 'object-contain' : 'object-fill'" />

      <a v-if="!imageFailed && showOpenNewTab && isHovering" :href="coverSrc" @click.stop target="_blank" class="absolute bg-md-surface-3 flex items-center justify-center shadow-sm rounded-full hover:scale-110 transform duration-100" :style="{ top: sizeMultiplier * 0.5 + 'rem', right: sizeMultiplier * 0.5 + 'rem', width: 2.5 * sizeMultiplier + 'rem', height: 2.5 * sizeMultiplier + 'rem' }">
        <span class="material-symbols" :style="{ fontSize: sizeMultiplier * 1.75 + 'rem' }">open_in_new</span>
      </a>
    </div>

    <div v-if="imageFailed && appStore.isOffline" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full bg-md-surface-3 flex items-center justify-center">
      <span class="material-symbols text-md-on-surface-variant/50" :style="{ fontSize: 1.5 * sizeMultiplier + 'rem' }">cloud_off</span>
    </div>

    <div v-else-if="imageFailed" class="absolute top-0 left-0 right-0 bottom-0 w-full h-full bg-md-error-container" :style="{ padding: placeholderCoverPadding + 'rem' }">
      <div class="w-full h-full border-2 border-error flex flex-col items-center justify-center">
        <ui-podshelf-mark class="mb-2 text-md-primary" :style="{ height: 64 * sizeMultiplier + 'px', width: 64 * sizeMultiplier + 'px' }" />
        <p class="text-centertext-error" :style="{ fontSize: sizeMultiplier + 'rem' }">Invalid Cover</p>
      </div>
    </div>

    <p v-if="!imageFailed && showResolution" class="absolute -bottom-5 left-0 right-0 mx-auto text-xs text-md-on-surface-variant text-center">{{ resolution }}</p>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  src?: string
  width?: number
  showOpenNewTab?: boolean
  bookCoverAspectRatio?: number
  showResolution?: boolean
}>()

// State
const imageFailed = ref(false)
const showCoverBg = ref(false)
const isHovering = ref(false)
const naturalHeight = ref(0)
const naturalWidth = ref(0)

// Refs
const coverImg = ref<HTMLImageElement | null>(null)
const coverBg = ref<HTMLElement | null>(null)

// Computed
const appStore = useAppStore()
const coverSrc = computed(() => props.src)
const sizeMultiplier = computed(() => (props.width || 120) / 120)
const placeholderCoverPadding = computed(() => 0.8 * sizeMultiplier.value)
const resolution = computed(() => `${naturalWidth.value}x${naturalHeight.value}px`)
const placeholderUrl = computed(() => '/book_placeholder.jpg')

// Watch
watch(coverSrc, () => {
  imageFailed.value = false
})

// Methods
function setCoverBg() {
  if (coverBg.value) {
    coverBg.value.style.backgroundImage = `url("${props.src}")`
  }
}

function imageLoaded() {
  if (coverImg.value && props.src !== placeholderUrl.value) {
    const { naturalWidth: nw, naturalHeight: nh } = coverImg.value
    naturalHeight.value = nh
    naturalWidth.value = nw

    const aspectRatio = nh / nw
    const arDiff = Math.abs(aspectRatio - (props.bookCoverAspectRatio || 1.6))

    if (arDiff > 0.15) {
      showCoverBg.value = true
      void nextTick(setCoverBg)
    } else {
      showCoverBg.value = false
    }
  }
}

function imageError(err: Event) {
  console.error('ImgError', err)
  imageFailed.value = true
}
</script>
