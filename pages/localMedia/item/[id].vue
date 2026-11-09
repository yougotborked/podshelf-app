<template>
  <div class="w-full h-full py-6 px-2">
    <div v-if="localLibraryItem" class="w-full h-full">
      <div class="px-2 flex items-center mb-2">
        <p class="text-base font-semibold truncate">{{ mediaMetadata.title }}</p>
        <div class="flex-grow" />

        <button v-if="audioTracks.length && !isPodcast" class="shadow-sm text-success flex items-center justify-center rounded-full mx-2" @click.stop="play">
          <span class="material-symbols fill" style="font-size: 2rem">play_arrow</span>
        </button>
        <span class="material-symbols text-2xl" @click="showItemDialog">more_vert</span>
      </div>

      <p v-if="!isIos" class="px-2 text-sm mb-0.5 text-md-on-surface-variant">{{ $strings.LabelFolder }}: {{ folderName }}</p>

      <p class="px-2 mb-4 text-xs text-md-on-surface-variant">{{ libraryItemId ? 'Linked to item on server ' + liServerAddress : 'Not linked to server item' }}</p>

      <div class="w-full max-w-full media-item-container overflow-y-auto overflow-x-hidden relative pb-4" :class="{ 'media-order-changed': orderChanged }">
        <div v-if="!isPodcast && audioTracksCopy.length" class="w-full py-2">
          <div class="flex justify-between items-center mb-2">
            <p class="text-base">Audio Tracks ({{ audioTracks.length }})</p>
            <p class="text-xs text-md-on-surface-variant px-2">{{ $strings.LabelTotalSize }}: {{ $bytesPretty(totalAudioSize) }}</p>
          </div>

          <draggable v-model="audioTracksCopy" v-bind="dragOptions" handle=".drag-handle" tag="div" item-key="localFileId" @start="drag = true" @end="drag = false" @update="draggableUpdate" :disabled="isIos">
            <template #item="{ element: track }">
              <div class="flex items-center my-1">
                <div v-if="!isIos" class="w-8 h-12 flex items-center justify-center" style="min-width: 32px">
                  <span class="material-symbols drag-handle text-lg text-md-on-surface-variant">menu</span>
                </div>
                <div class="w-8 h-12 flex items-center justify-center" style="min-width: 32px">
                  <p class="font-mono font-bold text-xl">{{ track.index }}</p>
                </div>
                <div class="flex-grow px-2">
                  <p class="text-xs">{{ track.title }}</p>
                </div>
                <div class="w-20 text-center text-md-on-surface-variant" style="min-width: 80px">
                  <p class="text-xs">{{ track.mimeType }}</p>
                  <p class="text-sm">{{ $elapsedPretty(track.duration) }}</p>
                </div>
                <div v-if="!isIos" class="w-12 h-12 flex items-center justify-center" style="min-width: 48px">
                  <span class="material-symbols text-2xl" @click="showTrackDialog(track)">more_vert</span>
                </div>
              </div>
            </template>
          </draggable>
        </div>

        <div v-if="isPodcast" class="w-full py-2">
          <div class="flex justify-between items-center mb-2">
            <p class="text-base">Episodes ({{ episodes.length }})</p>
            <p class="text-xs text-md-on-surface-variant px-2">{{ $strings.LabelTotalSize }}: {{ $bytesPretty(totalEpisodesSize) }}</p>
          </div>
          <template v-for="episode in episodes" :key="episode.id">
            <div class="flex items-center my-1">
              <div class="w-10 h-12 flex items-center justify-center" style="min-width: 48px">
                <p class="font-mono font-bold text-xl">{{ episode.index }}</p>
              </div>
              <div class="flex-grow px-2">
                <p class="text-xs">{{ episode.title }}</p>
              </div>
              <div class="w-20 text-center text-md-on-surface-variant" style="min-width: 80px">
                <p class="text-xs">{{ episode.audioTrack.mimeType }}</p>
                <p class="text-sm">{{ $elapsedPretty(episode.audioTrack.duration) }}</p>
              </div>
              <div class="w-12 h-12 flex items-center justify-center" style="min-width: 48px">
                <span class="material-symbols text-2xl" @click="showTrackDialog(episode)">more_vert</span>
              </div>
            </div>
          </template>
        </div>

        <div v-if="localFileForEbook" class="w-full py-2">
          <p class="text-base mb-2">EBook File</p>

          <div class="flex items-center my-1">
            <div class="w-10 h-12 flex items-center justify-center" style="min-width: 40px">
              <p class="font-mono font-bold text-sm">{{ ebookFile.ebookFormat }}</p>
            </div>
            <div class="flex-grow px-2">
              <p class="text-xs">{{ localFileForEbook.filename }}</p>
            </div>
            <div class="w-24 text-center text-md-on-surface-variant" style="min-width: 96px">
              <p class="text-xs">{{ localFileForEbook.mimeType }}</p>
              <p class="text-sm">{{ $bytesPretty(localFileForEbook.size) }}</p>
            </div>
          </div>
        </div>

        <div v-if="otherFiles.length">
          <div class="flex justify-between items-center py-2">
            <p class="text-lg">Other Files</p>
            <p class="text-xs text-md-on-surface-variant px-2">{{ $strings.LabelTotalSize }}: {{ $bytesPretty(totalOtherFilesSize) }}</p>
          </div>
          <template v-for="file in otherFiles" :key="file.id">
            <div class="flex items-center my-1">
              <div class="w-12 h-12 flex items-center justify-center">
                <img v-if="(file.mimeType || '').startsWith('image')" :src="getCapImageSrc(file.contentUrl)" class="w-full h-full object-contain" />
                <span v-else class="material-symbols">music_note</span>
              </div>
              <div class="flex-grow px-2">
                <p class="text-sm">{{ file.filename }}</p>
              </div>
              <div class="w-24 text-center text-md-on-surface-variant" style="min-width: 96px">
                <p class="text-xs">{{ file.mimeType }}</p>
                <p class="text-sm">{{ $bytesPretty(file.size) }}</p>
              </div>
            </div>
          </template>
        </div>

        <div class="mt-4 text-sm text-md-on-surface-variant">{{ $strings.LabelTotalSize }}: {{ $bytesPretty(totalLibraryItemSize) }}</div>
      </div>
    </div>
    <div v-else class="px-2 w-full h-full">
      <p class="text-lg text-center px-8">{{ failed ? 'Failed to get local library item ' + localLibraryItemId : 'Loading..' }}</p>
    </div>

    <div v-if="orderChanged" class="fixed left-0 w-full py-4 px-4 bg-md-surface-0 box-shadow-book flex items-center" :style="{ bottom: isPlayerOpen ? '120px' : '0px' }">
      <div class="flex-grow" />
      <ui-btn small color="success" @click="saveTrackOrder">{{ $strings.ButtonSaveOrder }}</ui-btn>
    </div>

    <modals-dialog v-model="showDialog" :items="dialogItems" @action="dialogAction" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import draggable from 'vuedraggable'
