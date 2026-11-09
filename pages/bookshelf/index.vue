<template>
  <!--
    600dp is where Android's medium window size class starts, and where a foldable's inner screen
    lands. Past it the content column stops growing and centres instead: a podcast description set
    across an eight-inch screen is a line of text nobody wants to read, and the shelves below would
    otherwise stretch with it.

    https://developer.android.com/develop/ui/views/layout/use-window-size-classes
  -->
  <div class="w-full h-full min-h-full relative min-[600px]:max-w-3xl min-[600px]:mx-auto">
    <div v-if="attemptingConnection" class="w-full pt-4 flex items-center justify-center">
      <widgets-loading-spinner />
      <p class="pl-4">{{ strings.MessageAttemptingServerConnection }}</p>
    </div>
    <div v-if="shelves.length && isLoading && !appStore.isOffline" class="w-full pt-4 flex items-center justify-center">
      <widgets-loading-spinner />
      <p class="pl-4">{{ strings.MessageLoadingServerData }}</p>
    </div>

    <div v-if="currentLibraryIsPodcast" class="w-full shrink-0" style="height: 45vh; min-height: 280px">
      <bookshelf-podcast-catch-up-feed :current-library-id="currentLibraryId" />
    </div>
    <div v-if="currentLibraryIsPodcast && shelves.length" class="w-full h-px bg-md-outline-variant/30 my-1" />
    <div class="w-full" :class="shelvesSpacingClass">
      <template v-for="(shelf, index) in shelves" :key="shelf.id">
        <bookshelf-shelf :label="getShelfLabel(shelf)" :entities="shelf.entities" :type="shelf.type" :style="{ zIndex: shelves.length - index }" />
      </template>
    </div>

    <div v-if="!shelves.length && !isLoading && !currentLibraryIsPodcast" class="absolute top-0 left-0 w-full h-full flex items-center justify-center">
      <div>
        <p class="mb-4 text-center text-xl">
          {{ strings.MessageBookshelfEmpty }}
        </p>
        <div class="w-full" v-if="!user">
          <div class="flex justify-center items-center mb-3">
            <span class="material-symbols text-error text-lg">cloud_off</span>
            <p class="pl-2 text-error text-sm">{{ strings.MessageAudiobookshelfServerNotConnected }}</p>
          </div>
        </div>
        <div class="flex justify-center">
          <ui-btn v-if="!user" small @click="router.push('/connect')" class="w-32">{{ strings.ButtonConnect }}</ui-btn>
        </div>
      </div>
    </div>
    <div v-else-if="!shelves.length && isLoading && !attemptingConnection && !currentLibraryIsPodcast" class="absolute top-0 left-0 z-50 w-full h-full flex items-center justify-center">
      <ui-loading-indicator :text="strings.MessageLoading" />
    </div>
  </div>
</template>

<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const strings = useStrings()
const eventBus = useEventBus()
const nativeHttp = useNativeHttp()
const db = useDb()
const toast = useToast()

const librariesStore = useLibrariesStore()
const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const userStore = useUserStore()

const shelves = ref<any[]>([])
const isFirstNetworkConnection = ref(true)
const lastServerFetch = ref(0)
const lastServerFetchLibraryId = ref<string | null>(null)
const lastLocalFetch = ref(0)
const localLibraryItems = ref<any[]>([])
const isLoading = ref(false)

const user = computed(() => userStore.user)
const networkConnected = computed(() => !appStore.isOffline)
const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const currentLibraryMediaType = computed(() => librariesStore.getCurrentLibraryMediaType)
const currentLibraryIsPodcast = computed(() => currentLibraryMediaType.value === 'podcast')
const altViewEnabled = computed(() => appStore.getAltViewEnabled)

/**
 * Padding around the shelves.
 *
 * Each shelf heading already carries its own pt-4, and in a podcast library the catch-up feed
 * above ends in a separator. Adding the container's own top padding on top of both left a wide
 * empty band above the first heading - 24px of it on top of the heading's 16px and the
 * separator's margins. Below the separator only the bottom padding is kept; a library with no
 * feed above it still needs the top padding to clear the app bar.
 */
