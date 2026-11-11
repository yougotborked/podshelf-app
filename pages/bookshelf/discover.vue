<template>
  <div class="w-full h-full flex flex-col overflow-hidden relative">
    <!-- Search bar -->
    <div class="px-4 pt-4 pb-2 shrink-0">
      <div class="relative">
        <span class="material-symbols absolute left-3 top-1/2 -translate-y-1/2 text-md-on-surface-variant text-xl pointer-events-none">search</span>
        <input v-model="searchQuery" type="search" :placeholder="strings.MessageDiscoverSearch" class="w-full bg-md-surface-3 text-md-on-surface rounded-md-full pl-10 pr-10 py-2.5 text-sm outline-none focus:ring-2 focus:ring-md-primary/50" @input="onSearchInput" />
        <button v-if="searchQuery" class="absolute right-3 top-1/2 -translate-y-1/2" @click="clearSearch">
          <span class="material-symbols text-md-on-surface-variant text-xl">close</span>
        </button>
      </div>
    </div>

    <!-- Genre chips -->
    <div class="px-3 pb-2 shrink-0 flex gap-2 overflow-x-auto no-scrollbar">
      <button v-for="genre in genres" :key="genre.label" class="shrink-0 px-3 py-1 rounded-md-full text-md-label-m border transition-colors" :class="activeGenre === genre.label ? 'bg-md-primary text-md-on-primary border-md-primary' : 'bg-transparent text-md-on-surface-variant border-md-outline-variant'" @click="selectGenre(genre)">
        {{ genre.label }}
      </button>
    </div>

    <!-- Search results -->
    <div v-if="isSearching" class="flex-1 overflow-y-auto">
      <div v-if="searchLoading" class="py-12 flex justify-center">
        <widgets-loading-spinner />
      </div>
      <p v-else-if="!searchResults.length && searchQuery" class="text-center text-md-on-surface-variant py-8 text-sm">
        {{ strings.MessageNoPodcastsFound }}
      </p>
      <template v-else>
        <div v-for="podcast in searchResults" :key="podcast.feedUrl" class="border-b border-md-outline-variant/20" @click="onCardClick(podcast)">
          <podcast-result-card :podcast="podcast" :in-library="isInLibrary(podcast.feedUrl)" :show-add="userIsAdminOrUp" @add="startAddFlow(podcast)" />
        </div>
      </template>
    </div>

    <!-- Discovery: trending -->
    <div v-else class="flex-1 overflow-y-auto">
      <div class="px-4 pt-2 pb-1 flex items-center justify-between shrink-0">
        <p class="text-md-label-l text-md-on-surface font-semibold">{{ strings.LabelTrending }}</p>
      </div>

      <div v-if="trendingLoading" class="py-8 flex justify-center">
        <widgets-loading-spinner />
      </div>
      <div v-else-if="trendingError" class="px-4 py-4">
        <p class="text-sm text-md-on-surface-variant">{{ trendingError }}</p>
        <button class="mt-3 px-4 py-2 rounded-md-full bg-md-primary-container text-md-on-primary-container text-sm" @click="loadTrending(activeCategory)">
          {{ strings.ButtonRetry || 'Retry' }}
        </button>
      </div>
      <p v-else-if="!trendingResults.length" class="px-4 py-4 text-sm text-md-on-surface-variant">No trending podcasts found.</p>
      <template v-else>
        <div v-for="feed in rankedTrending" :key="feed.id" class="border-b border-md-outline-variant/20" @click="onCardClick(toPodcastCard(feed))">
          <podcast-result-card :podcast="toPodcastCard(feed)" :in-library="isInLibrary(feed.feedUrl)" :show-add="userIsAdminOrUp" @add.stop="startAddFlow(toPodcastCard(feed))" />
          <!-- Why this one is near the top. Only shown when there is a profile behind it. -->
          <p v-if="feed.match?.reasons?.length" class="px-4 pb-2 -mt-1 text-xs text-md-primary">{{ feed.match.reasons[0] }}</p>
        </div>
      </template>
    </div>

    <!-- Podcast detail preview overlay (all users) -->
    <div v-if="showPreview && previewPodcast" class="absolute inset-0 bg-md-surface-0 z-50 flex flex-col overflow-hidden">
      <div class="flex items-center px-2 h-16 shrink-0 border-b border-md-outline-variant/20">
        <button class="flex items-center" @click="closePreview">
          <span class="material-symbols text-2xl text-md-on-surface-variant">arrow_back</span>
          <p class="pl-2 uppercase text-sm font-semibold text-md-on-surface-variant leading-4 pb-px">{{ strings.ButtonBack }}</p>
        </button>
      </div>

      <!-- Loading state -->
      <div v-if="previewLoading" class="flex-1 flex items-center justify-center">
        <ui-loading-indicator />
      </div>

      <div v-else class="flex-1 overflow-y-auto">
        <!-- Header: artwork + meta -->
        <div class="flex gap-4 px-4 py-5">
          <div class="h-24 w-24 shrink-0 rounded-md-md overflow-hidden bg-md-surface-3">
            <img v-if="previewPodcast.cover" :src="previewPodcast.cover" class="h-full w-full object-cover" />
            <div v-else class="h-full w-full flex items-center justify-center">
              <span class="material-symbols text-md-on-surface-variant text-4xl">podcasts</span>
            </div>
          </div>
          <div class="flex-1 min-w-0">
            <p class="text-md-title-m font-semibold text-md-on-surface leading-snug">{{ previewPodcast.title }}</p>
            <p class="text-sm text-md-on-surface-variant mt-1">{{ previewPodcast.artistName }}</p>
            <p v-if="previewPodcast.genres?.length" class="text-xs text-md-on-surface-variant/70 mt-1">{{ previewPodcast.genres.slice(0, 3).join(' · ') }}</p>
            <!-- The thing a genre list cannot say: a four-hour show is a different proposition
                 from a twenty-minute one, whatever it is about. -->
            <p v-if="previewLengthFit" class="text-xs text-md-on-surface-variant mt-1">{{ previewLengthFit }}</p>
            <div class="flex items-center gap-2 mt-2 flex-wrap">
              <span v-if="isInLibrary(previewPodcast.feedUrl)" class="text-xxs px-2 py-0.5 rounded-md-full bg-md-secondary-container text-md-on-secondary-container font-medium">{{ strings.LabelInLibrary }}</span>
              <span v-if="previewEpisodes.length" class="text-xs text-md-on-surface-variant">{{ previewEpisodes.length }} ep</span>
            </div>
          </div>
        </div>

        <!-- Add to Library button (admins only) -->
        <div v-if="userIsAdminOrUp" class="px-4 pb-3">
          <button class="w-full py-2.5 rounded-md-full bg-md-primary text-md-on-primary text-md-label-l font-semibold active:opacity-75 transition-opacity" @click="startAddFlowFromPreview">{{ strings.ButtonAdd }} to Library</button>
        </div>

        <!-- Description. Clamped until asked for: show notes run to many paragraphs, but a
             clamp with no way past it means the detail is simply unreachable. -->
        <div v-if="previewDescription" class="px-4 pb-4">
          <p class="text-md-label-s text-md-on-surface-variant uppercase tracking-wide mb-1">{{ strings.LabelDescription }}</p>
          <p class="text-sm text-md-on-surface leading-relaxed" :class="previewExpanded ? '' : 'line-clamp-5'" v-html="previewDescription" />
          <button class="mt-1.5 text-sm text-md-primary font-medium active:opacity-60" @click="previewExpanded = !previewExpanded">
            {{ previewExpanded ? strings.ButtonReadLess : strings.ButtonReadMore }}
          </button>
        </div>

        <!-- Nothing came back. Said plainly, with a way to try again, instead of a screen that
             looks like a podcast that simply has no description. -->
        <div v-else-if="previewFailed" class="px-4 pb-4 flex flex-col items-start gap-2">
          <p class="text-sm text-md-on-surface-variant">{{ strings.MessagePodcastDetailsUnavailable }}</p>
          <button class="px-4 py-2 rounded-md-full bg-md-surface-3 text-md-on-surface text-md-label-l active:opacity-60" @click="loadPreviewDetails">
            {{ strings.ButtonTryAgain }}
          </button>
        </div>

        <!-- Episodes -->
        <div v-if="previewEpisodes.length" class="pb-4">
          <p class="px-4 text-md-label-s text-md-on-surface-variant uppercase tracking-wide mb-1">{{ strings.LabelEpisodes }}</p>
          <div v-for="ep in previewEpisodes" :key="ep.enclosureUrl || ep.title" class="px-4 py-3 border-b border-md-outline-variant/20">
            <p class="text-sm font-medium text-md-on-surface leading-snug">{{ ep.title }}</p>
            <div class="flex items-center gap-3 mt-1">
              <p v-if="ep.publishedAt" class="text-xs text-md-on-surface-variant">{{ $dateDistanceFromNow(ep.publishedAt) }}</p>
              <p v-if="ep.duration" class="text-xs text-md-on-surface-variant">{{ $elapsedPretty(ep.duration) }}</p>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add flow overlay -->
    <div v-if="showAddFlow" class="absolute inset-0 bg-md-surface z-50 flex flex-col overflow-hidden">
      <div class="flex items-center px-2 h-16 shrink-0 border-b border-md-outline-variant/20">
        <button class="flex items-center" @click="cancelAddFlow">
          <span class="material-symbols text-2xl text-md-on-surface-variant">arrow_back</span>
          <p class="pl-2 uppercase text-sm font-semibold text-md-on-surface-variant leading-4 pb-px">{{ strings.ButtonBack }}</p>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto py-2">
        <forms-new-podcast-form v-if="selectedPodcastFeed" :podcast-data="selectedPodcast" :podcast-feed-data="selectedPodcastFeed" v-model:processing="addProcessing" />
      </div>
    </div>

    <!-- Processing overlay -->
    <div v-if="addProcessing" class="absolute inset-0 bg-black/25 z-60 flex items-center justify-center pointer-events-auto">
      <ui-loading-indicator />
    </div>
  </div>
