<template>
  <div class="w-full h-full flex flex-col overflow-hidden">
    <!-- Sticky header -->
    <div class="px-4 pt-4 pb-2 flex items-start justify-between shrink-0">
      <div>
        <div class="flex items-center gap-2">
          <h1 class="text-md-title-l text-md-on-surface font-semibold">Catch up</h1>
          <stats-streak-chip />
        </div>
        <p class="text-md-body-s text-md-on-surface-variant mt-0.5">
          <template v-if="unfinishedEpisodes.length"> {{ unfinishedEpisodes.length }} episode{{ unfinishedEpisodes.length !== 1 ? 's' : '' }} · oldest first </template>
          <template v-else-if="!isLoading">All done</template>
        </p>
      </div>
      <button v-if="unfinishedEpisodes.length" @click="playNext" class="flex items-center gap-1.5 bg-md-primary text-md-on-primary rounded-md-full px-4 py-2 text-md-label-l shrink-0 ml-4 mt-0.5 active:scale-95 active:opacity-75 transition-all">
        <span class="material-symbols text-base leading-none">play_arrow</span>
        Play next
      </button>
    </div>

    <!-- Loading -->
    <div v-if="isLoading" class="flex-1 flex items-center justify-center">
      <widgets-loading-spinner />
    </div>

    <!-- All caught up -->
    <div v-else-if="!unfinishedEpisodes.length" class="flex-1 flex flex-col items-center justify-center px-6 text-center gap-3">
      <span class="material-symbols text-5xl text-md-primary">check_circle</span>
      <p class="text-md-title-m text-md-on-surface">All caught up!</p>
      <p class="text-md-body-m text-md-on-surface-variant">New episodes will appear here when they arrive.</p>
    </div>

    <!-- Episode list — reuse LatestEpisodeRow -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto">
      <tables-podcast-latest-episode-row
        v-for="episode in unfinishedEpisodes"
        :key="episode.id"
        :episode="episode"
        :local-episode="localEpisodeMap[episode.id]"
        :library-item-id="episode.libraryItemId"
        :local-library-item-id="localEpisodeMap[episode.id] && localEpisodeMap[episode.id].localLibraryItemId"
        :local-cover-url="localCoverMap[episode.libraryItemId]"
        @addToPlaylist="addEpisodeToPlaylist"
      />
    </div>
  </div>
</template>

<script>
import { defineComponent } from 'vue'
import { useAutoPlaylistPodcastRules } from '~/composables/useAutoPlaylist'
import { episodePublishedAt, orderListeningQueue, queueItemStartTime, toPlayQueueItems } from '~/composables/useListeningQueue'
import { useWearSync } from '~/composables/useWearSync'
import { buildLocalCoverMap } from '~/composables/useCoverSource'

