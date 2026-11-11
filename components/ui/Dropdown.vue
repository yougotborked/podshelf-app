<template>
  <div class="relative w-full" v-click-outside="clickedOutside">
    <p class="text-sm font-semibold" :class="disabled ? 'text-md-on-surface-variant' : ''">{{ label }}</p>
    <button type="button" :disabled="disabled" class="relative w-full border border-md-outline-variant rounded shadow-sm pl-3 pr-8 py-2 text-left focus:outline-none text-sm" :class="buttonClass" aria-haspopup="listbox" aria-expanded="true" @click.stop.prevent="clickShowMenu">
      <span class="flex items-center" :class="!selectedText ? 'text-md-on-surface-variant' : 'text-md-on-surface'">
        <span class="block truncate" :class="small ? 'text-sm' : ''">{{ selectedText || placeholder || '' }}</span>
      </span>
      <span class="ml-3 absolute inset-y-0 right-0 flex items-center pr-2 pointer-events-none">
        <span class="material-symbols">arrow_drop_down</span>
      </span>
    </button>

    <transition name="menu">
      <ul v-show="showMenu" class="absolute z-10 -mt-px w-full bg-md-surface-3 border border-md-outline-variant shadow-lg max-h-56 rounded-b-md py-1 ring-1 ring-md-surface-0/5 overflow-auto focus:outline-none text-sm" role="listbox">
        <template v-for="item in items" :key="item.value">
          <li class="text-md-on-surface select-none relative py-2 cursor-pointer hover:bg-md-on-surface/10" role="option" @click="clickedOption(item.value)">
            <div class="flex items-center">
              <span class="font-normal ml-3 block truncate font-sans text-sm">{{ item.text }}</span>
            </div>
          </li>
        </template>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

interface DropdownItem {
  value: string | number
  text: string
}

const props = defineProps<{
  modelValue?: string | number | null
  label?: string
  items?: DropdownItem[]
  disabled?: boolean
  small?: boolean
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string | number]
}>()

const showMenu = ref(false)

const selectedItem = computed(() => (props.items || []).find((i) => i.value === props.modelValue))
const selectedText = computed(() => selectedItem.value ? selectedItem.value.text : '')

const buttonClass = computed(() => {
  const classes: string[] = []
  if (props.small) classes.push('h-9')
  else classes.push('h-10')

  if (props.disabled) classes.push('cursor-not-allowed border-md-outline-variant/70 bg-md-surface-3/70 text-md-on-surface-variant')
  else classes.push('cursor-pointer border-md-outline-variant bg-md-surface-3 text-md-on-surface')

  return classes.join(' ')
})

function clickShowMenu() {
  if (props.disabled) return
  showMenu.value = !showMenu.value
}

function clickedOutside() {
  showMenu.value = false
}

function clickedOption(itemValue: string | number) {
  emit('update:modelValue', itemValue)
  showMenu.value = false
}
</script>
