<template>
  <div class="relative rounded-sm overflow-hidden" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-if="hasOwnCover" class="w-full h-full relative rounded-sm">
      <div v-if="showCoverBg" class="bg-md-surface-3 absolute top-0 left-0 w-full h-full">
        <div class="w-full h-full z-0" ref="coverBg" />
      </div>
      <img ref="cover" :src="fullCoverUrl" @error="imageError" @load="imageLoaded" class="w-full h-full absolute top-0 left-0" :class="showCoverBg ? 'object-contain' : 'object-cover'" />
    </div>
    <div v-else-if="books.length" class="flex justify-center h-full relative bg-md-surface-3/95 rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-md-on-surface/5" />

      <covers-book-cover :library-item="books[0]" :width="(width || 0) / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
      <covers-book-cover v-if="books.length > 1" :library-item="books[1]" :width="(width || 0) / 2" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>
    <div v-else class="relative w-full h-full flex items-center justify-center p-2 bg-md-surface-3 rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-md-on-surface/5" />

      <p class="text-md-on-surface-variant text-center" :style="{ fontSize: Math.min(1, sizeMultiplier) + 'rem' }">Empty Collection</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  bookItems?: unknown[]
  width?: number
  height?: number
  bookCoverAspectRatio?: number
}>()

// State
const showCoverBg = ref(false)

// Refs
const cover = ref<HTMLImageElement | null>(null)
const coverBg = ref<HTMLElement | null>(null)

// Computed
const sizeMultiplier = computed(() => {
  if (props.bookCoverAspectRatio === 1) return (props.width || 0) / (120 * 1.6 * 2)
  return (props.width || 0) / 240
})
const hasOwnCover = computed(() => false)
const fullCoverUrl = computed(() => undefined as string | undefined)
const books = computed(() => props.bookItems || [])

// Methods
function imageError() {}
function imageLoaded() {}
</script>
