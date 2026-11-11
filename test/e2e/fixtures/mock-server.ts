/**
 * A stand-in Audiobookshelf server, served to the app entirely from Playwright route handlers.
 *
 * It lives on its own origin. That matters more than it looks: the previous harness matched
 * API calls with `**' + '/api/**`, which also matched the dev server's own module URLs - one of
 * them is `/_nuxt/node_modules/@vue/devtools-api/lib/esm/api/index.js`. Serving that as JSON
 * killed the module graph, and every screenshot came out blank. Keeping the fake server on a
 * different origin from the app makes an asset collision impossible rather than unlikely.
 */

export const MOCK_ORIGIN = 'http://abs-mock.test'

/** Server version the app negotiates against. Past 2.26.0 it expects refresh-token auth. */
const SERVER_VERSION = '2.26.0'

export const MOCK_LIBRARY_ID = 'lib_podcasts'

export const MOCK_USER = {
  id: 'usr_mock',
  username: 'listener',
  type: 'admin',
  // Must differ from the stored config token, or the app treats it as a stale login and
  // bounces to /connect with error=oldAuthToken.
  token: 'mock-legacy-token',
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  isOldToken: false,
  mediaProgress: [],
  bookmarks: [],
  seriesHideFromContinueListening: [],
  permissions: { download: true, update: true, delete: true, upload: true, accessAllLibraries: true },
  librariesAccessible: [] as string[],
  itemTagsSelected: [] as string[]
}

export const MOCK_SERVER_SETTINGS = {
  id: 'server-settings',
  version: SERVER_VERSION,
  language: 'en-us',
  scannerParseSubtitle: false,
  dateFormat: 'MM/dd/yyyy',
  timeFormat: 'HH:mm'
}

export const MOCK_LIBRARIES = [
  { id: MOCK_LIBRARY_ID, name: 'Podcasts', mediaType: 'podcast', icon: 'podcast', provider: 'itunes', folders: [], displayOrder: 1 },
  { id: 'lib_books', name: 'Audiobooks', mediaType: 'book', icon: 'audiobookshelf', provider: 'audible', folders: [], displayOrder: 2 }
]

type EpisodeSeed = {
  id: string
  title: string
  /** Minutes of runtime - the shelves show a duration, and a 0 reads as broken rather than empty. */
  minutes: number
  /** 0 = untouched, 1 = finished, anything between = partly played. */
  progress: number
  publishedDaysAgo: number
}

type PodcastSeed = {
  id: string
  title: string
  author: string
  /** Drives the generated cover, so each card is visually distinct. */
  hue: number
  episodes: EpisodeSeed[]
}

/**
 * Podcast-shaped on purpose: this app's own use is podcasts, and a fixture full of audiobooks
 * hides the layouts that actually get looked at.
 */
const PODCASTS: PodcastSeed[] = [
  {
    id: 'li_hardcore',
    title: 'Hardcore History',
    author: 'Dan Carlin',
    hue: 18,
    episodes: [
      { id: 'ep_h1', title: 'Blueprint for Armageddon VI', minutes: 269, progress: 0.42, publishedDaysAgo: 3 },
      { id: 'ep_h2', title: 'Supernova in the East IV', minutes: 242, progress: 0, publishedDaysAgo: 12 }
    ]
  },
  {
    id: 'li_daily',
    title: 'The Daily',
    author: 'The New York Times',
    hue: 210,
    episodes: [
      { id: 'ep_d1', title: 'The Sunday Read: A Year Inside the Fold', minutes: 34, progress: 1, publishedDaysAgo: 1 },
      { id: 'ep_d2', title: 'What the Election Means for the Courts', minutes: 26, progress: 0.71, publishedDaysAgo: 2 },
      { id: 'ep_d3', title: 'The Rise of the Home Server', minutes: 29, progress: 0, publishedDaysAgo: 4 }
    ]
  },
  {
    id: 'li_darknet',
    title: 'Darknet Diaries',
    author: 'Jack Rhysider',
    hue: 142,
    episodes: [
      { id: 'ep_x1', title: 'Ep 141: The Pirate Bay', minutes: 58, progress: 0.18, publishedDaysAgo: 6 },
      { id: 'ep_x2', title: 'Ep 140: Shadow Brokers', minutes: 64, progress: 0, publishedDaysAgo: 20 }
    ]
  },
  {
    id: 'li_search',
    title: 'Search Engine',
    author: 'PJ Vogt',
    hue: 280,
    episodes: [{ id: 'ep_s1', title: 'Why are there so many cranes?', minutes: 41, progress: 0, publishedDaysAgo: 8 }]
  },
  {
    id: 'li_ezra',
    title: 'The Ezra Klein Show',
    author: 'New York Times Opinion',
    hue: 48,
    episodes: [{ id: 'ep_e1', title: 'A Conversation About Attention', minutes: 76, progress: 0.9, publishedDaysAgo: 5 }]
  }
]