const shelvesSpacingClass = computed(() => {
  if (!altViewEnabled.value) return ''
  return currentLibraryIsPodcast.value ? 'pb-6' : 'py-6'
})
const attemptingConnection = computed(() => appStore.attemptingConnection)

watch(networkConnected, (newVal) => {
  console.log(`[categories] Network changed to ${newVal} - fetch categories. ${lastServerFetch.value}/${lastLocalFetch.value}`)

  if (newVal) {
    if (isFirstNetworkConnection.value) {
      isFirstNetworkConnection.value = false
      console.log(`[categories] networkConnected true first network connection. lastServerFetch=${lastServerFetch.value}`)
      void fetchCategories()
      return
    }

    setTimeout(() => {
      console.log(`[categories] networkConnected true so fetching categories. lastServerFetch=${lastServerFetch.value}`)
      void fetchCategories()
    }, 4000)
  } else {
    console.log(`[categories] networkConnected false so fetching categories`)
    void fetchCategories()
  }
})

watch(user, (newVal, oldVal) => {
  if ((newVal && !oldVal) || (!newVal && oldVal)) {
    console.log(`[categories] user changed so fetching categories`)
    void fetchCategories()
  }
})

function getShelfLabel(shelf: any) {
  if (shelf.labelStringKey && (strings as any)[shelf.labelStringKey]) return (strings as any)[shelf.labelStringKey]
  return shelf.label
}

function getLocalMediaItemCategories() {
  const localMedia = localLibraryItems.value
  if (!localMedia?.length) return []

  const categories: any[] = []
  const books: any[] = []
  const podcasts: any[] = []
  const booksContinueListening: any[] = []
  const podcastEpisodesContinueListening: any[] = []
  localMedia.forEach((item) => {
    if (item.mediaType == 'book') {
      item.progress = globalsStore.getLocalMediaProgressById(item.id)
      if (item.progress && !item.progress.isFinished && item.progress.progress > 0) booksContinueListening.push(item)
      books.push(item)
    } else if (item.mediaType == 'podcast') {
      const podcastEpisodeItemCloner = { ...item }
      item.media.episodes = item.media.episodes.map((ep: any) => {
        ep.progress = globalsStore.getLocalMediaProgressById(item.id, ep.id)
        if (ep.progress && !ep.progress.isFinished && ep.progress.progress > 0) {
          podcastEpisodesContinueListening.push({
            ...podcastEpisodeItemCloner,
            recentEpisode: ep
          })
        }
        return ep
      })
      podcasts.push(item)
    }
  })

  if (booksContinueListening.length) {
    categories.push({
      id: 'local-books-continue',
      label: strings.LabelContinueBooks,
      type: 'book',
      localOnly: true,
      entities: booksContinueListening.sort((a, b) => {
        if (a.progress && b.progress) {
          return b.progress.lastUpdate > a.progress.lastUpdate ? 1 : -1
        }
        return 0
      })
    })
  }
  if (podcastEpisodesContinueListening.length) {
    categories.push({
      id: 'local-episodes-continue',
      label: strings.LabelContinueEpisodes,
      type: 'episode',
      localOnly: true,
      entities: podcastEpisodesContinueListening.sort((a, b) => {
        if (a.recentEpisode.progress && b.recentEpisode.progress) {
          return b.recentEpisode.progress.lastUpdate > a.recentEpisode.progress.lastUpdate ? 1 : -1
        }
        return 0
      })
    })
  }

  if (books.length) {
    categories.push({
      id: 'local-books',
      label: strings.LabelLocalBooks,
      type: 'book',
      entities: books.sort((a, b) => {
        if (a.progress && a.progress.isFinished) return 1
        else if (b.progress && b.progress.isFinished) return -1
        else if (a.progress && b.progress) {
          return b.progress.lastUpdate > a.progress.lastUpdate ? 1 : -1
        }
        return 0
      })
    })
  }
  if (podcasts.length) {
    categories.push({
      id: 'local-podcasts',
      label: strings.LabelLocalPodcasts,
      type: 'podcast',
      entities: podcasts
    })
  }

  return categories
}

