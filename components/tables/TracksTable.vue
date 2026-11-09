<template>
  <div class="w-full my-4">
    <div class="w-full bg-md-surface-3 px-4 py-2 flex items-center" :class="showTracks ? 'rounded-t-md' : 'rounded-md'" @click.stop="clickBar">
      <p class="pr-2">{{ strings.HeaderAudioTracks }}</p>
      <div class="h-6 w-6 rounded-full bg-md-on-surface/10 flex items-center justify-center">
        <span class="text-xs font-mono">{{ tracks.length }}</span>
      </div>
      <div class="flex-grow" />
      <div class="h-10 w-10 rounded-full flex justify-center items-center duration-500" :class="showTracks ? 'transform rotate-180' : ''">
        <span class="material-symbols text-3xl">arrow_drop_down</span>
      </div>
    </div>
    <transition name="slide">
      <div class="w-full" v-show="showTracks">
        <table class="text-xs tracksTable">
          <tr>
            <th class="text-left">{{ strings.LabelFilename }}</th>
            <th class="text-center w-16">{{ strings.LabelDuration }}</th>
          </tr>
          <template v-for="track in tracks" :key="track.index">
            <tr>
              <td>{{ ((track as any).metadata && (track as any).metadata.filename) || (track as any).title || 'Unknown' }}</td>
              <td class="font-mono text-center w-16">
                {{ utils.secondsToTimestamp((track as any).duration) }}
              </td>
            </tr>
          </template>
        </table>
      </div>
    </transition>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  tracks: Array<{ index?: string | number; [key: string]: unknown }>
  libraryItemId?: string
}>()

const strings = useStrings()
const utils = useUtils()

const showTracks = ref(false)

function clickBar() {
  showTracks.value = !showTracks.value
}
</script>
