<template>
  <modals-modal v-model="show" :width="400" height="100%">
    <template #outer>
      <div class="absolute top-11 left-4 z-40">
        <p class="text-white text-2xl truncate">{{ strings.HeaderDetails }}</p>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div class="w-full overflow-x-hidden overflow-y-auto bg-md-surface-3 rounded-lg border border-md-outline-variant p-2" style="max-height: 75%" @click.stop>
        <p class="mb-2">{{ mediaMetadata.title }}</p>

        <div v-if="size" class="text-sm mb-2">{{ strings.LabelSize }}: {{ utils.bytesPretty(size) }}</div>

        <p class="mb-1 text-xs text-md-on-surface">ID: {{ _libraryItem.id }}</p>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useUtils } from '~/composables/useUtils'

const props = defineProps<{
  modelValue: boolean
  libraryItem: Record<string, unknown>
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()

const strings = useStrings()
const utils = useUtils()

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const _libraryItem = computed(() => props.libraryItem)
const media = computed(() => (_libraryItem.value.media as Record<string, unknown> | null | undefined) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown> | null | undefined) || {})
const size = computed(() => media.value.size as number | undefined)
</script>
