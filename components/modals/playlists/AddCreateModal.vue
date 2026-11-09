<template>
  <modals-fullscreen-modal v-model="show" :processing="processing">
    <div class="flex items-end justify-between h-24 px-4 pb-2">
      <h1 class="text-lg">{{ strings.LabelAddToPlaylist }}</h1>
      <button class="flex" @click="show = false">
        <span class="material-symbols">close</span>
      </button>
    </div>

    <!-- create new playlist form -->
    <div v-if="showPlaylistNameInput" class="w-full h-full max-h-[calc(100vh-176px)] flex items-center">
      <div class="w-full px-4">
        <div class="flex mb-4 items-center">
          <div class="w-9 h-9 flex items-center justify-center rounded-full cursor-pointer" @click.stop="showPlaylistNameInput = false">
            <span class="material-symbols text-3xl">arrow_back</span>
          </div>
          <p class="text-xl pl-2 leading-none">{{ strings.HeaderNewPlaylist }}</p>
          <div class="flex-grow" />
        </div>

        <ui-text-input-with-label v-model="newPlaylistName" :label="strings.LabelName" />
        <div class="flex justify-end mt-6">
          <ui-btn color="success" :loading="processing" class="w-full" @click.stop="submitCreatePlaylist">{{ strings.ButtonCreate }}</ui-btn>
        </div>
      </div>
    </div>

    <!-- playlists list -->
    <div v-if="!showPlaylistNameInput" class="w-full overflow-y-auto overflow-x-hidden h-full max-h-[calc(100vh-176px)]">
      <div class="w-full h-full" v-show="!showPlaylistNameInput">
        <template v-for="playlist in sortedPlaylists" :key="playlist.id">
          <modals-playlists-playlist-row :in-playlist="playlist.isItemIncluded" :playlist="playlist" @click="clickPlaylist" @close="show = false" />
        </template>
        <div v-if="!playlists.length" class="flex h-full items-center justify-center">
          <p class="text-xl">{{ loading ? strings.MessageLoading : strings.MessageNoUserPlaylists }}</p>
        </div>
      </div>
    </div>

    <!-- create playlist btn -->
    <div v-if="!showPlaylistNameInput" class="flex items-start justify-between h-20 pt-2 absolute bottom-0 left-0 w-full">
      <ui-btn :loading="processing" color="success" class="w-full h-14 flex items-center justify-center" @click.stop="createPlaylist">
        <p class="text-base">{{ strings.ButtonCreateNewPlaylist }}</p>
      </ui-btn>
    </div>
  </modals-fullscreen-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useHaptics } from '~/composables/useHaptics'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useToast } from '~/composables/useToast'
import { useLocalStore } from '~/composables/useLocalStore'
import { useSocket } from '~/composables/useSocket'
import { useGlobalsStore } from '~/stores/globals'
import { useLibrariesStore } from '~/stores/libraries'
import { useAppStore } from '~/stores/app'

const strings = useStrings()
const { impact } = useHaptics()
const nativeHttp = useNativeHttp()
const toast = useToast()
const localStore = useLocalStore()
const socket = useSocket()
const globalsStore = useGlobalsStore()
const librariesStore = useLibrariesStore()
const appStore = useAppStore()

const showPlaylistNameInput = ref(false)
const newPlaylistName = ref('')
const playlists = ref<Record<string, unknown>[]>([])
const processing = ref(false)
const loading = ref(false)

const show = computed({
  get() { return globalsStore.showPlaylistsAddCreateModal },
  set(val: boolean) { globalsStore.showPlaylistsAddCreateModal = val }
})

const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const selectedPlaylistItems = computed(() => globalsStore.selectedPlaylistItems || [])
const networkConnected = computed(() => !appStore.isOffline)

const sortedPlaylists = computed(() => {
  return (playlists.value
    .map((playlist) => {
      const includesItem = !(selectedPlaylistItems.value as Record<string, unknown>[]).some((item) => !checkIsItemInPlaylist(playlist, item))
      return { isItemIncluded: includesItem, ...playlist }
    })
    .sort((a) => (a.isItemIncluded ? -1 : 1))) as Array<{ id: string; isItemIncluded: boolean; [key: string]: unknown }>
})

watch(show, (newVal) => {
  if (newVal) {
    setListeners()
    showPlaylistNameInput.value = false
    newPlaylistName.value = ''
    void loadPlaylists()
  } else {
    unsetListeners()
  }
})

function checkIsItemInPlaylist(playlist: Record<string, unknown>, item: Record<string, unknown>) {
  const ep = item.episode as Record<string, unknown>
  const li = item.libraryItem as Record<string, unknown>
  if (ep) {
    return (playlist.items as Record<string, unknown>[]).some((i) => i.libraryItemId === li.id && i.episodeId === ep.id)
  }
  return (playlist.items as Record<string, unknown>[]).some((i) => i.libraryItemId === li.id)
}