import { Capacitor } from '@capacitor/core'
import { Dialog } from '@capacitor/dialog'
import { AbsFileSystem } from '@/plugins/capacitor'

const route = useRoute()
const router = useRouter()
const eventBus = useEventBus()
const db = useDb()
const toast = useToast()
const platform = usePlatform()
const { hapticsImpact } = useHaptics()
const strings = useStrings()

const localLibraryItemId = route.params.id as string

const appStore = useAppStore()

// State
const drag = ref(false)
const dragOptions = {
  animation: 200,
  group: 'description',
  delay: 40,
  delayOnTouchOnly: true
}
const failed = ref(false)
const localLibraryItem = ref<any>(null)
const audioTracksCopy = ref<any[]>([])
const folderId = ref<string | null>(null)
const folder = ref<any>(null)
const showDialog = ref(false)
const selectedAudioTrack = ref<any>(null)
const selectedEpisode = ref<any>(null)
const orderChanged = ref(false)

// Computed
const isPlayerOpen = computed(() => appStore.getIsPlayerOpen)
const isIos = computed(() => platform === 'ios')
const localFiles = computed(() => localLibraryItem.value?.localFiles || [])
const otherFiles = computed(() => {
  if (!localFiles.value.filter) {
    console.error('Invalid local files', localFiles.value)
    return []
  }
  return localFiles.value.filter((lf: any) => {
    if (localFileForEbook.value?.id === lf.id) return false
    return !audioTracks.value.find((at: any) => at.localFileId == lf.id)
  })
})
const folderName = computed(() => folder.value?.name)
const mediaType = computed(() => localLibraryItem.value?.mediaType)
const isPodcast = computed(() => mediaType.value == 'podcast')
const libraryItemId = computed(() => localLibraryItem.value?.libraryItemId)
const liServerAddress = computed(() => localLibraryItem.value?.serverAddress)
const media = computed(() => localLibraryItem.value?.media)
const mediaMetadata = computed(() => media.value?.metadata || {})
const ebookFile = computed(() => media.value?.ebookFile)
const localFileForEbook = computed(() => {
  if (!ebookFile.value) return null
  return localFiles.value.find((lf: any) => lf.id == ebookFile.value.localFileId)
})
const episodes = computed(() => media.value?.episodes || [])
const audioTracks = computed(() => {
  if (!media.value) return []
  if (mediaType.value == 'book') {
    return media.value.tracks || []
  } else {
    return (media.value.episodes || []).map((ep: any) => ep.audioTrack)
  }
})
const dialogItems = computed(() => {
  if (selectedAudioTrack.value || selectedEpisode.value) {
    const items: any[] = [
      {
        text: strings.ButtonDeleteLocalFile,
        value: 'track-delete',
        icon: 'delete'
      }
    ]
    if (isPodcast.value && selectedEpisode.value) {
      items.unshift({
        text: strings.ButtonPlayEpisode,
        value: 'play-episode',
        icon: 'play_arrow'
      })
    }
    return items
  } else {
    return [
      {
        text: strings.ButtonDeleteLocalItem,
        value: 'delete',
        icon: 'delete'
      }
    ]
  }
})
const playerIsStartingPlayback = computed(() => appStore.playerIsStartingPlayback)
const totalAudioSize = computed(() => audioTracks.value.reduce((acc: number, item: any) => (item.metadata ? acc + item.metadata.size : acc), 0))
const totalEpisodesSize = computed(() => episodes.value.reduce((acc: number, item: any) => acc + item.size, 0))
const totalOtherFilesSize = computed(() => otherFiles.value.reduce((acc: number, item: any) => acc + item.size, 0))
const totalLibraryItemSize = computed(() => localFiles.value.reduce((acc: number, item: any) => acc + item.size, 0))