export default defineComponent({
  props: {
    currentLibraryId: {
      type: String,
      default: null
    }
  },
  setup() {
    const appStore = useAppStore()
    const userStore = useUserStore()
    const globalsStore = useGlobalsStore()
    const eventBus = useEventBus()
    const db = useDb()
    const localStore = useLocalStore()
    const nativeHttp = useNativeHttp()
    const toast = useToast()
    const strings = useStrings()
    const { impact: hapticsImpact } = useHaptics()
    const { rules: podcastRules, refresh: refreshPodcastRules } = useAutoPlaylistPodcastRules()
    const wearSync = useWearSync()
    return { appStore, userStore, globalsStore, eventBus, db, localStore, nativeHttp, toast, strings, hapticsImpact, podcastRules, refreshPodcastRules, wearSync }
  },
  data() {
    return {
      episodes: [],
      isLoading: false,
      localLibraryItems: [],
      offlineToastShown: false
    }
  },
  watch: {
    currentLibraryId(newVal) {
      if (newVal) {
        void this.loadEpisodes()
      }
    },
    // The watch is told whenever this screen's queue changes. `immediate` matters: a watch
    // paired after the feed last changed would otherwise sit empty until an episode arrived or
    // finished, which on a quiet week is days.
    wearQueueItems: {
      immediate: true,
      handler() {
        this.publishToWatch()
      }
    }
  },
  computed: {
    networkConnected() {
      return this.appStore.networkConnected
    },
    socketConnected() {
      return this.appStore.socketConnected
    },
    serverReachable() {
      return this.appStore.serverReachable
    },
    localEpisodes() {
      const episodes = []
      this.localLibraryItems.forEach((li) => {
        if (li.media.episodes && li.media.episodes.length) {
          li.media.episodes.map((ep) => {
            ep.localLibraryItemId = li.id
            episodes.push(ep)
          })
        }
      })
      return episodes
    },
    localCoverMap() {
      return buildLocalCoverMap(this.localLibraryItems)
    },
    localEpisodeMap() {
      var epmap = {}
      this.localEpisodes.forEach((localEp) => {
        if (localEp.serverEpisodeId) {
          epmap[localEp.serverEpisodeId] = localEp
        }
      })
      return epmap
    },
    progressLookup() {
      // The server's record and the device's, read through the shared queue rules. The device
      // matters on its own: the native layer writes a finish before the socket confirms it, so
      // without it a just-finished episode lingers in the list.
      return {
        server: (libraryItemId, episodeId) => this.userStore.getUserMediaProgress(libraryItemId, episodeId),
        local: (libraryItemId, episodeId) => this.globalsStore.getLocalMediaProgressByServerItemId(libraryItemId, episodeId)
      }
    },
    wearQueueItems() {
      // The same mapping the play button uses, so the watch is handed exactly the queue a tap
      // on this screen would start - not a parallel list that could disagree with it.
      return toPlayQueueItems(this.unfinishedEpisodes, (ep) => this.localEpisodeMap[ep.id])
    },
    unfinishedEpisodes() {
      // Oldest-first, with no resume reordering: this is a list someone is reading, and one that
      // reshuffles as they listen is harder to scan than one that holds still. Minimal mode asks
      // the same function for the same queue with `resumeFirst`, since it has no list to scan.
      return orderListeningQueue(this.episodes, { rules: this.podcastRules, lookup: this.progressLookup })
    }
  },
  methods: {
    async loadLocalPodcastLibraryItems() {
      this.localLibraryItems = await this.db.getLocalLibraryItems('podcast')
    },
    async useOfflineEpisodes({ showToast = false } = {}) {
      if (!this.localLibraryItems.length) {
        await this.loadLocalPodcastLibraryItems()
      }

      const cached = await this.localStore.getCachedLatestEpisodes(this.currentLibraryId)
      if (cached.length) {
        this.episodes = cached
      } else {
        this.episodes = [...this.localEpisodes].sort((a, b) => episodePublishedAt(b) - episodePublishedAt(a)).slice(0, 200)
      }

      if (showToast && !this.offlineToastShown) {
        this.toast.error(this.strings.MessageServerConnectionUnavailable)
        this.offlineToastShown = true
      }
    },
    async loadEpisodes() {
      if (!this.currentLibraryId) return

      this.isLoading = true

      // A dropped socket is not an unreachable server - HTTP has its own timeout and sets
      // reachability itself, so only a known-offline state skips the fetch. And when we already
      // know we are offline there is nothing to report: the connection indicator says so, and
      // complaining about a request we chose not to make is just noise.
      if (this.appStore.isOffline) {
        // This return skips the finally below, so the spinner has to be cleared here too.
        // Without it the feed spins forever the moment you disconnect: the episodes load, but
        // isLoading stays true and the template never gets past the spinner.
        try {
          await this.useOfflineEpisodes({ showToast: false })
        } finally {
          this.isLoading = false
        }
        return
      }

      try {
        const episodePayload = await this.nativeHttp.get(`/api/libraries/${this.currentLibraryId}/recent-episodes?limit=200`, { connectTimeout: 10000 })

        if (!episodePayload) {
          throw new Error('Empty response payload')
        }

        this.episodes = episodePayload.episodes || []
        this.offlineToastShown = false
        void this.localStore.setCachedLatestEpisodes(this.currentLibraryId, this.episodes)
      } catch (error) {
        console.error('[PodcastCatchUpFeed] Failed to get recent episodes', error)
        await this.useOfflineEpisodes({ showToast: !this.appStore.offlineModeEnabled })
      } finally {
        this.isLoading = false
      }
    },
    /**
     * Hands the resolved queue to the watch.
     *
     * Fire-and-forget on purpose: the phone has no business waiting on a Bluetooth link to
     * render a list, and the native side already decides whether anything actually needs
     * sending - see queueNeedsPublishing in :wear-sync, which keeps an unchanged queue off the
     * air however often this is called.
     */
    publishToWatch() {
      const serverAddress = this.userStore.getServerAddress
      const token = this.userStore.getToken
      const session =
        serverAddress && token
          ? {
              serverAddress,
              token,
              userId: this.userStore.user?.id || '',
              serverConnectionConfigId: this.userStore.getServerConnectionConfigId || ''
            }
          : null

      void this.wearSync.publish(session, this.wearQueueItems, this.progressLookup)
    },
    async playNext() {
      const episodes = this.unfinishedEpisodes
      if (!episodes.length) return

      await this.hapticsImpact()

      // A queue of every unfinished episode, so playback continues without another tap - the
      // same pattern as a playlist's "play all".
      const queue = toPlayQueueItems(episodes, (ep) => this.localEpisodeMap[ep.id])
      if (!queue.length) return

      const first = queue[0]
      const startTime = queueItemStartTime(first, this.progressLookup)

      this.appStore.setPlayQueue(queue)
      this.appStore.setQueueIndex(0)
      this.appStore.playerIsStartingPlayback = true
      this.appStore.playerStartingPlaybackMediaId = first.serverEpisodeId || first.episodeId

      const playPayload = {
        libraryItemId: first.libraryItemId,
        episodeId: first.episodeId,
        serverLibraryItemId: first.serverLibraryItemId,
        serverEpisodeId: first.serverEpisodeId,
        queue,
        queueIndex: 0
      }
      if (startTime) playPayload.startTime = startTime

      this.eventBus.emit('play-item', playPayload)
    },
    async addEpisodeToPlaylist(episode) {
      const libraryItem = await this.nativeHttp.get(`/api/items/${episode.libraryItemId}`, { connectTimeout: 10000 }).catch((error) => {
        console.error('[PodcastCatchUpFeed] Failed to get library item', error)
        this.toast.error('Failed to get library item')
        return null
      })
      if (!libraryItem) return

      this.globalsStore.selectedPlaylistItems = [{ libraryItem, episode }]
      this.globalsStore.showPlaylistsAddCreateModal = true
    }
  },
  async mounted() {
    await this.refreshPodcastRules()
    await this.loadLocalPodcastLibraryItems()
    void this.loadEpisodes()
  }
})
</script>
