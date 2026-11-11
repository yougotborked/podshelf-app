import { defineStore } from 'pinia'
import { Network } from '@capacitor/network'
import { AbsAudioPlayer, AbsDownloader, AbsLogger } from '~/plugins/capacitor'

// Long enough for a working link to answer, short enough that a dead one is obvious fast
const SERVER_PROBE_TIMEOUT_MS = 4000

/**
 * How many episodes one auto-download pass may queue.
 *
 * Without a cap the pass walks every unfinished episode in every podcast library and queues the
 * lot. On a device with nothing downloaded yet - a new phone, or the setting just switched on -
 * that is the entire backlog at once: hundreds of plugin calls, database writes and foreground
 * service starts in a tight loop. The timer comes back every 30 minutes, so a cap still works
 * through the backlog; it just stops trying to do it in one go.
 */
const AUTO_DOWNLOAD_MAX_PER_PASS = 25
import { PlayMethod } from '~/constants'
import type { PlaybackSession, DeviceData, QueueItem } from '~/types'
import { getAutoPlaylistPodcastRule, refreshAutoPlaylistPodcastRules } from '~/composables/useAutoPlaylist'

// Helper functions (copy from store/index.js)
function resolveQueueItemIds(item: Record<string, unknown> | null | undefined): { libraryItemId: string | null; episodeId: string | null } {
  if (!item || typeof item !== 'object') {
    return { libraryItemId: null, episodeId: null }
  }

  const libraryItem = (item.libraryItem as Record<string, unknown> | null | undefined) || {}
  const libraryItemId =
    (item.libraryItemId as string | null | undefined) ??
    (item.serverLibraryItemId as string | null | undefined) ??
    (libraryItem.libraryItemId as string | null | undefined) ??
    (libraryItem.id as string | null | undefined) ??
    ((item.localLibraryItem as Record<string, unknown> | null | undefined)?.id as string | null | undefined) ??
    (item.localLibraryItemId as string | null | undefined) ??
    ((item.localEpisode as Record<string, unknown> | null | undefined)?.localLibraryItemId as string | null | undefined) ??
    (item.id as string | null | undefined) ??
    null

  const episode = (item.episode as Record<string, unknown> | null | undefined) || {}
  const episodeId =
    (item.episodeId as string | null | undefined) ??
    (item.serverEpisodeId as string | null | undefined) ??
    (episode.serverEpisodeId as string | null | undefined) ??
    (episode.id as string | null | undefined) ??
    (item.localEpisodeId as string | null | undefined) ??
    ((item.localEpisode as Record<string, unknown> | null | undefined)?.id as string | null | undefined) ??
    null

  return { libraryItemId, episodeId }
}

function sanitizeQueue(queue: QueueItem[] = []): QueueItem[] {
  const sanitized: QueueItem[] = []
  queue.forEach((item) => {
    const ids = resolveQueueItemIds(item as unknown as Record<string, unknown>)
    if (!ids.libraryItemId) return
    sanitized.push({ ...item, libraryItemId: ids.libraryItemId, episodeId: ids.episodeId ?? item.episodeId ?? null })
  })
  return sanitized
}

interface AppState {
  deviceData: DeviceData | null
  currentPlaybackSession: PlaybackSession | null
  playerIsPlaying: boolean
  playerIsFullscreen: boolean
  playerIsStartingPlayback: boolean
  /**
   * Minimal mode is on screen: one play control over the catch-up queue and nothing else.
   *
   * It lives here rather than being read from the route because the chrome it suppresses is not
   * on the page that turns it on - the appbar and the nav sit in the layout, and the player is
   * mounted by it - so a route check would have to be repeated in three components that have no
   * other reason to know what route is open.
   */
  minimalModeActive: boolean
  playerStartingPlaybackMediaId: string | null
  isCasting: boolean
  isCastAvailable: boolean
  isCastEnabled: boolean
  attemptingConnection: boolean
  socketConnected: boolean
  networkConnected: boolean
  networkConnectionType: string | null
  serverReachable: boolean
  offlineModeEnabled: boolean
  isNetworkUnmetered: boolean
  isFirstLoad: boolean
  isFirstAudioLoad: boolean
  hasStoragePermission: boolean
  selectedLibraryItem: Record<string, unknown> | null
  showReader: boolean
  ereaderKeepProgress: boolean
  ereaderFileId: string | null
  showSideDrawer: boolean
  isNetworkListenerInit: boolean
  serverSettings: Record<string, unknown> | null
  lastBookshelfScrollData: Record<string, { scrollTop: number; path: string }>
  lastItemScrollData: Record<string, unknown>
  playQueue: QueueItem[]
  queueIndex: number | null
  autoDownloadIntervalId: ReturnType<typeof setInterval> | null
}

