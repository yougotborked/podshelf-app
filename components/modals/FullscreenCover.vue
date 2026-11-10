<template>
  <modals-modal v-model="show" width="100%" height="100%" max-width="100%">
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <covers-book-cover :library-item="libraryItem" :width="width" raw :book-cover-aspect-ratio="bookCoverAspectRatio" />
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { getScreenOrientation } from '~/composables/useScreenOrientation'
import { ref, computed, watch, onMounted } from 'vue'
import { useGlobalsStore } from '~/stores/globals'

const props = defineProps<{
  modelValue: boolean
  libraryItem: Record<string, unknown>
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()

const globalsStore = useGlobalsStore()

const width = ref(0)

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const bookCoverAspectRatio = computed(() => globalsStore.getBookCoverAspectRatio)

watch(show, (val) => {
  if (val) {
    setWidth()
    setListeners()
  } else {
    removeListeners()
  }
})

function screenOrientationChange() {
  setTimeout(setWidth, 50)
}

function setListeners() {
  getScreenOrientation()?.addEventListener('change', screenOrientationChange)
}

function removeListeners() {
  getScreenOrientation()?.removeEventListener('change', screenOrientationChange)
}

function setWidth() {
  if (window.innerHeight > window.innerWidth) {
    width.value = window.innerWidth
  } else {
    width.value = window.innerHeight / bookCoverAspectRatio.value
  }
}

onMounted(() => {
  setWidth()
})
</script>

<style>
.filter-modal-wrapper {
  max-height: calc(100% - 320px);
}
</style>
