<template>
  <modals-modal v-model="show">
    <div class="px-4 pt-2 pb-2">
      <div class="flex items-center justify-between mb-3">
        <p class="text-md-title-m text-md-on-surface">Filter</p>
        <ui-btn v-show="selected !== 'all'" class="text-sm border-md-primary/40 h-8" :padding-y="0" @click="clearSelected">{{ strings.ButtonClearFilter }}</ui-btn>
      </div>
      <div class="w-full overflow-x-hidden overflow-y-auto" style="max-height: 70vh">
        <ul v-show="!sublist" class="w-full" role="listbox" aria-labelledby="listbox-label">
          <template v-for="item in items" :key="item.value">
            <li class="text-md-on-surface select-none relative py-4 pr-9 cursor-pointer rounded-md-sm" :class="item.value === selected ? 'bg-md-secondary-container' : 'hover:bg-md-on-surface/5'" role="option" @click="clickedOption(item)">
              <div class="flex items-center justify-between">
                <span class="font-normal ml-3 block truncate text-lg">{{ item.text }}</span>
              </div>
              <div v-if="item.sublist" class="absolute right-1 top-0 bottom-0 h-full flex items-center">
                <span class="material-symbols text-2xl">arrow_right</span>
              </div>
            </li>
          </template>
        </ul>
        <ul v-show="sublist" class="w-full" role="listbox" aria-labelledby="listbox-label">
          <li class="text-md-on-surface select-none relative py-3 pl-9 cursor-pointer hover:bg-md-on-surface/5 rounded-md-sm" role="option" @click="sublist = null">
            <div class="absolute left-1 top-0 bottom-0 h-full flex items-center">
              <span class="material-symbols text-2xl">arrow_left</span>
            </div>
            <div class="flex items-center justify-between">
              <span class="font-normal ml-3 block truncate text-lg">{{ strings.ButtonBack }}</span>
            </div>
          </li>
          <li v-if="!sublistItems.length" class="text-md-on-surface-variant select-none relative px-2" role="option">
            <div class="flex items-center justify-center">
              <span class="font-normal block truncate py-5 text-lg">No {{ sublist }} items</span>
            </div>
          </li>
          <template v-for="item in sublistItems" :key="item.value">
            <li class="text-md-on-surface select-none relative px-4 cursor-pointer rounded-md-sm" :class="`${sublist}.${item.value}` === selected ? 'bg-md-secondary-container' : 'hover:bg-md-on-surface/5'" role="option" @click="clickedSublistOption(item.value)">
              <div class="flex items-center">
                <span class="font-normal truncate py-3 text-base">{{ item.text }}</span>
              </div>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useHaptics } from '~/composables/useHaptics'
import { useUtils } from '~/composables/useUtils'
import { useUserStore } from '~/stores/user'
import { useLibrariesStore } from '~/stores/libraries'

const props = defineProps<{
  modelValue: boolean
  filterBy: string | undefined
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'update:filterBy': [val: string]
  change: [val: string]
}>()

const strings = useStrings()
const { impact } = useHaptics()
const utils = useUtils()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()

const sublist = ref<string | null>(null)

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const selected = computed({
  get() { return props.filterBy },
  set(val: string) { emit('update:filterBy', val) }
})

const userCanAccessExplicitContent = computed(() => userStore.getUserCanAccessExplicitContent)

const bookItems = computed(() => {
  const items: { text: string; value: string; sublist?: boolean }[] = [
    { text: strings.LabelAll, value: 'all' },
    { text: strings.LabelGenre, value: 'genres', sublist: true },
    { text: strings.LabelTag, value: 'tags', sublist: true },
    { text: strings.LabelSeries, value: 'series', sublist: true },
    { text: strings.LabelAuthor, value: 'authors', sublist: true },
    { text: strings.LabelNarrator, value: 'narrators', sublist: true },
    { text: strings.LabelLanguage, value: 'languages', sublist: true },
    { text: strings.LabelProgress, value: 'progress', sublist: true },
    { text: strings.LabelEbooks, value: 'ebooks', sublist: true },
    { text: strings.ButtonIssues, value: 'issues', sublist: false },
    { text: strings.LabelRSSFeedOpen, value: 'feed-open', sublist: false }
  ]

  if (userCanAccessExplicitContent.value) {
    items.push({ text: strings.LabelExplicit, value: 'explicit', sublist: false })
  }

  return items
})

