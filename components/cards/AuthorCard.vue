<template>
  <div>
    <div :style="{ width: width + 'px', height: height + 'px' }" class="bg-md-surface-3 box-shadow-book rounded-md relative overflow-hidden">
      <!-- Image or placeholder -->
      <covers-author-image :author="author" />

      <!-- Author name & num books overlay -->
      <div v-show="!searching && !nameBelow" class="absolute bottom-0 left-0 w-full py-1 bg-black/60 px-2">
        <p class="text-center font-semibold truncate text-white" :style="{ fontSize: sizeMultiplier * 0.75 + 'rem' }">{{ name }}</p>
        <p class="text-center text-md-on-surface" :style="{ fontSize: sizeMultiplier * 0.65 + 'rem' }">{{ numBooks }} {{ strings.LabelBooks }}</p>
      </div>

      <!-- Loading spinner -->
      <div v-show="searching" class="absolute top-0 left-0 z-10 w-full h-full bg-black/50 flex items-center justify-center">
        <widgets-loading-spinner size="" />
      </div>
    </div>
    <div v-show="nameBelow" class="w-full py-1 px-2">
      <p class="text-center font-semibold truncate text-md-on-surface" :style="{ fontSize: sizeMultiplier * 0.75 + 'rem' }">{{ name }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
const props = withDefaults(defineProps<{
  author?: Record<string, unknown>
  width?: number
  height?: number
  sizeMultiplier?: number
  nameBelow?: boolean
}>(), { sizeMultiplier: 1 })

const strings = useStrings()

const searching = ref(false)

const _author = computed(() => props.author || {})
const name = computed(() => (_author.value.name as string) || '')
const numBooks = computed(() => (_author.value.numBooks as number) || 0)
</script>