async function fetchCategories() {
  console.log(`[categories] fetchCategories networkConnected=${networkConnected.value}, lastServerFetch=${lastServerFetch.value}, lastLocalFetch=${lastLocalFetch.value}`)

  const isConnectedToServerWithInternet = user.value && currentLibraryId.value && !appStore.isOffline
  if (isConnectedToServerWithInternet) {
    if (lastServerFetch.value && Date.now() - lastServerFetch.value < 5000 && lastServerFetchLibraryId.value == currentLibraryId.value) {
      console.log(`[categories] fetchCategories server fetch was ${Date.now() - lastServerFetch.value}ms ago so not doing it.`)
      return
    } else {
      console.log(`[categories] fetchCategories fetching from server. Last was ${lastServerFetch.value ? Date.now() - lastServerFetch.value + 'ms' : 'Never'} ago. lastServerFetchLibraryId=${lastServerFetchLibraryId.value} and currentLibraryId=${currentLibraryId.value}`)
      lastServerFetchLibraryId.value = currentLibraryId.value
      lastServerFetch.value = Date.now()
      lastLocalFetch.value = 0
    }
  } else {
    if (lastLocalFetch.value && Date.now() - lastLocalFetch.value < 5000) {
      console.log(`[categories] fetchCategories local fetch was ${Date.now() - lastLocalFetch.value}ms ago so not doing it.`)
      return
    } else {
      console.log(`[categories] fetchCategories fetching from local. Last was ${lastLocalFetch.value ? Date.now() - lastLocalFetch.value + 'ms' : 'Never'} ago`)
      lastServerFetchLibraryId.value = null
      lastServerFetch.value = 0
      lastLocalFetch.value = Date.now()
    }
  }

  isLoading.value = true

  localLibraryItems.value = await db.getLocalLibraryItems()
  const localLibraryItemsById = new Map()
  localLibraryItems.value.forEach((item) => {
    if (item?.libraryItemId) {
      localLibraryItemsById.set(item.libraryItemId, item)
    }
  })

  const types = [...new Set(localLibraryItems.value.map((li: any) => li.mediaType))]
  librariesStore.offlineMediaTypes = types
  const localCategories = getLocalMediaItemCategories()
  shelves.value = localCategories
  console.log('[categories] Local shelves set', shelves.value.length, lastLocalFetch.value)

  if (isConnectedToServerWithInternet) {
    const categories = await nativeHttp.get(`/api/libraries/${currentLibraryId.value}/personalized?minified=1&include=rssfeed,numEpisodesIncomplete`, { connectTimeout: 10000 }).catch((error: any) => {
      console.error('[categories] Failed to fetch categories', error)
      return []
    }) as any[]
    if (!categories.length) {
      console.warn(`[categories] Failed to get server categories so using local categories`)
      lastServerFetch.value = 0
      lastLocalFetch.value = Date.now()
      isLoading.value = false
      console.log('[categories] Local shelves set from failure', shelves.value.length, lastLocalFetch.value)
      return
    }

    shelves.value = categories.map((cat: any) => {
      if (cat.type == 'book' || cat.type == 'podcast' || cat.type == 'episode') {
        cat.entities = cat.entities.map((entity: any) => {
          const localLibraryItem = localLibraryItemsById.get(entity.id)
          if (localLibraryItem) {
            entity.localLibraryItem = localLibraryItem
          }
          return entity
        })
      }
      return cat
    })

    const localShelves = localCategories.filter((cat) => cat.type === currentLibraryMediaType.value && !cat.localOnly)
    shelves.value.push(...localShelves)
    console.log('[categories] Server shelves set', shelves.value.length, lastServerFetch.value)
  }

  isLoading.value = false
}

function libraryChanged() {
  if (currentLibraryId.value) {
    console.log(`[categories] libraryChanged so fetching categories`)
    void fetchCategories()
  }
}

onMounted(async () => {
  if (route.query.error) {
    toast.error(route.query.error as string)
  }

  eventBus.on('library-changed', libraryChanged)
  await globalsStore.loadLocalMediaProgress()
  console.log(`[categories] mounted so fetching categories`)
  void fetchCategories()
})

onBeforeUnmount(() => {
  eventBus.off('library-changed', libraryChanged)
})
</script>
