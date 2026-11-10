<template>
  <div class="fixed top-0 left-0 right-0 layout-wrapper w-full z-50 overflow-hidden pointer-events-none">
    <div class="absolute top-0 left-0 w-full h-full transition-opacity duration-200" :class="show ? 'bg-black/60 pointer-events-auto' : 'bg-transparent'" @click="clickBackground" />
    <div class="absolute top-0 right-0 w-64 h-full bg-md-surface-1 transform transition-transform py-6 landscape:py-2 pointer-events-auto" :class="show ? '' : 'translate-x-64'" @click.stop>
      <div class="px-6 mb-4">
        <p v-if="user" class="text-base" v-html="getString('HeaderWelcome', [username])" />
      </div>

      <div class="w-full overflow-y-auto" style="max-height: calc(100vh - 180px)">
        <template v-for="item in navItems" :key="item.text">
          <button v-if="item.action" :tabindex="show ? 0 : -1" class="w-full hover:bg-md-surface-1/60 flex items-center py-3 px-6 text-md-on-surface-variant" @click="clickAction(item.action)">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <p class="pl-4">{{ item.text }}</p>
          </button>
          <nuxt-link v-else :to="item.to" :tabindex="show ? 0 : -1" class="w-full hover:bg-md-surface-1/60 flex items-center py-3 px-6 text-md-on-surface" :class="item.to && currentRoutePath.startsWith(item.to) ? 'bg-md-on-surface/5' : 'text-md-on-surface-variant'">
            <span class="material-symbols fill text-lg">{{ item.icon }}</span>
            <p class="pl-4">{{ item.text }}</p>
          </nuxt-link>
        </template>
      </div>
      <div class="absolute bottom-0 left-0 w-full py-6 px-6 text-md-on-surface">
        <div v-if="serverConnectionConfig" class="mb-4 flex justify-center">
          <p class="text-xs text-md-on-surface-variant" style="word-break: break-word">{{ serverConnectionConfig.address }} (v{{ serverSettings.version }})</p>
        </div>
        <div class="flex items-center">
          <p class="text-xs">{{ config.public.version }}</p>
          <div class="flex-grow" />
          <div v-if="user" class="flex items-center" @click="toggleOfflineMode">
            <p class="text-xs pr-2">{{ offlineModeEnabled ? getStrings().ButtonConnect : getStrings().ButtonDisconnect }}</p>
            <i class="material-symbols text-sm -mb-0.5">{{ offlineModeEnabled ? 'cloud' : 'cloud_off' }}</i>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import AppTouchEvent from '@/objects/TouchEvent'
import { getString } from '~/composables/useStrings'

const appStore = useAppStore()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const route = useRoute()
const router = useRouter()
const config = useRuntimeConfig()
const bus = useEventBus()
const getStrings = () => useStrings()
const { impact: hapticsImpact } = useHaptics()
const platform = usePlatform()

const touchEventRef = ref<InstanceType<typeof AppTouchEvent> | null>(null)

const show = computed({
  get: () => appStore.showSideDrawer,
  set: (val: boolean) => { appStore.showSideDrawer = val }
})

const user = computed(() => userStore.user)
const serverConnectionConfig = computed(() => userStore.serverConnectionConfig)
const serverSettings = computed(() => appStore.serverSettings || {})
const username = computed(() => (user.value as Record<string, unknown> | null | undefined)?.username as string || '')

const navItems = computed(() => {
  const items: { icon: string; text: string; to?: string; action?: string; iconOutlined?: boolean }[] = [
    { icon: 'home', text: getStrings().ButtonHome, to: '/bookshelf' }
  ]
  if (!serverConnectionConfig.value) {
    items.unshift({ icon: 'cloud_off', text: getStrings().ButtonConnectToServer, to: '/connect' })
  } else {
    items.push({ icon: 'person', text: getStrings().HeaderAccount, to: '/account' })
    items.push({ icon: 'equalizer', text: getStrings().ButtonUserStats, to: '/stats' })
  }

  if (platform !== 'ios') {
    items.push({ icon: 'folder', iconOutlined: true, text: getStrings().ButtonLocalMedia, to: '/localMedia/folders' })
  } else {
    items.push({ icon: 'download', iconOutlined: false, text: getStrings().HeaderDownloads, to: '/downloads' })
  }
  items.push({ icon: 'settings', text: getStrings().HeaderSettings, to: '/settings' })
  items.push({ icon: 'bug_report', iconOutlined: true, text: getStrings().ButtonLogs, to: '/logs' })

  if (serverConnectionConfig.value) {
    items.push({ icon: 'language', text: getStrings().ButtonGoToWebClient, action: 'openWebClient' })
    items.push({ icon: 'login', text: getStrings().ButtonSwitchServerUser, action: 'logout' })
  }

  return items
})

const currentRoutePath = computed(() => route.path)
const offlineModeEnabled = computed(() => appStore.offlineModeEnabled)

async function clickAction(action: string) {
  await hapticsImpact()
  if (action === 'logout') {
    await userStore.logout()
    void router.push('/connect')
  } else if (action === 'openWebClient') {
    show.value = false
    const path = `/library/${librariesStore.currentLibraryId}`
    await userStore.openWebClient(path)
  }
}

function clickBackground() {
  show.value = false
}

/**
 * Go offline, or come back online. This used to log out, which cleared the user id the local
 * caches are keyed by and so left the app with no libraries - the podcast home collapsed to a
 * generic bookshelf. Offline mode keeps the session and the caches and just stops talking to
 * the server; "Switch Server/User" in the menu above is still the real logout.
 */
async function toggleOfflineMode() {
  await hapticsImpact()
  const goingOffline = !appStore.offlineModeEnabled
  await appStore.setOfflineMode(goingOffline)

  if (goingOffline) {
    if (appStore.getIsPlayerOpen && !appStore.getIsCurrentSessionLocal) {
      // Nothing to stream from anymore, but a downloaded item keeps playing
      bus.emit('close-stream')
    }
  } else {
    bus.emit('go-online')
  }

  show.value = false
}

function touchstart(e: Event) {
  touchEventRef.value = new AppTouchEvent(e)
}

function touchend(e: Event) {
  if (!touchEventRef.value) return
  touchEventRef.value.setEndEvent(e)
  if (touchEventRef.value.isSwipeRight()) {
    show.value = false
  }
  touchEventRef.value = null
}

function registerListener() {
  document.addEventListener('touchstart', touchstart)
  document.addEventListener('touchend', touchend)
}

function removeListener() {
  document.removeEventListener('touchstart', touchstart as EventListener)
  document.removeEventListener('touchend', touchend as EventListener)
}

watch(route, () => { show.value = false })
watch(show, (newVal) => {
  if (newVal) registerListener()
  else removeListener()
})

onBeforeUnmount(() => {
  show.value = false
  removeListener()
})
</script>
