<template>
  <modals-modal v-model="show" :width="400" height="100%">
    <template #outer>
      <div class="absolute top-11 left-4 z-40">
        <p class="text-white text-2xl truncate">{{ strings.LabelYourBookmarks }}</p>
      </div>
    </template>
    <div class="w-full h-full overflow-hidden absolute top-0 left-0 flex items-center justify-center" @click="show = false">
      <div class="w-full rounded-lg bg-md-surface-3 border border-md-outline-variant overflow-y-auto overflow-x-hidden relative mt-16" style="max-height: 80vh" @click.stop.prevent>
        <div class="w-full h-full p-4" v-if="showBookmarkTitleInput">
          <div class="flex mb-4 items-center">
            <div class="w-9 h-9 flex items-center justify-center rounded-full hover:bg-white/10 cursor-pointer" @click.stop="showBookmarkTitleInput = false">
              <span class="material-symbols text-3xl">arrow_back</span>
            </div>
            <p class="text-xl pl-2">{{ selectedBookmark ? 'Edit Bookmark' : 'New Bookmark' }}</p>
            <div class="flex-grow" />
            <p class="text-xl font-mono">{{ utils.secondsToTimestamp(currentTime / _playbackRate) }}</p>
          </div>

          <ui-text-input-with-label v-model="newBookmarkTitle" :placeholder="bookmarkPlaceholder()" :autofocus="false" ref="noteInput" label="Note" />
          <div class="flex justify-end mt-6">
            <ui-btn color="success" class="w-full" @click.stop="submitBookmark">{{ selectedBookmark ? 'Update' : 'Create' }}</ui-btn>
          </div>
        </div>
        <div class="w-full h-full" v-else>
          <template v-for="bookmark in bookmarks" :key="bookmark.id">
            <modals-bookmarks-bookmark-item :highlight="currentTime === bookmark.time" :bookmark="bookmark as BookmarkRow" :playback-rate="_playbackRate" @click="clickBookmark" @edit="editBookmark" @delete="deleteBookmark" />
          </template>
          <div v-if="!bookmarks.length" class="flex h-32 items-center justify-center">
            <p class="text-xl">{{ strings.MessageNoBookmarks }}</p>
          </div>
        </div>
        <div v-if="canCreateBookmark && !showBookmarkTitleInput" class="flex px-4 py-2 items-center text-center justify-between border-b border-md-on-surface/10 bg-md-primary cursor-pointer text-white/80 sticky bottom-0 left-0 w-full" @click.stop="createBookmark">
          <span class="material-symbols">add</span>
          <p class="text-base pl-2">{{ strings.ButtonCreateBookmark }}</p>
          <p class="text-sm font-mono">{{ utils.secondsToTimestamp(currentTime / _playbackRate) }}</p>
        </div>
      </div>
    </div>
  </modals-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { Dialog } from '@capacitor/dialog'
import { useStrings } from '~/composables/useStrings'
import { useHaptics } from '~/composables/useHaptics'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useToast } from '~/composables/useToast'
import { useUtils } from '~/composables/useUtils'
import { useUserStore } from '~/stores/user'

type BookmarkRow = { time: number; [key: string]: unknown }

const props = defineProps<{
  modelValue: boolean
  bookmarks: Record<string, unknown>[]
  currentTime: number
  playbackRate: number
  libraryItemId: string | null
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  select: [bookmark: Record<string, unknown>]
}>()

const strings = useStrings()
const { impact } = useHaptics()
const nativeHttp = useNativeHttp()
const toast = useToast()
const utils = useUtils()
const userStore = useUserStore()

const selectedBookmark = ref<Record<string, unknown> | null>(null)
const showBookmarkTitleInput = ref(false)
const newBookmarkTitle = ref('')

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const canCreateBookmark = computed(() => !props.bookmarks.find((bm) => bm.time === props.currentTime))

const _playbackRate = computed(() => {
  if (!props.playbackRate || isNaN(props.playbackRate)) return 1
  return props.playbackRate
})

watch(show, (newVal) => {
  if (newVal) {
    showBookmarkTitleInput.value = false
    newBookmarkTitle.value = ''
  }
})

function bookmarkPlaceholder() {
  return utils.formatDate(Date.now(), 'MMM dd, yyyy HH:mm')
}

function editBookmark(bm: Record<string, unknown>) {
  selectedBookmark.value = bm
  newBookmarkTitle.value = bm.title as string
  showBookmarkTitleInput.value = true
}

async function deleteBookmark(bm: Record<string, unknown>) {
  await impact()
  const { value } = await Dialog.confirm({
    title: 'Remove Bookmark',
    message: strings.MessageConfirmRemoveBookmark
  })
  if (!value) return

  nativeHttp
    .delete(`/api/me/item/${props.libraryItemId}/bookmark/${bm.time}`)
    .then(() => {
      userStore.deleteBookmark({ libraryItemId: props.libraryItemId ?? '', time: bm.time as number })
    })
    .catch((error) => {
      toast.error(strings.ToastBookmarkRemoveFailed)
      console.error(error)
    })
}

async function clickBookmark(bm: Record<string, unknown>) {
  await impact()
  emit('select', bm)
}

function submitUpdateBookmark(updatedBookmark: Record<string, unknown>) {
  nativeHttp
    .patch(`/api/me/item/${props.libraryItemId}/bookmark`, updatedBookmark)
    .then((bookmark) => {
      userStore.updateBookmark(bookmark as Record<string, unknown>)
      showBookmarkTitleInput.value = false
    })
    .catch((error) => {
      toast.error(strings.ToastBookmarkUpdateFailed)
      console.error(error)
    })
}

function submitCreateBookmark() {
  if (!newBookmarkTitle.value) {
    newBookmarkTitle.value = utils.formatDate(Date.now(), 'MMM dd, yyyy HH:mm')
  }
  const bookmark = {
    title: newBookmarkTitle.value,
    time: Math.floor(props.currentTime)
  }
  nativeHttp
    .post(`/api/me/item/${props.libraryItemId}/bookmark`, bookmark)
    .then(() => {
      toast.success('Bookmark added')
    })
    .catch((error) => {
      toast.error(strings.ToastBookmarkCreateFailed)
      console.error(error)
    })

  newBookmarkTitle.value = ''
  showBookmarkTitleInput.value = false

  show.value = false
}

function createBookmark() {
  selectedBookmark.value = null
  newBookmarkTitle.value = ''
  showBookmarkTitleInput.value = true
}

async function submitBookmark() {
  await impact()
  if (selectedBookmark.value) {
    const updatePayload = {
      ...selectedBookmark.value,
      title: newBookmarkTitle.value
    }
    submitUpdateBookmark(updatePayload)
  } else {
    submitCreateBookmark()
  }
}
</script>