</template>

<script setup lang="ts">
import type { HttpError, LibraryItem, PodcastCandidate } from '~/types'
import type { DiscoverFeed, DiscoveryFailure } from '~/composables/usePodcastDiscovery'
import { buildListeningProfile, describeLengthFit, rankCandidates } from '~/composables/useListeningProfile'
import { indexLibraryByFeed, normalizeFeedUrl, parsePodcastFeed, type ParsedFeedEpisode } from '~/composables/usePodcastFeedPreview'
import { fetchExternalText } from '~/composables/useNativeHttp'

const router = useRouter()
const strings = useStrings()
const nativeHttp = useNativeHttp()
const toast = useToast()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const globalsStore = useGlobalsStore()
const eventBus = useEventBus()
const { fetchTrending } = usePodcastDiscovery()

// ── State ─────────────────────────────────────────────────────────────────────
const searchQuery = ref('')
const searchResults = ref<PodcastCandidate[]>([])
const searchLoading = ref(false)
const searchDebounce = ref<ReturnType<typeof setTimeout> | null>(null)

const trendingResults = ref<DiscoverFeed[]>([])
const trendingLoading = ref(false)
const trendingError = ref<string | null>(null)
const activeCategory = ref<string | undefined>(undefined)

const TRENDING_FAILURE_MESSAGES: Record<DiscoveryFailure, string> = {
  rejected: 'Could not load the podcast charts. Discovery may need updating.',
  'rate-limited': 'Too many requests. Try again in a minute.',
  unreachable: 'Could not reach the podcast charts. Check your connection.',
  'server-error': 'The podcast charts are having trouble. Try again later.'
}
const activeGenre = ref<string | null>(null)

