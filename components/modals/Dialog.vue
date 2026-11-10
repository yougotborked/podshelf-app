<template>
  <modals-modal v-model="show" :width="width">
    <div class="px-4 pt-2 pb-2">
      <p v-if="title" class="text-md-title-m text-md-on-surface mb-3 truncate">{{ title }}</p>
      <div ref="container" class="w-full overflow-x-hidden overflow-y-auto" style="max-height: 60vh">
        <ul class="w-full" role="listbox" aria-labelledby="listbox-label">
          <template v-for="item in itemsToShow" :key="item.value">
            <slot :name="item.value" :item="item" :selected="item.value === selected">
              <li :ref="`item-${item.value}`" class="text-md-on-surface select-none relative cursor-pointer rounded-md-sm hover:bg-md-on-surface/5" :class="selected === item.value ? 'bg-md-secondary-container' : ''" :style="{ paddingTop: itemPaddingY || '14px', paddingBottom: itemPaddingY || '14px' }" role="option" @click="clickedOption(item.value)">
                <div class="relative flex items-center px-3">
                  <span v-if="item.icon" class="material-symbols text-xl mr-2 text-md-on-surface-variant">{{ item.icon }}</span>
                  <p class="font-normal block truncate text-base text-md-on-surface">{{ item.text }}</p>
                </div>
              </li>
            </slot>
          </template>
        </ul>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'

interface DialogItem {
  text: string
  value: string
  icon?: string
}

const props = defineProps<{
  modelValue: boolean
  title?: string
  items: (DialogItem | string)[]
  selected?: string | number | null
  itemPaddingY?: string
  width?: string | number
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  action: [value: string]
}>()

const container = ref<HTMLElement | null>(null)

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const itemsToShow = computed((): DialogItem[] => {
  return (props.items || []).map((i) => {
    if (typeof i === 'string') {
      return { text: i, value: i }
    }
    return i
  })
})

watch(show, (newVal: boolean) => {
  if (newVal) void nextTick(init)
}, { immediate: true })

function clickedOption(action: string) {
  emit('action', action)
}

function init() {
  const selectedVal = props.selected
  if (selectedVal && container.value) {
    const itemEl = (container.value.querySelector(`[data-value="${selectedVal}"]`) || document.querySelector(`[id="item-${selectedVal}"]`)) as HTMLElement | null
    if (itemEl) {
      const containerOffset = container.value.offsetTop + container.value.clientHeight / 2
      const scrollAmount = itemEl.offsetTop - containerOffset
      container.value.scrollTo({ top: scrollAmount })
    }
  }
}
</script>
