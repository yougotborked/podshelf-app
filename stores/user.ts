import { defineStore } from 'pinia'
import { Browser } from '@capacitor/browser'
import { CapacitorHttp } from '@capacitor/core'
import { AbsLogger } from '~/plugins/capacitor'
import type { UserSettings, ServerConnectionConfig, MediaProgress } from '~/types'

interface UserState {
  user: Record<string, unknown> | null
  accessToken: string | null
  serverConnectionConfig: ServerConnectionConfig | null
  settings: UserSettings
}

interface UserMediaProgressIndex {
  byItem: Map<string, MediaProgress>
  byEpisode: Map<string, MediaProgress>
}

export const useUserStore = defineStore('user', {
  state: (): UserState => ({
    user: null,
    accessToken: null,
    serverConnectionConfig: null,
    settings: {
      mobileOrderBy: 'addedAt',
      mobileOrderDesc: true,
      mobileFilterBy: 'all',
      playbackRate: 1,
      collapseSeries: false,
      collapseBookSeries: false
    }
  }),

  getters: {
    getIsRoot: (state) => state.user?.type === 'root',
    getIsAdminOrUp: (state) => state.user?.type === 'admin' || state.user?.type === 'root',
    getToken: (state) => state.accessToken || null,
    getServerConnectionConfigId: (state) => state.serverConnectionConfig?.id || null,
    getServerAddress: (state) => state.serverConnectionConfig?.address || null,
    getServerConfigName: (state) => state.serverConnectionConfig?.name || null,
    /**
     * Lookup indexes over the user's media progress.
     *
     * Long lists (the auto playlist runs to hundreds of rows) look progress up once per row, so a
     * linear scan per row makes rendering O(rows x progress entries).  The maps are rebuilt once
     * whenever mediaProgress changes and every row lookup is then O(1).
     */
    userMediaProgressIndex: (state): UserMediaProgressIndex => {
      const byItem = new Map<string, MediaProgress>()
      const byEpisode = new Map<string, MediaProgress>()
      const mediaProgress = (state.user?.mediaProgress as MediaProgress[]) || []

      for (const mp of mediaProgress) {
        const libraryItemId = mp.libraryItemId as string | undefined
        if (!libraryItemId) continue
        // `find` returns the first match, so earlier entries win here too
        if (!byItem.has(libraryItemId)) byItem.set(libraryItemId, mp)
        if (mp.episodeId) {
          const key = `${libraryItemId}|${mp.episodeId as string}`
          if (!byEpisode.has(key)) byEpisode.set(key, mp)
        }
      }

      return { byItem, byEpisode }
    },
    getUserMediaProgress(): (libraryItemId: string, episodeId?: string | null) => MediaProgress | null {
      const { byItem, byEpisode } = this.userMediaProgressIndex
      return (libraryItemId: string, episodeId: string | null = null) => {
        if (!libraryItemId) return null
        if (episodeId) return byEpisode.get(`${libraryItemId}|${episodeId}`) || null
        return byItem.get(libraryItemId) || null
      }
    },
    getUserBookmarksForItem: (state) => (libraryItemId: string) => {
      if (!state.user?.bookmarks) return []
      return (state.user.bookmarks as Record<string, unknown>[]).filter((bm) => bm.libraryItemId === libraryItemId)
    },
    getUserSetting: (state) => (key: keyof UserSettings) => state.settings?.[key] ?? null,
    getUserCanUpdate: (state) => !!(state.user?.permissions as Record<string, unknown>)?.update,
    getUserCanDelete: (state) => !!(state.user?.permissions as Record<string, unknown>)?.delete,
    getUserCanDownload: (state) => !!(state.user?.permissions as Record<string, unknown>)?.download,
    getUserCanAccessExplicitContent: (state) => !!(state.user?.permissions as Record<string, unknown>)?.accessExplicitContent
  },

  actions: {
    checkUpdateLibrarySortFilter(mediaType: string) {
      const settingsUpdate: Partial<UserSettings> = {}
      if (mediaType == 'podcast') {
        if (this.settings.mobileOrderBy == 'media.metadata.authorName' || this.settings.mobileOrderBy == 'media.metadata.authorNameLF') {
          settingsUpdate.mobileOrderBy = 'media.metadata.author'
        }
        if (this.settings.mobileOrderBy == 'media.duration') {
          settingsUpdate.mobileOrderBy = 'media.numTracks'
        }
        if (this.settings.mobileOrderBy == 'media.metadata.publishedYear') {
          settingsUpdate.mobileOrderBy = 'media.metadata.title'
        }
        const invalidFilters = ['series', 'authors', 'narrators', 'languages', 'progress', 'issues']
        const filterByFirstPart = (this.settings.mobileFilterBy || '').split('.').shift()
        if (filterByFirstPart && invalidFilters.includes(filterByFirstPart)) {
          settingsUpdate.mobileFilterBy = 'all'
        }
      } else {
        if (this.settings.mobileOrderBy == 'media.metadata.author') {
          settingsUpdate.mobileOrderBy = 'media.metadata.authorName'
        }
        if (this.settings.mobileOrderBy == 'media.numTracks') {
          settingsUpdate.mobileOrderBy = 'media.duration'
        }
      }
      if (Object.keys(settingsUpdate).length) {
        void this.updateUserSettings(settingsUpdate)
      }
    },

    async updateUserSettings(payload: Partial<UserSettings>) {
      if (!payload) return false
      let hasChanges = false
      const existingSettings = { ...this.settings }
      for (const key in existingSettings) {
        const k = key as keyof UserSettings
        if (payload[k] !== undefined && existingSettings[k] !== payload[k]) {
          hasChanges = true
          ;(existingSettings as Record<string, unknown>)[k] = payload[k]
        }
      }
      if (hasChanges) {
        this.settings = existingSettings
        const localStore = useLocalStore()
        await localStore.setUserSettings(existingSettings)
        useEventBus().emit('user-settings', this.settings)
      }
    },

    async loadUserSettings() {
      const localStore = useLocalStore()
      const userSettingsFromLocal = await localStore.getUserSettings()
      if (userSettingsFromLocal) {
        const userSettings = { ...this.settings }
        for (const key in userSettings) {
          const k = key as keyof UserSettings
          if (userSettingsFromLocal[k] !== undefined) {
            (userSettings as Record<string, unknown>)[k] = userSettingsFromLocal[k]
          }
        }
        this.settings = userSettings
        useEventBus().emit('user-settings', this.settings)
      }
    },

    async openWebClient(path: string | null = null) {
      const serverAddress = this.serverConnectionConfig?.address
      if (!serverAddress) {
        console.error('openWebClient: No server address')
        return
      }
      try {
        let url = serverAddress.replace(/\/$/, '')
        if (path?.startsWith('/')) url += path
        await Browser.open({ url })
      } catch (error) {
        console.error('Error opening browser', error)
      }
    },

    async logout(logoutFromServer = false) {
      if (this.serverConnectionConfig && logoutFromServer) {
        const db = useDb()
        const refreshToken = await db.getRefreshToken(this.serverConnectionConfig.id)
        const options: Record<string, unknown> = {}
        if (refreshToken) {
          options.headers = { 'x-refresh-token': refreshToken }
        }
        const nativeHttp = useNativeHttp()
        await nativeHttp.post('/logout', null, { ...options, connectTimeout: 10000 }).catch((error: Error) => {
          console.error('Failed to logout', error)
        })
      }
      const db = useDb()
      await db.logout()
      useSocket().logout()
      const localStore = useLocalStore()
      void localStore.removeLastLibraryId()
      await localStore.setPlaybackSession(null)
      await localStore.setPlayQueue([])
      await localStore.setQueueIndex(null)
      localStore.setUserId(null)
      this.user = null
      this.accessToken = null
      const serverName = this.serverConnectionConfig?.name || 'Not connected'
      this.serverConnectionConfig = null
      const librariesStore = useLibrariesStore()
      librariesStore.currentLibraryId = ''
      await AbsLogger.info({ tag: 'user', message: `Logged out from server ${serverName}` })
    },

    async refreshToken() {
      const db = useDb()
      const refreshToken = await db.getRefreshToken(this.serverConnectionConfig?.id || '')
      if (!refreshToken) {
        console.error('No refresh token found')
        return null
      }
      const serverAddress = this.serverConnectionConfig?.address
      const response = await CapacitorHttp.post({
        url: `${serverAddress}/auth/refresh`,
        headers: {
          'Content-Type': 'application/json',
          'x-refresh-token': refreshToken
        },
        data: {}
      })
      if (response.status !== 200) {
        console.error('[user] Token refresh request failed:', response.status)
        return null
      }
      const userResponseData = response.data as Record<string, unknown>
      const userObj = userResponseData.user as Record<string, unknown>
      if (!userObj?.accessToken) {
        console.error('[user] No access token in refresh response')
        return null
      }
      const updatedConfig = {
        ...this.serverConnectionConfig!,
        token: userObj.accessToken as string,
        refreshToken: userObj.refreshToken as string
      }
      const savedConfig = await db.setServerConnectionConfig(updatedConfig)
      this.accessToken = userObj.accessToken as string
      const socket = useSocket()
      if (socket?.connected && !socket.isAuthenticated) {
        socket.sendAuthenticate()
      } else if (!socket) {
        console.warn('[user] Socket not available, cannot re-authenticate')
      }
      if (savedConfig) {
        this.serverConnectionConfig = savedConfig as ServerConnectionConfig
      }
      return userObj.accessToken as string
    },

    removeMediaProgress(id: string) {
      if (!this.user) return
      this.user.mediaProgress = (this.user.mediaProgress as Record<string, unknown>[]).filter((mp) => mp.id != id)
    },

    /**
     * Replaces the user's media progress with the server's current set.
     *
     * Used on resume: while the app is backgrounded the device reports progress straight to the
     * server, and neither the native progress events nor the socket deliver that to the webview,
     * so what is held here can be an hour behind what the server knows. The server is the
     * authority for server progress, so its set replaces this one wholesale — the same thing
     * attemptConnection does with the user object at startup.
     */
    setUserMediaProgress(mediaProgress: Record<string, unknown>[]) {
      if (!this.user || !Array.isArray(mediaProgress)) return
      this.user.mediaProgress = mediaProgress
    },

    updateUserMediaProgress(data: Record<string, unknown>) {
      if (!data || !this.user) return
      const progress = this.user.mediaProgress as Record<string, unknown>[]
      const idx = progress.findIndex((mp) => mp.id === data.id)
      if (idx >= 0) {
        progress.splice(idx, 1, data)
      } else {
        progress.push(data)
      }
    },

    updateBookmark(bookmark: Record<string, unknown>) {
      if (!this.user?.bookmarks) return
      this.user.bookmarks = (this.user.bookmarks as Record<string, unknown>[]).map((bm) => {
        if (bm.libraryItemId === bookmark.libraryItemId && bm.time === bookmark.time) return bookmark
        return bm
      })
    },

    deleteBookmark({ libraryItemId, time }: { libraryItemId: string; time: number }) {
      if (!this.user?.bookmarks) return
      this.user.bookmarks = (this.user.bookmarks as Record<string, unknown>[]).filter((bm) => {
        if (bm.libraryItemId === libraryItemId && bm.time === time) return false
        return true
      })
    }
  }
})
