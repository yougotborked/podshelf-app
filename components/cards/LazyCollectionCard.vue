<template>
  <div ref="card" :id="`collection-card-${index}`" :style="{ width: width + 'px', height: height + 'px' }" class="rounded-sm cursor-pointer z-30" @click="clickCard">
    <div class="absolute top-0 left-0 w-full box-shadow-book shadow-height" />
    <div class="w-full h-full bg-md-surface-3 relative rounded overflow-hidden">
      <covers-collection-cover ref="coverRef" :book-items="books" :width="width" :height="height" :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>

    <div class="categoryPlacard absolute z-30 left-0 right-0 mx-auto -bottom-6 h-6 rounded-md text-center" :style="{ width: Math.min(240, width || 0) + 'px' }">
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
  isAltViewEnabled?: boolean
}>()

const router = useRouter()

// State
const collection = ref<Record<string, unknown> | null>(null)
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
const title = computed(() => collection.value ? collection.value.name as string : '')
const books = computed(() => collection.value ? (collection.value.books as unknown[]) || [] : [])

// Methods
function setEntity(_collection: Record<string, unknown>) {
  collection.value = _collection
}

function setSelectionMode(val: boolean) {
  isSelectionMode.value = val
}

function clickCard() {
  if (!collection.value) return
  void router.push(`/collection/${collection.value.id}`)
}

defineExpose({ setEntity, setSelectionMode, isHovering: false })
</script>
