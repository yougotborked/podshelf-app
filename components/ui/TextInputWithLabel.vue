<template>
  <div class="w-full">
    <label class="block text-md-label-l text-md-on-surface-variant mb-1.5">{{ label }}</label>
    <ui-text-input v-model="inputValue" ref="input" :disabled="disabled" :type="type" :placeholder="placeholder" :autofocus="autofocus" class="w-full" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  modelValue?: string | number | null
  label?: string
  type?: string
  disabled?: boolean
  placeholder?: string
  autofocus?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number]
}>()

const inputValue = computed({
  get() { return props.modelValue },
  set(val: string | number | undefined) { if (val !== undefined) emit('update:modelValue', val) }
})
</script>
