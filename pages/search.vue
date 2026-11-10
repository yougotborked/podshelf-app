<template>
  <div class="w-full h-full">
    <div class="px-4 py-6">
      <ui-text-input ref="input" v-model="search" @input="updateSearch" borderless :placeholder="$strings.ButtonSearch" bg="white/10" rounded="md" prepend-icon="search" text-size="base" clearable class="w-full text-lg" />
    </div>
    <div class="w-full overflow-x-hidden overflow-y-auto search-content px-4" @click.stop>
      <div v-show="isFetching" class="w-full py-8 flex justify-center">
        <p class="text-lg text-md-on-surface-variant">{{ $strings.MessageFetching }}</p>
      </div>
      <div v-if="!isFetching && lastSearch && !totalResults" class="w-full py-8 flex justify-center">
        <p class="text-lg text-md-on-surface-variant">{{ $strings.MessageNoItemsFound }}</p>
      </div>
      <p v-if="bookResults.length" class="font-semibold text-sm mb-1">{{ $strings.LabelBooks }}</p>
      <template v-for="item in bookResults" :key="item.libraryItem.id">
        <div class="w-full h-16 py-1">
          <nuxt-link :to="`/item/${item.libraryItem.id}`">
            <cards-item-search-card :library-item="item.libraryItem" :search="lastSearch" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="podcastResults.length" class="uppercase text-xs text-md-on-surface-variant my-1 px-1 font-semibold">{{ $strings.LabelPodcasts }}</p>
      <template v-for="item in podcastResults" :key="item.libraryItem.id">
        <div class="text-md-on-surface select-none relative py-1">
          <nuxt-link :to="`/item/${item.libraryItem.id}`">
            <cards-item-search-card :library-item="item.libraryItem" :search="lastSearch" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="episodeResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.HeaderEpisodes }}</p>
      <template v-for="item in episodeResults" :key="item.libraryItem.recentEpisode.id">
        <div class="text-md-on-surface select-none relative py-1">
          <nuxt-link :to="`/item/${item.libraryItem.id}/${item.libraryItem.recentEpisode.id}`">
            <cards-episode-search-card :episode="item.libraryItem.recentEpisode" :library-item="item.libraryItem" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="seriesResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelSeries }}</p>
      <template v-for="seriesResult in seriesResults" :key="seriesResult.series.id">
        <div class="w-full h-16 py-1">
          <nuxt-link :to="`/bookshelf/series/${seriesResult.series.id}`">
            <cards-series-search-card :series="seriesResult.series" :book-items="seriesResult.books" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="authorResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelAuthors }}</p>
      <template v-for="authorResult in authorResults" :key="authorResult.id">
        <div class="w-full h-14 py-1">
          <nuxt-link :to="`/bookshelf/library?filter=authors.${$encode(authorResult.id)}`">
            <cards-author-search-card :author="authorResult" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="narratorResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelNarrators }}</p>
      <template v-for="narrator in narratorResults" :key="narrator.name">
        <div class="w-full h-14 py-1">
          <nuxt-link :to="`/bookshelf/library?filter=narrators.${$encode(narrator.name)}`">
            <cards-narrator-search-card :narrator="narrator.name" />
          </nuxt-link>
        </div>
      </template>

      <p v-if="tagResults.length" class="font-semibold text-sm mb-1 mt-2">{{ $strings.LabelTags }}</p>
      <template v-for="tag in tagResults" :key="tag.name">
        <div class="w-full h-14 py-1">
          <nuxt-link :to="`/bookshelf/library?filter=tags.${$encode(tag.name)}`">
            <cards-tag-search-card :tag="tag.name" />
          </nuxt-link>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryItem } from '~/types'
import { useLibrariesStore } from '~/stores/libraries'
import { useGlobalsStore } from '~/stores/globals'

const librariesStore = useLibrariesStore()
const globalsStore = useGlobalsStore()
const appStore = useAppStore()
const db = useDb()
const nativeHttp = useNativeHttp()

const search = ref<string | null>(null)
const searchTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const lastSearch = ref<string | null>(null)
const isFetching = ref(false)
const bookResults = ref<Array<{ libraryItem: { id: string; [key: string]: unknown }; [key: string]: unknown }>>([])
const podcastResults = ref<Array<{ libraryItem: { id: string; [key: string]: unknown }; [key: string]: unknown }>>([])
const episodeResults = ref<Array<{ libraryItem: { id: string; recentEpisode: { id: string; [key: string]: unknown }; [key: string]: unknown }; [key: string]: unknown }>>([])
const seriesResults = ref<Array<{ series: { id: string; [key: string]: unknown }; books?: Record<string, unknown>[]; [key: string]: unknown }>>([])
const authorResults = ref<Array<{ id: string; name?: string; [key: string]: unknown }>>([])
const narratorResults = ref<Array<{ name: string; [key: string]: unknown }>>([])
const tagResults = ref<Array<{ name: string; [key: string]: unknown }>>([])

