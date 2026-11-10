import { CapacitorHttp } from '@capacitor/core'

/**
 * Podcast discovery, from Apple's public charts.
 *
 * This replaced Podcast Index, which needed an API key *and* a shared secret to sign every
 * request. Both had to be compiled into the client bundle, and anything in the bundle is
 * extractable from a published APK - obfuscation only buys time, because the app has to
 * reconstruct the secret at runtime and so ships the means to do it. Apple's chart feeds need no
 * credentials at all, so there is nothing left to leak.
 *
 * It is also the provider the Audiobookshelf server already uses for /api/search/podcast, so
 * search and discovery now agree about what a podcast is instead of coming from two indexes.
 *
 * Two requests, because the chart feed does not carry RSS URLs and adding a podcast needs one:
 *   1. the chart   -> ranked ids
 *   2. one lookup  -> feedUrl and artwork for all of them at once (ids are comma-separated)
 */

const CHARTS_BASE = 'https://itunes.apple.com'
const LOOKUP_URL = 'https://itunes.apple.com/lookup'

export interface DiscoverFeed {
  id: string
  title: string
  author: string
  artwork: string
  feedUrl: string
  genres: string[]
  episodeCount: number
}

export type DiscoveryFailure = 'rate-limited' | 'unreachable' | 'server-error' | 'rejected'

export type DiscoverResult = { ok: true; feeds: DiscoverFeed[] } | { ok: false; reason: DiscoveryFailure }

/**
 * Apple's genre ids for the categories the discover screen offers.
 *
 * Every one of these was checked against the live chart feed; an id Apple does not recognise
 * returns an empty feed rather than an error, which would show as a silently empty tab.
 */
export const APPLE_GENRE_IDS: Record<string, number> = {
  Comedy: 1303,
  'True Crime': 1488,
  Technology: 1318,
  News: 1489,
  Science: 1533,
  History: 1487,
  Sports: 1545,
  Business: 1321
}

/** Why a request failed, in terms a person can act on. Pure, so it can be tested. */
export function describeDiscoveryFailure(status: number): DiscoveryFailure {
  if (status === 429) return 'rate-limited'
  if (status >= 500) return 'server-error'
  return 'rejected'
}

/**
 * The chart URL for a category.
 *
 * `country` is a storefront: charts are per-country, and an unknown one 404s, so it falls back
 * to the one Apple always has rather than letting a stray locale empty the screen.
 */
export function appleChartUrl(options: { limit?: number; category?: string; country?: string } = {}): string {
  const limit = Math.min(Math.max(options.limit ?? 15, 1), 200)
  const country = /^[a-z]{2}$/i.test(options.country ?? '') ? (options.country as string).toLowerCase() : 'us'
  const genreId = options.category ? APPLE_GENRE_IDS[options.category] : undefined
  const genre = genreId ? `genre=${genreId}/` : ''
  return `${CHARTS_BASE}/${country}/rss/toppodcasts/limit=${limit}/${genre}json`
}

type ChartEntry = { id: string; title: string; author: string; artwork: string }

// The parts of Apple's chart and lookup JSON this reads. Everything is optional: the shape is
// Apple's, it has changed before, and a missing field must read as absent rather than throw.
interface AppleChartRaw {
  id?: { attributes?: Record<string, string | undefined> }
  'im:name'?: { label?: string }
  'im:artist'?: { label?: string }
  'im:image'?: Array<{ label?: string }>
}

interface AppleLookupRaw {
  collectionId?: number | string | null
  feedUrl?: string
  collectionName?: string
  artistName?: string
  artworkUrl600?: string
  artworkUrl100?: string
  genres?: string[]
  trackCount?: number
}

/**
 * Pulls the ranked entries out of a chart feed.
 *
 * Apple's JSON is the old iTunes RSS shape - everything wrapped in `label`, and `entry` is a bare
 * object rather than an array when exactly one result comes back, which is the kind of thing that
 * throws in production and never in testing.
 */
