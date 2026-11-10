<template>
  <div class="w-full px-2">
    <img v-if="podcast.imageUrl" :src="podcast.imageUrl" class="h-36 w-36 object-contain mx-auto mb-2" />

    <ui-text-input-with-label v-model="podcast.title" :label="strings.LabelTitle" class="mb-2 text-sm" @update:modelValue="titleUpdated" />

    <ui-text-input-with-label v-model="podcast.author" :label="strings.LabelAuthor" class="mb-2 text-sm" />

    <ui-text-input-with-label v-model="podcast.feedUrl" :label="strings.LabelFeedURL" readonly class="mb-2 text-sm" />

    <ui-multi-select v-model="podcast.genres" :items="podcast.genres" :label="strings.LabelGenres" class="mb-2 text-sm" />

    <ui-textarea-with-label v-model="podcast.description" :label="strings.LabelDescription" :rows="3" class="mb-2 text-sm" />

    <ui-dropdown v-model="selectedFolderId" :items="folderItems" :disabled="processing" :label="strings.LabelFolder" class="mb-2 text-sm" @update:modelValue="folderUpdated" />

    <ui-text-input-with-label v-model="fullPath" :label="strings.LabelPath" input-class="h-10" readonly class="mb-2 text-sm" />

    <div class="flex items-center py-4 px-2">
      <ui-checkbox v-model="podcast.autoDownloadEpisodes" :label="strings.LabelAutoDownloadEpisodes" checkbox-bg="primary" border-color="gray-600" label-class="pl-2 text-sm font-semibold" />
      <div class="flex-grow" />
      <ui-btn color="success" @click="submit">{{ strings.ButtonSubmit }}</ui-btn>
    </div>
  </div>
</template>

<script setup lang="ts">
import Path from 'path'
import { ref, computed, reactive, onMounted } from 'vue'

const props = defineProps<{
  processing: boolean
  podcastData: Record<string, unknown> | null
  podcastFeedData: Record<string, unknown> | null
}>()

const emit = defineEmits<{
  'update:processing': [value: boolean]
}>()

const strings = useStrings()
const librariesStore = useLibrariesStore()
const nativeHttp = useNativeHttp()
const toast = useToast()
const router = useRouter()
const utils = useUtils()

const selectedFolderId = ref<string | null>(null)
const fullPath = ref<string | null>(null)
const podcast = reactive({
  title: '',
  author: '',
  description: '',
  releaseDate: '',
  genres: [] as string[],
  feedUrl: '',
  feedImageUrl: '',
  itunesPageUrl: '',
  itunesId: '',
  itunesArtistId: '',
  autoDownloadEpisodes: false,
  imageUrl: '',
  language: ''
})

const _podcastData = computed(() => (props.podcastData || {}) as Record<string, unknown>)
const feedMetadata = computed(() => {
  if (!props.podcastFeedData) return {}
  return (props.podcastFeedData.metadata as Record<string, unknown> | null | undefined) || {}
})

const currentLibrary = computed(() => librariesStore.getCurrentLibrary)
const folders = computed(() => {
  if (!currentLibrary.value) return []
  return (currentLibrary.value.folders as Array<{ id: string; fullPath: string }> | null | undefined) || []
})
const folderItems = computed(() => {
  return folders.value.map((fold) => ({
    value: fold.id,
    text: fold.fullPath
  }))
})
const selectedFolder = computed(() => folders.value.find((f) => f.id === selectedFolderId.value))
const selectedFolderPath = computed(() => selectedFolder.value?.fullPath || '')

function titleUpdated() {
  folderUpdated()
}

function folderUpdated() {
  if (!selectedFolderPath.value || !podcast.title) {
    fullPath.value = ''
    return
  }
  fullPath.value = Path.join(selectedFolderPath.value, utils.sanitizeFilename(podcast.title) as string)
}

function submit() {
  const podcastPayload = {
    path: fullPath.value,
    folderId: selectedFolderId.value,
    libraryId: currentLibrary.value?.id,
    media: {
      metadata: {
        title: podcast.title,
        author: podcast.author,
        description: podcast.description,
        releaseDate: podcast.releaseDate,
        genres: [...podcast.genres],
        feedUrl: podcast.feedUrl,
        imageUrl: podcast.imageUrl,
        itunesPageUrl: podcast.itunesPageUrl,
        itunesId: podcast.itunesId,
        itunesArtistId: podcast.itunesArtistId,
        language: podcast.language
      },
      autoDownloadEpisodes: podcast.autoDownloadEpisodes
    }
  }
  console.log('Podcast payload', podcastPayload)

  emit('update:processing', true)
  nativeHttp
    .post('/api/podcasts', podcastPayload)
    .then((libraryItem) => {
      emit('update:processing', false)
      toast.success(strings.ToastPodcastCreateSuccess)
      void router.push(`/item/${(libraryItem as Record<string, unknown>).id}`)
    })
    .catch((error: Error & { response?: { data?: string } }) => {
      const errorMsg = error.response?.data ? error.response.data : strings.ToastPodcastCreateFailed
      console.error('Failed to create podcast', error)
      emit('update:processing', false)
      toast.error(errorMsg as string)
    })
}

function init() {
  podcast.title = (_podcastData.value.title as string) || (feedMetadata.value.title as string) || ''
  podcast.author = (_podcastData.value.artistName as string) || (feedMetadata.value.author as string) || ''
  podcast.description = (_podcastData.value.description as string) || (feedMetadata.value.descriptionPlain as string) || ''
  podcast.releaseDate = (_podcastData.value.releaseDate as string) || ''
  podcast.genres = (_podcastData.value.genres as string[] | null | undefined) || (feedMetadata.value.categories as string[] | null | undefined) || []
  podcast.feedUrl = (_podcastData.value.feedUrl as string) || (feedMetadata.value.feedUrl as string) || ''
  podcast.imageUrl = (_podcastData.value.cover as string) || (feedMetadata.value.image as string) || ''
  podcast.itunesPageUrl = (_podcastData.value.pageUrl as string) || ''
  podcast.itunesId = (_podcastData.value.id as string) || ''
  podcast.itunesArtistId = (_podcastData.value.artistId as string) || ''
  podcast.language = (_podcastData.value.language as string) || ''
  podcast.autoDownloadEpisodes = false

  if (folderItems.value[0]) {
    selectedFolderId.value = folderItems.value[0].value
    folderUpdated()
  }
}

onMounted(() => {
  init()
})
</script>