const inputRef = ref<{ focus: () => void } | null>(null)

const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const totalResults = computed(
  () =>
    bookResults.value.length +
    seriesResults.value.length +
    authorResults.value.length +
    podcastResults.value.length +
    episodeResults.value.length +
    narratorResults.value.length +
    tagResults.value.length
)

async function runSearch(value: string | null) {
  if (isFetching.value && lastSearch.value === value) return

  lastSearch.value = value
  globalsStore.lastSearch = value

  if (!lastSearch.value) {
    bookResults.value = []
    podcastResults.value = []
    episodeResults.value = []
    seriesResults.value = []
    authorResults.value = []
    narratorResults.value = []
    tagResults.value = []
    return
  }
  isFetching.value = true

  // Offline the server search can only time out, so go straight to what is on the device.
  const results = appStore.isOffline
    ? await searchDownloaded(value)
    : ((await nativeHttp.get(`/api/libraries/${currentLibraryId.value}/search?q=${value}`, { connectTimeout: 10000 }).catch((error: Error) => {
        console.error('Search error', error)
        return null
      })) as Record<string, Record<string, unknown>[]> | null) || (await searchDownloaded(value))
  if (value !== lastSearch.value) {
    console.log(`runSearch: New search was made for ${lastSearch.value} - results are from ${value}`)
    isFetching.value = false
    return
  }
  console.log('RESULTS', results)

  isFetching.value = false

  bookResults.value = (results?.book || []) as typeof bookResults.value
  podcastResults.value = (results?.podcast || []) as typeof podcastResults.value
  episodeResults.value = (results?.episodes || []) as typeof episodeResults.value
  seriesResults.value = (results?.series || []) as typeof seriesResults.value
  authorResults.value = (results?.authors || []) as typeof authorResults.value
  narratorResults.value = (results?.narrators || []) as typeof narratorResults.value
  tagResults.value = (results?.tags || []) as typeof tagResults.value
}

/**
 * Search the items already downloaded to the device. Used whenever the server is out of
 * reach so that search still finds the content you can actually play.
 */
async function searchDownloaded(value: string | null): Promise<Record<string, Record<string, unknown>[]>> {
  const query = (value || '').trim().toLowerCase()
  const empty = { book: [], podcast: [], episodes: [], series: [], authors: [], narrators: [], tags: [] }
  if (!query) return empty

  const localItems = [
    ...(await db.getLocalLibraryItems('book').catch(() => [] as LibraryItem[])),
    ...(await db.getLocalLibraryItems('podcast').catch(() => [] as LibraryItem[]))
  ]

  const books: Record<string, unknown>[] = []
  const podcasts: Record<string, unknown>[] = []
  const episodes: Record<string, unknown>[] = []

  for (const li of localItems) {
    const metadata = li.media?.metadata || {}
    const haystack = [metadata.title, metadata.authorName, metadata.author, metadata.narratorName, metadata.seriesName]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()

    if (haystack.includes(query)) {
      if (li.mediaType === 'podcast') podcasts.push({ libraryItem: li })
      else books.push({ libraryItem: li })
    }

    for (const ep of li.media.episodes || []) {
      if (`${ep.title || ''}`.toLowerCase().includes(query)) {
        episodes.push({ libraryItem: { ...li, recentEpisode: ep } })
      }
    }
  }

  return { ...empty, book: books, podcast: podcasts, episodes }
}

function updateSearch(val: string) {
  if (searchTimeout.value) clearTimeout(searchTimeout.value)
  searchTimeout.value = setTimeout(() => {
    void runSearch(val)
  }, 500)
}

function setFocus() {
  setTimeout(() => {
    if (inputRef.value) {
      inputRef.value.focus()
    }
  }, 100)
}

onMounted(() => {
  if (globalsStore.lastSearch) {
    search.value = globalsStore.lastSearch
    void runSearch(search.value)
  } else {
    void nextTick(setFocus)
  }
})
</script>

<style>
.search-content {
  height: calc(100% - 108px);
  max-height: calc(100% - 108px);
}
</style>
