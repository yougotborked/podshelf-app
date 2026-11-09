<template>
  <div class="inline-flex toggle-btn-wrapper shadow-md">
    <button v-for="(item, index) in items" :key="`${name}-${index}`" type="button" class="toggle-btn outline-none relative border border-md-outline-variant px-4 py-1" :class="{ selected: item.value === modelValue }" @click.stop="clickBtn(item.value)">
      {{ item.text }}
    </button>
  </div>
</template>

<script setup lang="ts">
interface ToggleItem {
  value: string | number | boolean
  text: string
}

defineProps<{
  name?: string
  modelValue?: string | number | boolean
  items?: ToggleItem[]
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number | boolean]
}>()

function clickBtn(value: string | number | boolean) {
  emit('update:modelValue', value)
}
</script>

<style scoped>
.toggle-btn-wrapper .toggle-btn:first-child {
  border-top-left-radius: 0.375rem /* 6px */;
  border-bottom-left-radius: 0.375rem /* 6px */;
}
.toggle-btn-wrapper .toggle-btn:last-child {
  border-top-right-radius: 0.375rem /* 6px */;
  border-bottom-right-radius: 0.375rem /* 6px */;
}
.toggle-btn-wrapper .toggle-btn:first-child::before {
  border-top-left-radius: 0.375rem /* 6px */;
  border-bottom-left-radius: 0.375rem /* 6px */;
}
.toggle-btn-wrapper .toggle-btn:last-child::before {
  border-top-right-radius: 0.375rem /* 6px */;
  border-bottom-right-radius: 0.375rem /* 6px */;
}

.toggle-btn-wrapper .toggle-btn:not(:first-child) {
  margin-left: -1px;
}
.toggle-btn {
  background-color: rgb(var(--md-surface-1));
  color: rgb(var(--md-on-surface) / 0.5);
}
.toggle-btn.selected {
  background-color: rgb(var(--md-surface-3));
  color: rgb(var(--md-on-surface));
}
</style>