// Methods
function draggableUpdate() {
  for (let i = 0; i < audioTracksCopy.value.length; i++) {
    const trackCopy = audioTracksCopy.value[i]
    const track = audioTracks.value[i]
    if (track.localFileId !== trackCopy.localFileId) {
      orderChanged.value = true
      return
    }
  }
  orderChanged.value = false
}

async function saveTrackOrder() {
  const copyOfCopy = audioTracksCopy.value.map((at: any) => ({ ...at }))
  const payload = {
    localLibraryItemId,
    tracks: copyOfCopy
  }
  const response = await db.updateLocalTrackOrder(payload)
  if (response) {
    toast.success('Library item updated')
    console.log('updateLocal track order response', JSON.stringify(response))
    localLibraryItem.value = response
    audioTracksCopy.value = audioTracks.value.map((at: any) => ({ ...at }))
  } else {
    toast.info(strings.MessageNoUpdatesWereNecessary)
  }
  orderChanged.value = false
}

function showItemDialog() {
  selectedAudioTrack.value = null
  selectedEpisode.value = null
  showDialog.value = true
}

function showTrackDialog(track: any) {
  if (isPodcast.value) {
    selectedAudioTrack.value = null
    selectedEpisode.value = track
  } else {
    selectedEpisode.value = null
    selectedAudioTrack.value = track
  }
  showDialog.value = true
}

async function play() {
  if (playerIsStartingPlayback.value) return
  await hapticsImpact()
  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = localLibraryItemId
  eventBus.emit('play-item', { libraryItemId: localLibraryItemId, serverLibraryItemId: libraryItemId.value })
}

function getCapImageSrc(contentUrl: string) {
  return Capacitor.convertFileSrc(contentUrl)
}

async function playEpisode() {
  if (!selectedEpisode.value) return
  if (playerIsStartingPlayback.value) return
  await hapticsImpact()
  appStore.playerIsStartingPlayback = true
  appStore.playerStartingPlaybackMediaId = selectedEpisode.value.serverEpisodeId

  eventBus.emit('play-item', {
    libraryItemId: localLibraryItemId,
    episodeId: selectedEpisode.value.id,
    serverLibraryItemId: libraryItemId.value,
    serverEpisodeId: selectedEpisode.value.serverEpisodeId
  })
}

