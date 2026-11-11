<template>
  <div class="w-full layout-wrapper bg-md-surface-1">
    <app-appbar v-if="!appStore.minimalModeActive" />
    <div id="content" class="overflow-hidden relative" :class="[appStore.getIsPlayerOpen && !appStore.minimalModeActive ? 'playerOpen' : '', appStore.minimalModeActive ? 'minimalMode' : '']">
      <slot />
    </div>
    <app-audio-player-container ref="streamContainer" />
    <modals-libraries-modal />
    <modals-playlists-add-create-modal />
    <modals-select-local-folder-modal />
    <modals-rssfeeds-rss-feed-modal />
    <app-side-drawer />
    <readers-reader />
  </div>
</template>

<script setup lang="ts">
import { AbsLogger } from '~/plugins/capacitor'

const appStore = useAppStore()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const globalsStore = useGlobalsStore()
const router = useRouter()
const route = useRoute()
const config = useRuntimeConfig()
const { isValidVersion, setOrientationLock } = useUtils()
const bus = useEventBus()
const wearSync = useWearSync()

/**
 * Tells the watch which server it is talking to, as soon as that is known.
 *
 * Separate from the queue, which is published by whichever screen resolved it. Without this the
 * watch cannot tell "the phone has never reached me" from "it did, and there is nothing to
 * play" - and a user whose current library is a book library never opens a screen that resolves
 * a podcast queue at all, so their watch sat on "Open Podshelf on your phone" indefinitely while
 * the phone was in fact right there.
 *
 * An empty queue is not sent with it. The watch keeps whatever it already has, so a run started
 * before switching libraries still plays.
 */
watch(
  () => [userStore.getServerAddress, userStore.getToken, userStore.getServerConnectionConfigId],
  ([serverAddress, token, configId]) => {
    if (!serverAddress || !token) return
    void wearSync.publish({ serverAddress, token, userId: (userStore.user?.id as string) || '', serverConnectionConfigId: configId || '' }, null)
  },
  { immediate: true }
)

const inittingLibraries = ref(false)
const hasMounted = ref(false)
const disconnectTime = ref(0)
const timeLostFocus = ref(0)
const socketDisconnectedTime = ref(0)
const connectionRetryTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
// Reset the moment the server answers; see useReconnectBackoff for why it backs off at all.
const reconnectAttempts = ref(0)

const streamContainer = ref<{ audioPlayerReady: boolean; streamOpen: (stream: unknown) => void } | null>(null)

// Watchers
watch(() => appStore.networkConnected, (newVal, oldVal) => {
  if (!hasMounted.value) return
  if (newVal) {
    console.log(`[default] network connected changed ${oldVal} -> ${newVal}`)
    // The radio came back, which says nothing about the server. Probe from a clean slate
    // rather than assuming, so a flapping link cannot bounce the whole UI online and back.
    reconnectAttempts.value = 0
    if (!userStore.user) {
      void attemptConnection()
    } else if (!librariesStore.currentLibraryId) {
      void initLibraries()
    } else {
      // Syncing straight away would spend its timeouts discovering the link is still dead, and
      // it cannot tell us whether the server is back. The scheduled retry probes first and syncs
      // once the server has actually answered.
      const timeSinceDisconnect = Date.now() - disconnectTime.value
      console.log(`[default] network back after ${timeSinceDisconnect}ms, probing server`)
      scheduleConnectionRetry(reconnectDelayMs(0))
    }
    if (userStore.user && librariesStore.currentLibraryId) {
      void appStore.autoDownloadCheck()
    }
  } else {
    console.log('[default] lost network connection')
    disconnectTime.value = Date.now()
    clearConnectionRetry()
  }
})

