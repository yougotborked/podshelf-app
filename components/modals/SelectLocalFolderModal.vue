<template>
  <modals-modal v-model="show" :width="300" height="100%">
    <template #outer>
      <div class="absolute top-10 left-4 z-40" style="max-width: 80%">
        <p class="text-white text-lg truncate">{{ strings.HeaderSelectDownloadLocation }}</p>
      </div>
    </template>

    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div ref="container" class="w-full overflow-x-hidden overflow-y-auto bg-md-surface-3 rounded-lg border border-md-on-surface/20" style="max-height: 75%" @click.stop>
        <ul class="h-full w-full" role="listbox" aria-labelledby="listbox-label">
          <template v-for="folder in localFolders" :key="folder.id">
            <li :id="`folder-${folder.id}`" class="text-md-on-surface select-none relative py-5" role="option" @click="clickedOption(folder)">
              <div class="relative flex items-center pl-3" style="padding-right: 4.5rem">
                <span class="material-symbols text-xl mr-2 text-md-on-surface/80">folder</span>
                <p class="font-normal block truncate text-sm text-md-on-surface/80">{{ folder.name }}</p>
              </div>
            </li>
          </template>
        </ul>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useDb } from '~/composables/useDb'
import { useGlobalsStore } from '~/stores/globals'

const strings = useStrings()
const db = useDb()
const globalsStore = useGlobalsStore()

const localFolders = ref<{ id: string; name?: string; [key: string]: unknown }[]>([])

const show = computed({
  get() { return globalsStore.showSelectLocalFolderModal },
  set(val: boolean) { globalsStore.showSelectLocalFolderModal = val }
})

const modalData = computed(() => (globalsStore.localFolderSelectData as Record<string, unknown>) || {})
const callback = computed(() => modalData.value.callback as ((folder: Record<string, unknown>) => void) | undefined)
const mediaType = computed(() => modalData.value.mediaType as string)

watch(show, (newVal) => {
  if (newVal) {
    void nextTick(init)
  }
})

function clickedOption(folder: Record<string, unknown>) {
  show.value = false
  if (!callback.value) {
    console.error('Callback not set')
    return
  }
  callback.value(folder)
}

async function init() {
  const folders = (await db.getLocalFolders()) || []

  if (!folders.some((lf) => (lf as Record<string, unknown>).id === `internal-${mediaType.value}`)) {
    folders.push({
      id: `internal-${mediaType.value}`,
      name: strings.LabelInternalAppStorage,
      mediaType: mediaType.value
    })
  }
  localFolders.value = (folders as { id: string; name?: string; [key: string]: unknown }[]).filter((lf) => lf.mediaType == mediaType.value)
}
</script>
