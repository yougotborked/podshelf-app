<template>
  <div class="w-full">
    <p class="px-1 text-sm font-semibold" :class="disabled ? 'text-md-on-surface-variant' : ''">{{ label }}</p>
    <div ref="wrapper" class="relative">
      <form @submit.prevent="submitForm">
        <div ref="inputWrapper" style="min-height: 36px" class="flex-wrap relative w-full shadow-sm flex items-center border border-md-outline-variant rounded px-2 py-1" :class="wrapperClass" @click.stop.prevent="clickWrapper" @mouseup.stop.prevent @mousedown.prevent>
          <div v-for="item in selected" :key="item" class="rounded-full px-2 py-1 mx-0.5 my-0.5 text-xs bg-md-surface-1 flex flex-nowrap break-all items-center relative">
            <div v-if="!disabled" class="w-full h-full rounded-full absolute top-0 left-0 px-1 bg-md-surface-1/75 flex items-center justify-end opacity-0 hover:opacity-100">
              <span v-if="showEdit" class="material-symbols text-md-on-surface hover:text-warning cursor-pointer" style="font-size: 1.1rem" @click.stop="editItem(item)">edit</span>
              <span class="material-symbols text-md-on-surface hover:text-error cursor-pointer" style="font-size: 1.1rem" @click.stop="removeItem(item)">close</span>
            </div>
            {{ item }}
          </div>
          <input v-show="!readonly" ref="input" v-model="textInput" :disabled="disabled" style="min-width: 40px; width: 40px" class="h-full bg-md-surface-3 focus:outline-none px-1" @keydown="keydownInput" @focus="inputFocus" @blur="inputBlur" />
        </div>
      </form>

      <ul ref="menu" v-show="showMenu" class="absolute z-50 mt-1 w-full bg-md-surface-1 border border-md-outline-variant shadow-lg max-h-56 rounded-md py-1 ring-1 ring-black/5 overflow-auto focus:outline-none text-sm" role="listbox" aria-labelledby="listbox-label">
        <template v-for="item in itemsToShow" :key="item">
          <li class="text-md-on-surface select-none relative py-2 pr-9 cursor-pointer" role="option" @click="clickedOption($event, item)" @mouseup.stop.prevent @mousedown.prevent>
            <div class="flex items-center">
              <span class="font-normal ml-3 block truncate">{{ item }}</span>
            </div>
            <span v-if="selected.includes(item)" class="text-md-primary absolute inset-y-0 right-0 flex items-center pr-4">
              <span class="material-symbols text-xl">checkmark</span>
            </span>
          </li>
        </template>
        <li v-if="!itemsToShow.length" class="text-md-on-surface select-none relative py-2 pr-9" role="option">
          <div class="flex items-center justify-center">
            <span class="font-normal">No Items</span>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'

const props = defineProps<{
  modelValue?: string[]
  items?: string[]
  label?: string
  disabled?: boolean
  readonly?: boolean
  showEdit?: boolean
}>()

const emit = defineEmits<{
  'update:modelValue': [val: string[]]
  edit: [item: string]
  removedItem: [item: string]
  newItem: [item: string]
}>()

const inputWrapper = ref<HTMLElement | null>(null)
const input = ref<HTMLInputElement | null>(null)
const menu = ref<HTMLElement | null>(null)
let detachedMenu: HTMLElement | null = null

const textInput = ref<string | null>(null)
const currentSearch = ref<string | null>(null)
const typingTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
const isFocused = ref(false)

const selected = computed(() => props.modelValue || [])

const showMenu = computed(() => isFocused.value)

const wrapperClass = computed(() => {
  const classes: string[] = []
  if (props.disabled) classes.push('bg-md-on-surface/5')
  else classes.push('bg-md-surface-3')
  if (!props.readonly) classes.push('cursor-text')
  return classes.join(' ')
})

const itemsToShow = computed(() => {
  if (!currentSearch.value || !textInput.value) {
    return props.items || []
  }
  return (props.items || []).filter((i) => {
    const iValue = String(i).toLowerCase()
    return iValue.includes(currentSearch.value!.toLowerCase())
  })
})

watch(showMenu, (newVal) => {
  if (newVal) setListener()
  else removeListener()
})

function editItem(item: string) {
  emit('edit', item)
}