async function loadPlaylists() {
  loading.value = true
  if (!networkConnected.value) {
    playlists.value = await localStore.getCachedPlaylists(currentLibraryId.value) as Record<string, unknown>[]
    loading.value = false
    return
  }
  nativeHttp
    .get(`/api/libraries/${currentLibraryId.value}/playlists`)
    .then((data) => {
      const d = data as Record<string, unknown>
      playlists.value = (d.results as Record<string, unknown>[]) || []
      void localStore.setCachedPlaylists(currentLibraryId.value, playlists.value)
    })
    .catch((error) => {
      console.error('Failed', error)
      toast.error('Failed to load playlists')
    })
    .finally(() => {
      loading.value = false
    })
}

async function clickPlaylist(playlist: Record<string, unknown>) {
  await impact()
  if (playlist.isItemIncluded) {
    removeFromPlaylist(playlist)
  } else {
    addToPlaylist(playlist)
  }
}

function removeFromPlaylist(playlist: Record<string, unknown>) {
  if (!selectedPlaylistItems.value.length) return
  processing.value = true

  const itemObjects = (selectedPlaylistItems.value as Record<string, unknown>[]).map((pi) => ({ libraryItemId: (pi.libraryItem as Record<string, unknown>).id, episodeId: pi.episode ? (pi.episode as Record<string, unknown>).id : null }))
  nativeHttp
    .post(`/api/playlists/${playlist.id}/batch/remove`, { items: itemObjects })
    .then((updatedPlaylist) => {
      console.log(`Items removed from playlist`, updatedPlaylist)
    })
    .catch((error) => {
      console.error('Failed to remove items from playlist', error)
      toast.error('Failed to remove playlist item(s)')
    })
    .finally(() => {
      processing.value = false
    })
}

function addToPlaylist(playlist: Record<string, unknown>) {
  if (!selectedPlaylistItems.value.length) return
  processing.value = true

  const itemObjects = (selectedPlaylistItems.value as Record<string, unknown>[]).map((pi) => ({ libraryItemId: (pi.libraryItem as Record<string, unknown>).id, episodeId: pi.episode ? (pi.episode as Record<string, unknown>).id : null }))
  nativeHttp
    .post(`/api/playlists/${playlist.id}/batch/add`, { items: itemObjects })
    .then((updatedPlaylist) => {
      console.log(`Items added to playlist`, updatedPlaylist)
    })
    .catch((error) => {
      console.error('Failed to add items to playlist', error)
      toast.error('Failed to add items to playlist')
    })
    .finally(() => {
      processing.value = false
    })
}

function createPlaylist() {
  newPlaylistName.value = ''
  showPlaylistNameInput.value = true
}

async function submitCreatePlaylist() {
  await impact()
  if (!newPlaylistName.value || !selectedPlaylistItems.value.length) {
    return
  }
  processing.value = true

  const itemObjects = (selectedPlaylistItems.value as Record<string, unknown>[]).map((pi) => ({ libraryItemId: (pi.libraryItem as Record<string, unknown>).id, episodeId: pi.episode ? (pi.episode as Record<string, unknown>).id : null }))
  const newPlaylist = {
    items: itemObjects,
    libraryId: currentLibraryId.value,
    name: newPlaylistName.value
  }

  nativeHttp
    .post('/api/playlists', newPlaylist)
    .then((data) => {
      console.log('New playlist created', data)
      newPlaylistName.value = ''
      showPlaylistNameInput.value = false
    })
    .catch((error) => {
      console.error('Failed to create playlist', error)
      toast.error(strings.ToastPlaylistCreateFailed)
    })
    .finally(() => {
      processing.value = false
    })
}

function playlistAdded(playlist: Record<string, unknown>) {
  if (!playlists.value.some((p) => p.id === playlist.id)) {
    playlists.value.push(playlist)
    void localStore.setCachedPlaylist(playlist)
    void localStore.setCachedPlaylists(currentLibraryId.value, playlists.value)
  }
}

function playlistUpdated(playlist: Record<string, unknown>) {
  const index = playlists.value.findIndex((p) => p.id === playlist.id)
  if (index >= 0) {
    playlists.value.splice(index, 1, playlist)
    void localStore.setCachedPlaylist(playlist)
  } else {
    playlists.value.push(playlist)
    void localStore.setCachedPlaylist(playlist)
  }
  void localStore.setCachedPlaylists(currentLibraryId.value, playlists.value)
}

function playlistRemoved(playlist: Record<string, unknown>) {
  playlists.value = playlists.value.filter((p) => p.id !== playlist.id)
  void localStore.removeCachedPlaylist(playlist.id as string)
  void localStore.setCachedPlaylists(currentLibraryId.value, playlists.value)
}

function setListeners() {
  socket.$on('playlist_added', playlistAdded)
  socket.$on('playlist_updated', playlistUpdated)
  socket.$on('playlist_removed', playlistRemoved)
}

function unsetListeners() {
  socket.$off('playlist_added', playlistAdded)
  socket.$off('playlist_updated', playlistUpdated)
  socket.$off('playlist_removed', playlistRemoved)
}
</script>
