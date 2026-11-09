<template>
  <div class="w-full h-full">
    <div class="w-full h-full overflow-y-auto px-2 py-6 md:p-8">
      <div class="w-full flex justify-center md:block sm:w-32 md:w-52" style="min-width: 240px">
        <div class="relative" style="height: fit-content">
          <covers-collection-cover :book-items="bookItems" :width="240" :height="120 * bookCoverAspectRatio" :book-cover-aspect-ratio="bookCoverAspectRatio" />
        </div>
      </div>
      <div class="flex-grow py-6">
        <div class="flex items-center px-2">
          <h1 class="text-xl font-sans">
            {{ collectionName }}
          </h1>
          <div class="flex-grow" />
          <ui-btn v-if="showPlayButton" color="success" :padding-x="4" :loading="playerIsStartingForThisMedia" small class="flex items-center justify-center mx-1 w-24" @click="playClick">
            <span class="material-symbols text-2xl fill">{{ playerIsPlaying ? 'pause' : 'play_arrow' }}</span>
            <span class="px-1 text-sm">{{ playerIsPlaying ? strings.ButtonPause : strings.ButtonPlay }}</span>
          </ui-btn>
        </div>

        <div class="my-8 max-w-2xl px-2">
          <p class="text-base text-md-on-surface">{{ description }}</p>
        </div>

        <tables-collection-books-table :books="bookItems" :collection-id="collection.id" />
      </div>
    </div>
    <div v-show="processingRemove" class="absolute top-0 left-0 w-full h-full z-10 bg-black/40 flex items-center justify-center">
      <ui-loading-indicator />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'

const route = useRoute()
const eventBus = useEventBus()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const { hapticsImpact } = useHaptics()
const strings = useStrings()
const globalsStore = useGlobalsStore()
const appStore = useAppStore()
const userStore = useUserStore()

const id = route.params.id as string

const collection = ref<any>(null)
const loadedFromCache = ref(false)
const mediaIdStartingPlayback = ref<string | null>(null)
const processingRemove = ref(false)

const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)
const bookItems = computed(() => collection.value?.books || [])
const collectionName = computed(() => collection.value?.name || '')
const description = computed(() => collection.value?.description || '')
const playableItems = computed(() => bookItems.value.filter((book: any) => {
  return !book.isMissing && !book.isInvalid && book.media.tracks.length
}))
const playerIsPlaying = computed(() => {
  return appStore.playerIsPlaying && isOpenInPlayer.value
})
const isOpenInPlayer = computed(() => {
  return !!playableItems.value.find((i: any) => {
    if (i.localLibraryItem && appStore.getIsMediaStreaming(i.localLibraryItem.id)) return true
    return appStore.getIsMediaStreaming(i.id)
  })
})
const autoContinuePlaylists = computed(() => {
  return appStore.deviceData?.deviceSettings?.autoContinuePlaylists
})
const playerIsStartingPlayback = computed(() => {
  return appStore.playerIsStartingPlayback
})
const playerIsStartingForThisMedia = computed(() => {
  if (!appStore.playerIsStartingPlayback) return false
  if (!mediaIdStartingPlayback.value) return false
  const mediaId = appStore.playerStartingPlaybackMediaId
  return mediaId === mediaIdStartingPlayback.value
})
const showPlayButton = computed(() => playableItems.value.length)

async function playClick() {
  if (playerIsStartingPlayback.value) return
  await hapticsImpact()

  if (playerIsPlaying.value) {
    eventBus.emit('pause-item')
  } else {
    playNextItem()
  }
}

function playNextItem() {
  const nowIndex = playableItems.value.findIndex((i: any) => {
    return appStore.getIsMediaStreaming(i.localLibraryItem?.id || i.id)
  })
  const nextBookNotRead = playableItems.value.slice(nowIndex + 1).find((pb: any) => {
    const prog = userStore.getUserMediaProgress(pb.id)
    return !prog?.isFinished
  })
  if (nextBookNotRead) {
    mediaIdStartingPlayback.value = nextBookNotRead.id
    appStore.playerIsStartingPlayback = true
    appStore.playerStartingPlaybackMediaId = nextBookNotRead.id

    if (nextBookNotRead.localLibraryItem) {
      eventBus.emit('play-item', { libraryItemId: nextBookNotRead.localLibraryItem.id, serverLibraryItemId: nextBookNotRead.id })
    } else {
      eventBus.emit('play-item', { libraryItemId: nextBookNotRead.id })
    }
  }
}

function onPlaybackEnded() {
  if (autoContinuePlaylists.value) {
    playNextItem()
  }
}

// A collection belongs to a single library, so leave rather than show one that is not in it
function libraryChanged(libraryId: string) {
  if (!libraryId || libraryId !== collection.value?.libraryId) {
    navigateTo('/bookshelf/collections')
  }
}

onMounted(async () => {
  const user = userStore.user
  const networkConnected = !appStore.isOffline

  if (!user && !networkConnected) {
    const cachedOfflineCollection = await localStore.getCachedCollection(id)
    if (cachedOfflineCollection) {
      collection.value = cachedOfflineCollection
      loadedFromCache.value = true
    } else {
      await navigateTo('/bookshelf')
      return
    }
  } else {
    const isNetworkAvailable = networkConnected && !!user
    let fetchedCollection: Record<string, unknown> | null = null

    if (isNetworkAvailable) {
      fetchedCollection = await nativeHttp.get(`/api/collections/${id}`, { connectTimeout: 10000 }).catch((error: any) => {
        console.error('Failed to fetch collection', error)
        return null
      }) as Record<string, unknown> | null

      if (fetchedCollection) {
        await localStore.setCachedCollection(fetchedCollection)
      }
    }

    if (!fetchedCollection) {
      fetchedCollection = await localStore.getCachedCollection(id)
      loadedFromCache.value = !!fetchedCollection
    }

    if (!fetchedCollection) {
      await navigateTo(networkConnected ? '/bookshelf' : '/bookshelf?error=offlineCollectionUnavailable')
      return
    }

    // Lookup matching local items and attach to collection items
    if ((fetchedCollection.books as unknown[]).length) {
      const localLibraryItems: any[] = (await db.getLocalLibraryItems('book') as any) || []
      if (localLibraryItems.length) {
        const localLibraryItemMap = new Map()
        localLibraryItems.forEach((item: any) => {
          if (item?.libraryItemId) {
            localLibraryItemMap.set(item.libraryItemId, item)
          }
        })

        ;(fetchedCollection.books as any[]).forEach((collectionItem: any) => {
          const matchingLocalLibraryItem = localLibraryItemMap.get(collectionItem.id)
          if (!matchingLocalLibraryItem) return
          collectionItem.localLibraryItem = matchingLocalLibraryItem
        })
      }
    }

    collection.value = fetchedCollection
  }

  eventBus.on('playback-ended', onPlaybackEnded)
  eventBus.on('library-changed', libraryChanged)
})

onBeforeUnmount(() => {
  eventBus.off('playback-ended', onPlaybackEnded)
  eventBus.off('library-changed', libraryChanged)
})
</script>
