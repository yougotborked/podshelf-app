<template>
  <div>
    <div id="bookshelf" class="w-full h-full p-4 overflow-y-auto">
      <div class="flex flex-wrap justify-center">
        <template v-for="author in authors" :key="author.id">
          <cards-author-card :author="author" :width="cardWidth" :height="cardHeight" class="p-2" />
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { AuthorEntity } from '~/types'
import { buildAuthorsFromItems } from '~/composables/useLocalAuthors'
const eventBus = useEventBus()
const socket = useSocket()
const nativeHttp = useNativeHttp()
const db = useDb()
const localStore = useLocalStore()
const router = useRouter()

const librariesStore = useLibrariesStore()
const appStore = useAppStore()

const loading = ref(true)
const authors = ref<AuthorEntity[]>([])
const loadedLibraryId = ref<string | null>(null)
const cardWidth = ref(200)

const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const networkConnected = computed(() => !appStore.isOffline)
const cardHeight = computed(() => cardWidth.value * 1.25)

async function buildLocalAuthors() {
  const localItems = await db.getLocalLibraryItems('book')
  return buildAuthorsFromItems(localItems, currentLibraryId.value)
}

async function init() {
  cardWidth.value = (window.innerWidth - 64) / 2
  if (!currentLibraryId.value) {
    return
  }
  loadedLibraryId.value = currentLibraryId.value
  let authorList: AuthorEntity[] = []

  if (networkConnected.value) {
    authorList = await nativeHttp
      .get(`/api/libraries/${currentLibraryId.value}/authors`)
      .then((response) => (response as { authors: AuthorEntity[] }).authors)
      .catch((error: unknown) => {
        console.error('Failed to load authors', error)
        return []
      })

    if (authorList.length) {
      await localStore.setCachedAuthors(currentLibraryId.value, authorList)
    }
  }

  if (!authorList.length) {
    authorList = ((await localStore.getCachedAuthors(currentLibraryId.value)) || []) as AuthorEntity[]
  }

  if (!authorList.length) {
    authorList = await buildLocalAuthors()
  }

  authors.value = authorList
  console.log('Loaded authors', authors.value)
  eventBus.emit('bookshelf-total-entities', authors.value.length)
  loading.value = false
}

function authorAdded(author: AuthorEntity) {
  if (!authors.value.some((au) => au.id === author.id)) {
    authors.value.push(author)
    eventBus.emit('bookshelf-total-entities', authors.value.length)
  }
}

function authorUpdated(author: AuthorEntity) {
  authors.value = authors.value.map((au) => {
    if (au.id === author.id) {
      return author
    }
    return au
  })
}

function authorRemoved(author: AuthorEntity) {
  authors.value = authors.value.filter((au) => au.id !== author.id)
  eventBus.emit('bookshelf-total-entities', authors.value.length)
}

function libraryChanged(libraryId: string) {
  if (libraryId !== loadedLibraryId.value) {
    if (librariesStore.getCurrentLibraryMediaType === 'book') {
      void init()
    } else {
      void router.replace('/bookshelf')
    }
  }
}

onMounted(() => {
  void init()
  socket.$on('author_added', authorAdded)
  socket.$on('author_updated', authorUpdated)
  socket.$on('author_removed', authorRemoved)
  eventBus.on('library-changed', libraryChanged)
})

onBeforeUnmount(() => {
  socket.$off('author_added', authorAdded)
  socket.$off('author_updated', authorUpdated)
  socket.$off('author_removed', authorRemoved)
  eventBus.off('library-changed', libraryChanged)
})
</script>