const DAY_MS = 86400000

function episodePayload(podcast: PodcastSeed, ep: EpisodeSeed) {
  return {
    id: ep.id,
    libraryItemId: podcast.id,
    title: ep.title,
    subtitle: '',
    description: `<p>${ep.title} - from ${podcast.title}.</p>`,
    season: '',
    episode: '',
    episodeType: 'full',
    pubDate: new Date(Date.now() - ep.publishedDaysAgo * DAY_MS).toUTCString(),
    publishedAt: Date.now() - ep.publishedDaysAgo * DAY_MS,
    addedAt: Date.now() - ep.publishedDaysAgo * DAY_MS,
    audioFile: { duration: ep.minutes * 60 },
    duration: ep.minutes * 60,
    size: ep.minutes * 60 * 32000
  }
}

function progressPayload(podcast: PodcastSeed, ep: EpisodeSeed) {
  const duration = ep.minutes * 60
  return {
    id: `${podcast.id}-${ep.id}`,
    libraryItemId: podcast.id,
    episodeId: ep.id,
    duration,
    progress: ep.progress,
    currentTime: Math.round(duration * ep.progress),
    isFinished: ep.progress >= 1,
    lastUpdate: Date.now() - DAY_MS,
    startedAt: Date.now() - 2 * DAY_MS,
    finishedAt: ep.progress >= 1 ? Date.now() - DAY_MS : null
  }
}

function libraryItemPayload(podcast: PodcastSeed) {
  const episodes = podcast.episodes.map((ep) => episodePayload(podcast, ep))
  return {
    id: podcast.id,
    libraryId: MOCK_LIBRARY_ID,
    mediaType: 'podcast',
    folderId: 'fld_1',
    addedAt: Date.now() - 90 * DAY_MS,
    updatedAt: Date.now() - DAY_MS,
    isMissing: false,
    isInvalid: false,
    numEpisodesIncomplete: podcast.episodes.filter((e) => e.progress < 1).length,
    media: {
      id: `md_${podcast.id}`,
      libraryItemId: podcast.id,
      metadata: {
        title: podcast.title,
        titleIgnorePrefix: podcast.title,
        author: podcast.author,
        description: `<p>${podcast.title}, hosted by ${podcast.author}.</p>`,
        genres: ['History', 'Society & Culture'],
        language: 'en',
        explicit: false
      },
      coverPath: `/cover/${podcast.id}`,
      tags: [],
      episodes,
      numEpisodes: episodes.length,
      autoDownloadEpisodes: true
    }
  }
}

/** Every episode the fixture knows about, newest first - what the Catch Up shelf reads. */
function recentEpisodes() {
  return PODCASTS.flatMap((p) =>
    p.episodes.map((ep) => ({
      ...episodePayload(p, ep),
      podcast: { id: p.id, metadata: { title: p.title, author: p.author }, coverPath: `/cover/${p.id}` },
      libraryItem: libraryItemPayload(p)
    }))
  ).sort((a, b) => b.publishedAt - a.publishedAt)
}

/** The home screen's shelves, in the shape `/personalized` returns. */
/**
 * An entity for an episode shelf.
 *
 * The server sends these as a *library item* with the episode hung off it as `recentEpisode`,
 * not as a bare episode - which is what LazyBookCard reads, both for the episode details and for
 * `media.coverPath`. Sending a bare episode meant every card on these shelves fell back to
 * `/book_placeholder.jpg`, so the home screen showed rows of red leather books in a podcast app,
 * and four of those shots went to the Play listing.
 */
function episodeShelfEntity(podcast: PodcastSeed, ep: PodcastSeed['episodes'][number]) {
  return {
    ...libraryItemPayload(podcast),
    recentEpisode: episodePayload(podcast, ep),
    progress: progressPayload(podcast, ep)
  }
}

