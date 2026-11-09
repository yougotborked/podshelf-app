<template>
  <div class="w-full h-full bg-md-surface-0 flex flex-col items-center justify-center min-h-screen">
    <nuxt-link to="/" class="absolute top-4 left-4 z-20 rounded-full h-10 w-10 flex items-center justify-center">
      <span class="material-symbols text-3xl text-md-on-surface-variant">arrow_back</span>
    </nuxt-link>

    <!-- Branding -->
    <div class="flex flex-col items-center mb-8 short:hidden">
      <div class="h-20 w-20 rounded-md-2xl bg-md-surface-2 flex items-center justify-center mb-4 elevation-1">
        <ui-podshelf-mark class="h-14 w-14 text-md-primary" />
      </div>
      <h1 class="text-md-headline-s text-md-on-surface">Podshelf</h1>
    </div>
    <div class="hidden short:flex items-center gap-3 mb-6">
      <div class="h-10 w-10 rounded-md-lg bg-md-surface-2 flex items-center justify-center">
        <ui-podshelf-mark class="h-7 w-7 text-md-primary" />
      </div>
      <p class="text-md-title-l text-md-on-surface">Podshelf</p>
    </div>

    <connection-server-connect-form v-if="deviceData" />

    <!-- Arriving here with no server reachable would otherwise be a dead end: the form cannot be
         completed offline and the back arrow routes straight back to this page. Continuing
         offline opens the app proper against a saved server, so the normal library layout and
         everything cached from it is available - not just the flat downloads list. -->
    <div v-if="offlineServer || hasDownloads" class="flex flex-col items-center gap-3 mt-6">
      <ui-btn v-if="offlineServer" :disabled="enteringOfflineMode" :padding-x="4" class="h-10" @click="continueOffline">
        <span class="flex items-center gap-2">
          <span class="material-symbols text-lg">cloud_off</span>
          {{ $strings.ButtonContinueOffline }}
        </span>
      </ui-btn>
      <nuxt-link v-if="hasDownloads" to="/downloads" class="flex items-center gap-2 text-md-on-surface-variant">
        <span class="material-symbols text-lg">download_done</span>
        <p class="text-md-label-l underline">{{ $strings.HeaderDownloads }}</p>
      </nuxt-link>
    </div>

    <!-- Footer -->
    <div class="flex items-center gap-2 mt-8 opacity-60">
      <a href="https://github.com/yougotborked/podshelf-app" target="_blank" class="text-md-label-m text-md-on-surface-variant">{{ $strings.MessageFollowTheProjectOnGithub }}</a>
      <a href="https://github.com/yougotborked/podshelf-app" target="_blank" aria-label="GitHub">
        <svg class="w-5 h-5 text-md-on-surface-variant" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" viewBox="0 0 24 24">
          <path d="M12 2.247a10 10 0 0 0-3.162 19.487c.5.088.687-.212.687-.475c0-.237-.012-1.025-.012-1.862c-2.513.462-3.163-.613-3.363-1.175a3.636 3.636 0 0 0-1.025-1.413c-.35-.187-.85-.65-.013-.662a2.001 2.001 0 0 1 1.538 1.025a2.137 2.137 0 0 0 2.912.825a2.104 2.104 0 0 1 .638-1.338c-2.225-.25-4.55-1.112-4.55-4.937a3.892 3.892 0 0 1 1.025-2.688a3.594 3.594 0 0 1 .1-2.65s.837-.262 2.75 1.025a9.427 9.427 0 0 1 5 0c1.912-1.3 2.75-1.025 2.75-1.025a3.593 3.593 0 0 1 .1 2.65a3.869 3.869 0 0 1 1.025 2.688c0 3.837-2.338 4.687-4.563 4.937a2.368 2.368 0 0 1 .675 1.85c0 1.338-.012 2.413-.012 2.75c0 .263.187.575.687.475A10.005 10.005 0 0 0 12 2.247z" fill="currentColor" />
        </svg>
      </a>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useAppStore } from '~/stores/app'
import { useLibrariesStore } from '~/stores/libraries'

definePageMeta({ layout: 'blank' })

const appStore = useAppStore()
const librariesStore = useLibrariesStore()

const userStore = useUserStore()
const localStore = useLocalStore()
const router = useRouter()

const deviceData = ref<unknown>(null)
const hasDownloads = ref(false)
const offlineServer = ref<Record<string, unknown> | null>(null)
const enteringOfflineMode = ref(false)

async function init() {
  await appStore.setupNetworkListener()
  const db = useDb()
  deviceData.value = await db.getDeviceData()
  appStore.setDeviceData(deviceData.value as Parameters<typeof appStore.setDeviceData>[0])
  await appStore.init()
  await appStore.setupNetworkListener()

  const localItems = (await db.getLocalLibraryItems().catch(() => [])) as unknown[]
  hasDownloads.value = !!localItems?.length

  // A saved server is enough to work offline against: its cached libraries and downloads are
  // already on the device. Prefer the one last used, otherwise the only one there is.
  const dd = deviceData.value as Record<string, unknown> | null
  const configs = (dd?.serverConnectionConfigs as Record<string, unknown>[]) || []
  offlineServer.value = configs.find((c) => c.id === dd?.lastServerConnectionConfigId) || configs[0] || null
}

/** Open the app offline against a saved server, rather than only its downloads. */
async function continueOffline() {
  const serverConfig = offlineServer.value
  if (!serverConfig || enteringOfflineMode.value) return
  enteringOfflineMode.value = true

  try {
    // Point the caches back at the last signed-in user before anything reads them
    await localStore.restoreUserId()
    userStore.serverConnectionConfig = serverConfig as unknown as import('~/types').ServerConnectionConfig
    userStore.accessToken = (serverConfig.token as string) || null
    await appStore.setOfflineMode(true)
    await router.replace('/bookshelf')
  } catch (error) {
    console.error('[connect] Failed to continue offline', error)
    enteringOfflineMode.value = false
  }
}

onMounted(() => {
  // Reset data on logouts
  librariesStore.reset()
  appStore.isFirstLoad = true
  void init()
})
</script>