const podcastItems = computed(() => {
  const items: { text: string; value: string; sublist?: boolean }[] = [
    { text: strings.LabelAll, value: 'all' },
    { text: strings.LabelGenre, value: 'genres', sublist: true },
    { text: strings.LabelTag, value: 'tags', sublist: true },
    { text: strings.LabelRSSFeedOpen, value: 'feed-open', sublist: false }
  ]

  if (userCanAccessExplicitContent.value) {
    items.push({ text: strings.LabelExplicit, value: 'explicit', sublist: false })
  }

  return items
})

const isPodcast = computed(() => librariesStore.getCurrentLibraryMediaType === 'podcast')

const items = computed(() => {
  if (isPodcast.value) return podcastItems.value
  return bookItems.value
})

const selectedItemSublist = computed(() => {
  return selected.value && selected.value.includes('.') ? selected.value.split('.')[0] : false
})

const filterData = computed(() => librariesStore.filterData || {})

const genres = computed(() => (filterData.value as Record<string, unknown[]>).genres || [])
const tags = computed(() => (filterData.value as Record<string, unknown[]>).tags || [])
const series = computed(() => (filterData.value as Record<string, unknown[]>).series || [])
const authors = computed(() => (filterData.value as Record<string, unknown[]>).authors || [])
const narrators = computed(() => (filterData.value as Record<string, unknown[]>).narrators || [])
const languages = computed(() => (filterData.value as Record<string, unknown[]>).languages || [])

const progress = computed(() => [
  { id: 'finished', name: strings.LabelFinished },
  { id: 'in-progress', name: strings.LabelInProgress },
  { id: 'not-started', name: strings.LabelNotStarted },
  { id: 'not-finished', name: strings.LabelNotFinished }
])

const ebooks = computed(() => [
  { id: 'ebook', name: strings.LabelHasEbook },
  { id: 'supplementary', name: strings.LabelHasSupplementaryEbook }
])


const sublistItems = computed(() => {
  if (!sublist.value) return []
  const dataMap: Record<string, unknown[]> = {
    genres: genres.value,
    tags: tags.value,
    series: series.value,
    authors: authors.value,
    narrators: narrators.value,
    languages: languages.value,
    progress: progress.value,
    ebooks: ebooks.value
  }
  const data = dataMap[sublist.value] || []
  const items = data.map((item) => {
    if (typeof item === 'string') {
      return { text: item, value: utils.encode(item) }
    } else {
      const obj = item as Record<string, string>
      return { text: obj.name, value: utils.encode(obj.id) }
    }
  })
  if (sublist.value === 'series') {
    items.unshift({ text: strings.MessageNoSeries, value: utils.encode('no-series') })
  }
  return items
})

watch(show, (newVal) => {
  if (!newVal) {
    if (sublist.value && !selectedItemSublist.value) sublist.value = null
    if (!sublist.value && selectedItemSublist.value) sublist.value = selectedItemSublist.value as string
  }
})

async function clearSelected() {
  await impact()
  selected.value = 'all'
  show.value = false
  await nextTick()
  emit('change', 'all')
}

function clickedSublistOption(item: string) {
  clickedOption({ value: `${sublist.value}.${item}` })
}

async function clickedOption(option: { value: string; sublist?: boolean }) {
  if (option.sublist) {
    sublist.value = option.value
    return
  }

  const val = option.value
  if (selected.value === val) {
    show.value = false
    return
  }
  await impact()
  selected.value = val
  show.value = false
  await nextTick()
  emit('change', val)
}
</script>