function personalizedShelves() {
  const items = PODCASTS.map(libraryItemPayload)
  const inProgress = PODCASTS.flatMap((p) => p.episodes.filter((e) => e.progress > 0 && e.progress < 1).map((ep) => episodeShelfEntity(p, ep)))
  return [
    { id: 'continue-listening', label: 'Continue Listening', labelStringKey: 'LabelContinueListening', type: 'episode', entities: inProgress },
    {
      id: 'recent-episodes',
      label: 'Newest Episodes',
      labelStringKey: 'LabelNewestEpisodes',
      type: 'episode',
      entities: PODCASTS.flatMap((p) => p.episodes.slice(0, 2).map((ep) => episodeShelfEntity(p, ep))).slice(0, 6)
    },
    { id: 'recently-added', label: 'Recently Added', labelStringKey: 'LabelRecentlyAdded', type: 'podcast', entities: items }
  ]
}

/** All media progress rows, as /api/me reports them. */
function allProgress() {
  return PODCASTS.flatMap((p) => p.episodes.filter((e) => e.progress > 0).map((ep) => progressPayload(p, ep)))
}

/**
 * A flat SVG cover per item, so artwork is present and each card is distinguishable.
 * Real cover bytes would mean binary fixtures in the repo for no extra signal.
 */
