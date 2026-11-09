<template>
  <div class="w-full h-full py-6 px-4">
    <div class="flex items-center mb-2">
      <p class="text-base font-semibold">{{ $strings.LabelFolder }}: {{ folderName }}</p>
      <div class="flex-grow" />

      <span v-if="dialogItems.length" class="material-symbols text-2xl" @click="showDialog = true">more_vert</span>
    </div>

    <p class="text-sm mb-4 text-md-on-surface-variant">{{ $strings.LabelMediaType }}: {{ mediaType }}</p>

    <p class="mb-2 text-base text-md-on-surface">{{ $strings.HeaderLocalLibraryItems }} ({{ localLibraryItems.length }})</p>

    <div class="w-full media-item-container overflow-y-auto">
      <template v-for="localLibraryItem in localLibraryItems" :key="localLibraryItem.id">
        <nuxt-link :to="`/localMedia/item/${localLibraryItem.id}`" class="flex my-1">
          <div class="w-12 h-12 min-w-12 min-h-12 bg-md-surface-1">
            <img v-if="localLibraryItem.coverPathSrc" :src="localLibraryItem.coverPathSrc" class="w-full h-full object-contain" />
          </div>
          <div class="flex-grow px-2">
            <p class="text-sm">{{ localLibraryItem.media.metadata.title }}</p>
            <p class="text-xs text-md-on-surface-variant">{{ getLocalLibraryItemSubText(localLibraryItem) }}</p>
          </div>
          <div class="w-12 h-12 flex items-center justify-center">
            <span class="material-symbols text-xl text-md-on-surface-variant">arrow_right</span>
          </div>
        </nuxt-link>
      </template>
    </div>

    <modals-dialog v-model="showDialog" :items="dialogItems" @action="dialogAction" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'
import { AbsFileSystem } from '@/plugins/capacitor'

const route = useRoute()
const router = useRouter()
const eventBus = useEventBus()
const db = useDb()
const strings = useStrings()

const folderId = route.params.id as string

// State
const localLibraryItems = ref<any[]>([])
const folder = ref<any>(null)
const removingFolder = ref(false)
const showDialog = ref(false)

// Computed
const folderName = computed(() => folder.value?.name || null)
const mediaType = computed(() => folder.value?.mediaType)
const isInternalStorage = computed(() => folder.value?.id.startsWith('internal-'))
const dialogItems = computed(() => {
  if (isInternalStorage.value) return []
  return [
    {
      text: strings.ButtonRemove,
      value: 'remove'
    }
  ]
})

// Methods
function getLocalLibraryItemSubText(localLibraryItem: any) {
  if (!localLibraryItem) return ''
  if (localLibraryItem.mediaType == 'book') {
    const txts: string[] = []
    if (localLibraryItem.media.ebookFile) {
      txts.push(`${localLibraryItem.media.ebookFile.ebookFormat} ${strings.LabelEbook}`)
    }
    if (localLibraryItem.media.tracks?.length) {
      txts.push(`${localLibraryItem.media.tracks.length} ${strings.LabelTracks}`)
    }
    return txts.join(' • ')
  } else {
    return `${localLibraryItem.media.episodes?.length || 0} ${strings.HeaderEpisodes}`
  }
}

function dialogAction(action: string) {
  console.log('Dialog action', action)
  if (action == 'remove') {
    void removeFolder()
  }
  showDialog.value = false
}

async function removeFolder() {
  let deleteMessage = 'Are you sure you want to remove this folder? (does not delete anything in your file system)'
  if (localLibraryItems.value.length) {
    deleteMessage = `Are you sure you want to remove this folder and ${localLibraryItems.value.length} items? (does not delete anything in your file system)`
  }
  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: deleteMessage
  })
  if (value) {
    removingFolder.value = true
    await AbsFileSystem.removeFolder({ folderId })
    removingFolder.value = false
    void router.replace('/localMedia/folders')
  }
}

async function init() {
  const folderData = await db.getLocalFolder(folderId)
  folder.value = folderData

  const items = (await db.getLocalLibraryItemsInFolder(folderId)) || []
  console.log('Init folder', folderId, items)
  localLibraryItems.value = items.map((lmi: any) => {
    console.log('Local library item', JSON.stringify(lmi))
    return {
      ...lmi,
      coverPathSrc: lmi.coverContentUrl ? Capacitor.convertFileSrc(lmi.coverContentUrl) : null
    }
  })
}

function newLocalLibraryItem(item: any) {
  if (item.folderId == folderId) {
    console.log('New local library item', item.id)
    if (localLibraryItems.value.find((li) => li.id == item.id)) {
      console.warn('Item already added', item.id)
      return
    }

    const _item = {
      ...item,
      coverPathSrc: item.coverContentUrl ? Capacitor.convertFileSrc(item.coverContentUrl) : null
    }
    localLibraryItems.value.push(_item)
  }
}

onMounted(() => {
  eventBus.on('new-local-library-item', newLocalLibraryItem)
  void init()
})

onBeforeUnmount(() => {
  eventBus.off('new-local-library-item', newLocalLibraryItem)
})
</script>

<style scoped>
.media-item-container {
  height: calc(100vh - 210px);
  max-height: calc(100vh - 210px);
}
.playerOpen .media-item-container {
  height: calc(100vh - 310px);
  max-height: calc(100vh - 310px);
}
</style>
