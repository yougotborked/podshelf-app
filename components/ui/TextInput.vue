<template>
  <div
    :class="[
      'flex items-center relative rounded-md-sm overflow-hidden',
      'bg-md-surface-1 border transition-md-standard',
      focused ? 'border-md-primary border-2' : 'border-md-outline-variant'
    ]"
  >
    <input
      v-model="input"
      ref="inputEl"
      :autofocus="autofocus"
      :type="type"
      :disabled="disabled"
      :readonly="readonly"
      autocorrect="off"
      autocapitalize="none"
      autocomplete="off"
      :placeholder="placeholder"
      :class="inputClass"
      @keyup="keyup"
      @focus="onFocus"
      @blur="focused = false"
    />
    <div v-if="prependIcon" class="absolute top-0 left-0 h-full px-2.5 flex items-center justify-center text-md-on-surface-variant pointer-events-none">
      <span class="material-symbols text-lg">{{ prependIcon }}</span>
    </div>
    <div v-if="clearable && input" class="absolute top-0 right-0 h-full px-2.5 flex items-center justify-center text-md-on-surface-variant" @click.stop="clear">
      <span class="material-symbols text-lg">close</span>
    </div>
    <div v-else-if="!clearable && appendIcon" class="absolute top-0 right-0 h-full px-2.5 flex items-center justify-center text-md-on-surface-variant pointer-events-none">
      <span class="material-symbols text-lg">{{ appendIcon }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  modelValue?: string | number | null
  placeholder?: string
  type?: string
  disabled?: boolean
  readonly?: boolean
  borderless?: boolean
  autofocus?: boolean
  bg?: string        // kept for backward compat
  rounded?: string   // kept for backward compat
  prependIcon?: string | null
  appendIcon?: string | null
  clearable?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number]
}>()

const inputEl = ref<HTMLInputElement | null>(null)
const focused = ref(false)

const input = computed({
  get() { return props.modelValue },
  set(val: string | number | undefined) { if (val !== undefined) emit('update:modelValue', val) }
})

const inputClass = computed(() => {
  return [
    'w-full bg-transparent text-md-on-surface text-md-body-l',
    'placeholder:text-md-on-surface-variant',
    'focus:outline-none disabled:opacity-40',
    props.prependIcon ? 'pl-10' : 'pl-4',
    props.appendIcon || props.clearable ? 'pr-10' : 'pr-4',
    'py-3'
  ].join(' ')
})

function onFocus() { if (!props.readonly) focused.value = true }
function clear() { input.value = '' }
function focus() {
  if (inputEl.value) {
    inputEl.value.focus()
    inputEl.value.click()
  }
}
function keyup() {
  if (inputEl.value) input.value = inputEl.value.value
}

defineExpose({ focus })
</script>

<style scoped>
input[type='time']::-webkit-calendar-picker-indicator {
  filter: invert(100%);
}
html[data-theme='light'] input[type='time']::-webkit-calendar-picker-indicator {
  filter: unset;
}
</style>
