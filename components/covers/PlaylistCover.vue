<template>
  <div class="relative rounded-sm overflow-hidden" :style="{ width: width + 'px', height: height + 'px' }">
    <div v-if="items?.length" class="flex flex-wrap justify-center h-full relative bg-md-surface-3/95 rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-md-on-surface/5" />
      <covers-book-cover v-for="(li, index) in libraryItemCovers" :key="index" :library-item="li" :width="itemCoverWidth" :book-cover-aspect-ratio="1" />
    </div>
    <div v-else class="relative w-full h-full flex items-center justify-center p-2 bg-md-surface-3 rounded-sm">
      <div class="absolute top-0 left-0 w-full h-full bg-md-on-surface/5" />
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  items?: Record<string, unknown>[]
  width?: number
  height?: number
}>()

// Computed
const itemCoverWidth = computed(() => {
  if (libraryItemCovers.value.length === 1) return props.width || 0
  return (props.width || 0) / 2
})
const libraryItemCovers = computed(() => {
  const itemList = props.items || []
  if (!itemList.length) return []
  const only = itemList[0]
  if (itemList.length === 1 && only) return [only.libraryItem as Record<string, unknown>]

  const covers: Record<string, unknown>[] = []
  for (let i = 0; i < 4; i++) {
    let index = i % itemList.length
    if (itemList.length === 2 && i >= 2) index = (i + 1) % 2

    const picked = itemList[index]
    if (picked) covers.push(picked.libraryItem as Record<string, unknown>)
  }
  return covers
})
</script>
