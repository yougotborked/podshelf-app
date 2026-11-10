<template>
  <div class="flex h-full px-1 overflow-hidden">
    <covers-group-cover :name="name" :book-items="bookItems" :width="80" :height="60" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    <div class="flex-grow px-2 seriesSearchCardContent h-full">
      <p class="truncate text-sm">{{ name }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  series?: Record<string, unknown>
  bookItems?: Record<string, unknown>[]
}>()

const globalsStore = useGlobalsStore()

const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio as number)
const name = computed(() => (props.series?.name as string) || '')
</script>

<style>
.seriesSearchCardContent {
  width: calc(100% - 80px);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