export function parseChartEntries(payload: unknown): ChartEntry[] {
  const feed = (payload as { feed?: { entry?: unknown } } | null | undefined)?.feed
  if (!feed?.entry) return []

  const entries = Array.isArray(feed.entry) ? feed.entry : [feed.entry]

  return entries
    .map((raw) => {
      const e = (raw ?? {}) as AppleChartRaw
      const id = e.id?.attributes?.['im:id']
      if (!id) return null
      const images = Array.isArray(e['im:image']) ? e['im:image'] : []
      return {
        id: String(id),
        title: e['im:name']?.label ?? '',
        author: e['im:artist']?.label ?? '',
        // Last is the largest Apple offers here (170px); the lookup below supplies a better one.
        artwork: images.length ? images[images.length - 1]?.label ?? '' : ''
      }
    })
    .filter((e): e is ChartEntry => e !== null)
}

/**
 * Joins lookup details onto chart entries, keeping chart order.
 *
 * Anything without a feedUrl is dropped: the only thing to do with a discovered podcast is add
 * it, and that needs an RSS URL. A card that cannot be actioned is worse than one fewer card.
 */
export function mergeChartWithLookup(entries: ChartEntry[], lookupResults: unknown[]): DiscoverFeed[] {
  const byId = new Map<string, AppleLookupRaw>()
  for (const raw of lookupResults || []) {
    const r = (raw ?? {}) as AppleLookupRaw
    if (r.collectionId != null) byId.set(String(r.collectionId), r)
  }

  return entries
    .map((entry) => {
      const details = byId.get(entry.id)
      const feedUrl = details?.feedUrl
      if (!feedUrl) return null
      return {
        id: entry.id,
        title: entry.title || details?.collectionName || '',
        author: entry.author || details?.artistName || '',
        artwork: details?.artworkUrl600 || details?.artworkUrl100 || entry.artwork,
        feedUrl,
        genres: Array.isArray(details?.genres) ? details.genres.filter((g) => g !== 'Podcasts') : [],
        episodeCount: typeof details?.trackCount === 'number' ? details.trackCount : 0
      }
    })
    .filter((f): f is DiscoverFeed => f !== null)
}

export function usePodcastDiscovery() {
  // Nothing to configure: no key, no secret. Kept so callers that asked about configuration
  // still have an answer, and so the discover screen does not need a special case.
  const isConfigured = computed(() => true)

  /**
   * CapacitorHttp rather than fetch: these hosts send no Access-Control-Allow-Origin, so a
   * cross-origin fetch from the webview is blocked regardless of whether the request is valid.
   * Not useNativeHttp either - that wrapper drives appStore.serverReachable and refreshes the
   * server token on a 401, neither of which a third-party host should control.
   */
  async function getJson(url: string): Promise<unknown> {
    const res = await CapacitorHttp.request({
      method: 'GET',
      url,
      headers: { Accept: 'application/json' },
      connectTimeout: 10000
    })
    if (res.status >= 400) {
      const error = new Error(`HTTP ${res.status}`) as Error & { status?: number }
      error.status = res.status
      throw error
    }
    return typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  }

  async function fetchTrending(
    options: { max?: number; category?: string; country?: string } = {}
  ): Promise<DiscoverResult> {
    try {
      const chart = await getJson(appleChartUrl({ limit: options.max ?? 15, category: options.category, country: options.country }))
      const entries = parseChartEntries(chart)
      if (!entries.length) return { ok: true, feeds: [] }

      const lookup = (await getJson(
        `${LOOKUP_URL}?id=${entries.map((e) => e.id).join(',')}&entity=podcast`
      )) as { results?: unknown[] }

      return { ok: true, feeds: mergeChartWithLookup(entries, lookup?.results ?? []) }
    } catch (error) {
      const status = (error as { status?: number } | null | undefined)?.status
      console.error('[discovery] Apple charts request failed', error)
      // No status means it never got there - no signal, captive portal, DNS.
      return { ok: false, reason: status ? describeDiscoveryFailure(status) : 'unreachable' }
    }
  }

  return { isConfigured, fetchTrending }
}
