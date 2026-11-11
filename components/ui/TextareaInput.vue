<template>
  <textarea ref="input" v-model="inputValue" :rows="rows" :readonly="readonly" :disabled="disabled" :placeholder="placeholder" class="py-2 px-3 rounded bg-md-surface-3 text-md-on-surface focus:outline-none" :class="transparent ? '' : 'border border-md-outline-variant'" @change="change" />
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue?: string | number
  placeholder?: string
  readonly?: boolean
  rows?: number
  transparent?: boolean
  disabled?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number]
  change: [val: string]
}>()

const input = ref<HTMLTextAreaElement | null>(null)

const inputValue = computed({
  get() { return props.modelValue },
  set(val: string | number | undefined) { if (val !== undefined) emit('update:modelValue', val) }
})

function change(e: Event) {
  emit('change', (e.target as HTMLTextAreaElement).value)
}

function blur() {
  input.value?.blur()
}

defineExpose({ blur })
</script>

<style scoped>
textarea {
  border-style: inherit !important;
}
textarea:read-only {
  color: rgb(var(--md-on-surface-variant));
  background-color: rgb(var(--md-outline-variant));
}
</style>