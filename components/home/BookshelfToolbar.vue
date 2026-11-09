<template>
  <div class="w-full h-9 bg-md-surface-1 relative z-20">
    <div id="bookshelf-toolbar" class="absolute top-0 left-0 w-full h-full z-20 flex items-center px-2">
      <div class="flex items-center w-full text-sm">
        <p v-show="!selectedSeriesName" class="pt-1">{{ formatNumber(totalEntities) }} {{ entityTitle }}</p>
        <p v-show="selectedSeriesName" class="ml-2 pt-1">{{ selectedSeriesName }} ({{ formatNumber(totalEntities) }})</p>
        <div class="flex-grow" />
        <span v-if="page == 'library' || seriesBookPage" class="material-symbols text-2xl px-2" @click="changeView">{{ !bookshelfListView ? 'view_list' : 'grid_view' }}</span>
        <template v-if="page === 'library'">
          <div class="relative flex items-center px-2">
            <span class="material-symbols text-2xl" @click="showFilterModal = true">filter_alt</span>
            <div v-show="hasFilters" class="absolute top-0 right-2 w-2 h-2 rounded-full bg-md-primary border border-md-surface-4 shadow-sm z-10 pointer-events-none" />
          </div>
          <span class="material-symbols text-2xl px-2" @click="showSortModal = true">sort</span>
        </template>
        <span v-if="seriesBookPage" class="material-symbols text-2xl px-2" @click="downloadSeries">download</span>
        <span v-if="(page == 'library' && isBookLibrary) || seriesBookPage" class="material-symbols text-2xl px-2" @click="showMoreMenuDialog = true">more_vert</span>
      </div>
    </div>

    <modals-order-modal v-model="showSortModal" :order-by="settings.mobileOrderBy" @update:order-by="settings.mobileOrderBy = $event" :descending="settings.mobileOrderDesc" @update:descending="settings.mobileOrderDesc = $event" @change="updateOrder" />
    <modals-filter-modal v-model="showFilterModal" :filter-by="settings.mobileFilterBy" @update:filter-by="settings.mobileFilterBy = $event" @change="updateFilter" />
    <modals-dialog v-model="showMoreMenuDialog" :items="menuItems" @action="clickMenuAction" />
  </div>
</template>

<script setup lang="ts">
import { formatNumber } from '@/composables/useStrings'

const strings = useStrings()
const globalsStore = useGlobalsStore()
const librariesStore = useLibrariesStore()
const userStore = useUserStore()
const localStore = useLocalStore()
const { impact } = useHaptics()
const eventBus = useEventBus()
const route = useRoute()

const showSortModal = ref(false)
const showFilterModal = ref(false)
const settings = ref<Record<string, unknown>>({})
const totalEntities = ref(0)
const showMoreMenuDialog = ref(false)

const bookshelfListView = computed({
  get: () => globalsStore.bookshelfListView,
  set: (val: boolean) => {
    // A setter cannot be awaited; the store follows once the preference has been written.
    void localStore.setBookshelfListView(val).then(() => {
      globalsStore.bookshelfListView = val
    })
  }
})

const currentLibraryMediaType = computed(() => librariesStore.getCurrentLibraryMediaType)
const isBookLibrary = computed(() => currentLibraryMediaType.value === 'book')
const hasFilters = computed(() => userStore.getUserSetting('mobileFilterBy') !== 'all')
const page = computed(() => {
  const routeName = (route.name as string) || ''
  return routeName.split('-')[1]
})
const seriesBookPage = computed(() => route.name == 'bookshelf-series-id')
const isPodcast = computed(() => librariesStore.getCurrentLibraryMediaType === 'podcast')

const entityTitle = computed(() => {
  if (page.value === 'library') {
    return isPodcast.value ? strings.LabelPodcasts : strings.LabelBooks
  } else if (page.value === 'playlists') {
    return strings.ButtonPlaylists
  } else if (page.value === 'series') {
    return strings.LabelSeries
  } else if (page.value === 'collections') {
    return strings.ButtonCollections
  } else if (page.value === 'authors') {
    return strings.LabelAuthors
  }
  return ''
})

const selectedSeriesName = computed(() => {
  if (page.value === 'series' && route.params.id && globalsStore.series) {
    return (globalsStore.series as Record<string, unknown>).name as string
  }
  return null
})

const menuItems = computed(() => {
  if (!isBookLibrary.value) return []

  if (seriesBookPage.value) {
    return [
      {
        text: strings.LabelCollapseSeries,
        value: 'collapse_subseries',
        icon: settings.value.collapseBookSeries ? 'check_box' : 'check_box_outline_blank'
      }
    ]
  } else {
    return [
      {
        text: strings.LabelCollapseSeries,
        value: 'collapse_series',
        icon: settings.value.collapseSeries ? 'check_box' : 'check_box_outline_blank'
      }
    ]
  }
})

function clickMenuAction(action: string) {
  showMoreMenuDialog.value = false
  if (action === 'collapse_series') {
    settings.value.collapseSeries = !settings.value.collapseSeries
    saveSettings()
  } else if (action === 'collapse_subseries') {
    settings.value.collapseBookSeries = !settings.value.collapseBookSeries
    saveSettings()
  }
}

function updateOrder() {
  saveSettings()
}

function updateFilter() {
  saveSettings()
}

function saveSettings() {
  void userStore.updateUserSettings(settings.value as Parameters<typeof userStore.updateUserSettings>[0])
}

async function init() {
  bookshelfListView.value = await localStore.getBookshelfListView() as boolean
  settings.value = { ...userStore.settings }
}

function settingsUpdated(newSettings: Record<string, unknown>) {
  for (const key in newSettings) {
    settings.value[key] = newSettings[key]
  }
}

function setTotalEntities(total: number) {
  totalEntities.value = total
}

async function changeView() {
  bookshelfListView.value = !bookshelfListView.value
  await impact()
}

function downloadSeries() {
  console.log('Download Series click')
  eventBus.emit('download-series-click')
}

onMounted(() => {
  void init()
  eventBus.on('bookshelf-total-entities', setTotalEntities)
  eventBus.on('user-settings', settingsUpdated)
})

onBeforeUnmount(() => {
  eventBus.off('bookshelf-total-entities', setTotalEntities)
  eventBus.off('user-settings', settingsUpdated)
})
</script>

<style>
#bookshelf-toolbar {
  box-shadow: 0px 5px 5px rgb(var(--md-scrim) / 0.33);
}
</style>
