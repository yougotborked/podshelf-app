<template>
  <modals-modal v-model="show" :width="400" max-width="95%" height="100%">
    <template #outer>
      <div v-if="currentChapter" class="absolute top-10 left-4 z-40 pt-1" style="max-width: 80%">
        <p class="text-white text-lg truncate">{{ chapters.length }} {{ strings.LabelChapters }}</p>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div ref="container" class="w-full overflow-x-hidden overflow-y-auto bg-md-surface-2 rounded-lg border border-md-on-surface/20" style="max-height: 75%" @click.stop>
        <div class="sticky top-0 z-10 bg-md-surface-2 grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-2 border-b border-md-on-surface/10 transition-shadow" :class="{ 'shadow-md': isScrolled }">
          <div>
            <p class="text-md-on-surface-variant text-sm">{{ strings.LabelChapters }}</p>
          </div>
          <div class="text-right" style="min-width: 60px">
            <p class="text-md-on-surface-variant text-sm" style="letter-spacing: -0.5px">{{ strings.LabelStart }}</p>
          </div>
          <div class="text-right" style="min-width: 60px">
            <p class="text-md-on-surface-variant text-sm" style="letter-spacing: -0.5px">{{ strings.LabelDuration }}</p>
          </div>
        </div>
        <ul class="h-full w-full" role="listbox" aria-labelledby="listbox-label">
          <li v-for="chapter in chapters" :key="chapter.id" :id="`chapter-row-${chapter.id}`" class="text-md-on-surface select-none relative cursor-pointer" :class="currentChapterId === chapter.id ? 'bg-md-surface-container' : ''" role="option" @click="clickedOption(chapter)">
            <div class="grid grid-cols-[1fr_auto_auto] gap-2 px-3 py-3 items-start">
              <p class="font-normal line-clamp-2 text-sm text-md-on-surface/80">{{ chapter.title }}</p>
              <div class="text-right" style="min-width: 60px">
                <span class="font-mono text-md-on-surface-variant text-sm" style="letter-spacing: -0.5px">{{ utils.secondsToTimestamp(chapter.start / _playbackRate) }}</span>
              </div>
              <div class="text-right" style="min-width: 60px">
                <span class="font-mono text-md-on-surface-variant text-sm" style="letter-spacing: -0.5px">{{ utils.secondsToTimestamp(Math.max(0, chapter.end - chapter.start) / _playbackRate) }}</span>
              </div>
            </div>

            <div v-show="chapter.id === currentChapterId" class="w-0.5 h-full absolute top-0 left-0 bg-md-primary" />
          </li>
        </ul>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import type { Chapter } from '~/types'
import { useStrings } from '~/composables/useStrings'
import { useUtils } from '~/composables/useUtils'

type ChapterItem = Chapter

const props = defineProps<{
  modelValue: boolean
  chapters: ChapterItem[]
  currentChapter: ChapterItem | null
  playbackRate: number
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  select: [chapter: ChapterItem]
}>()

const strings = useStrings()
const utils = useUtils()

const container = ref<HTMLElement | null>(null)
const isScrolled = ref(false)

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const _playbackRate = computed(() => {
  if (!props.playbackRate || isNaN(props.playbackRate)) return 1
  return props.playbackRate
})

const currentChapterId = computed(() => props.currentChapter?.id)

watch(() => props.modelValue, (newVal) => {
  if (newVal) {
    void nextTick(scrollToChapter)
  }
})

function clickedOption(chapter: ChapterItem) {
  emit('select', chapter)
}

function scrollToChapter() {
  if (!currentChapterId.value) return

  if (container.value) {
    const currChapterEl = document.getElementById(`chapter-row-${currentChapterId.value}`)
    if (currChapterEl) {
      const offsetTop = currChapterEl.offsetTop
      const containerHeight = container.value.clientHeight
      container.value.scrollTo({ top: offsetTop - containerHeight / 2 })
    }
  }
}

function handleScroll() {
  if (container.value) {
    isScrolled.value = container.value.scrollTop > 0
  }
}

onMounted(() => {
  if (container.value) {
    container.value.addEventListener('scroll', handleScroll)
  }
})

onBeforeUnmount(() => {
  if (container.value) {
    container.value.removeEventListener('scroll', handleScroll)
  }
})
</script>