watch(() => appStore.socketConnected, (newVal) => {
  if (newVal) {
    clearConnectionRetry()
    // While the socket was down, progress updates made elsewhere were not delivered. After a long
    // outage the item open in the player may have moved on, so ask for a fresh check.
    const timeSinceDisconnect = Date.now() - socketDisconnectedTime.value
    if (socketDisconnectedTime.value && timeSinceDisconnect > 30000 && appStore.currentPlaybackSession) {
      console.log(`[default] socket reconnected after ${timeSinceDisconnect}ms with the player open, checking server media progress`)
      bus.emit('socket-reconnected')
    } else {
      console.log(`[default] socket reconnected after ${timeSinceDisconnect}ms`)
    }
  } else {
    console.log('[default] socket disconnected')
    socketDisconnectedTime.value = Date.now()
    scheduleConnectionRetry(1200)
  }
})

watch(() => appStore.serverReachable, (newVal) => {
  if (newVal) {
    reconnectAttempts.value = 0
    clearConnectionRetry()
  } else {
    scheduleConnectionRetry()
  }
})

// Methods

async function loadSavedSettings() {
  const userSavedServerSettings = await useLocalStore().getServerSettings()
  if (userSavedServerSettings) {
    appStore.setServerSettings(userSavedServerSettings)
  }
  await userStore.loadUserSettings()
}

async function attemptConnection() {
  console.warn('[default] attemptConnection')
  if (appStore.offlineModeEnabled) {
    console.warn('[default] Offline mode enabled, not connecting')
    await AbsLogger.info({ tag: 'default', message: 'attemptConnection: Offline mode enabled' })
    return
  }
  if (!appStore.networkConnected) {
    console.warn('[default] No network connection')
    await AbsLogger.info({ tag: 'default', message: 'attemptConnection: No network connection' })
    return
  }
  if (appStore.attemptingConnection) return
  appStore.attemptingConnection = true

  const deviceData = await useDb().getDeviceData() as Record<string, unknown> | null
  let serverConfig: Record<string, unknown> | null = null
  if (deviceData) {
    globalsStore.hapticFeedback = (deviceData.deviceSettings as Record<string, unknown> | null | undefined)?.hapticFeedback as string || 'LIGHT'
    if (deviceData.lastServerConnectionConfigId && (deviceData.serverConnectionConfigs as unknown[] | null | undefined)?.length) {
      serverConfig = (deviceData.serverConnectionConfigs as Record<string, unknown>[]).find(
        (scc) => scc.id == deviceData.lastServerConnectionConfigId
      ) || null
    }
  }

  if (!serverConfig) {
    appStore.attemptingConnection = false
    await AbsLogger.info({ tag: 'default', message: 'attemptConnection: No last server config set' })
    return
  }

  await AbsLogger.info({ tag: 'default', message: `attemptConnection: Got server config, attempt authorize (${serverConfig.name})` })

  const nativeHttpOptions = {
    headers: { Authorization: `Bearer ${serverConfig.token}` },
    connectTimeout: 6000,
    serverConnectionConfig: serverConfig as { id: string; address: string; token?: string; refreshToken?: string }
  }
  const authRes = await useNativeHttp().post(`${serverConfig.address}/api/authorize`, null, nativeHttpOptions).catch(() => false) as Record<string, unknown> | false

  if (!authRes) {
    appStore.attemptingConnection = false
    scheduleConnectionRetry(5000)
    return
  }

  const { user, userDefaultLibraryId, serverSettings, ereaderDevices } = authRes
  appStore.setServerSettings(serverSettings as Record<string, unknown>)
  librariesStore.ereaderDevices = ereaderDevices as unknown[]

  const serverSettingsObj = serverSettings as Record<string, unknown>
  const userObj = user as Record<string, unknown>
  if (isValidVersion(serverSettingsObj.version as string, '2.26.0')) {
    if (serverConfig.token === userObj.token || userObj.isOldToken) {
      appStore.attemptingConnection = false
      await AbsLogger.info({ tag: 'default', message: `attemptConnection: Old token detected, requesting re-login` })
      await userStore.logout()
      void router.push(`/connect?error=oldAuthToken&serverConnectionConfigId=${serverConfig.id}`)
      return
    }
    serverConfig.token = userStore.accessToken || serverConfig.token
  }

  const lastLibraryId = await useLocalStore().getLastLibraryId()
  const userLibrariesAccessible = (userObj.librariesAccessible as string[] | null | undefined) || []
  if (lastLibraryId && (!userLibrariesAccessible.length || userLibrariesAccessible.includes(lastLibraryId))) {
    librariesStore.currentLibraryId = lastLibraryId
  } else if (userDefaultLibraryId) {
    librariesStore.currentLibraryId = userDefaultLibraryId as string
  }

  serverConfig.version = serverSettingsObj.version
  const savedServerConnectionConfig = await useDb().setServerConnectionConfig(serverConfig) as Record<string, unknown>

  userStore.user = userObj
  userStore.accessToken = (savedServerConnectionConfig.token || serverConfig.token) as string
  userStore.serverConnectionConfig = savedServerConnectionConfig as import('~/types').ServerConnectionConfig

  useLocalStore().setUserId((userObj).id as string)
  await userStore.loadUserSettings()

  useSocket().connect(savedServerConnectionConfig.address as string, savedServerConnectionConfig.token as string)

  await AbsLogger.info({ tag: 'default', message: `attemptConnection: Successful connection (${savedServerConnectionConfig.name})` })
  await initLibraries()
  appStore.attemptingConnection = false
}

