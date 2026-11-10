<template>
  <div class="flex h-full px-1 overflow-hidden">
    <covers-book-cover :library-item="libraryItem" :width="coverWidth" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    <div class="grow px-2 audiobookSearchCardContent">
      <p class="truncate text-sm">{{ title }}</p>
      <p v-if="podcastTitle" class="truncate text-xs text-md-on-surface-variant">{{ podcastTitle }}</p>
      <p v-if="authorName" class="text-xs text-md-on-surface-variant truncate">{{ getString('LabelByAuthor', [authorName]) }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { getString } from '~/composables/useStrings'

const props = defineProps<{
  episode?: Record<string, unknown>
  libraryItem?: Record<string, unknown>
}>()

const globalsStore = useGlobalsStore()

const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const coverWidth = computed(() => {
  if (bookCoverAspectRatio.value === 1) return 50 * 1.2
  return 50
})
const media = computed(() => (props.libraryItem?.media as Record<string, unknown> | null | undefined) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown> | null | undefined) || {})
const title = computed(() => (props.episode?.title as string) || 'No Title')
// The podcast the episode belongs to, so a bare episode title is not ambiguous
const podcastTitle = computed(() => mediaMetadata.value.title as string | undefined)
const authorName = computed(() => mediaMetadata.value.author as string | undefined)
</script>

<style>
.audiobookSearchCardContent {
  width: calc(100% - 80px);
  display: flex;
  flex-direction: column;
  justify-content: center;
}
</style>
