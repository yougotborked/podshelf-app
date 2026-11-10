<template>
  <div ref="card" :id="`playlist-card-${index}`" :style="{ width: width + 'px', height: height + 'px' }" class="absolute top-0 left-0 rounded-sm z-30 cursor-pointer" @click="clickCard">
    <div class="absolute top-0 left-0 w-full box-shadow-book shadow-height" />
    <div class="w-full h-full bg-md-surface-3 relative rounded overflow-hidden">
      <covers-playlist-cover ref="coverRef" :items="items" :width="width" :height="height" />
    </div>
    <div class="categoryPlacard absolute z-30 left-0 right-0 mx-auto -bottom-6 h-6 rounded-md text-center" :style="{ width: Math.min(160, width || 0) + 'px' }">
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
  playlistMount?: Record<string, unknown> | null
  isAltViewEnabled?: boolean
}>()

const router = useRouter()

// State
const playlist = ref<Record<string, unknown> | null>(null)
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
const title = computed(() => playlist.value ? playlist.value.name as string : '')
const items = computed(() => playlist.value ? (playlist.value.items as unknown[] | null | undefined) || [] : [])

// Methods
function setEntity(p: Record<string, unknown>) {
  playlist.value = p
}

function setSelectionMode(val: boolean) {
  isSelectionMode.value = val
}

function clickCard() {
  if (!playlist.value) return
  void router.push(`/playlist/${playlist.value.id}`)
}

onMounted(() => {
  if (props.playlistMount) {
    setEntity(props.playlistMount)
  }
})

defineExpose({ setEntity, setSelectionMode, isHovering: false })
</script>