function keydownInput() {
  if (typingTimeout.value) clearTimeout(typingTimeout.value)
  typingTimeout.value = setTimeout(() => {
    currentSearch.value = textInput.value
  }, 100)
  setInputWidth()
}

function setInputWidth() {
  setTimeout(() => {
    if (!input.value) return
    const value = input.value.value
    const len = value.length * 7 + 24
    input.value.style.width = len + 'px'
    recalcMenuPos()
  }, 50)
}

function recalcMenuPos() {
  if (!detachedMenu || !inputWrapper.value) return
  const boundingBox = inputWrapper.value.getBoundingClientRect()
  if (boundingBox.y > window.innerHeight - 8) {
    return forceBlur()
  }
  const menuHeight = detachedMenu.clientHeight
  let top = boundingBox.y + boundingBox.height - 4
  if (top + menuHeight > window.innerHeight - 20) {
    top = boundingBox.y - menuHeight - 4
  }

  detachedMenu.style.top = top + 'px'
  detachedMenu.style.left = boundingBox.x + 'px'
  detachedMenu.style.width = boundingBox.width + 'px'
}

function unmountMountMenu() {
  if (!menu.value || !inputWrapper.value) return
  detachedMenu = menu.value

  const boundingBox = inputWrapper.value.getBoundingClientRect()
  detachedMenu.remove()
  document.body.appendChild(detachedMenu)
  detachedMenu.style.top = boundingBox.y + boundingBox.height - 4 + 'px'
  detachedMenu.style.left = boundingBox.x + 'px'
  detachedMenu.style.width = boundingBox.width + 'px'
}

function inputFocus() {
  if (!detachedMenu) {
    unmountMountMenu()
  }
  isFocused.value = true
  void nextTick(recalcMenuPos)
}

function inputBlur() {
  if (!isFocused.value) return

  setTimeout(() => {
    if (document.activeElement === input.value) {
      return
    }
    isFocused.value = false
    if (textInput.value) submitForm()
  }, 50)
}

function focus() {
  if (input.value) input.value.focus()
}

function blur() {
  if (input.value) input.value.blur()
}

function forceBlur() {
  isFocused.value = false
  if (textInput.value) submitForm()
  if (input.value) input.value.blur()
}

function clickedOption(e: MouseEvent | null, itemValue: string) {
  if (e) {
    e.stopPropagation()
    e.preventDefault()
  }
  if (input.value) input.value.focus()

  let newSelected: string[]
  if (selected.value.includes(itemValue)) {
    newSelected = selected.value.filter((s) => s !== itemValue)
    emit('removedItem', itemValue)
  } else {
    newSelected = selected.value.concat([itemValue])
  }
  textInput.value = null
  currentSearch.value = null
  emit('update:modelValue', newSelected)
  void nextTick(() => {
    recalcMenuPos()
  })
}

function clickWrapper() {
  if (props.disabled) return
  if (showMenu.value) {
    return blur()
  }
  focus()
}

function removeItem(item: string) {
  const remaining = selected.value.filter((i) => i !== item)
  emit('update:modelValue', remaining)
  emit('removedItem', item)
  void nextTick(() => {
    recalcMenuPos()
  })
}

function insertNewItem(item: string) {
  const newSelected = selected.value.concat([item])
  emit('update:modelValue', newSelected)
  emit('newItem', item)
  textInput.value = null
  currentSearch.value = null
  void nextTick(() => {
    blur()
  })
}

function submitForm() {
  if (!textInput.value) return

  const cleaned = textInput.value.trim()
  const matchesItem = (props.items || []).find((i) => i === cleaned)
  if (matchesItem) {
    clickedOption(null, matchesItem)
  } else {
    insertNewItem(textInput.value)
  }
}

function scroll() {
  recalcMenuPos()
}

function setListener() {
  document.addEventListener('scroll', scroll, true)
}

function removeListener() {
  document.removeEventListener('scroll', scroll, true)
}

defineExpose({ focus, blur })

onBeforeUnmount(() => {
  if (detachedMenu) detachedMenu.remove()
})
</script>

<style scoped>
input {
  border-style: inherit !important;
}
input:read-only {
  color: rgb(var(--md-on-surface-variant));
  background-color: rgb(var(--md-outline-variant));
}
</style>
