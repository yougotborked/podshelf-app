<template>
  <div ref="wrapper" v-click-outside="clickOutside">
    <div @click.stop="toggleMenu">
      <slot />
    </div>
    <transition name="menu">
      <ul ref="menu" v-show="showMenu" class="absolute z-50 -mt-px bg-md-surface-3 border border-md-outline-variant shadow-lg max-h-56 rounded-md py-1 text-base ring-1 ring-md-surface-0/5 overflow-auto focus:outline-none sm:text-sm" role="listbox" style="width: 160px">
        <template v-for="item in items" :key="item.value">
          <nuxt-link v-if="item.to" :to="item.to">
            <li class="text-md-on-surface select-none relative py-2" id="listbox-option-0" role="option" @click="clickedOption(item.value)">
              <div class="flex items-center px-2">
                <span v-if="item.icon" class="material-symbols text-lg mr-2" :class="item.iconClass ? item.iconClass : ''">{{ item.icon }}</span>
                <span class="font-normal block truncate font-sans text-center">{{ item.text }}</span>
              </div>
            </li>
          </nuxt-link>
          <li v-else class="text-md-on-surface select-none relative py-2" id="listbox-option-0" role="option" @click="clickedOption(item.value)">
            <div class="flex items-center px-2">
              <span v-if="item.icon" class="material-symbols text-lg mr-2" :class="item.iconClass ? item.iconClass : ''">{{ item.icon }}</span>
              <span class="font-normal block truncate font-sans text-center">{{ item.text }}</span>
            </div>
          </li>
        </template>
      </ul>
    </transition>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from 'vue'

interface MenuItem {
  value: string | number
  text: string
  icon?: string
  iconClass?: string
  to?: string
}

defineProps<{
  items?: MenuItem[]
}>()

const emit = defineEmits<{
  action: [value: string | number]
}>()

const wrapper = ref<HTMLElement | null>(null)
const menu = ref<HTMLElement | null>(null)
let detachedMenu: HTMLElement | null = null
const showMenu = ref(false)

function toggleMenu() {
  if (!showMenu.value) {
    openMenu()
  } else {
    closeMenu()
  }
}

function openMenu() {
  showMenu.value = true
  void nextTick(() => {
    if (!detachedMenu) unmountMountMenu()
    recalcMenuPos()
  })
}

function closeMenu() {
  showMenu.value = false
}

function recalcMenuPos() {
  if (!detachedMenu || !wrapper.value) return
  const boundingBox = wrapper.value.getBoundingClientRect()
  if (boundingBox.y > window.innerHeight - 8) {
    return closeMenu()
  }
  const menuHeight = detachedMenu.clientHeight
  let top = boundingBox.y + boundingBox.height - 4
  if (top + menuHeight > window.innerHeight - 20) {
    top = boundingBox.y - menuHeight - 4
  }

  let left = boundingBox.x
  if (left + detachedMenu.clientWidth > window.innerWidth - 20) {
    left = boundingBox.x + boundingBox.width - detachedMenu.clientWidth
  }

  detachedMenu.style.top = top + 'px'
  detachedMenu.style.left = left + 'px'
}

function unmountMountMenu() {
  if (!menu.value) return
  detachedMenu = menu.value
  detachedMenu.remove()
  document.body.appendChild(detachedMenu)
}

function clickOutside() {
  closeMenu()
}

function clickedOption(itemValue: string | number) {
  closeMenu()
  emit('action', itemValue)
}

onBeforeUnmount(() => {
  if (detachedMenu) {
    detachedMenu.remove()
  }
})
</script>
