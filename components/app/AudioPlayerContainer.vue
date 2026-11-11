<template>
  <div>
    <app-audio-player ref="audioPlayer" :bookmarks="bookmarks" :sleep-timer-running="isSleepTimerRunning" :sleep-time-remaining="sleepTimeRemaining" :serverLibraryItemId="serverLibraryItemId" @selectPlaybackSpeed="showPlaybackSpeedModal = true" @updateTime="(t) => (currentTime = t)" @showSleepTimer="showSleepTimer" @showBookmarks="showBookmarks" @showQueue="openQueue" @skipNextQueue="onSkipNextRequest" @skipPreviousQueue="onSkipPreviousRequest" />

    <modals-playback-speed-modal v-model="showPlaybackSpeedModal" v-model:playback-rate="playbackSpeed" @update:playbackRate="updatePlaybackSpeed" @change="changePlaybackSpeed" />
    <modals-sleep-timer-modal v-model="showSleepTimerModal" :current-time="sleepTimeRemaining" :sleep-timer-running="isSleepTimerRunning" :current-end-of-chapter-time="currentEndOfChapterTime" :is-auto="isAutoSleepTimer" @change="selectSleepTimeout" @cancel="cancelSleepTimer" @increase="increaseSleepTimer" @decrease="decreaseSleepTimer" />
    <modals-bookmarks-modal v-model="showBookmarksModal" :bookmarks="bookmarks" :current-time="currentTime" :library-item-id="serverLibraryItemId" :playback-rate="playbackSpeed" @select="selectBookmark" />
    <modals-queue-modal v-model="showQueueModal" :queue="playQueue" :current-index="queueIndex" @select="selectQueueItem" />
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { AbsAudioPlayer, AbsLogger } from '@/plugins/capacitor'
import { Dialog } from '@capacitor/dialog'
import { useCellularPermission } from '@/composables/useCellularPermission'
import { resolvePlaybackTarget } from '@/composables/usePlaybackTarget'
import { resumePoint } from '@/composables/useListeningQueue'

const MAX_LOG_LENGTH = 2000
// Long enough for the native player's closing progress sync to finish and start the next item
const QUEUE_ADVANCE_FALLBACK_MS = 4000
// A hung progress check must not leave the transport controls disabled
const SERVER_PROGRESS_TIMEOUT_MS = 8000

function formatForLog(payload) {
  try {
    const json = JSON.stringify(payload)
    if (json.length > MAX_LOG_LENGTH) {
      return `${json.substring(0, MAX_LOG_LENGTH)}... (truncated)`
    }
    return json
  } catch (error) {
    return '[unserializable payload]'
  }
}

