<template>
  <div ref="wrapper" class="modal modal-bg w-full h-full max-h-screen fixed top-0 left-0 flex items-end justify-center z-50 opacity-0" style="background: rgb(var(--md-scrim) / 0.5)">
    <div class="absolute top-0 left-0 w-full h-full pointer-events-none" />

    <!--
      This floats on the scrim over whatever the page was showing - often cover art - not on a
      surface, so it cannot borrow a surface token for its colour. text-md-on-surface-variant is
      a muted grey meant to sit on --md-surface; over dark artwork it all but disappeared. A
      translucent circle of its own gives it a background it can be read against whatever is
      behind, in every theme.
    -->
    <div class="absolute z-40 top-3 right-4 h-10 w-10 flex items-center justify-center cursor-pointer rounded-md-full bg-black/50 text-white hover:bg-black/70" @click="show = false">
      <span class="material-symbols text-2xl">close</span>
    </div>
    <slot name="outer" />
    <div ref="content" class="relative text-md-on-surface bg-md-surface-3 rounded-t-md-xl w-full overflow-hidden" :style="Object.assign({ height: modalHeight, maxWidth: maxWidth, maxHeight: '90vh' }, popoverStyle) as any" v-click-outside="clickBg">
      <!-- Drag handle -->
      <div class="w-8 h-1 rounded-md-full bg-md-on-surface-variant/40 mx-auto mt-3 mb-1" />
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useGlobalsStore } from '~/stores/globals'
import { useEventBus } from '~/composables/useEventBus'

const props = defineProps<{
  modelValue: boolean
  processing?: boolean
  persistent?: boolean
  width?: string | number
  height?: string | number
  maxWidth?: string
  anchorSelector?: string | null
}>()

const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  input: [val: boolean]
}>()

const globalsStore = useGlobalsStore()
const eventBus = useEventBus()

const wrapper = ref<HTMLElement | null>(null)
const content = ref<HTMLElement | null>(null)
const el = ref<HTMLElement | null>(null)
const justOpened = ref(false)

const persistent = computed(() => props.persistent)

const show = computed({
  get() {
    return props.modelValue
  },
  set(val: boolean) {
    emit('update:modelValue', val)
    emit('input', val)
  }
})

const modalHeight = computed(() => {
  if (typeof props.height === 'string') return props.height
  if (props.height !== undefined) return props.height + 'px'
  return 'unset'
})

const popoverStyle = computed(() => {
  if (!props.anchorSelector) return {}
  if (typeof window === 'undefined') return {}
  const isLandscape = window.innerWidth > window.innerHeight
  if (!isLandscape) return {}
  const anchor = document.querySelector(props.anchorSelector)
  if (!anchor) return {}
  const rect = anchor.getBoundingClientRect()
  const margin = 8
  const estWidth = Math.min(280, window.innerWidth - 32)
  const left = Math.max(margin, Math.min(rect.left, window.innerWidth - estWidth - margin))
  const top = Math.min(rect.bottom + margin, window.innerHeight - 100)
  return {
    position: 'fixed',
    left: left + 'px',
    top: top + 'px',
    bottom: 'auto',
    borderRadius: '12px',
    width: estWidth + 'px',
    transform: 'none',
    maxHeight: '60vh'
  }
})

watch(show, (newVal) => {
  if (newVal) setShow()
  else setHide()
})

function clickBg(ev: MouseEvent) {
  if (justOpened.value) return
  if (props.processing && persistent.value) return
  const target = ev.target as HTMLElement | null
  if (target?.classList.contains('modal-bg')) {
    show.value = false
  }
}

function setShow() {
  globalsStore.isModalOpen = true
  justOpened.value = true
  setTimeout(() => {
    justOpened.value = false
  }, 350)
  document.body.appendChild(el.value!)
  const isPopover = !!props.anchorSelector && typeof window !== 'undefined' && window.innerWidth > window.innerHeight
  if (isPopover) {
    content.value!.style.transform = 'scale(0.95)'
    content.value!.style.opacity = '0'
  } else {
    content.value!.style.transform = 'translateY(100%)'
    content.value!.style.opacity = '0'
  }
  setTimeout(() => {
    content.value!.style.transform = isPopover ? 'scale(1)' : 'translateY(0)'
    content.value!.style.opacity = '1'
  }, 10)
  document.documentElement.classList.add('modal-open')
}

function setHide() {
  globalsStore.isModalOpen = false
  content.value!.style.transform = 'translateY(100%)'
  content.value!.style.opacity = '0'
  setTimeout(() => {
    el.value!.remove()
  }, 250)
  document.documentElement.classList.remove('modal-open')
}

function closeModalEvt() {
  show.value = false
}

onMounted(() => {
  eventBus.on('close-modal', closeModalEvt)
  el.value = wrapper.value
  content.value!.style.transform = 'translateY(100%)'
  content.value!.style.opacity = '0'
  content.value!.style.transition = 'transform 250ms cubic-bezier(0, 0, 0, 1), opacity 200ms ease'
  el.value!.style.opacity = '1'
  el.value!.remove()
})

onBeforeUnmount(() => {
  eventBus.off('close-modal', closeModalEvt)
  // If the component unmounts while the modal is still open in the DOM
  // (e.g. parent navigates away), remove the element to prevent stuck backdrop
  if (el.value && el.value.parentNode) {
    el.value.remove()
    globalsStore.isModalOpen = false
    document.documentElement.classList.remove('modal-open')
  }
})
</script>
