<template>
  <div v-if="downloadItemPartsRemaining.length" @click="clickedIt">
    <widgets-circle-progress :value="progress" :count="downloadItemPartsRemaining.length" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { AbsDownloader } from '@/plugins/capacitor'
import type { LibraryItem } from '~/types'
import { useGlobalsStore } from '~/stores/globals'
import { useEventBus } from '~/composables/useEventBus'
import { useToast } from '~/composables/useToast'
import { useStrings } from '~/composables/useStrings'

const router = useRouter()
const globalsStore = useGlobalsStore()
const eventBus = useEventBus()
const toast = useToast()
const strings = useStrings()

let downloadItemListener: { remove: () => void } | null = null
let completeListener: { remove: () => void } | null = null
let itemPartUpdateListener: { remove: () => void } | null = null
let queueChangedListener: { remove: () => void } | null = null

const downloadItems = computed(() => globalsStore.itemDownloads)

const downloadItemParts = computed(() => {
  const parts: Record<string, unknown>[] = []
  downloadItems.value.forEach((di) => parts.push(...(di.downloadItemParts as Record<string, unknown>[])))
  return parts
})

const downloadItemPartsRemaining = computed(() => downloadItemParts.value.filter((dip) => !dip.completed))

const progress = computed(() => {
  let totalBytes = 0
  let totalBytesDownloaded = 0
  downloadItemParts.value.forEach((dip) => {
    totalBytes += dip.fileSize as number
    totalBytesDownloaded += dip.bytesDownloaded as number
  })
  if (!totalBytes) return 0
  return Math.min(1, totalBytesDownloaded / totalBytes)
})


function clickedIt() {
  void router.push('/downloading')
}

function onItemDownloadComplete(data: Record<string, unknown>) {
  console.log('DownloadProgressIndicator onItemDownloadComplete', JSON.stringify(data))
  if (!data || !data.libraryItemId) {
    console.error('Invalid item download complete payload')
    return
  }

  if (!data.localLibraryItem) {
    toast.error(strings.MessageItemDownloadCompleteFailedToCreate)
  } else {
    eventBus.emit('new-local-library-item', data.localLibraryItem as LibraryItem)
  }

  if (data.localMediaProgress) {
    console.log('onItemDownloadComplete updating local media progress', (data.localMediaProgress as Record<string, unknown>).id)
    globalsStore.updateLocalMediaProgress(data.localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
  }

  globalsStore.removeItemDownload(data.libraryItemId as string)
}

function onDownloadItem(downloadItem: Record<string, unknown>) {
  console.log('DownloadProgressIndicator onDownloadItem', JSON.stringify(downloadItem))

  downloadItem.itemProgress = 0
  downloadItem.episodes = (downloadItem.downloadItemParts as Record<string, unknown>[]).filter((dip) => dip.episode).map((dip) => dip.episode)

  globalsStore.addUpdateItemDownload(downloadItem as Parameters<typeof globalsStore.addUpdateItemDownload>[0])
}

function onDownloadItemPartUpdate(itemPart: Record<string, unknown>) {
  globalsStore.updateDownloadItemPart(itemPart as Parameters<typeof globalsStore.updateDownloadItemPart>[0])
}

// The download queue can be cancelled from the notification, outside the webview
function onQueueChanged(data: Record<string, unknown>) {
  if (!data.hasWork) globalsStore.clearItemDownloads()
}

onMounted(async () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  downloadItemListener = await AbsDownloader.addListener('onDownloadItem', (data: any) => onDownloadItem(data as Record<string, unknown>))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  itemPartUpdateListener = await AbsDownloader.addListener('onDownloadItemPartUpdate', (data: any) => onDownloadItemPartUpdate(data as Record<string, unknown>))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  completeListener = await AbsDownloader.addListener('onItemDownloadComplete', (data: any) => onItemDownloadComplete(data as Record<string, unknown>))
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  queueChangedListener = await AbsDownloader.addListener('onQueueChanged', (data: any) => onQueueChanged(data as Record<string, unknown>))
})

onBeforeUnmount(() => {
  downloadItemListener?.remove()
  completeListener?.remove()
  itemPartUpdateListener?.remove()
  queueChangedListener?.remove()
})
</script>