async function dialogAction(action: string) {
  console.log('Dialog action', action)
  await hapticsImpact()

  if (action == 'delete') {
    void deleteItem()
  } else if (action == 'track-delete') {
    if (isPodcast.value) void deleteEpisode()
    else void deleteTrack()
  } else if (action == 'play-episode') {
    void playEpisode()
  }
  showDialog.value = false
}

function getLocalFileForTrack(localFileId: string) {
  return localFiles.value.find((lf: any) => lf.id == localFileId)
}

async function deleteEpisode() {
  if (!selectedEpisode.value) return
  const localFile = getLocalFileForTrack(selectedEpisode.value.audioTrack.localFileId)
  if (!localFile) {
    toast.error('Audio track does not have matching local file..')
    return
  }

  let confirmMessage = `Remove local audio file "${localFile.basePath}" from your device?`
  if (libraryItemId.value) {
    confirmMessage += ' The file on the server will be unaffected.'
  }
  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: confirmMessage
  })
  if (value) {
    const res = await AbsFileSystem.deleteTrackFromItem({ id: localLibraryItem.value.id, trackLocalFileId: localFile.id, trackContentUrl: selectedEpisode.value.audioTrack.contentUrl })
    if (res && res.id) {
      toast.success('Deleted track successfully')
      localLibraryItem.value = res
    } else toast.error('Failed to delete')
  }
}

async function deleteTrack() {
  if (!selectedAudioTrack.value) {
    return
  }
  const localFile = getLocalFileForTrack(selectedAudioTrack.value.localFileId)
  if (!localFile) {
    toast.error('Audio track does not have matching local file..')
    return
  }

  let confirmMessage = `Remove local audio file "${localFile.basePath}" from your device?`
  if (libraryItemId.value) {
    confirmMessage += ' The file on the server will be unaffected.'
  }
  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: confirmMessage
  })
  if (value) {
    const res = await AbsFileSystem.deleteTrackFromItem({ id: localLibraryItem.value.id, trackLocalFileId: selectedAudioTrack.value.localFileId, trackContentUrl: selectedAudioTrack.value.contentUrl })
    if (res && res.id) {
      toast.success('Deleted track successfully')
      localLibraryItem.value = res
    } else toast.error('Failed to delete')
  }
}

async function deleteItem() {
  let confirmMessage = 'Remove local files of this item from your device?'
  if (libraryItemId.value) {
    confirmMessage += ' The files on the server and your progress will be unaffected.'
  }
  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: confirmMessage
  })
  if (value) {
    const res = await AbsFileSystem.deleteItem(localLibraryItem.value)
    if (res && res.success) {
      toast.success('Deleted Successfully')
      void router.replace(isIos.value ? '/downloads' : `/localMedia/folders/${folderId.value}`)
    } else toast.error('Failed to delete')
  }
}

async function init() {
  localLibraryItem.value = await db.getLocalLibraryItem(localLibraryItemId)

  if (!localLibraryItem.value) {
    console.error('Failed to get local library item', localLibraryItemId)
    failed.value = true
    return
  }

  audioTracksCopy.value = audioTracks.value.map((at: any) => ({ ...at }))

  folderId.value = localLibraryItem.value.folderId as string | null
  folder.value = await db.getLocalFolder(folderId.value || '')
}

onMounted(() => {
  void init()
})
</script>

<style scoped>
.media-item-container {
  height: calc(100vh - 200px);
  max-height: calc(100vh - 200px);
}
.media-item-container.media-order-changed {
  height: calc(100vh - 280px);
  max-height: calc(100vh - 280px);
}
.playerOpen .media-item-container {
  height: calc(100vh - 300px);
  max-height: calc(100vh - 300px);
}
.playerOpen .media-item-container.media-order-changed {
  height: calc(100vh - 380px);
  max-height: calc(100vh - 380px);
}
.sortable-ghost {
  opacity: 0.5;
}
.dragtrack-enter-from,
.dragtrack-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

.dragtrack-leave-active {
  position: absolute;
}
</style>