const libraryItemIdByFeed = ref<Map<string, string>>(new Map())
/** Genres per library item, taken from the same request that collects the feed urls. */
const libraryGenresById = ref<Record<string, { genres: string[] }>>({})

const showAddFlow = ref(false)
const selectedPodcast = ref<PodcastCandidate | null>(null)
const selectedPodcastFeed = ref<Record<string, unknown> | null>(null)
const addProcessing = ref(false)

/**
 * What this listener's finished episodes look like, used to order the charts.
 *
 * The charts are the same for everyone; this is the only part of discovery that knows anything
 * about the person. It reads progress the user store already holds, so it costs no request, and
 * it stays silent until there is enough finished listening to mean something.
 */
const listeningProfile = computed(() => buildListeningProfile(((userStore.user?.mediaProgress as Record<string, unknown>[] | null | undefined) || []) as never[], libraryGenresById.value))

const rankedTrending = computed(() => rankCandidates(trendingResults.value, listeningProfile.value))

const previewLengthFit = computed(() =>
  describeLengthFit(
    previewEpisodes.value.map((ep) => Number(ep.duration)),
    listeningProfile.value
  )
)

const showPreview = ref(false)
const previewPodcast = ref<PodcastCandidate | null>(null)
const previewLoading = ref(false)
// The feed fetch used to fail silently, leaving the title and artist with no description, no
// episodes and no hint that anything had been attempted
const previewFailed = ref(false)
const previewExpanded = ref(false)
const previewDescription = ref('')
const previewEpisodes = ref<ParsedFeedEpisode[]>([])

