<template>
  <div class="w-full">
    <p class="px-1 text-sm font-semibold" :class="disabled ? 'text-md-on-surface-variant' : ''">{{ label }}</p>
    <ui-textarea-input ref="input" v-model="inputValue" :disabled="disabled" :rows="rows" class="w-full" />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue?: string | number
  label?: string
  disabled?: boolean
  rows?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number]
}>()

const input = ref<{ blur: () => void } | null>(null)

const inputValue = computed({
  get() { return props.modelValue },
  set(val: string | number | undefined) { if (val !== undefined) emit('update:modelValue', val) }
})

function blur() {
  input.value?.blur()
}

defineExpose({ blur })
</script>