<template>
  <div class="w-full h-16 bg-md-surface-4 relative z-20 elevation-1">
    <div id="appbar" class="absolute top-0 left-0 w-full h-full flex items-center px-2">
      <a v-if="showBack" @click="back" aria-label="Back" class="rounded-full h-10 w-10 flex items-center justify-center mr-2 cursor-pointer">
        <span class="material-symbols text-3xl text-md-on-surface">arrow_back</span>
      </a>
      <div v-if="user && currentLibrary">
        <button type="button" aria-label="Show library modal" class="pl-1.5 pr-2.5 py-2 bg-md-surface-1/30 rounded-md flex items-center" @click="clickShowLibraryModal">
          <ui-library-icon :icon="currentLibraryIcon" :size="4" font-size="base" />
          <p class="text-md-body-m leading-4 ml-2 mt-0.5 max-w-24 truncate text-md-on-surface landscape:hidden">{{ currentLibraryName }}</p>
        </button>
      </div>

      <widgets-connection-indicator />

      <div class="flex-grow" />

      <widgets-download-progress-indicator />

      <!-- Must be connected to a server to cast, only supports media items on server -->
      <button
        v-if="user && (castEnabled || isCasting)"
        type="button"
        aria-label="Cast"
        class="mx-2 cursor-pointer flex items-center"
        :class="{ 'opacity-60': !isCastAvailable && !isCasting }"
        @click="castClick"
      >
        <span class="material-symbols text-2xl leading-none">
          {{ isCasting ? 'cast_connected' : 'cast' }}
        </span>
      </button>

      <nuxt-link v-if="user" class="mx-1.5 flex items-center h-10" to="/search" aria-label="Search">
        <span class="material-symbols text-2xl leading-none">search</span>
      </nuxt-link>

      <button type="button" aria-label="Toggle side drawer" class="h-7 mx-1.5" @click="clickShowSideDrawer">
        <span class="material-symbols" style="font-size: 1.75rem">menu</span>
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { AbsAudioPlayer } from '@/plugins/capacitor'

const appStore = useAppStore()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const route = useRoute()
const bus = useEventBus()

const onCastAvailableUpdateListener = ref<{ remove(): void } | null>(null)
const onCastSupportUpdateListener = ref<{ remove(): void } | null>(null)

const currentLibrary = computed(() => librariesStore.getCurrentLibrary)
const currentLibraryName = computed(() => currentLibrary.value?.name || '')
const currentLibraryIcon = computed(() => (currentLibrary.value as Record<string, unknown> | null | undefined)?.icon as string || 'database')
const showBack = computed(() => {
  if (!route.name) return true
  const name = String(route.name)
  return name !== 'index' && !name.startsWith('bookshelf')
})
const user = computed(() => userStore.user)
const isCasting = computed(() => appStore.isCasting)
const isCastAvailable = computed(() => appStore.isCastAvailable)
const castEnabled = computed(() => appStore.isCastEnabled)

function castClick() {
  if (appStore.getIsCurrentSessionLocal) {
    bus.emit('cast-local-item')
    return
  }
  AbsAudioPlayer.requestSession()
}

function clickShowSideDrawer() {
  appStore.showSideDrawer = true
}

function clickShowLibraryModal() {
  librariesStore.showModal = true
}

function back() {
  window.history.back()
}

function onCastAvailableUpdate(data: { value?: boolean } | null) {
  appStore.isCastAvailable = !!(data && data.value)
}

function onCastSupportUpdate(data: { value?: boolean } | null) {
  appStore.isCastEnabled = !!(data && data.value)
}

onMounted(async () => {
  AbsAudioPlayer.getIsCastAvailable().then((data: { value?: boolean } | null) => {
    appStore.isCastAvailable = !!(data && data.value)
  })
  const castSupportedFn = (AbsAudioPlayer as Record<string, unknown>).getIsCastSupported as (() => Promise<{ value?: boolean } | null>) | undefined
  void castSupportedFn?.().then((data) => {
    appStore.isCastEnabled = !!(data && data.value)
  })
  onCastAvailableUpdateListener.value = await AbsAudioPlayer.addListener('onCastAvailableUpdate', onCastAvailableUpdate)
  onCastSupportUpdateListener.value = await AbsAudioPlayer.addListener('onCastSupportUpdate', onCastSupportUpdate)
})

onBeforeUnmount(() => {
  onCastAvailableUpdateListener.value?.remove()
  onCastSupportUpdateListener.value?.remove()
})
</script>

<style>
/* elevation-1 utility handles the shadow */
.loader-dots div {
  animation-timing-function: cubic-bezier(0, 1, 1, 0);
}
.loader-dots div:nth-child(1) {
  left: 0px;
  animation: loader-dots1 0.6s infinite;
}
.loader-dots div:nth-child(2) {
  left: 0px;
  animation: loader-dots2 0.6s infinite;
}
.loader-dots div:nth-child(3) {
  left: 10px;
  animation: loader-dots2 0.6s infinite;
}
.loader-dots div:nth-child(4) {
  left: 20px;
  animation: loader-dots3 0.6s infinite;
}
@keyframes loader-dots1 {
  0% {
    transform: scale(0);
  }
  100% {
    transform: scale(1);
  }
}
@keyframes loader-dots3 {
  0% {
    transform: scale(1);
  }
  100% {
    transform: scale(0);
  }
}
@keyframes loader-dots2 {
  0% {
    transform: translate(0, 0);
  }
  100% {
    transform: translate(10px, 0);
  }
}
</style>