// ── Computed ──────────────────────────────────────────────────────────────────
const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const userIsAdminOrUp = computed(() => userStore.getIsAdminOrUp)
const isSearching = computed(() => searchQuery.value.trim().length > 0)

// ── Genres ────────────────────────────────────────────────────────────────────
const genres = [
  { label: 'All', cat: undefined },
  { label: 'Comedy', cat: 'Comedy' },
  { label: 'True Crime', cat: 'True Crime' },
  { label: 'Technology', cat: 'Technology' },
  { label: 'News', cat: 'News' },
  { label: 'Science', cat: 'Science' },
  { label: 'History', cat: 'History' },
  { label: 'Sports', cat: 'Sports' },
  { label: 'Business', cat: 'Business' }
]

// ── In-library ────────────────────────────────────────────────────────────────
function libraryItemIdFor(feedUrl?: string): string | undefined {
  const key = normalizeFeedUrl(feedUrl)
  return key ? libraryItemIdByFeed.value.get(key) : undefined
}

function isInLibrary(feedUrl?: string) {
  return !!libraryItemIdFor(feedUrl)
}

async function loadLibraryFeedUrls() {
  if (!currentLibraryId.value) return
  try {
    const res = (await nativeHttp.get(`/api/libraries/${currentLibraryId.value}/items?minified=1&limit=0`, { connectTimeout: 10000 })) as { results?: LibraryItem[]; items?: LibraryItem[] } | null
    const items: LibraryItem[] = res?.results ?? res?.items ?? []
    // Keyed by normalized feed URL. Apple and a library routinely store the same feed with a
    // different scheme, a www prefix or tracking parameters, and comparing the raw strings made
    // Discover offer podcasts the user already had.
    libraryItemIdByFeed.value = indexLibraryByFeed(
      items,
      (item) => item.media.metadata.feedUrl ?? undefined,
      (item) => item.id
    )
    const genres: Record<string, { genres: string[] }> = {}
    for (const item of items) {
      if (item.id) genres[item.id] = { genres: item.media.metadata.genres ?? [] }
    }
    libraryGenresById.value = genres
  } catch {
    // non-fatal
  }
}

// ── Trending ──────────────────────────────────────────────────────────────────
async function loadTrending(category?: string) {
  trendingLoading.value = true
  trendingError.value = null
  activeCategory.value = category

  const result = await fetchTrending({ max: 15, category })
  if (result.ok) {
    trendingResults.value = result.feeds
  } else {
    // Previously every failure returned an empty array, so a rejected key, a rate limit and no
    // signal at all were indistinguishable from "nothing is trending" - which is how this sat
    // broken without anything to go on.
    trendingResults.value = []
    trendingError.value = TRENDING_FAILURE_MESSAGES[result.reason]
  }
  trendingLoading.value = false
}

function selectGenre(genre: { label: string; cat?: string }) {
  const newGenre = genre.label === 'All' ? null : genre.label
  if (activeGenre.value === newGenre) {
    activeGenre.value = null
    void loadTrending()
    return
  }
  activeGenre.value = newGenre
  void loadTrending(genre.cat)
}

// ── Search ────────────────────────────────────────────────────────────────────
function onSearchInput() {
  if (searchDebounce.value) clearTimeout(searchDebounce.value)
  if (!searchQuery.value.trim()) {
    searchResults.value = []
    return
  }
  searchDebounce.value = setTimeout(
    asVoidHandler(() => doSearch(searchQuery.value.trim())),
    400
  )
}

async function doSearch(term: string) {
  searchLoading.value = true
  try {
    const res = (await nativeHttp.get(`/api/search/podcast?term=${encodeURIComponent(term)}`, { connectTimeout: 10000 })) as PodcastCandidate[]
    searchResults.value = Array.isArray(res) ? res : []
  } catch {
    searchResults.value = []
  }
  searchLoading.value = false
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  if (searchDebounce.value) clearTimeout(searchDebounce.value)
}

// ── Shape adapter: discovered feed → card shape ───────────────────────────────
function toPodcastCard(feed: DiscoverFeed) {
  return {
    feedUrl: feed.feedUrl,
    title: feed.title,
    artistName: feed.author,
    cover: feed.artwork,
    genres: feed.genres,
    trackCount: feed.episodeCount || null,
    // Apple's chart feed does not carry an explicit flag, and guessing one would be worse than
    // leaving it off: the card simply does not show the badge.
    explicit: false
  }
}