async function initLibraries() {
  if (inittingLibraries.value) return
  inittingLibraries.value = true
  try {
    await librariesStore.load()
    await AbsLogger.info({ tag: 'default', message: `initLibraries loading library ${librariesStore.getCurrentLibraryName}` })
    await librariesStore.fetch(librariesStore.currentLibraryId)
    bus.emit('library-changed', librariesStore.currentLibraryId)
    if (userStore.user) {
      await appStore.autoDownloadCheck()
    }
  } finally {
    inittingLibraries.value = false
  }
}

async function syncLocalSessions(isFirstSync: boolean) {
  if (!userStore.user) {
    console.log('[default] No need to sync local sessions - not connected to server')
    return
  }
  await AbsLogger.info({ tag: 'default', message: 'Calling syncLocalSessions' })
  const response = await useDb().syncLocalSessionsWithServer(isFirstSync) as Record<string, unknown> | null
  if (response?.error) {
    console.error('[default] Failed to sync local sessions', response.error)
  } else {
    console.log('[default] Successfully synced local sessions')
    await globalsStore.loadLocalMediaProgress()
  }
}

function userUpdated(user: Record<string, unknown>) {
  if (userStore.user?.id == user.id) {
    userStore.user = user
  }
}

async function userMediaProgressUpdated(payload: Record<string, unknown>) {
  const prog = payload.data as Record<string, unknown>
  await AbsLogger.info({ tag: 'default', message: `userMediaProgressUpdate: Received updated media progress. Media item id ${payload.id}` })

  const isMediaOpenInPlayer = appStore.getIsMediaStreaming(prog.libraryItemId as string, prog.episodeId as string)
  if (isMediaOpenInPlayer && appStore.getCurrentPlaybackSessionId !== payload.sessionId && !appStore.playerIsPlaying) {
    await AbsLogger.info({ tag: 'default', message: `userMediaProgressUpdate: Item in player, paused, from different session. Updating to ${(payload.data as Record<string, unknown>).currentTime}` })
    bus.emit('playback-time-update', { currentTime: (payload.data as Record<string, unknown>).currentTime as number, duration: 0 })
  }

  const localProg = await useDb().getLocalMediaProgressForServerItem({ libraryItemId: prog.libraryItemId, episodeId: prog.episodeId }) as Record<string, unknown> | null
  let newLocalMediaProgress: Record<string, unknown> | null = null

  if (localProg && (localProg.lastUpdate as number) < (prog.lastUpdate as number)) {
    if (localProg.currentTime == prog.currentTime && localProg.isFinished == prog.isFinished) {
      await AbsLogger.info({ tag: 'default', message: `userMediaProgressUpdate: server lastUpdate is more recent but progress is up-to-date` })
      return
    }
    await AbsLogger.info({ tag: 'default', message: `userMediaProgressUpdate: syncing progress from server` })
    newLocalMediaProgress = await useDb().syncServerMediaProgressWithLocalMediaProgress({
      localMediaProgressId: localProg.id,
      mediaProgress: prog
    }) as Record<string, unknown> | null
  } else if (!localProg) {
    const localLibraryItem = await useDb().getLocalLibraryItemByLId(prog.libraryItemId as string) as Record<string, unknown> | null
    if (localLibraryItem) {
      if (prog.episodeId) {
        const lliEpisodes = ((localLibraryItem.media as Record<string, unknown> | null | undefined)?.episodes as Record<string, unknown>[] | null | undefined) || []
        const localEpisode = lliEpisodes.find((ep) => ep.serverEpisodeId === prog.episodeId)
        if (localEpisode) {
          newLocalMediaProgress = await useDb().syncServerMediaProgressWithLocalMediaProgress({
            localLibraryItemId: localLibraryItem.id,
            localEpisodeId: localEpisode.id,
            mediaProgress: prog
          }) as Record<string, unknown> | null
        }
      } else {
        newLocalMediaProgress = await useDb().syncServerMediaProgressWithLocalMediaProgress({
          localLibraryItemId: localLibraryItem.id,
          mediaProgress: prog
        }) as Record<string, unknown> | null
      }
    } else {
      console.log(`[default] userMediaProgressUpdate no local media progress or lli found for ${prog.id}`)
    }
  }

  if (newLocalMediaProgress?.id) {
    await AbsLogger.info({ tag: 'default', message: `userMediaProgressUpdate: local media progress updated for ${newLocalMediaProgress.id as string}` })
    globalsStore.updateLocalMediaProgress(newLocalMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
  }
}

const userMediaProgressUpdatedListener = asVoidHandler(userMediaProgressUpdated)

/**
 * Re-reads the user's media progress from the server after time out of focus.
 *
 * The device keeps playing and reporting progress while backgrounded, but the webview hears
 * none of it, so this is the only thing that brings its copy back in step before Catch up and
 * the auto playlist are read again.
 */
async function refreshUserMediaProgress() {
  if (!userStore.user) return

  const me = (await useNativeHttp()
    .get('/api/me', { connectTimeout: 10000 })
    .catch((error: unknown) => {
      console.error('[default] resume: failed to refresh user media progress', error)
      return null
    })) as Record<string, unknown> | null

  const mediaProgress = me?.mediaProgress as Record<string, unknown>[] | undefined
  if (!Array.isArray(mediaProgress)) return

  userStore.setUserMediaProgress(mediaProgress)
  await AbsLogger.info({
    tag: 'default',
    message: `resume: refreshed user media progress (${mediaProgress.length} entries)`
  })
}

async function visibilityChanged() {
  if (document.visibilityState === 'visible') {
    const elapsed = Date.now() - timeLostFocus.value
    console.log(`✅ [default] device visibility: has focus (${elapsed}ms out of focus)`)
    if (isResumeStale(elapsed)) {
      console.log('✅ [default] reloading local media progress')
      await globalsStore.loadLocalMediaProgress()
    }
    bus.emit('device-focus-update', true)

    // Coverage can come and go while the screen is off. Settle the question before the first
    // screen the user opens spends a ten second timeout discovering it for them.
    if (
      shouldCheckServerOnResume({
        elapsedMs: elapsed,
        offlineModeEnabled: appStore.offlineModeEnabled,
        networkConnected: appStore.networkConnected,
        hasServerConnectionConfig: !!userStore.serverConnectionConfig
      })
    ) {
      const reachable = await appStore.probeServerReachable()
      console.log(`✅ [default] resume probe: server ${reachable ? 'reachable' : 'unreachable'}`)
      if (!reachable) scheduleConnectionRetry()
      else await refreshUserMediaProgress()
    }
  } else {
    console.log('⛔️ [default] device visibility: does NOT have focus')
    timeLostFocus.value = Date.now()
    bus.emit('device-focus-update', false)
  }
}

const visibilityChangedListener = asVoidHandler(visibilityChanged)

function changeLanguage(code: string) {
  console.log('Changed lang', code)
  document.documentElement.lang = code
}

function scheduleConnectionRetry(delay?: number) {
  if (connectionRetryTimeout.value) return
  if (appStore.offlineModeEnabled) return
  if (!appStore.networkConnected) return
  if (!userStore.user && !userStore.serverConnectionConfig) return

  const delayMs = Math.max(delay ?? reconnectDelayMs(reconnectAttempts.value), 0)
  console.log(`[default] scheduling connection retry in ${delayMs}ms (attempt ${reconnectAttempts.value + 1})`)
  connectionRetryTimeout.value = setTimeout(() => {
    connectionRetryTimeout.value = null
    retryConnectionIfNeeded().catch((error) => {
      console.error('[default] retryConnectionIfNeeded failed', error)
    })
  }, delayMs)
}

function clearConnectionRetry() {
  if (connectionRetryTimeout.value) {
    clearTimeout(connectionRetryTimeout.value)
    connectionRetryTimeout.value = null
  }
}

/** True once the server has answered; leaves the app offline and reschedules if it has not. */
async function serverAnsweredProbe(): Promise<boolean> {
  if (await appStore.probeServerReachable()) {
    reconnectAttempts.value = 0
    return true
  }
  reconnectAttempts.value += 1
  scheduleConnectionRetry()
  return false
}

async function retryConnectionIfNeeded() {
  if (appStore.offlineModeEnabled) return
  if (!appStore.networkConnected) return
  if (appStore.attemptingConnection) return

  const hasUser = !!userStore.user
  const serverConfig = userStore.serverConnectionConfig

  if (!hasUser) {
    await attemptConnection()
    return
  }

  if (!serverConfig?.address || !serverConfig.token) {
    console.warn('[default] No server config available for retry connection')
    return
  }

  // Reconnecting the socket and syncing are expensive and slow against a dead link, and neither
  // reports back whether the server is there. Ask first, cheaply.
  if (!(await serverAnsweredProbe())) {
    console.log('[default] server still unreachable, staying offline')
    return
  }

  const socket = useSocket()
  const socketIsConnected = (socket as unknown as Record<string, unknown> | null | undefined)?.socket
    ? ((socket as unknown as Record<string, unknown>).socket as Record<string, unknown> | null | undefined)?.connected
    : false

  if (!socketIsConnected) {
    console.log('[default] Socket disconnected, reconnecting')
    socket.logout()
    socket.connect(serverConfig.address, serverConfig.token)
  } else if (!socket.isAuthenticated) {
    console.log('[default] Socket connected but unauthenticated, sending auth event')
    socket.sendAuthenticate()
  }

  try {
    await syncLocalSessions(false)
  } catch (error) {
    console.error('[default] retryConnectionIfNeeded sync failed', error)
  } finally {
    if (!appStore.serverReachable) {
      reconnectAttempts.value += 1
      scheduleConnectionRetry()
    }
  }
}

/** Leaving deliberate offline mode: reconnect and flush anything listened to while away. */
async function goOnline() {
  const socket = useSocket()
  if (userStore.user && socket.hasSocket()) {
    // Session survived offline mode, so just bring the socket back up
    socket.goOnline()
  } else {
    await attemptConnection()
  }
  await syncLocalSessions(false)
}

const goOnlineListener = asVoidHandler(goOnline)

// Lifecycle
onMounted(async () => {
  bus.on('change-lang', changeLanguage)
  bus.on('go-online', goOnlineListener)
  document.addEventListener('visibilitychange', visibilityChangedListener)

  const socket = useSocket()
  socket.$on('user_updated', userUpdated)
  socket.$on('user_media_progress_updated', userMediaProgressUpdatedListener)

  if (appStore.isFirstLoad) {
    await AbsLogger.info({ tag: 'default', message: `mounted: initializing first load (${usePlatform()} v${config.public.version})` })
    appStore.isFirstLoad = false

    // Before any cached read: without this the caches are keyed by a user id we do not have
    // until a connection succeeds, so an offline start finds nothing.
    await useLocalStore().restoreUserId()
    await loadSavedSettings()
    await appStore.loadOfflineMode()

    const deviceData = await useDb().getDeviceData() as Record<string, unknown> | null
    appStore.setDeviceData(deviceData)

    if (deviceData?.lastServerConnectionConfigId && (deviceData.serverConnectionConfigs as unknown[] | null | undefined)?.length) {
      const scc = (deviceData.serverConnectionConfigs as Record<string, unknown>[]).find(
        (s) => s.id == deviceData.lastServerConnectionConfigId
      )
      if (scc) {
        userStore.accessToken = scc.token as string
        userStore.serverConnectionConfig = scc as import('~/types').ServerConnectionConfig
      }
    }

    setOrientationLock(appStore.getOrientationLockSetting)

    await appStore.init()
    await appStore.setupNetworkListener()

    const serverConfig = userStore.serverConnectionConfig
    if (serverConfig && userStore.user) {
      await AbsLogger.info({ tag: 'default', message: `mounted: Server connected, init libraries (${userStore.getServerConfigName})` })
      await initLibraries()
    } else if (serverConfig) {
      // Bring the cached library list up first so the home screen renders its normal layout
      // straight away. Without this the app has no idea the current library is a podcast library
      // until the server answers, and shows the empty-bookshelf view instead - or stays on it
      // permanently when there is no connection at all.
      if (await librariesStore.loadCachedLibraries()) {
        await AbsLogger.info({ tag: 'default', message: `mounted: Restored ${librariesStore.libraries.length} cached libraries` })
        bus.emit('library-changed', librariesStore.currentLibraryId)
      }
      await AbsLogger.info({ tag: 'default', message: `mounted: Server config found, attempting connection (${userStore.getServerConfigName})` })
      await attemptConnection()
    } else {
      // No server session. Offline that is a dead end - the connect form cannot be completed -
      // so send anyone with downloaded content to their downloads instead of trapping them on
      // a screen they have no way to leave.
      const localItems = (await useDb().getLocalLibraryItems().catch(() => [])) as unknown[]
      if (localItems.length && appStore.isOffline) {
        await AbsLogger.info({ tag: 'default', message: 'mounted: No server config and offline, showing downloads' })
        if (route.path !== '/downloads') void router.replace('/downloads')
      } else {
        await AbsLogger.info({ tag: 'default', message: 'mounted: No server config, redirecting to connect' })
        void router.push('/connect')
      }
      hasMounted.value = true
      return
    }

    await syncLocalSessions(true)
    hasMounted.value = true

    await AbsLogger.info({ tag: 'default', message: 'mounted: fully initialized' })
    bus.emit('abs-ui-ready')
  }
})

onBeforeUnmount(() => {
  bus.off('go-online', goOnlineListener)
  bus.off('change-lang', changeLanguage)
  document.removeEventListener('visibilitychange', visibilityChangedListener)
  const socket = useSocket()
  socket.$off('user_updated', userUpdated)
  socket.$off('user_media_progress_updated', userMediaProgressUpdatedListener)
  clearConnectionRetry()
})
</script>
