<template>
  <div class="w-full my-2">
    <div class="w-full bg-md-surface-3 px-4 py-2 flex items-center" :class="showFiles ? 'rounded-t-md' : 'rounded-md'" @click.stop="clickBar">
      <p class="pr-2">{{ strings.HeaderEbookFiles }}</p>
      <div class="h-6 w-6 rounded-full bg-md-on-surface/10 flex items-center justify-center">
        <span class="text-xs font-mono">{{ ebookFiles.length }}</span>
      </div>
      <div class="flex-grow" />
      <div class="h-10 w-10 rounded-full flex justify-center items-center duration-500" :class="showFiles ? 'transform rotate-180' : ''">
        <span class="material-symbols text-3xl">arrow_drop_down</span>
      </div>
    </div>
    <transition name="slide">
      <div class="w-full" v-show="showFiles">
        <table class="text-sm tracksTable">
          <tr>
            <th class="text-left px-4">{{ strings.LabelFilename }}</th>
            <th class="text-left px-4 w-16">{{ strings.LabelRead }}</th>
            <th v-if="userCanUpdate && !libraryIsAudiobooksOnly" class="text-center w-16"></th>
          </tr>
          <template v-for="file in ebookFiles" :key="file.path">
            <tables-ebook-files-table-row :libraryItemId="libraryItemId" :file="file" @read="readEbook" @more="showMore" />
          </template>
        </table>
      </div>
    </transition>

    <modals-dialog v-model="showMoreMenu" :items="moreMenuItems" @action="moreMenuAction" />
  </div>
</template>

<script setup lang="ts">
const props = defineProps<{
  libraryItem: Record<string, unknown>
}>()

const strings = useStrings()
const userStore = useUserStore()
const librariesStore = useLibrariesStore()
const globalsStore = useGlobalsStore()
const nativeHttp = useNativeHttp()
const toast = useToast()

const processing = ref(false)
const showFiles = ref(false)
const showMoreMenu = ref(false)
const moreMenuItems = ref<{ text: string; value: string }[]>([])
const selectedFile = ref<Record<string, unknown> | null>(null)

const libraryItemId = computed(() => props.libraryItem.id as string)
const ebookFiles = computed(() =>
  ((props.libraryItem.libraryFiles as Record<string, unknown>[]) || []).filter((lf) => lf.fileType === 'ebook')
)
const userCanUpdate = computed(() => userStore.getUserCanUpdate)
const libraryIsAudiobooksOnly = computed(() => librariesStore.getLibraryIsAudiobooksOnly)

function moreMenuAction(action: string) {
  showMoreMenu.value = false
  if (action === 'updateStatus') {
    updateEbookStatus()
  }
}

function showMore({ file, items }: { file: Record<string, unknown>; items: { text: string; value: string }[] }) {
  showMoreMenu.value = true
  selectedFile.value = file
  moreMenuItems.value = items
}

function readEbook(fileIno: unknown) {
  globalsStore.showReaderAction({ libraryItem: props.libraryItem, keepProgress: false, fileId: fileIno as string })
}

function clickBar() {
  showFiles.value = !showFiles.value
}

async function updateEbookStatus() {
  processing.value = true
  try {
    await nativeHttp.patch(`/api/items/${libraryItemId.value}/ebook/${selectedFile.value?.ino}/status`, null, { connectTimeout: 10000 })
    toast.success('Ebook updated')
  } catch (error) {
    console.error('Failed to update ebook', error)
    toast.error('Failed to update ebook')
  } finally {
    processing.value = false
  }
}
</script>