export const useAppStore = defineStore('app', {
  state: (): AppState => ({
    deviceData: null,
    currentPlaybackSession: null,
    playerIsPlaying: false,
    playerIsFullscreen: false,
    playerIsStartingPlayback: false,
    minimalModeActive: false,
    playerStartingPlaybackMediaId: null,
    isCasting: false,
    isCastAvailable: false,
    isCastEnabled: false,
    attemptingConnection: false,
    socketConnected: false,
    networkConnected: false,
    networkConnectionType: null,
    serverReachable: true,
    offlineModeEnabled: false,
    isNetworkUnmetered: true,
    isFirstLoad: true,
    isFirstAudioLoad: true,
    hasStoragePermission: false,
    selectedLibraryItem: null,
    showReader: false,
    ereaderKeepProgress: false,
    ereaderFileId: null,
    showSideDrawer: false,
    isNetworkListenerInit: false,
    serverSettings: null,
    lastBookshelfScrollData: {},
    lastItemScrollData: {},
    playQueue: [],
    queueIndex: null,
    autoDownloadIntervalId: null
  }),

  getters: {
    getCurrentPlaybackSessionId: (state) => state.currentPlaybackSession?.id || null,
    getIsPlayerOpen: (state) => !!state.currentPlaybackSession,
    getIsCurrentSessionLocal: (state) => state.currentPlaybackSession?.playMethod == PlayMethod.LOCAL,
    getIsMediaStreaming: (state) => (libraryItemId: string, episodeId?: string | null) => {
      if (!state.currentPlaybackSession || !libraryItemId) return false
      const isLocalLibraryItemId = libraryItemId.startsWith('local_')
      if (isLocalLibraryItemId) {
        if ((state.currentPlaybackSession as Record<string, unknown>).localLibraryItem &&
            ((state.currentPlaybackSession as Record<string, unknown>).localLibraryItem as Record<string, unknown> | null | undefined)?.id !== libraryItemId) {
          return false
        }
        if (!episodeId) return true
        return state.currentPlaybackSession.localEpisodeId === episodeId
      }
      if (state.currentPlaybackSession.libraryItemId !== libraryItemId) return false
      if (!episodeId) return true
      return state.currentPlaybackSession.episodeId === episodeId
    },
    getServerSetting: (state) => (key: string) => {
      if (!state.serverSettings) return null
      return state.serverSettings[key]
    },
    getJumpForwardTime: (state) => state.deviceData?.deviceSettings?.jumpForwardTime || 10,
    getJumpBackwardsTime: (state) => state.deviceData?.deviceSettings?.jumpBackwardsTime || 10,
    getAltViewEnabled: (state) => {
      if (!state.deviceData?.deviceSettings) return true
      return state.deviceData.deviceSettings.enableAltView
    },
    getOrientationLockSetting: (state) => state.deviceData?.deviceSettings?.lockOrientation,
    getCanDownloadUsingCellular: (state) => state.deviceData?.deviceSettings?.downloadUsingCellular || 'ALWAYS',
    getCanStreamingUsingCellular: (state) => state.deviceData?.deviceSettings?.streamingUsingCellular || 'ALWAYS',
    getDoesServerImagesRequireToken: (state) => {
      const serverVersion = state.serverSettings?.version as string | undefined
      if (!serverVersion) return false
      const [major, minor] = serverVersion.split('.').map(Number)
      return (major ?? 0) < 2 || (major === 2 && (minor ?? 0) < 17)
    },
    /**
     * Whether we should be working from the on-device copy rather than the server. Either the
     * user chose to go offline, or the server is out of reach. networkConnected alone is not
     * enough for the latter: plane wifi and captive portals both look like a working network
     * while nothing can actually reach the server.
     */
    isOffline: (state) => state.offlineModeEnabled || !state.networkConnected || !state.serverReachable,
    getPlayQueue: (state) => state.playQueue,
    getQueueIndex: (state) => state.queueIndex,
    getNextQueueItem: (state) => {
      if (state.queueIndex === null) return null
      return state.playQueue[state.queueIndex + 1] || null
    },
    getPreviousQueueItem: (state) => {
      if (state.queueIndex === null) return null
      if (state.queueIndex === 0) return null
      return state.playQueue[state.queueIndex - 1] || null
    }
  },

  actions: {
    async init() {
      const localStore = useLocalStore()
      const queue = sanitizeQueue((await localStore.getPlayQueue()) as QueueItem[])
      let index = await localStore.getQueueIndex()
      let session = await localStore.getPlaybackSession()

      const deviceSession = this.deviceData?.lastPlaybackSession
      if (deviceSession) {
        if (!session || session.id !== deviceSession.id) {
          session = deviceSession
          await localStore.setPlaybackSession(session)
        }
        const idx = queue.findIndex((q) => {
          const liId = (q.localLibraryItem)?.id || q.libraryItemId
          const epId = (q.localEpisode)?.id || q.episodeId
          const curLi = (deviceSession.localLibraryItem as Record<string, unknown> | null | undefined)?.id || deviceSession.libraryItemId
          const curEp = deviceSession.localEpisodeId || deviceSession.episodeId
          return liId === curLi && epId === curEp
        })
        if (idx >= 0 && idx !== index) {
          index = idx
          await localStore.setQueueIndex(index)
        }
      }

      if (!queue.length) {
        index = null
      } else if (typeof index !== 'number' || index < 0 || index >= queue.length) {
        index = 0
        await localStore.setQueueIndex(index)
      }

      this.playQueue = sanitizeQueue(queue)
      this.queueIndex = index
      this.currentPlaybackSession = session as PlaybackSession | null

      const librariesStore = useLibrariesStore()
      const autoUnfinished = this.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes
      const hasCachedPlaylists = await localStore.hasCachedPlaylists()
      if (autoUnfinished || hasCachedPlaylists) {
        librariesStore.numUserPlaylists = 1
      }

      this.startAutoDownloadTimer()
    },

    startAutoDownloadTimer() {
      if (this.autoDownloadIntervalId) return
      const id = setInterval(() => {
        void this.autoDownloadCheck()
      }, 30 * 60 * 1000)
      this.autoDownloadIntervalId = id
      void this.autoDownloadCheck()
    },

    stopAutoDownloadTimer() {
      if (this.autoDownloadIntervalId) {
        clearInterval(this.autoDownloadIntervalId)
        this.autoDownloadIntervalId = null
      }
    },

    async autoDownloadCheck() {
      if (!this.deviceData?.deviceSettings?.autoCacheUnplayedEpisodes) return
      if (this.isOffline) return
      const userStore = useUserStore()
      if (!userStore.user) return

      const userMediaProgress = (userStore.user.mediaProgress as Record<string, unknown>[] | null | undefined) || []
      const globalsStore = useGlobalsStore()
      const localMediaProgress = (globalsStore.localMediaProgress as Record<string, unknown>[] | null | undefined) || []

      const progressMap: Record<string, unknown> = {}
      userMediaProgress.forEach((mp: Record<string, unknown>) => {
        if (mp.episodeId) progressMap[mp.episodeId as string] = mp
      })
      localMediaProgress.forEach((mp: Record<string, unknown>) => {
        if (mp.episodeId && !progressMap[mp.episodeId as string]) {
          progressMap[mp.episodeId as string] = mp
        }
      })

      const db = useDb()
      const localLibraries = await db.getLocalLibraryItems('podcast')
      const downloadedMap: Record<string, boolean> = {}
      for (const li of localLibraries as Record<string, unknown>[]) {
        for (const ep of (li.media as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | null | undefined || []) {
          const sid = (ep.serverEpisodeId || ep.id) as string
          if (sid) downloadedMap[`${li.libraryItemId}_${sid}`] = true
        }
      }

      // A podcast the user excluded from the auto playlist should not be auto-downloaded either
      const podcastRules = await refreshAutoPlaylistPodcastRules()

      // Unfinished episodes seen per podcast so far, used to honour a `latest` rule
      const unfinishedSeenByPodcast: Record<string, number> = {}

      const librariesStore = useLibrariesStore()
      const nativeHttp = useNativeHttp()
      let queued = 0
      libraries: for (const lib of librariesStore.libraries) {
        if ((lib as Record<string, unknown>).mediaType !== 'podcast') continue
        let page = 0
        for (;;) {
          const payload = await nativeHttp.get(`/api/libraries/${(lib as Record<string, unknown>).id}/recent-episodes?limit=200&page=${page}`, { connectTimeout: 10000 }).catch(() => null)
          const episodes = (payload as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | null | undefined || []
          for (const ep of episodes) {
            const serverId = ep.id as string
            const liId = ep.libraryItemId as string
            if (!serverId || !liId) continue
            const rule = getAutoPlaylistPodcastRule(podcastRules, liId)
            if (rule.mode === 'exclude') continue
            const prog = progressMap[serverId] as Record<string, unknown>
            if (isProgressFinished(prog as MaybeProgress)) continue

            // recent-episodes comes back newest first, so counting unfinished episodes as we go
            // gives the same set the auto playlist shows for a `latest` rule. Counted before the
            // already-downloaded check so a downloaded episode still uses up one of the slots.
            const seen = (unfinishedSeenByPodcast[liId] = (unfinishedSeenByPodcast[liId] || 0) + 1)
            if (rule.mode === 'latest' && rule.limit && seen > rule.limit) continue

            if (downloadedMap[`${liId}_${serverId}`]) continue
            AbsDownloader.downloadLibraryItem({ libraryItemId: liId, episodeId: serverId })
            downloadedMap[`${liId}_${serverId}`] = true

            if (++queued >= AUTO_DOWNLOAD_MAX_PER_PASS) {
              AbsLogger.info({ tag: 'Store', message: `[Store] autoDownloadCheck queued ${queued} episodes, stopping this pass` })
              break libraries
            }
          }
          if (episodes.length < 200) break
          page++
        }
      }
    },

    async setupNetworkListener() {
      if (this.isNetworkListenerInit) return
      this.isNetworkListenerInit = true

      const status = await Network.getStatus()
      AbsLogger.info({ tag: 'Store', message: `Network status: ${JSON.stringify(status)}` })
      this.setNetworkStatus(status)

      void Network.addListener('networkStatusChange', (status) => {
        AbsLogger.info({ tag: 'Store', message: `Network status changed: ${JSON.stringify({ connected: status.connected, connectionType: status.connectionType })}` })
        this.setNetworkStatus(status)
      })

      AbsAudioPlayer.addListener('onNetworkMeteredChanged', (payload: { value: boolean }) => {
        AbsLogger.info({ tag: 'Store', message: `On network metered changed: ${JSON.stringify({ isUnmetered: payload.value })}` })
        this.isNetworkUnmetered = payload.value
      })
    },

    setDeviceData(deviceData: DeviceData | null) {
      this.deviceData = deviceData
      if (deviceData?.deviceSettings?.autoCacheUnplayedEpisodes) {
        this.startAutoDownloadTimer()
      } else {
        this.stopAutoDownloadTimer()
      }
    },

    setLastBookshelfScrollData({ scrollTop, path, name }: { scrollTop: number; path: string; name: string }) {
      this.lastBookshelfScrollData[name] = { scrollTop, path }
    },

    setLastItemScrollData(data: Record<string, unknown>) {
      this.lastItemScrollData = data
    },

    /**
     * Records which player the native layer switched to.
     *
     * This is its own action because the native `onMediaPlayerChanged` event carries a plain
     * string ("cast-player" / "exo-player"), not a session. It used to be handed to
     * setPlaybackSession, which replaced currentPlaybackSession with that string: the player
     * went blank, and `isCasting` evaluated `"cast-player".mediaPlayer === 'cast-player'` —
     * undefined, so false — leaving the cast icon unfilled the whole time a cast was connected.
     */
    setMediaPlayer(mediaPlayer: string) {
      this.isCasting = mediaPlayer === 'cast-player'
      if (this.currentPlaybackSession) {
        this.currentPlaybackSession.mediaPlayer = mediaPlayer
      }
    },

    setPlaybackSession(playbackSession: PlaybackSession | null) {
      this.currentPlaybackSession = playbackSession
      this.isCasting = playbackSession?.mediaPlayer === 'cast-player'
      void useLocalStore().setPlaybackSession(playbackSession)

      if (playbackSession && this.playQueue.length) {
        const idx = this.playQueue.findIndex((q) => {
          const liId = (q.localLibraryItem)?.id || q.libraryItemId
          const epId = (q.localEpisode)?.id || q.episodeId
          const curLi = (playbackSession.localLibraryItem as Record<string, unknown> | null | undefined)?.id || playbackSession.libraryItemId
          const curEp = playbackSession.localEpisodeId || playbackSession.episodeId
          return liId === curLi && epId === curEp
        })
        if (idx >= 0) this.queueIndex = idx
      }
    },

    /**
     * Ask the server whether it is actually there.
     *
     * A connected radio is not a reachable server - driving through patchy coverage, the radio
     * reports cellular while nothing can get out. Assuming the server is back on every radio
     * transition made the app flip online, fire real requests, stall on their timeouts and fall
     * back offline, over and over. So reachability is only ever restored by evidence: this
     * probe, a request that actually succeeded, or the socket connecting.
     *
     * Deliberately short: this is a question about whether the link works at all, and waiting
     * ten seconds for the answer is the problem it exists to avoid. useNativeHttp records
     * reachability from the outcome, including the case where the server answers an error (it
     * answered, so it is reachable).
     */
    async probeServerReachable(): Promise<boolean> {
      if (this.offlineModeEnabled) return false
      if (!this.networkConnected) {
        this.serverReachable = false
        return false
      }
      if (!useUserStore().serverConnectionConfig?.address) return false

      try {
        await useNativeHttp().get('/ping', { connectTimeout: SERVER_PROBE_TIMEOUT_MS, readTimeout: SERVER_PROBE_TIMEOUT_MS })
        this.serverReachable = true
      } catch (error) {
        // useNativeHttp already classified the failure; trust its verdict
      }
      return this.serverReachable
    },

    /**
     * Deliberate offline mode, from the Disconnect button. Unlike logging out this keeps the
     * session, the cached libraries and the downloaded content addressable, so the app keeps
     * the same shape - it just stops talking to the server.
     */
    async setOfflineMode(enabled: boolean) {
      this.offlineModeEnabled = enabled
      await useLocalStore().setOfflineMode(enabled)
      const socket = useSocket()
      if (enabled) {
        socket.goOffline()
        this.socketConnected = false
      } else {
        // Assume the server is back and let the next request say otherwise
        this.serverReachable = true
      }
      await AbsLogger.info({ tag: 'Store', message: `[Store] Offline mode ${enabled ? 'enabled' : 'disabled'}` })
    },

    async loadOfflineMode() {
      this.offlineModeEnabled = await useLocalStore().getOfflineMode()
    },

    setNetworkStatus(val: { connected: boolean; connectionType: string }) {
      if (val.connectionType !== 'none') {
        this.networkConnected = true
      } else {
        this.networkConnected = false
        // No radio, no server. Recorded now so nothing spends a timeout finding out.
        this.serverReachable = false
      }
      const platform = usePlatform()
      if (platform === 'ios') {
        this.networkConnected = true
      }
      this.networkConnectionType = val.connectionType
    },

    setPlayQueue(queue: QueueItem[]) {
      const incomingSummary = {
        incomingLength: Array.isArray(queue) ? queue.length : 0,
        sample: Array.isArray(queue) ? queue.slice(0, 5).map((item) => ({
          libraryItemId: item.libraryItemId,
          episodeId: item.episodeId
        })) : []
      }
      AbsLogger.info({ tag: 'Store', message: `[Store] setPlayQueue called: ${JSON.stringify(incomingSummary)}` })
      this.playQueue = sanitizeQueue(queue)
      AbsLogger.info({ tag: 'Store', message: `[Store] setPlayQueue sanitized length: ${this.playQueue.length}` })
      void useLocalStore().setPlayQueue(this.playQueue)
    },

    setQueueIndex(index: number | null) {
      this.queueIndex = index
      AbsLogger.info({ tag: 'Store', message: `[Store] setQueueIndex: ${JSON.stringify({ queueIndex: index, queueLength: this.playQueue.length })}` })
      void useLocalStore().setQueueIndex(index)
    },

    reorderQueue({ oldIndex, newIndex }: { oldIndex: number; newIndex: number }) {
      const item = this.playQueue.splice(oldIndex, 1)[0]
      // An index outside the queue removes nothing; there is nothing to put back.
      if (!item) return
      this.playQueue.splice(newIndex, 0, item)
      if (this.queueIndex === oldIndex) {
        this.queueIndex = newIndex
      } else if (this.queueIndex !== null && this.queueIndex > oldIndex && this.queueIndex <= newIndex) {
        this.queueIndex--
      } else if (this.queueIndex !== null && this.queueIndex < oldIndex && this.queueIndex >= newIndex) {
        this.queueIndex++
      }
    },

    removeQueueItem(index: number) {
      this.playQueue.splice(index, 1)
      if (this.queueIndex !== null) {
        if (this.queueIndex > index) {
          this.queueIndex--
        } else if (this.queueIndex === index) {
          if (this.queueIndex >= this.playQueue.length) {
            this.queueIndex = this.playQueue.length - 1
          }
        }
      }
      if (!this.playQueue.length) this.queueIndex = null
    },

    clearPlayQueue() {
      this.playQueue = []
      this.queueIndex = null
    },

    setServerSettings(val: Record<string, unknown> | null) {
      this.serverSettings = val
      void useLocalStore().setServerSettings(val)
    }
  }
})