export default defineComponent({
  data() {
    return {
      isReady: false,
      settingsLoaded: false,
      audioPlayerReady: false,
      download: null,
      showPlaybackSpeedModal: false,
      showBookmarksModal: false,
      showQueueModal: false,
      showSleepTimerModal: false,
      playbackSpeed: 1,
      currentTime: 0,
      isSleepTimerRunning: false,
      sleepTimerEndTime: 0,
      sleepTimeRemaining: 0,
      isAutoSleepTimer: false,
      onLocalMediaProgressUpdateListener: null,
      onSleepTimerEndedListener: null,
      onSleepTimerSetListener: null,
      onMediaPlayerChangedListener: null,
      onCastAvailableUpdateListener: null,
      onCastSupportUpdateListener: null,
      onSkipNextRequestListener: null,
      queueAdvanceFallbackTimeout: null,
      onSkipPreviousRequestListener: null,
      onQueueIndexUpdateListener: null,
      sleepInterval: null,
      currentEndOfChapterTime: 0,
      serverLibraryItemId: null,
      serverEpisodeId: null
    }
  },
  setup() {
    const { checkCellularPermission } = useCellularPermission()
    const appStore = useAppStore()
    const userStore = useUserStore()
    const globalsStore = useGlobalsStore()
    const eventBus = useEventBus()
    const toast = useToast()
    const nativeHttp = useNativeHttp()
    const platform = usePlatform()
    const db = useDb()
    return { checkCellularPermission, appStore, userStore, globalsStore, eventBus, toast, nativeHttp, platform, db }
  },
  computed: {
    progressLookup() {
      return {
        server: (libraryItemId, episodeId) => this.userStore.getUserMediaProgress(libraryItemId, episodeId),
        local: (libraryItemId, episodeId) => this.globalsStore.getLocalMediaProgressByServerItemId(libraryItemId, episodeId)
      }
    },
    bookmarks() {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data() infers this field as `null` in a plain <script>; it is assigned a string elsewhere
      if (!this.serverLibraryItemId) return []
      return this.userStore.getUserBookmarksForItem(this.serverLibraryItemId)
    },
    isIos() {
      return this.platform === 'ios'
    },
    playQueue() {
      return this.appStore.playQueue
    },
    queueIndex() {
      return this.appStore.queueIndex
    }
  },
  methods: {
    isLocalId(id) {
      return typeof id === 'string' && id.startsWith('local')
    },
    resolveQueueItemIds(item) {
      if (!item || typeof item !== 'object') {
        return {
          serverLibraryItemId: null,
          localLibraryItemId: null,
          fallbackLibraryItemId: null,
          serverEpisodeId: null,
          localEpisodeId: null,
          fallbackEpisodeId: null
        }
      }

      const libraryItem = item.libraryItem || {}
      const rawLibraryItemId =
        item.libraryItemId ??
        libraryItem.libraryItemId ??
        libraryItem.id ??
        item.id ??
        null
      const serverLibraryItemId =
        item.serverLibraryItemId ??
        (!this.isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
        (!this.isLocalId(libraryItem.id) ? libraryItem.id : null) ??
        (!this.isLocalId(libraryItem.libraryItemId) ? libraryItem.libraryItemId : null) ??
        null
      const localLibraryItemId =
        item.localEpisode?.localLibraryItemId ??
        item.localLibraryItem?.id ??
        item.localLibraryItemId ??
        (this.isLocalId(rawLibraryItemId) ? rawLibraryItemId : null) ??
        (this.isLocalId(libraryItem.id) ? libraryItem.id : null) ??
        null

      const episode = item.episode || {}
      const rawEpisodeId =
        item.episodeId ??
        episode.id ??
        item.localEpisodeId ??
        null
      const serverEpisodeId =
        item.serverEpisodeId ??
        episode.serverEpisodeId ??
        (!this.isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
        null
      const localEpisodeId =
        item.localEpisode?.id ??
        item.localEpisodeId ??
        (this.isLocalId(rawEpisodeId) ? rawEpisodeId : null) ??
        null

      const fallbackLibraryItemId =
        localLibraryItemId ??
        serverLibraryItemId ??
        rawLibraryItemId ??
        null
      const fallbackEpisodeId =
        localEpisodeId ??
        serverEpisodeId ??
        rawEpisodeId ??
        null

      return {
        serverLibraryItemId,
        localLibraryItemId,
        fallbackLibraryItemId,
        serverEpisodeId,
        localEpisodeId,
        fallbackEpisodeId
      }
    },
    getQueuePayload(queue, preferServerIds = false) {
      if (!Array.isArray(queue)) return []
      return queue
        .map((item) => {
          const ids = this.resolveQueueItemIds(item)

          let libraryItemId = preferServerIds
            ? ids.serverLibraryItemId ?? ids.fallbackLibraryItemId
            : ids.localLibraryItemId || ids.fallbackLibraryItemId

          if (!libraryItemId) return null
          if (preferServerIds && this.isLocalId(libraryItemId)) {
            libraryItemId = ids.fallbackLibraryItemId
            if (!libraryItemId || this.isLocalId(libraryItemId)) return null
          }

          let episodeId = null
          if (preferServerIds) {
            episodeId = ids.serverEpisodeId ?? ids.fallbackEpisodeId ?? null
            if (episodeId && this.isLocalId(episodeId)) {
              episodeId = ids.fallbackEpisodeId ?? null
            }
          } else {
            episodeId = ids.localEpisodeId ?? ids.serverEpisodeId ?? ids.fallbackEpisodeId
          }

          const payload = { libraryItemId }
          if (episodeId) payload.episodeId = episodeId
          // The native player advances the queue itself, from the downloaded copy's own record
          // unless it is told a newer position - see resumePoint and queuedResumeTime.
          const resume = resumePoint(ids.serverLibraryItemId, ids.serverEpisodeId, this.progressLookup)
          if (resume) {
            payload.startTime = resume.startTime
            payload.progressLastUpdate = resume.lastUpdate
          }
          return payload
        })
        .filter(Boolean)
    },
    resolveQueueIndex(queuePayload, libraryItemId, episodeId, fallbackIndex = 0) {
      if (!Array.isArray(queuePayload) || !queuePayload.length) return 0
      const normalizedEpisodeId = episodeId || null
      const idx = queuePayload.findIndex((entry) => {
        if (entry.libraryItemId !== libraryItemId) return false
        const entryEpisodeId = entry.episodeId || null
        return entryEpisodeId === normalizedEpisodeId
      })
      if (idx >= 0) return idx
      const safeFallback = Math.max(0, Math.min(fallbackIndex, queuePayload.length - 1))
      return safeFallback
    },
    resolvePlaybackTarget({ ids, preferServerIds, forceLocal }) {
      // forceLocal is now what happens anyway whenever a download exists; it still overrides
      // preferring the server, which is how a cast session is told to play a download locally.
      return resolvePlaybackTarget({ ids, preferServerIds: preferServerIds && !forceLocal, isOffline: this.appStore.isOffline })
    },
    showBookmarks() {
      this.showBookmarksModal = true
    },
    openQueue() {
      const queue = this.appStore.playQueue
      if (!Array.isArray(queue) || !queue.length) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: '[AudioPlayerContainer] openQueue requested but queue is empty'
        })
        return
      }

      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] openQueue: ${formatForLog({ queueLength: queue.length, queueIndex: this.appStore.queueIndex })}`
      })

      this.showQueueModal = true
    },
    selectBookmark(bookmark) {
      this.showBookmarksModal = false
      if (!bookmark || isNaN(bookmark.time)) return
      const bookmarkTime = Number(bookmark.time)
      if (this.$refs.audioPlayer) {
        this.$refs.audioPlayer.seek(bookmarkTime)
      }
    },
    onSleepTimerEnded({ value: currentPosition }) {
      this.isSleepTimerRunning = false
      if (currentPosition) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `Sleep Timer Ended Current Position: ${currentPosition}`
        })
      }
    },
    onSleepTimerSet(payload) {
      const { value: sleepTimeRemaining, isAuto } = payload
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `SLEEP TIMER SET: ${formatForLog(payload)}`
      })
      if (sleepTimeRemaining === 0) {
        AbsLogger.info({ tag: 'AudioPlayerContainer', message: 'Sleep timer canceled' })
        this.isSleepTimerRunning = false
      } else {
        this.isSleepTimerRunning = true
      }

      this.isAutoSleepTimer = !!isAuto
      this.sleepTimeRemaining = sleepTimeRemaining
    },
    showSleepTimer() {
      if (this.$refs.audioPlayer && this.$refs.audioPlayer.currentChapter) {
        this.currentEndOfChapterTime = Math.floor(this.$refs.audioPlayer.currentChapter.end)
      } else {
        this.currentEndOfChapterTime = 0
      }
      this.showSleepTimerModal = true
    },
    async selectSleepTimeout({ time, isChapterTime }) {
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `Setting sleep timer: ${formatForLog({ time, isChapterTime })}`
      })
      var res = await AbsAudioPlayer.setSleepTimer({ time: String(time), isChapterTime })
      if (!res.success) {
        return this.toast.error('Sleep timer did not set, invalid time')
      }
    },
    increaseSleepTimer() {
      // Default time to increase = 5 min
      AbsAudioPlayer.increaseSleepTime({ time: '300000' })
    },
    decreaseSleepTimer() {
      AbsAudioPlayer.decreaseSleepTime({ time: '300000' })
    },
    async cancelSleepTimer() {
      AbsLogger.info({ tag: 'AudioPlayerContainer', message: 'Canceling sleep timer' })
      await AbsAudioPlayer.cancelSleepTimer()
    },
    updatePlaybackSpeed(speed) {
      if (this.$refs.audioPlayer) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] Update Playback Speed: ${speed}`
        })
        this.$refs.audioPlayer.setPlaybackSpeed(speed)
      }
      void this.userStore.updateUserSettings({ playbackRate: speed })
    },
    changePlaybackSpeed(speed) {
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] Change Playback Speed: ${speed}`
      })
      void this.userStore.updateUserSettings({ playbackRate: speed })
    },
    settingsUpdated(settings) {
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] Settings Update | PlaybackRate: ${settings.playbackRate}`
      })
      this.playbackSpeed = settings.playbackRate
      if (this.$refs.audioPlayer && this.$refs.audioPlayer.currentPlaybackRate !== settings.playbackRate) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] PlaybackRate Updated: ${this.playbackSpeed}`
        })
        this.$refs.audioPlayer.setPlaybackSpeed(this.playbackSpeed)
      }

      // Settings have been loaded (at least once, so it's safe to kickoff onReady)
      if (!this.settingsLoaded) {
        this.settingsLoaded = true
        this.notifyOnReady()
      }
    },
    closeStreamOnly() {
      // If user logs out or disconnects from server and not playing local
      if (this.$refs.audioPlayer && !this.$refs.audioPlayer.isLocalPlayMethod) {
        this.$refs.audioPlayer.closePlayback()
      }
    },
    castLocalItem() {
      let libraryItemId = this.serverLibraryItemId
      let episodeId = this.serverEpisodeId
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data() infers this field as `null` in a plain <script>; it is assigned a string elsewhere
      if (!libraryItemId) {
        const session = this.appStore.currentPlaybackSession
        if (session) {
          if (session.libraryItemId && !session.libraryItemId.startsWith('local')) {
            libraryItemId = session.libraryItemId
            episodeId = session.episodeId
          } else if (session.localLibraryItem?.libraryItemId) {
            libraryItemId = session.localLibraryItem.libraryItemId
            episodeId = session.localEpisode?.serverEpisodeId || null
          }
        }
      }
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- data() infers this field as `null` in a plain <script>; it is assigned a string elsewhere
      if (!libraryItemId) {
        this.toast.error(`Cannot cast locally downloaded media`)
        return
      }
      // Change to server library item
      this.playServerLibraryItemAndCast(libraryItemId, episodeId)
    },
    playServerLibraryItemAndCast(libraryItemId, episodeId) {
      var playbackRate = this.playbackSpeed || 1
      const startTime = Math.floor(this.currentTime || 0)
      const queuePayload = this.getQueuePayload(this.appStore.playQueue, true)
      const payload = { libraryItemId, episodeId, playWhenReady: false, playbackRate }
      if (queuePayload.length) {
        payload.queue = queuePayload
        const fallbackIndex = this.appStore.queueIndex ?? 0
        payload.queueIndex = this.resolveQueueIndex(queuePayload, libraryItemId, episodeId || null, fallbackIndex)
      }
      if (startTime) payload.startTime = startTime
      AbsAudioPlayer.prepareLibraryItem(payload)
        .then((data) => {
          if (data.error) {
            const errorMsg = data.error || 'Failed to play'
            this.toast.error(errorMsg)
          } else {
            AbsLogger.info({
              tag: 'AudioPlayerContainer',
              message: `Library item play response: ${formatForLog(data)}`
            })
            this.serverLibraryItemId = libraryItemId
            this.serverEpisodeId = episodeId
            AbsAudioPlayer.requestSession()
          }
        })
        .catch((error) => {
          console.error('Failed', error)
          this.toast.error('Failed to play')
        })
    },
    // The event bus does not await its listeners; these keep the promise from being dropped
    // silently (a rejection reaches the global unhandledrejection log).
    playLibraryItemListener(payload) {
      void this.playLibraryItem(payload)
    },
    deviceFocusedListener(hasFocus) {
      void this.deviceFocused(hasFocus)
    },
    async playLibraryItem(payload) {
      await AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `playLibraryItem: Received play request for library item ${payload.libraryItemId} ${payload.episodeId ? `episode ${payload.episodeId}` : ''}`
      })
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] playLibraryItem received: ${formatForLog({
          payload,
          storeQueueSize: this.appStore.playQueue.length,
          storeQueueIndex: this.appStore.queueIndex,
          isCasting: this.appStore.isCasting
        })}`
      })
      const ids = this.resolveQueueItemIds(payload)
      const canUseServerIds = !!ids.serverLibraryItemId && !this.isLocalId(ids.serverLibraryItemId)
      const effectiveForceLocal = !!payload.forceLocal && !(this.appStore.isCasting && canUseServerIds)
      const shouldUseServerIds = this.appStore.isCasting && canUseServerIds && !effectiveForceLocal
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] Resolved IDs for play: ${formatForLog({
          ids,
          canUseServerIds,
          shouldUseServerIds,
          forceLocal: payload.forceLocal,
          effectiveForceLocal
        })}`
      })
      const playbackTarget = this.resolvePlaybackTarget({
        ids,
        preferServerIds: shouldUseServerIds,
        forceLocal: effectiveForceLocal
      })
      let libraryItemId = playbackTarget.libraryItemId
      let episodeId = playbackTarget.episodeId
      if (!libraryItemId) {
        this.appStore.playerIsStartingPlayback = false
        this.toast.error('Unable to determine item to play')
        return
      }
      if (playbackTarget.blockedByOffline) {
        this.appStore.playerIsStartingPlayback = false
        this.toast.error('No offline copy available. Reconnect to stream this item.')
        return
      }
      if (payload.forceLocal && !effectiveForceLocal) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] Ignoring forceLocal while casting because server IDs are available: ${formatForLog({
            serverLibraryItemId: ids.serverLibraryItemId,
            serverEpisodeId: ids.serverEpisodeId,
            localLibraryItemId: ids.localLibraryItemId,
            localEpisodeId: ids.localEpisodeId
          })}`
        })
      }
      if (playbackTarget.usingLocalFallback) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] Falling back to local playback target: ${formatForLog({
            serverLibraryItemId: ids.serverLibraryItemId,
            localLibraryItemId: ids.localLibraryItemId,
            serverEpisodeId: ids.serverEpisodeId,
            localEpisodeId: ids.localEpisodeId,
            networkConnected: this.appStore.networkConnected,
            serverReachable: this.appStore.serverReachable
          })}`
        })
      }
      const useServerQueueIds = !this.isLocalId(libraryItemId)
      const startWhenReady = !payload.paused

      const isLocal = this.isLocalId(libraryItemId)
      let startTime = payload.startTime
      if (!isLocal) {
        const hasPermission = await this.checkCellularPermission('streaming')
        if (!hasPermission) {
          this.appStore.playerIsStartingPlayback = false
          return
        }
      }

      // When playing local library item and can also play this item from the server
      //   then store the server library item id so it can be used if a cast is made
      const serverLibraryItemId = ids.serverLibraryItemId || payload.serverLibraryItemId || null
      const serverEpisodeId = ids.serverEpisodeId || payload.serverEpisodeId || null

      if (this.appStore.isCasting && isLocal) {
        const { value } = await Dialog.confirm({
          title: 'Warning',
          message: `Cannot cast downloaded media items. Confirm to close cast and play on your device.`
        })
        if (!value) {
          this.appStore.playerIsStartingPlayback = false
          return
        }
      }

      // if already playing this item then jump to start time
      //
      // Only the store's flag counts here: it is driven by the native player's own playing
      // updates. The AudioPlayer component's copy survives a webview reload with whatever value
      // it last had, so after the app is reopened it can claim to be playing an item the native
      // player no longer has loaded. Taking the shortcut then calls play() on an empty player and
      // nothing happens - the item is unplayable until you start something else first.
      const isAlreadyStreaming = this.appStore.getIsMediaStreaming(libraryItemId, episodeId)
      const isCurrentlyPlaying = this.appStore.playerIsPlaying

      if (isAlreadyStreaming && isCurrentlyPlaying) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `Already streaming item: ${formatForLog({
            startTime,
            queueSize: payload.queue?.length,
            storeQueueSize: this.appStore.playQueue.length,
            queueIndex: this.appStore.queueIndex,
            playerIsPlaying: this.appStore.playerIsPlaying,
            audioPlayerIsPlaying: this.$refs.audioPlayer?.isPlaying
          })}`
        })
        if (startTime !== undefined && startTime !== null) {
          // seek to start time
          AbsAudioPlayer.seek({ value: startTime })
        } else if (this.$refs.audioPlayer) {
          this.$refs.audioPlayer.play()
        }
        this.appStore.playerIsStartingPlayback = false
        return
      }

      if (isAlreadyStreaming) {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `Item matches current session but player inactive; preparing again: ${formatForLog({
            queueSize: payload.queue?.length,
            storeQueueSize: this.appStore.playQueue.length,
            queueIndex: this.appStore.queueIndex,
            playerIsPlaying: this.appStore.playerIsPlaying,
            playerIsStartingPlayback: this.appStore.playerIsStartingPlayback,
            audioPlayerIsPlaying: this.$refs.audioPlayer?.isPlaying
          })}`
        })
      }

      this.serverLibraryItemId = null
      this.serverEpisodeId = null

      let playbackRate = this.playbackSpeed || 1

      if (payload.queue) {
        this.appStore.setPlayQueue(payload.queue)
        if (payload.queueIndex !== undefined) {
          this.appStore.setQueueIndex(payload.queueIndex)
        } else {
          const idx = payload.queue.findIndex((q) => {
            const queueIds = this.resolveQueueItemIds(q)
            const queueLibraryItemId = useServerQueueIds
              ? queueIds.serverLibraryItemId
              : queueIds.localLibraryItemId || queueIds.fallbackLibraryItemId
            const queueEpisodeId = useServerQueueIds
              ? queueIds.serverEpisodeId
              : queueIds.localEpisodeId ?? queueIds.serverEpisodeId ?? queueIds.fallbackEpisodeId
            if (!queueLibraryItemId) return false
            return (
              queueLibraryItemId === libraryItemId && (queueEpisodeId || null) === (episodeId || null)
            )
          })
          if (idx >= 0) this.appStore.setQueueIndex(idx)
        }
      } else {
        this.appStore.setPlayQueue([payload])
        this.appStore.setQueueIndex(0)
      }

      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `Called playLibraryItem: ${libraryItemId}`
      })
      const queuePayload = this.getQueuePayload(this.appStore.playQueue, useServerQueueIds)
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] Queue payload prepared: ${formatForLog({
          preferServerIds: useServerQueueIds,
          originalQueueSize: this.appStore.playQueue.length,
          queuePayloadSize: queuePayload.length,
          queuePayloadSample: queuePayload.slice(0, 5)
        })}`
      })
      const preparePayload = {
        libraryItemId,
        episodeId,
        playWhenReady: startWhenReady,
        playbackRate
      }
      if (queuePayload.length) {
        preparePayload.queue = queuePayload
        const fallbackIndex = this.appStore.queueIndex ?? 0
        preparePayload.queueIndex = this.resolveQueueIndex(queuePayload, libraryItemId, episodeId || null, fallbackIndex)
      }
      // A download prepared without a start time plays from the device's own record, which misses
      // listening the server saw while the app was closed. Every skip, queue pick and item-page
      // play of a download arrives without one, so ask the newest record instead. Only here, for
      // a session being prepared: an item already loaded keeps its live position.
      if ((startTime === undefined || startTime === null) && isLocal) {
        startTime = resumePoint(ids.serverLibraryItemId, ids.serverEpisodeId, this.progressLookup)?.startTime
      }
      if (startTime !== undefined && startTime !== null) preparePayload.startTime = startTime
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `[AudioPlayerContainer] Calling AbsAudioPlayer.prepareLibraryItem: ${formatForLog({ preparePayload })}`
      })
      AbsAudioPlayer.prepareLibraryItem(preparePayload)
        .then((data) => {
          if (data.error) {
            const errorMsg = data.error || 'Failed to play'
            this.toast.error(errorMsg)
          } else {
            AbsLogger.info({
              tag: 'AudioPlayerContainer',
              message: `Library item play response: ${formatForLog(data)}`
            })
            if (!this.isLocalId(libraryItemId)) {
              this.serverLibraryItemId = libraryItemId
            } else if (serverLibraryItemId && !this.isLocalId(serverLibraryItemId)) {
              this.serverLibraryItemId = serverLibraryItemId
            } else {
              this.serverLibraryItemId = null
            }
            if (episodeId && !this.isLocalId(episodeId)) {
              this.serverEpisodeId = episodeId
            } else if (serverEpisodeId && !this.isLocalId(serverEpisodeId)) {
              this.serverEpisodeId = serverEpisodeId
            } else {
              this.serverEpisodeId = null
            }
            if (this.appStore.isCasting) {
              AbsAudioPlayer.requestSession()
            }
          }
        })
        .catch((error) => {
          AbsLogger.error({
            tag: 'AudioPlayerContainer',
            message: `[AudioPlayerContainer] prepareLibraryItem failed: ${formatForLog({ error: String(error) })}`
          })
          this.toast.error('Failed to play')
        })
        .finally(() => {
          this.appStore.playerIsStartingPlayback = false
        })
    },
    pauseItem() {
      if (this.$refs.audioPlayer && this.$refs.audioPlayer.isPlaying) {
        this.$refs.audioPlayer.pause()
      }
    },
    onLocalMediaProgressUpdate(localMediaProgress) {
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `Got local media progress update: ${formatForLog({
          progress: localMediaProgress.progress,
          payload: localMediaProgress
        })}`
      })
      this.globalsStore.updateLocalMediaProgress(localMediaProgress)
    },
    onMediaPlayerChanged(data) {
      // data.value is the player name, not a session - see appStore.setMediaPlayer
      this.appStore.setMediaPlayer(data.value)
    },
    onReady() {
      // The UI is reporting elsewhere we are ready
      this.isReady = true
      this.notifyOnReady()
    },
    notifyOnReady() {
      // TODO: was used on iOS to open last played media. May be removed
      if (!this.isIos) return

      // If settings aren't loaded yet, native player will receive incorrect settings
      AbsLogger.info({
        tag: 'AudioPlayerContainer',
        message: `Notify on ready... settingsLoaded: ${this.settingsLoaded}, isReady: ${this.isReady}`
      })
      if (this.settingsLoaded && this.isReady && this.appStore.isFirstAudioLoad) {
        this.appStore.isFirstAudioLoad = false // Only run this once on app launch
        AbsAudioPlayer.onReady()
      }
    },
    playbackTimeUpdate(currentTime) {
      this.$refs.audioPlayer?.seek(currentTime)
    },
    /**
     * Current user's progress for an item from the server, or null if the request fails, times
     * out, or answers about a different item.
     *
     * The player is put into its loading state for the duration so the user cannot hit play
     * against a position that is about to change. The timeout is short so an unresponsive server
     * does not lock the controls for long.
     */
    async getServerMediaProgress({ libraryItemId, episodeId }) {
      if (!libraryItemId) return null

      // Focus and socket reconnect can both fire at once; one check at a time is enough
      if (this.$refs.audioPlayer?.isCheckingServerProgress) {
        console.log('[AudioPlayerContainer] getServerMediaProgress: already checking server progress')
        return null
      }

      const url = episodeId ? `/api/me/progress/${libraryItemId}/${episodeId}` : `/api/me/progress/${libraryItemId}`
      this.$refs.audioPlayer?.setIsCheckingServerProgress(true)
      try {
        const data = await Promise.race([
          this.nativeHttp.get(url, { connectTimeout: 7000, readTimeout: 7000 }),
          new Promise((_resolve, reject) =>
            setTimeout(() => reject(new Error('Timed out checking server media progress')), SERVER_PROGRESS_TIMEOUT_MS)
          )
        ])
        if (!data || data.libraryItemId !== libraryItemId) return null
        return data
      } catch (error) {
        AbsLogger.error({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] Failed to get server media progress ${formatForLog(error)}`
        })
        return null
      } finally {
        this.$refs.audioPlayer?.setIsCheckingServerProgress(false)
      }
    },
    /**
     * Refreshes the player timestamps when the device regains focus, and picks up progress made
     * elsewhere: for a downloaded item the server copy wins when it is more recent, so listening
     * on another device carries over.
     */
    async deviceFocused(hasFocus) {
      if (!this.appStore.currentPlaybackSession) return
      if (!hasFocus) return
      // Don't move the position out from under playback that is already running
      if (this.$refs.audioPlayer?.isPlaying) return

      const playbackSession = this.appStore.currentPlaybackSession
      if (this.$refs.audioPlayer.isLocalPlayMethod) {
        const localLibraryItemId = playbackSession.localLibraryItem?.id
        const localEpisodeId = playbackSession.localEpisodeId
        if (!localLibraryItemId) {
          AbsLogger.error({
            tag: 'AudioPlayerContainer',
            message: `[AudioPlayerContainer] device visibility: no local library item for session ${formatForLog(playbackSession)}`
          })
          return
        }
        const localMediaProgress = this.globalsStore.localMediaProgress.find((mp) => {
          if (localEpisodeId) return mp.localEpisodeId === localEpisodeId
          return mp.localLibraryItemId === localLibraryItemId
        })
        if (!localMediaProgress) {
          AbsLogger.error({
            tag: 'AudioPlayerContainer',
            message: '[AudioPlayerContainer] device visibility: Local media progress not found'
          })
          return
        }

        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] device visibility: found local media progress: ${formatForLog({
            currentTime: localMediaProgress.currentTime,
            playerCurrentTime: this.currentTime
          })}`
        })
        this.$refs.audioPlayer.currentTime = localMediaProgress.currentTime
        this.$refs.audioPlayer.timeupdate()

        // The item came from a server, so check whether it was listened to elsewhere since
        const serverLibraryItemId = playbackSession.libraryItemId
        const serverEpisodeId = playbackSession.episodeId
        if (!serverLibraryItemId || !this.userStore.user || this.appStore.isOffline) return

        const data = await this.getServerMediaProgress({ libraryItemId: serverLibraryItemId, episodeId: serverEpisodeId })
        if (!data || !data.lastUpdate || data.lastUpdate <= localMediaProgress.lastUpdate) return

        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] device visibility: server progress is more recent: ${formatForLog({
            serverCurrentTime: data.currentTime,
            localCurrentTime: localMediaProgress.currentTime,
            serverLastUpdate: data.lastUpdate,
            localLastUpdate: localMediaProgress.lastUpdate
          })}`
        })
        if (!this.$refs.audioPlayer?.isPlaying && data.currentTime !== localMediaProgress.currentTime) {
          // seek() rather than assigning currentTime, so the native session moves too
          this.$refs.audioPlayer.seek(data.currentTime)
        }

        try {
          const newLocalMediaProgress = await this.db.syncServerMediaProgressWithLocalMediaProgress({
            localMediaProgressId: localMediaProgress.id,
            mediaProgress: data
          })
          if (newLocalMediaProgress?.id) {
            this.globalsStore.updateLocalMediaProgress(newLocalMediaProgress)
          }
        } catch (error) {
          AbsLogger.error({
            tag: 'AudioPlayerContainer',
            message: `[AudioPlayerContainer] device visibility: Failed to sync server progress to local ${formatForLog(error)}`
          })
        }
      } else {
        const data = await this.getServerMediaProgress({
          libraryItemId: playbackSession.libraryItemId,
          episodeId: playbackSession.episodeId
        })
        if (!data) return
        if (this.$refs.audioPlayer?.isPlaying) return

        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] device visibility: got server media progress: ${formatForLog({
            currentTime: data.currentTime,
            playerCurrentTime: this.currentTime
          })}`
        })
        // Only move if it actually differs, so a rounding difference does not cause a seek
        if (Math.abs(data.currentTime - this.currentTime) > 1) {
          this.$refs.audioPlayer.seek(data.currentTime)
        } else {
          this.$refs.audioPlayer.currentTime = data.currentTime
          this.$refs.audioPlayer.timeupdate()
        }
      }
    },
    /** Socket was down long enough that progress updates from elsewhere may have been missed. */
    onSocketReconnected() {
      void this.deviceFocused(true)
    },

    onSkipNextRequest() {
      const nextItem = this.appStore.getNextQueueItem
      if (nextItem) {
        void this.playLibraryItem({
          libraryItemId: nextItem.localLibraryItem?.id || nextItem.libraryItemId,
          episodeId: nextItem.localEpisode?.id || nextItem.episodeId,
          serverLibraryItemId: nextItem.libraryItemId,
          serverEpisodeId: nextItem.episodeId,
          queue: this.appStore.playQueue,
          queueIndex: this.appStore.queueIndex + 1
        })
      }
    },
    onSkipPreviousRequest() {
      const idx = this.appStore.queueIndex
      if (idx > 0) {
        const prevItem = this.appStore.playQueue[idx - 1]
        void this.playLibraryItem({
          libraryItemId: prevItem.localLibraryItem?.id || prevItem.libraryItemId,
          episodeId: prevItem.localEpisode?.id || prevItem.episodeId,
          serverLibraryItemId: prevItem.libraryItemId,
          serverEpisodeId: prevItem.episodeId,
          queue: this.appStore.playQueue,
          queueIndex: idx - 1
        })
      }
    },
    onQueueIndexUpdate({ value }) {
      if (typeof value === 'number') {
        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] onQueueIndexUpdate: ${formatForLog({ value, queueLength: this.appStore.playQueue.length })}`
        })
        this.appStore.setQueueIndex(value)
      }
    },
    selectQueueItem(index) {
      const item = this.appStore.playQueue[index]
      if (!item) return
      void this.playLibraryItem({
        libraryItemId: item.localLibraryItem?.id || item.libraryItemId,
        episodeId: item.localEpisode?.id || item.episodeId,
        serverLibraryItemId: item.libraryItemId,
        serverEpisodeId: item.episodeId,
        queue: this.appStore.playQueue,
        queueIndex: index
      })
      this.showQueueModal = false
    },
    /**
     * Advances the queue when an item finishes, as a fallback.
     *
     * The native player advances the queue itself once its final progress sync completes, so this
     * waits to see whether that happened and only steps in if it did not - otherwise both would
     * fire and an episode would be skipped.
     */
    onPlaybackEnded() {
      if (!this.appStore.getNextQueueItem) return

      const endedSessionId = this.appStore.currentPlaybackSession?.id || null
      clearTimeout(this.queueAdvanceFallbackTimeout)
      this.queueAdvanceFallbackTimeout = setTimeout(() => {
        const sessionId = this.appStore.currentPlaybackSession?.id || null
        if (sessionId !== endedSessionId) return // native already moved on
        if (this.appStore.playerIsPlaying) return
        if (!this.appStore.getNextQueueItem) return

        AbsLogger.info({
          tag: 'AudioPlayerContainer',
          message: `[AudioPlayerContainer] Playback ended and the native queue did not advance, advancing from the client: ${formatForLog(
            { endedSessionId, queueIndex: this.appStore.queueIndex, queueLength: this.appStore.playQueue.length }
          )}`
        })
        this.onSkipNextRequest()
      }, QUEUE_ADVANCE_FALLBACK_MS)
    }
  },
  async mounted() {
    this.onLocalMediaProgressUpdateListener = await AbsAudioPlayer.addListener('onLocalMediaProgressUpdate', this.onLocalMediaProgressUpdate)
    this.onSleepTimerEndedListener = await AbsAudioPlayer.addListener('onSleepTimerEnded', this.onSleepTimerEnded)
    this.onSleepTimerSetListener = await AbsAudioPlayer.addListener('onSleepTimerSet', this.onSleepTimerSet)
    this.onMediaPlayerChangedListener = await AbsAudioPlayer.addListener('onMediaPlayerChanged', this.onMediaPlayerChanged)
    this.onCastAvailableUpdateListener = await AbsAudioPlayer.addListener('onCastAvailableUpdate', ({ value }) => {
      this.appStore.isCastAvailable = value
    })
    this.onCastSupportUpdateListener = await AbsAudioPlayer.addListener('onCastSupportUpdate', ({ value }) => {
      this.appStore.isCastEnabled = value
    })
    this.onSkipNextRequestListener = await AbsAudioPlayer.addListener('onSkipNextRequest', this.onSkipNextRequest)
    this.onSkipPreviousRequestListener = await AbsAudioPlayer.addListener('onSkipPreviousRequest', this.onSkipPreviousRequest)
    this.onQueueIndexUpdateListener = await AbsAudioPlayer.addListener('onQueueIndexUpdate', this.onQueueIndexUpdate)

    AbsAudioPlayer.getIsCastAvailable().then(({ value }) => {
      this.appStore.isCastAvailable = value
    })
    AbsAudioPlayer.getIsCastSupported?.().then?.(({ value }) => {
      this.appStore.isCastEnabled = value
    })

    this.playbackSpeed = this.userStore.getUserSetting('playbackRate')
    AbsLogger.info({
      tag: 'AudioPlayerContainer',
      message: `[AudioPlayerContainer] Init Playback Speed: ${this.playbackSpeed}`
    })

    this.eventBus.on('abs-ui-ready', this.onReady)
    this.eventBus.on('play-item', this.playLibraryItemListener)
    this.eventBus.on('pause-item', this.pauseItem)
    this.eventBus.on('close-stream', this.closeStreamOnly)
    this.eventBus.on('cast-local-item', this.castLocalItem)
    this.eventBus.on('user-settings', this.settingsUpdated)
    this.eventBus.on('playback-time-update', this.playbackTimeUpdate)
    this.eventBus.on('device-focus-update', this.deviceFocusedListener)
    this.eventBus.on('socket-reconnected', this.onSocketReconnected)
    this.eventBus.on('playback-ended', this.onPlaybackEnded)
    // Minimal mode has its own transport controls and the player component it would normally
    // emit from is not on screen, so skipping has to be reachable from the bus too
    this.eventBus.on('skip-next-queue', this.onSkipNextRequest)

    if (
      this.appStore.currentPlaybackSession &&
      this.appStore.isCasting
    ) {
      AbsAudioPlayer.requestSession()
    }

    if (this.appStore.playQueue.length) {
      AbsAudioPlayer.setPlayQueue({
        queue: this.appStore.playQueue,
        queueIndex: this.appStore.queueIndex
      })
    }
  },
  beforeUnmount() {
    this.onLocalMediaProgressUpdateListener?.remove()
    this.onSleepTimerEndedListener?.remove()
    this.onSleepTimerSetListener?.remove()
    this.onMediaPlayerChangedListener?.remove()
    this.onCastAvailableUpdateListener?.remove()
    this.onCastSupportUpdateListener?.remove()
    this.onSkipNextRequestListener?.remove()
    this.onSkipPreviousRequestListener?.remove()
    this.onQueueIndexUpdateListener?.remove()

    this.eventBus.off('abs-ui-ready', this.onReady)
    this.eventBus.off('play-item', this.playLibraryItemListener)
    this.eventBus.off('pause-item', this.pauseItem)
    this.eventBus.off('close-stream', this.closeStreamOnly)
    this.eventBus.off('cast-local-item', this.castLocalItem)
    this.eventBus.off('user-settings', this.settingsUpdated)
    this.eventBus.off('playback-time-update', this.playbackTimeUpdate)
    this.eventBus.off('device-focus-update', this.deviceFocusedListener)
    this.eventBus.off('socket-reconnected', this.onSocketReconnected)
    this.eventBus.off('playback-ended', this.onPlaybackEnded)
    this.eventBus.off('skip-next-queue', this.onSkipNextRequest)
    clearTimeout(this.queueAdvanceFallbackTimeout)
  }
})
</script>
