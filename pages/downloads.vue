<template>
  <div class="w-full h-full py-6 px-4 overflow-y-auto">
    <p class="mb-2 text-base text-md-on-surface">{{ $strings.HeaderDownloads }} ({{ localLibraryItems.length }})</p>

    <div class="w-full">
      <template v-for="(mediaItem, num) in localLibraryItems" :key="mediaItem.id">
        <div class="w-full">
          <nuxt-link :to="`/localMedia/item/${mediaItem.id}`" class="flex items-center">
            <div class="w-16 h-16 min-w-16 min-h-16 flex-none bg-md-surface-3 relative">
              <img v-if="mediaItem.coverPathSrc" :src="mediaItem.coverPathSrc" class="w-full h-full object-contain" />
            </div>
            <div class="px-2 flex-grow">
              <p class="text-sm">{{ mediaItem.media.metadata?.title }}</p>
              <p v-if="mediaItem.mediaType == 'book'" class="text-xs text-md-on-surface-variant">{{ mediaItem.media.tracks?.length }} {{ $strings.LabelTracks }}</p>
              <p v-else-if="mediaItem.mediaType == 'podcast'" class="text-xs text-md-on-surface-variant">{{ mediaItem.media.episodes?.length }} {{ $strings.HeaderEpisodes }}</p>
              <p v-if="mediaItem.size" class="text-xs text-md-on-surface-variant">{{ $bytesPretty(mediaItem.size) }}</p>
            </div>
            <div class="w-12 h-12 flex items-center justify-center">
              <span class="material-symbols text-2xl text-md-on-surface-variant">chevron_right</span>
            </div>
          </nuxt-link>
          <div v-if="num + 1 < localLibraryItems.length" class="flex border-t border-md-on-surface/10 my-3" />
        </div>
      </template>
    </div>
    <div v-if="localLibraryItems.length" class="mt-4 text-sm text-md-on-surface-variant">{{ $strings.LabelTotalSize }}: {{ $bytesPretty(localLibraryItems.reduce((acc, item) => acc + item.size, 0)) }}</div>
  </div>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'

const eventBus = useEventBus()

type LocalMediaItem = { id: string; size: number; coverPathSrc: string | null; media: { metadata?: { title?: string }; tracks?: unknown[]; episodes?: unknown[] }; mediaType?: string; [key: string]: unknown }

const localLibraryItems = ref<LocalMediaItem[]>([])

function getSize(item: Record<string, unknown>): number {
  if (!item || !item.localFiles) return 0
  const files = item.localFiles as { size: number }[]
  let size = 0
  for (let i = 0; i < files.length; i++) {
    size += files[i].size
  }
  return size
}

function newLocalLibraryItem(item: Record<string, unknown>) {
  if (!item) return
  const itemIndex = localLibraryItems.value.findIndex((li) => li.id === item.id)
  const newItemObj: LocalMediaItem = {
    ...item,
    id: item.id as string,
    size: getSize(item),
    coverPathSrc: item.coverContentUrl ? Capacitor.convertFileSrc(item.coverContentUrl as string) : null,
    media: (item.media as LocalMediaItem['media']) || {}
  }
  if (itemIndex >= 0) {
    localLibraryItems.value.splice(itemIndex, 1, newItemObj)
  } else {
    localLibraryItems.value.push(newItemObj)
  }
}

async function init() {
  const db = useDb()
  const items = ((await db.getLocalLibraryItems()) as Record<string, unknown>[]) || []
  localLibraryItems.value = items.map((lmi) => {
    console.log('Local library item', JSON.stringify(lmi))
    return {
      ...lmi,
      id: lmi.id as string,
      size: getSize(lmi),
      coverPathSrc: lmi.coverContentUrl ? Capacitor.convertFileSrc(lmi.coverContentUrl as string) : null,
      media: (lmi.media as LocalMediaItem['media']) || {}
    }
  })
}

onMounted(() => {
  eventBus.on('new-local-library-item', newLocalLibraryItem)
  void init()
})

onBeforeUnmount(() => {
  eventBus.off('new-local-library-item', newLocalLibraryItem)
})
</script>

