<template>
  <div ref="card" :id="`series-card-${index}`" :style="{ width: width + 'px', height: height + 'px' }" class="rounded-sm cursor-pointer z-30" @click="clickCard">
    <div class="absolute top-0 left-0 w-full box-shadow-book shadow-height" />
    <div class="w-full h-full bg-md-surface-3 relative rounded overflow-hidden">
      <covers-group-cover v-if="series" ref="coverRef" :id="seriesId" :name="title" :book-items="books" :width="width" :height="height" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>

    <div v-if="seriesPercentInProgress > 0" class="absolute bottom-0 left-0 h-1 max-w-full z-10 rounded-b w-full box-shadow-progressbar" :class="isSeriesFinished ? 'bg-md-primary/50' : 'bg-md-primary'" :style="{ width: seriesPercentInProgress * 100 + '%' }" />

    <div v-if="isAltViewEnabled && isCategorized" class="absolute z-30 left-0 right-0 mx-auto -bottom-8 h-8 py-1 rounded-md text-center">
      <p class="truncate" :style="{ fontSize: labelFontSize + 'rem' }">{{ title }}</p>
    </div>
    <div v-if="!isCategorized" class="categoryPlacard absolute z-30 left-0 right-0 mx-auto -bottom-6 h-6 rounded-md text-center" :style="{ width: Math.min(240, width || 0) + 'px' }">
      <div class="w-full h-full flex items-center justify-center rounded-sm border" :class="isAltViewEnabled ? 'altBookshelfLabel' : 'shinyBlack'" :style="{ padding: `0rem ${0.5 * sizeMultiplier}rem` }">
        <p class="truncate" :style="{ fontSize: labelFontSize + 'rem' }">{{ title }}</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  index?: number
  width?: number
  height?: number
  bookCoverAspectRatio?: number
  seriesMount?: Record<string, unknown> | null
  isAltViewEnabled?: boolean
  isCategorized?: boolean
}>()

const userStore = useUserStore()
const router = useRouter()

// State
const series = ref<Record<string, unknown> | null>(null)
const isSelectionMode = ref(false)

// Refs
const card = ref<HTMLElement | null>(null)

// Computed
const labelFontSize = computed(() => {
  if ((props.width || 0) < 160) return 0.75
  return 0.875
})
const sizeMultiplier = computed(() => {
  if (props.bookCoverAspectRatio === 1) return (props.width || 0) / (120 * 1.6 * 2)
  return (props.width || 0) / 240
})
const title = computed(() => series.value ? series.value.name as string : '')
const books = computed(() => series.value ? (series.value.books as Record<string, unknown>[] | null | undefined) || [] : [])
const seriesBookProgress = computed(() => {
  return (books.value)
    .map((libraryItem) => userStore.getUserMediaProgress(libraryItem.id as string))
    .filter((p) => !!p)
})
const seriesBooksFinished = computed(() => seriesBookProgress.value.filter((p) => (p as Record<string, unknown>).isFinished))
const hasSeriesBookInProgress = computed(() =>
  seriesBookProgress.value.some((p) => !(p as Record<string, unknown>).isFinished && ((p as Record<string, unknown>).progress as number) > 0)
)
const seriesPercentInProgress = computed(() => {
  let totalFinishedAndInProgress = seriesBooksFinished.value.length
  if (hasSeriesBookInProgress.value) totalFinishedAndInProgress += 1
  return Math.min(1, Math.max(0, totalFinishedAndInProgress / books.value.length))
})
const isSeriesFinished = computed(() => books.value.length === seriesBooksFinished.value.length)
const seriesId = computed(() => series.value ? series.value.id as string : undefined)

// Methods
function setEntity(_series: Record<string, unknown>) {
  series.value = _series
}

function setSelectionMode(val: boolean) {
  isSelectionMode.value = val
}

function clickCard() {
  if (!series.value) return
  void router.push(`/bookshelf/series/${seriesId.value}`)
}

onMounted(() => {
  if (props.seriesMount) {
    setEntity(props.seriesMount)
  }
})

defineExpose({ setEntity, setSelectionMode, isHovering: false })
</script>
