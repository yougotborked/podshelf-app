<template>
  <div class="w-full bg-md-secondary-container rounded-lg">
    <div class="w-full h-14 flex items-center px-3">
      <p class="pr-2">{{ strings.HeaderPlaylistItems }}</p>

      <div class="w-6 h-6 md:w-7 md:h-7 bg-md-on-surface/10 rounded-full flex items-center justify-center">
        <span class="text-xs md:text-sm font-mono leading-none">{{ displayCount }}</span>
      </div>

      <div class="flex-grow" />
      <p v-if="totalDuration" class="text-sm text-md-on-surface">{{ totalDurationPretty }}</p>
    </div>
    <div ref="listEl">
      <div v-if="topSpacerHeight" :style="{ height: `${topSpacerHeight}px` }" />
      <template v-for="item in visibleItems" :key="itemKey(item)">
        <tables-playlist-item-table-row
          :item="item"
          :playlist-id="playlistId"
          @showMore="showMore"
        />
      </template>
      <div v-if="bottomSpacerHeight" :style="{ height: `${bottomSpacerHeight}px` }" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { computeRowWindow } from '~/composables/useRowWindow'

const props = defineProps<{
  playlistId?: string
  items: Record<string, unknown>[]
  totalItems?: number | null
}>()

const emit = defineEmits<{
  showMore: [item: Record<string, unknown>]
}>()

const strings = useStrings()
const utils = useUtils()

/**
 * Rows are windowed rather than all rendered.
 *
 * The auto playlist runs to hundreds of episodes and each row is a non-trivial component (cover
 * image, progress lookup, several computed properties). Mounting all of them makes the page slow
 * to open and janky to scroll, so only the rows near the viewport are in the DOM and fixed-height
 * spacers stand in for the rest.
 */
const INITIAL_VISIBLE_ROWS = 15
const OVERSCAN_ROWS = 6
const ESTIMATED_ROW_HEIGHT = 72

const listEl = ref<HTMLElement | null>(null)
const rowHeight = ref(ESTIMATED_ROW_HEIGHT)
const firstVisibleIndex = ref(0)
const lastVisibleIndex = ref(INITIAL_VISIBLE_ROWS)
const topSpacerHeight = ref(0)
const bottomSpacerHeight = ref(0)

let scrollParent: HTMLElement | Window | null = null
let recomputeFrame: number | null = null

const visibleItems = computed(() => props.items.slice(firstVisibleIndex.value, lastVisibleIndex.value))

const displayCount = computed(() => {
  if (props.totalItems && props.totalItems > props.items.length) {
    return `${props.items.length}/${props.totalItems}`
  }
  return `${props.items.length}`
})

const totalDuration = computed(() => {
  let _total = 0
  props.items.forEach((item) => {
    const ep = item.episode as Record<string, unknown> | undefined
    if (ep) _total += (ep.duration as number) || 0
    else _total += ((item.libraryItem as Record<string, unknown> | null | undefined)?.media as Record<string, unknown> | null | undefined)?.duration as number || 0
  })
  return _total
})

const totalDurationPretty = computed(() => utils.elapsedPrettyExtended(totalDuration.value))

function itemKey(item: Record<string, unknown>) {
  if (item.id) return item.id as string
  const ep = item.episode as Record<string, unknown> | undefined
  const episodeId = (item.episodeId as string) || (ep?.serverEpisodeId as string) || (ep?.id as string) || 'book'
  const libraryItemId = (item.libraryItemId as string) || ((item.libraryItem as Record<string, unknown> | null | undefined)?.id as string) || 'unknown'
  return `${libraryItemId}_${episodeId}`
}

/** Nearest scrollable ancestor, falling back to the page scroller. */
function findScrollParent(el: HTMLElement | null): HTMLElement | Window {
  let node = el?.parentElement || null
  while (node) {
    const overflowY = window.getComputedStyle(node).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return node
    node = node.parentElement
  }
  return window
}

/** Viewport of the scroll parent in client coordinates. */
function getViewport() {
  if (!scrollParent || scrollParent === window) {
    return { top: 0, height: window.innerHeight }
  }
  const el = scrollParent as HTMLElement
  return { top: el.getBoundingClientRect().top, height: el.clientHeight }
}

function recomputeWindow() {
  const list = listEl.value
  const total = props.items.length
  if (!list || !total) {
    firstVisibleIndex.value = 0
    lastVisibleIndex.value = 0
    topSpacerHeight.value = 0
    bottomSpacerHeight.value = 0
    return
  }

  const viewport = getViewport()
  const { first, last, topSpacer, bottomSpacer } = computeRowWindow({
    // Distance the list top sits above the viewport top once the user has scrolled into it
    scrolledPast: viewport.top - list.getBoundingClientRect().top,
    viewportHeight: viewport.height,
    rowHeight: rowHeight.value || ESTIMATED_ROW_HEIGHT,
    totalRows: total,
    overscan: OVERSCAN_ROWS
  })

  firstVisibleIndex.value = first
  lastVisibleIndex.value = last
  topSpacerHeight.value = topSpacer
  bottomSpacerHeight.value = bottomSpacer
}

function scheduleRecompute() {
  if (recomputeFrame !== null) return
  recomputeFrame = window.requestAnimationFrame(() => {
    recomputeFrame = null
    recomputeWindow()
  })
}

/** Measures a real row so the spacers match the rendered height on any cover aspect ratio. */
function measureRowHeight() {
  const row = listEl.value?.querySelector('[data-playlist-row]') as HTMLElement | null
  if (row?.offsetHeight) rowHeight.value = row.offsetHeight
}

watch(
  () => props.items,
  () => {
    // A shorter list can leave the window past the end, which would render nothing until the
    // recompute below lands
    firstVisibleIndex.value = Math.min(firstVisibleIndex.value, Math.max(0, props.items.length - 1))
    lastVisibleIndex.value = Math.min(lastVisibleIndex.value || INITIAL_VISIBLE_ROWS, props.items.length)
    void nextTick(() => {
      measureRowHeight()
      recomputeWindow()
    })
  }
)

onMounted(() => {
  scrollParent = findScrollParent(listEl.value)
  scrollParent.addEventListener('scroll', scheduleRecompute, { passive: true })
  window.addEventListener('resize', scheduleRecompute, { passive: true })
  void nextTick(() => {
    measureRowHeight()
    recomputeWindow()
  })
})

onBeforeUnmount(() => {
  scrollParent?.removeEventListener('scroll', scheduleRecompute)
  window.removeEventListener('resize', scheduleRecompute)
  if (recomputeFrame !== null) window.cancelAnimationFrame(recomputeFrame)
  scrollParent = null
})

function showMore(playlistItem: Record<string, unknown>) {
  emit('showMore', playlistItem)
}
</script>