// ── Add flow ──────────────────────────────────────────────────────────────────
async function startAddFlow(podcast: PodcastCandidate) {
  if (!podcast.feedUrl) {
    toast.error('Podcast has no feed URL')
    return
  }
  addProcessing.value = true
  try {
    const payload = (await nativeHttp.post('/api/podcasts/feed', { rssFeed: podcast.feedUrl }, { connectTimeout: 10000 })) as { podcast?: Record<string, unknown> } | null
    if (!payload) {
      toast.error('Failed to get podcast feed')
      return
    }
    selectedPodcast.value = podcast
    selectedPodcastFeed.value = payload.podcast ?? null
    showAddFlow.value = true
  } catch (err: unknown) {
    console.error('[Discover] feed check failed', err)
    // Adding genuinely does need admin - it creates a library item on the server - so a 403
    // here is a real answer rather than a fault, and saying "failed to get podcast feed" sends
    // the user looking at the podcast instead of at their account.
    const httpError = err as HttpError | null
    const status = httpError?.status ?? httpError?.response?.status
    toast.error(status === 403 ? 'Only a server admin can add podcasts' : 'Failed to get podcast feed')
  } finally {
    addProcessing.value = false
  }
}

function cancelAddFlow() {
  showAddFlow.value = false
  selectedPodcast.value = null
  selectedPodcastFeed.value = null
}

async function onCardClick(podcast: PodcastCandidate) {
  // Already in the library: open it rather than offering a preview and an Add button for
  // something that is one tap away in full.
  const existingId = libraryItemIdFor(podcast.feedUrl)
  if (existingId) {
    void router.push(`/item/${existingId}`)
    return
  }

  previewPodcast.value = podcast
  showPreview.value = true
  await loadPreviewDetails()
}

/**
 * Fetches the podcast's own feed for the description and episode list.
 *
 * The chart and search APIs give a title, an artist and artwork and nothing else, so everything
 * worth reading here comes from this one request - which made swallowing its failure particularly
 * bad: the screen looked like a podcast with no description rather than one that failed to load.
 */
async function loadPreviewDetails() {
  const podcast = previewPodcast.value
  previewDescription.value = ''
  previewEpisodes.value = []
  previewExpanded.value = false
  previewFailed.value = false

  if (!podcast?.feedUrl) {
    previewFailed.value = true
    return
  }

  previewLoading.value = true
  try {
    // Straight from the podcast's own feed, not through the server.
    //
    // This used to POST /api/podcasts/feed, which Audiobookshelf restricts to admins - so for
    // every non-admin account, every podcast in Discover reported that its feed could not be
    // loaded, naming the feed for what was really a permission. An RSS feed is public, and the
    // native HTTP client is not bound by CORS, so there is nothing to ask anyone for.
    const raw = await fetchExternalText(podcast.feedUrl, { connectTimeout: 10000 })
    const parsed = parsePodcastFeed(raw)
    previewDescription.value = parsed.description
    previewEpisodes.value = parsed.episodes
    // A feed that parsed but carries neither is still nothing to read, and saying so beats a
    // screen that looks deliberately empty
    previewFailed.value = !previewDescription.value && !previewEpisodes.value.length
  } catch (error) {
    console.error('[discover] Failed to load podcast feed', error)
    previewFailed.value = true
  } finally {
    previewLoading.value = false
  }
}

function closePreview() {
  showPreview.value = false
  previewPodcast.value = null
  previewDescription.value = ''
  previewEpisodes.value = []
}

async function startAddFlowFromPreview() {
  const podcast = previewPodcast.value
  closePreview()
  if (podcast) await startAddFlow(podcast)
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────
/**
 * The preview and the add flow cover the page without being routes, so back has to be told they
 * are there. Without this it found nothing covering the page, went back in history, and left the
 * Discover tab - which looks like back switching tabs rather than closing the podcast.
 */
const hasOverlay = computed(() => showPreview.value || showAddFlow.value)

watch(hasOverlay, (open) => {
  globalsStore.pageOverlayOpen = open
})

/** Peel one layer: the add flow sits over the preview, so it goes first. */
function onCloseOverlay() {
  if (showAddFlow.value) cancelAddFlow()
  else if (showPreview.value) closePreview()
}

onMounted(() => {
  eventBus.on('close-page-overlay', onCloseOverlay)
  void loadLibraryFeedUrls()
  void loadTrending()
})

onBeforeUnmount(() => {
  eventBus.off('close-page-overlay', onCloseOverlay)
  // Leaving the page with an overlay open would otherwise strand the flag set, and back would
  // keep trying to close something that is no longer on screen
  globalsStore.pageOverlayOpen = false
})
</script>
