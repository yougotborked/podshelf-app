<template>
  <modals-modal v-model="show" :width="400">
    <p class="text-md-title-m text-md-on-surface px-4 pt-2 pb-1">{{ strings.LabelQueue }}</p>
    <div class="max-h-[70vh] overflow-y-auto">
      <draggable v-model="localQueue" handle=".drag" tag="div" item-key="libraryItemId" @end="dragEnd">
        <template #item="{ element: item, index: idx }">
          <div class="flex items-center px-4 py-2 border-b border-md-on-surface/10 cursor-pointer" :class="{ 'bg-md-secondary-container': idx === currentIndex }" @click="select(idx)">
            <span class="material-symbols drag mr-2 text-md-on-surface-variant cursor-move">drag_handle</span>
            <p class="flex-grow truncate">{{ itemTitle(item) }}</p>
            <span v-if="idx === currentIndex" class="material-symbols text-md-primary">play_arrow</span>
            <span class="material-symbols text-error ml-2" @click.stop="remove(idx)">close</span>
          </div>
        </template>
      </draggable>
      <div v-if="!queue.length" class="flex items-center justify-center p-4">
        <p class="text-base text-md-on-surface-variant">{{ strings.MessageNoItems }}</p>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import draggable from 'vuedraggable'
import { useStrings } from '~/composables/useStrings'
import { useAppStore } from '~/stores/app'

const props = defineProps<{
  modelValue: boolean
  queue: Record<string, unknown>[]
  currentIndex: number | null
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  select: [idx: number]
}>()

const strings = useStrings()
const appStore = useAppStore()

const localQueue = ref([...props.queue])

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

watch(() => props.queue, (newVal) => {
  localQueue.value = [...newVal]
})

function itemTitle(item: Record<string, unknown>) {
  const ep = item.episode as Record<string, unknown>
  const le = item.localEpisode as Record<string, unknown>
  const li = item.libraryItem as Record<string, unknown>
  const lli = item.localLibraryItem as Record<string, unknown>
  if (ep) return ep.title as string
  if (le) return le.title as string
  if (li?.media) return ((li.media as Record<string, unknown>).metadata as Record<string, unknown> | null | undefined)?.title as string
  if (lli?.media) return ((lli.media as Record<string, unknown>).metadata as Record<string, unknown> | null | undefined)?.title as string
  return ''
}

function select(idx: number) {
  emit('select', idx)
}

function remove(idx: number) {
  appStore.removeQueueItem(idx)
}

function dragEnd(evt: { oldIndex: number; newIndex: number }) {
  if (evt.oldIndex === evt.newIndex) return
  appStore.reorderQueue({ oldIndex: evt.oldIndex, newIndex: evt.newIndex })
}
</script>
