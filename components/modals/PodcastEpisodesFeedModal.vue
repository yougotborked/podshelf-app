<template>
  <modals-modal v-model="show" width="100%" height="100%" max-width="100%">
    <template #outer>
      <div class="absolute top-8 left-4 z-40">
        <p class="text-white text-2xl truncate">Feed Episodes</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div class="feed-content w-full overflow-x-hidden overflow-y-auto bg-md-surface-1 rounded-lg border border-white/20" @click.stop.prevent>
        <template v-for="(episode, index) in episodes" :key="index">
          <div class="relative" :class="itemEpisodeMap[(episode as any).enclosure.url] ? 'bg-md-surface-3/40' : selectedEpisodes[String(index)] ? 'bg-md-primary/10' : index % 2 == 0 ? 'bg-md-surface-3/25' : 'bg-md-surface-3/5'" @click="selectEpisode(episode, index)">
            <div class="absolute top-0 left-0 h-full flex items-center p-2">
              <span v-if="itemEpisodeMap[(episode as any).enclosure.url]" class="material-symbols text-md-primary text-xl">download_done</span>
              <ui-checkbox v-else :model-value="!!selectedEpisodes[String(index)]" small @update:model-value="selectedEpisodes[String(index)] = $event" checkbox-bg="md-surface-3" border-color="gray-600" />
            </div>
            <div class="pl-9 pr-2 py-2 border-b border-white/10">
              <p v-if="(episode as any).episode" class="font-semibold text-md-on-surface text-xs">#{{ (episode as any).episode }}</p>
              <p class="break-words mb-1 text-sm">{{ (episode as any).title }}</p>
              <p v-if="(episode as any).subtitle" class="break-words mb-1 text-xs text-md-on-surface-variant episode-subtitle">{{ (episode as any).subtitle }}</p>
              <p class="text-xxs text-md-on-surface-variant">{{ utils.dateDistanceFromNow((episode as any).publishedAt) ? getString('LabelPublishedDate', [(episode as any).publishedAt ? utils.dateDistanceFromNow((episode as any).publishedAt) : strings.LabelUnknown]) : '' }}</p>
            </div>
          </div>
        </template>
      </div>
      <div class="absolute bottom-6 left-0 w-full flex items-center" style="height: 50px">
        <ui-btn class="w-full" :disabled="!episodesSelected.length" color="success" @click.stop="downloadEpisodes">{{ episodesSelected.length ? `Add ${episodesSelected.length} Episode(s) to Server` : 'No Episodes Selected' }}</ui-btn>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useStrings, getString } from '~/composables/useStrings'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useToast } from '~/composables/useToast'
import { useUtils } from '~/composables/useUtils'

const props = defineProps<{
  modelValue: boolean
  libraryItem: Record<string, unknown>
  episodes: Record<string, unknown>[]
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
}>()

const strings = useStrings()
const nativeHttp = useNativeHttp()
const toast = useToast()
const utils = useUtils()

const processing = ref(false)
const selectedEpisodes = ref<Record<string, boolean>>({})

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const episodesSelected = computed(() => Object.keys(selectedEpisodes.value).filter((key) => !!selectedEpisodes.value[key]))

const itemEpisodes = computed(() => {
  return ((props.libraryItem.media as Record<string, unknown>).episodes as Record<string, unknown>[] | null | undefined) || []
})

const itemEpisodeMap = computed(() => {
  const map: Record<string, boolean> = {}
  itemEpisodes.value.forEach((item) => {
    const enc = item.enclosure as Record<string, string> | undefined
    if (enc?.url) map[enc.url] = true
  })
  return map
})

watch(show, (newVal: boolean) => {
  if (newVal) init()
}, { immediate: true })

function downloadEpisodes() {
  const episodesToDownload = episodesSelected.value.map((episodeIndex) => props.episodes[Number(episodeIndex)])

  const payloadSize = JSON.stringify(episodesToDownload).length
  const sizeInMb = payloadSize / 1024 / 1024
  const sizeInMbPretty = sizeInMb.toFixed(2) + 'MB'
  console.log('Request size', sizeInMb)
  if (sizeInMb > 4.99) {
    toast.error(`Request is too large (${sizeInMbPretty}) should be < 5Mb`)
    return
  }

  processing.value = true
  nativeHttp
    .post(`/api/podcasts/${props.libraryItem.id}/download-episodes`, episodesToDownload)
    .then(() => {
      processing.value = false
      toast.success('Started downloading episodes on server')
      show.value = false
    })
    .catch((error) => {
      const err = error as Record<string, Record<string, string>>
      const errorMsg = err.response && err.response.data ? err.response.data : 'Failed to download episodes'
      console.error('Failed to download episodes', error)
      processing.value = false
      toast.error(errorMsg)

      selectedEpisodes.value = {}
    })
}

function selectEpisode(episode: Record<string, unknown>, index: number) {
  const enc = episode.enclosure as Record<string, string> | undefined
  if (enc?.url && itemEpisodeMap.value[enc.url]) return
  selectedEpisodes.value[String(index)] = !selectedEpisodes.value[String(index)]
}

function init() {
  const sorted = [...props.episodes].sort((a, b) => {
    const aTime = a.publishedAt as number
    const bTime = b.publishedAt as number
    return aTime < bTime ? 1 : -1
  })
  const newSelected: Record<string, boolean> = {}
  for (let i = 0; i < sorted.length; i++) {
    newSelected[String(i)] = false
  }
  selectedEpisodes.value = newSelected
}
</script>

<style>
.feed-content {
  height: calc(100vh - 150px);
  max-height: calc(100vh - 150px);
  margin-top: 5px;
}
</style>
