<template>
  <div class="w-full bg-md-surface-4 relative z-30 elevation-2 landscape:w-16 landscape:fixed landscape:left-0 landscape:top-0 landscape:bottom-0 landscape:h-full">
    <nav id="bookshelf-navbar" class="flex h-full pointer-events-auto">
      <nuxt-link
        v-for="item in items"
        :key="item.to"
        :to="item.to"
        class="flex-1 flex flex-col items-center justify-center py-1 min-h-[56px] relative transition-md-standard"
        :aria-label="item.text"
        :aria-current="routeName === item.routeName ? 'page' : undefined"
      >
        <!-- Active: pill wraps icon + label -->
        <div v-if="routeName === item.routeName"
             class="flex flex-col items-center justify-center rounded-md-full bg-md-primary-container px-5 py-1 min-w-[64px]">
          <span class="flex items-center justify-center h-6">
            <span
              v-if="item.iconPack === 'abs-icons'"
              class="abs-icons text-md-on-primary-container text-xl"
              :class="`icon-${item.icon}`"
            />
            <span
              v-else
              :class="[item.iconPack, 'text-md-on-primary-container text-xl']"
            >{{ item.icon }}</span>
          </span>
          <span class="text-md-label-m text-md-on-primary-container leading-tight">{{ item.text }}</span>
        </div>
        <!-- Inactive: icon only, no pill -->
        <span v-else class="flex items-center justify-center h-6">
          <span
            v-if="item.iconPack === 'abs-icons'"
            class="abs-icons text-md-on-surface-variant text-xl"
            :class="`icon-${item.icon}`"
          />
          <span
            v-else
            :class="[item.iconPack, 'text-md-on-surface-variant text-xl']"
          >{{ item.icon }}</span>
        </span>
      </nuxt-link>
    </nav>
  </div>
</template>

<script setup lang="ts">
const strings = useStrings()
const appStore = useAppStore()
const librariesStore = useLibrariesStore()
const route = useRoute()

const currentLibrary = computed(() => librariesStore.getCurrentLibrary)
const currentLibraryIcon = computed(() => (currentLibrary.value as Record<string, unknown>)?.icon as string || 'database')
const userHasPlaylists = computed(() => {
  const autoUnfinished = (appStore.deviceData as Record<string, unknown>)?.deviceSettings && ((appStore.deviceData as Record<string, unknown>).deviceSettings as Record<string, unknown>)?.autoCacheUnplayedEpisodes
  return librariesStore.numUserPlaylists || autoUnfinished
})
const routeName = computed(() => route.name)
const libraryMediaType = computed(() => librariesStore.getCurrentLibraryMediaType)
const isPodcast = computed(() => libraryMediaType.value === 'podcast')

const items = computed(() => {
  let navItems: { to: string; routeName: string; iconPack: string; icon: string; text: string }[] = []
  if (isPodcast.value) {
    navItems = [
      { to: '/bookshelf', routeName: 'bookshelf', iconPack: 'abs-icons', icon: 'home', text: strings.ButtonHome },
      { to: '/bookshelf/discover', routeName: 'bookshelf-discover', iconPack: 'material-symbols', icon: 'explore', text: strings.ButtonDiscover },
      { to: '/bookshelf/library', routeName: 'bookshelf-library', iconPack: 'abs-icons', icon: currentLibraryIcon.value, text: strings.ButtonLibrary }
    ]
  } else {
    navItems = [
      { to: '/bookshelf', routeName: 'bookshelf', iconPack: 'abs-icons', icon: 'home', text: strings.ButtonHome },
      { to: '/bookshelf/library', routeName: 'bookshelf-library', iconPack: 'abs-icons', icon: currentLibraryIcon.value, text: strings.ButtonLibrary },
      { to: '/bookshelf/series', routeName: 'bookshelf-series', iconPack: 'abs-icons', icon: 'columns', text: strings.ButtonSeries },
      { to: '/bookshelf/collections', routeName: 'bookshelf-collections', iconPack: 'material-symbols', icon: 'collections_bookmark', text: strings.ButtonCollections },
      { to: '/bookshelf/authors', routeName: 'bookshelf-authors', iconPack: 'abs-icons', icon: 'authors', text: strings.ButtonAuthors }
    ]
  }
  if (userHasPlaylists.value) {
    navItems.push({ to: '/bookshelf/playlists', routeName: 'bookshelf-playlists', iconPack: 'material-symbols', icon: 'queue_music', text: strings.ButtonPlaylists })
  }
  return navItems
})
</script>

<style scoped>
@media (orientation: landscape) {
  #bookshelf-navbar {
    flex-direction: column;
    position: fixed;
    left: 0;
    top: 0;
    bottom: 0;
    width: 64px;
    height: 100%;
    z-index: 30;
    padding-top: 56px; /* leave room for appbar */
    padding-bottom: 72px; /* leave room for mini-player */
    overflow-y: auto;
  }
  #bookshelf-navbar > a {
    flex: none;
    width: 100%;
    min-height: 56px;
  }
}
</style>