function coverSvg(hue: number, title: string): string {
  const safe = title.replace(/[<>&]/g, '')
  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">
  <defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="hsl(${hue} 55% 42%)"/><stop offset="1" stop-color="hsl(${hue + 24} 60% 22%)"/>
  </linearGradient></defs>
  <rect width="400" height="400" fill="url(#g)"/>
  <text x="200" y="210" text-anchor="middle" font-family="sans-serif" font-size="30" font-weight="600" fill="rgba(255,255,255,0.92)">${safe.slice(0, 16)}</text>
</svg>`
}

function coverForPath(pathname: string): string | null {
  const match = pathname.match(/\/api\/items\/([^/]+)\/cover/)
  if (!match) return null
  const podcast = PODCASTS.find((p) => p.id === match[1])
  return coverSvg(podcast?.hue ?? 200, podcast?.title ?? 'Cover')
}

export type MockServerHandle = {
  /** Paths the fixture had no specific answer for. A screen leaning on one of these is a gap. */
  unhandled: string[]
}

/** The JSON body for a server path, or undefined when the fixture has nothing specific. */
export function mockResponseFor(pathname: string): unknown {
  if (pathname === '/api/authorize') {
    return {
      // With progress, as the real server sends it: the app reads it from here at sign-in and
      // never shows a progress bar or "remaining" anywhere without it.
      user: { ...MOCK_USER, mediaProgress: allProgress() },
      userDefaultLibraryId: MOCK_LIBRARY_ID,
      serverSettings: MOCK_SERVER_SETTINGS,
      ereaderDevices: []
    }
  }
  if (pathname === '/api/me') return { ...MOCK_USER, mediaProgress: allProgress() }
  if (pathname === '/api/libraries') return { libraries: MOCK_LIBRARIES }
  if (pathname === '/api/me/listening-stats') return { totalTime: 184000, items: {}, days: listeningDays(), dayOfWeek: {}, today: 3600, recentSessions: [] }
  if (pathname === '/status') return { isInit: true, language: 'en-us', ServerSettings: MOCK_SERVER_SETTINGS }

  const libraryMatch = pathname.match(/^\/api\/libraries\/([^/]+)$/)
  if (libraryMatch) {
    const library = MOCK_LIBRARIES.find((l) => l.id === libraryMatch[1])
    if (library) return { library, filterdata: {}, issues: 0, numUserPlaylists: 0 }
  }
  if (pathname.endsWith('/personalized')) return personalizedShelves()
  if (pathname.endsWith('/recent-episodes')) return { episodes: recentEpisodes(), total: recentEpisodes().length, limit: 25, page: 0 }
  if (pathname.endsWith('/items')) {
    const items = PODCASTS.map(libraryItemPayload)
    return { results: items, total: items.length, page: 0, limit: 50, minified: true, mediaType: 'podcast' }
  }
  if (pathname.endsWith('/series')) return { results: [], total: 0, page: 0, limit: 50 }
  if (pathname.endsWith('/authors')) return { authors: [] }
  if (pathname.endsWith('/playlists')) return { results: [], total: 0, page: 0, limit: 50 }
  if (pathname.endsWith('/collections')) return { results: [], total: 0, page: 0, limit: 50 }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/)
  if (itemMatch) {
    const podcast = PODCASTS.find((p) => p.id === itemMatch[1])
    if (podcast) return libraryItemPayload(podcast)
  }

  const progressMatch = pathname.match(/^\/api\/me\/progress\/([^/]+)(?:\/([^/]+))?$/)
  if (progressMatch) {
    const podcast = PODCASTS.find((p) => p.id === progressMatch[1])
    const ep = podcast?.episodes.find((e) => e.id === progressMatch[2])
    if (podcast && ep) return progressPayload(podcast, ep)
  }

  return undefined
}

/**
 * Serves the fake server to `page`, and records any path the fixture did not recognise.
 */
/**
 * A plausible listening history: a live streak running up to today, an earlier longer run, and a
 * gap between them. Empty `days` made the stats screenshot useless - every streak and badge read
 * zero, which is the one state that shows nothing of the design.
 */
function listeningDays(): Record<string, number> {
  const days: Record<string, number> = {}
  const add = (daysAgo: number, minutes: number) => {
    const date = new Date()
    date.setDate(date.getDate() - daysAgo)
    days[`${date.getFullYear()}-${`${date.getMonth() + 1}`.padStart(2, '0')}-${`${date.getDate()}`.padStart(2, '0')}`] = minutes
  }
  // Current run: today back five days
  for (let i = 0; i < 5; i++) add(i, 20 + i * 7)
  // A longer run earlier, so "best" differs from "current"
  for (let i = 9; i < 21; i++) add(i, 15 + (i % 5) * 9)
  return days
}

export async function installMockServer(page: import('@playwright/test').Page): Promise<MockServerHandle> {
  const handle: MockServerHandle = { unhandled: [] }

  // The app opens a websocket at the server address (transports: ['websocket'], no polling), and
  // judges the server unreachable while it is down - so aborting it put a red "offline" cloud in
  // the appbar of every screenshot, including the four published to the Play listing.
  //
  // Speaking just enough Engine.IO/Socket.IO to complete a handshake is cheaper than running a
  // real server and exercises the app's actual connect path:
  //   server "0{...}"  open, with the session parameters
  //   client "40"      connect to the default namespace
  //   server "40{...}" namespace connected  -> socket.connected is true
  //   client "2"/"3"   heartbeats
  await page.routeWebSocket(/\/socket\.io\//, (ws) => {
    ws.send('0' + JSON.stringify({ sid: 'mock-sid', upgrades: [], pingInterval: 25000, pingTimeout: 20000, maxPayload: 1000000 }))
    ws.onMessage((message) => {
      const packet = typeof message === 'string' ? message : message.toString()
      if (packet.startsWith('40')) {
        ws.send('40' + JSON.stringify({ sid: 'mock-nsp-sid' }))
      } else if (packet === '2') {
        ws.send('3')
      } else if (packet.startsWith('42')) {
        // The app emits `auth` on connect and waits for `init` before it considers itself
        // authenticated; answering keeps it out of the reconnect loop.
        if (packet.includes('"auth"')) ws.send('42' + JSON.stringify(['init', { userId: MOCK_USER.id, usersOnline: [] }]))
      }
    })
  })

  await page.route(`${MOCK_ORIGIN}/**`, (route) => {
    const { pathname } = new URL(route.request().url())

    const svg = coverForPath(pathname)
    if (svg) return route.fulfill({ contentType: 'image/svg+xml', body: svg })

    const body = mockResponseFor(pathname)
    if (body !== undefined) return route.fulfill({ json: body as object })

    handle.unhandled.push(pathname)
    return route.fulfill({ status: 200, json: {} })
  })

  return handle
}

export const MOCK_SERVER_CONFIG = {
  id: 'cfg_mock',
  index: 0,
  name: 'Mock Server',
  address: MOCK_ORIGIN,
  version: SERVER_VERSION,
  userId: MOCK_USER.id,
  username: MOCK_USER.username,
  // Deliberately not MOCK_USER.token - matching it trips the stale-login check.
  token: 'mock-config-token'
}
