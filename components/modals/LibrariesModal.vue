<template>
  <modals-modal v-model="show" :processing="processing" anchor-selector="[aria-label='Show library modal']">
    <div class="px-4 pt-2 pb-2">
      <p class="text-md-title-m text-md-on-surface mb-3">{{ strings.HeaderLibraries }}</p>
      <ul class="w-full" role="listbox">
        <template v-for="library in libraries" :key="library.id">
          <li
            class="select-none relative rounded-md-md cursor-pointer mb-1"
            :class="currentLibraryId === library.id ? 'bg-md-secondary-container' : 'hover:bg-md-on-surface/5'"
            role="option"
            @click="clickedOption(library)"
          >
            <div v-show="currentLibraryId === library.id" class="absolute top-0 left-0 w-0.5 bg-md-primary rounded-l-md-md h-full" />
            <div class="flex items-center px-3 py-3">
              <ui-library-icon :icon="library.icon as string" />
              <span class="text-md-body-l text-md-on-surface font-normal block truncate ml-4">{{ library.name }}</span>
            </div>
          </li>
        </template>
      </ul>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useStrings } from '~/composables/useStrings'
import { useHaptics } from '~/composables/useHaptics'
import { useEventBus } from '~/composables/useEventBus'
import { useLocalStore } from '~/composables/useLocalStore'
import { useLibrariesStore } from '~/stores/libraries'

const strings = useStrings()
const { impact } = useHaptics()
const eventBus = useEventBus()
const localStore = useLocalStore()
const librariesStore = useLibrariesStore()

const processing = ref(false)

const show = computed({
  get() { return librariesStore.showModal },
  set(val: boolean) { librariesStore.showModal = val }
})

const currentLibraryId = computed(() => librariesStore.currentLibraryId)
const libraries = computed(() => librariesStore.libraries)

async function clickedOption(lib: Record<string, unknown>) {
  await impact()
  show.value = false
  if (lib.id === currentLibraryId.value) return
  await librariesStore.fetch(lib.id as string)
  eventBus.emit('library-changed', lib.id as string)
  void localStore.setLastLibraryId(lib.id as string)
}
</script>
