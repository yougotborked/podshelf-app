<template>
  <div :key="playlist.id" :id="`playlist-row-${playlist.id}`" class="flex items-center px-3 py-2 justify-start relative border-y border-md-outline-variant" :class="inPlaylist ? 'bg-md-surface-1/20' : ''">
    <div v-if="inPlaylist" class="absolute top-0 left-0 h-full w-1 bg-md-primary z-10" />
    <div class="w-14 min-w-[56px] text-center" @click.stop="clickCover">
      <covers-playlist-cover :items="items" :width="52" :height="52" />
    </div>
    <div class="flex-grow overflow-hidden">
      <p class="px-2 truncate text-sm">{{ playlist.name }}</p>
    </div>
    <div class="w-24 min-w-[96px] px-1">
      <ui-btn v-if="inPlaylist" small class="w-full" @click.stop="click">{{ strings.ButtonRemove }}</ui-btn>
      <ui-btn v-else small class="w-full" @click.stop="click">{{ strings.ButtonAdd }}</ui-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useRouter } from 'vue-router'

const props = defineProps<{
  playlist: { id: string; name?: string; items?: unknown[]; [key: string]: unknown }
  inPlaylist: boolean
}>()
const emit = defineEmits<{
  click: [playlist: Record<string, unknown>]
  close: []
}>()

const strings = useStrings()
const router = useRouter()

const items = computed(() => (props.playlist.items as Record<string, unknown>[] | null | undefined) || [])

function click() {
  emit('click', props.playlist)
}

function clickCover() {
  emit('close')
  void router.push(`/playlist/${props.playlist.id}`)
}
</script>
