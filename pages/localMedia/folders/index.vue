<template>
  <div class="w-full h-full py-6">
    <div class="flex items-center mb-2">
      <h1 class="text-base font-semibold px-2">
        {{ $strings.HeaderLocalFolders }}
      </h1>
      <button type="button" class="material-symbols text-xl" @click.stop="showLocalFolderMoreInfo">info</button>
    </div>

    <div v-if="!isIos" class="w-full max-w-full px-2 py-2">
      <template v-for="folder in localFolders" :key="folder.id">
        <nuxt-link :to="`/localMedia/folders/${folder.id}`" class="flex items-center px-2 py-4 bg-md-surface-1 rounded-md border-md-surface-0 mb-1">
          <span class="material-symbols fill text-xl text-md-primary">folder</span>
          <p class="ml-2">{{ folder.name }}</p>
          <div class="flex-grow" />
          <p class="text-sm italic text-md-on-surface-variant px-3 capitalize">{{ folder.mediaType }}s</p>
          <span class="material-symbols text-xl text-md-on-surface-variant">arrow_right</span>
        </nuxt-link>
      </template>
      <div v-if="!localFolders.length" class="flex justify-center">
        <p class="text-center">{{ $strings.MessageNoMediaFolders }}</p>
      </div>
      <div v-if="!isAndroid10OrBelow || overrideFolderRestriction" class="flex border-t border-md-on-surface/10 my-4 py-4">
        <div class="flex-grow pr-1">
          <ui-dropdown v-model="newFolderMediaType" :placeholder="$strings.LabelSelectMediaType" :items="mediaTypeItems" />
        </div>
        <ui-btn small class="w-28" color="success" @click="selectFolder">{{ $strings.ButtonNewFolder }}</ui-btn>
      </div>
      <div v-else class="flex border-t border-md-on-surface/10 my-4 py-4">
        <div class="flex-grow pr-1">
          <p class="text-sm">{{ $strings.MessageAndroid10Downloads }}</p>
        </div>
        <ui-btn small class="w-28" color="primary" @click="overrideFolderRestriction = true">{{ $strings.ButtonOverride }}</ui-btn>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { LibraryItem, LocalFolder } from '~/types'
import { ref, computed } from 'vue'
import { AbsFileSystem } from '@/plugins/capacitor'
import { Dialog } from '@capacitor/dialog'

const toast = useToast()
const db = useDb()
const platform = usePlatform()
const strings = useStrings()
const { getAndroidSDKVersion } = useUtils()

// State
const localFolders = ref<LocalFolder[]>([])
const localLibraryItems = ref<LibraryItem[]>([])
const newFolderMediaType = ref<string | null>(null)
const mediaTypeItems = [
  {
    value: 'book',
    text: strings.LabelBooks
  },
  {
    value: 'podcast',
    text: strings.LabelPodcasts
  }
]
const isAndroid10OrBelow = ref(false)
const overrideFolderRestriction = ref(false)

// Computed
const isIos = computed(() => platform === 'ios')

// Methods
async function selectFolder() {
  if (!newFolderMediaType.value) {
    toast.error('Must select a media type')
    return
  }
  const folderObj = await AbsFileSystem.selectFolder({ mediaType: newFolderMediaType.value })
  if (!folderObj) return
  if (folderObj.error) {
    toast.error(`Error: ${folderObj.error || 'Unknown Error'}`)
    return
  }

  const indexOfExisting = localFolders.value.findIndex((lf) => lf.id == folderObj.id)
  if (indexOfExisting >= 0) {
    localFolders.value.splice(indexOfExisting, 1, folderObj)
  } else {
    localFolders.value.push(folderObj)
  }

  const permissionsGood = await AbsFileSystem.checkFolderPermissions({ folderUrl: folderObj.contentUrl })

  if (!permissionsGood) {
    toast.error('Folder permissions failed')
    return
  } else {
    toast.success('Folder permission success')
  }
}

async function showLocalFolderMoreInfo() {
  const confirmResult = await Dialog.confirm({
    title: strings.HeaderLocalFolders,
    message: strings.MessageLocalFolderDescription,
    cancelButtonTitle: 'View More'
  })
  if (!confirmResult.value) {
    window.open('https://www.audiobookshelf.org/guides/android_app_shared_storage', '_blank')
  }
}

async function init() {
  const androidSdkVersion = await getAndroidSDKVersion()
  isAndroid10OrBelow.value = !!androidSdkVersion && androidSdkVersion <= 29
  console.log(`androidSdkVersion=${androidSdkVersion}, isAndroid10OrBelow=${isAndroid10OrBelow.value}`)

  localFolders.value = (await db.getLocalFolders()) || []
  localLibraryItems.value = await db.getLocalLibraryItems()
}

onMounted(() => {
  void init()
})
</script>
