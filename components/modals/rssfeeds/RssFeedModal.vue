<template>
  <modals-fullscreen-modal v-model="show" :processing="processing">
    <div class="flex items-end justify-end h-24 pr-4 pb-2">
      <!-- <h1 class="text-lg">RSS Feed</h1> -->
      <button class="flex" @click="show = false">
        <span class="material-symbols">close</span>
      </button>
    </div>

    <div class="w-full px-2 h-[calc(100%-176px)] overflow-y-auto">
      <div v-if="currentFeed" class="w-full">
        <div class="w-full relative">
          <h1 class="text-lg mb-4">{{ strings.HeaderRSSFeedIsOpen }}</h1>

          <ui-text-input v-model="fullFeedUrl" class="text-sm" readonly />

          <span class="material-symbols absolute right-2 bottom-2 p-0.5 text-base" :class="linkCopied ? 'text-md-primary' : 'text-md-on-surface-variant'" @click="copyToClipboard(fullFeedUrl)">{{ linkCopied ? 'check' : 'content_copy' }}</span>
        </div>

        <div v-if="currentFeed.meta" class="mt-5">
          <div class="flex py-0.5">
            <div class="w-48">
              <span class="text-md-on-surface-variant uppercase text-sm">{{ strings.LabelRSSFeedPreventIndexing }}</span>
            </div>
            <div>{{ (currentFeed.meta as any).preventIndexing ? strings.ButtonYes : strings.LabelNo }}</div>
          </div>
          <div v-if="(currentFeed.meta as any).ownerName" class="flex py-0.5">
            <div class="w-48">
              <span class="text-md-on-surface-variant uppercase text-sm">{{ strings.LabelRSSFeedCustomOwnerName }}</span>
            </div>
            <div>{{ (currentFeed.meta as any).ownerName }}</div>
          </div>
          <div v-if="(currentFeed.meta as any).ownerEmail" class="flex py-0.5">
            <div class="w-48">
              <span class="text-md-on-surface-variant uppercase text-sm">{{ strings.LabelRSSFeedCustomOwnerEmail }}</span>
            </div>
            <div>{{ (currentFeed.meta as any).ownerEmail }}</div>
          </div>
        </div>
      </div>
      <div v-else class="w-full">
        <div class="w-full relative mb-2">
          <ui-text-input-with-label v-model="newFeedSlug" :label="strings.LabelRSSFeedSlug" />
          <p class="text-xs text-md-on-surface-variant py-0.5 px-1">{{ getString('MessageFeedURLWillBe', [demoFeedUrl]) }}</p>
        </div>
        <modals-rssfeeds-rss-feed-metadata-builder v-model="metadataDetails" />

        <p v-if="isHttp" class="w-full pt-2 text-warning text-xs">{{ strings.NoteRSSFeedPodcastAppsHttps }}</p>
        <p v-if="hasEpisodesWithoutPubDate" class="w-full pt-2 text-warning text-xs">{{ strings.NoteRSSFeedPodcastAppsPubDate }}</p>
      </div>
    </div>

    <div v-show="userIsAdminOrUp" class="flex items-start pt-2 h-20">
      <ui-btn v-if="currentFeed" color="error" class="w-full h-14" @click="closeFeed">{{ strings.ButtonCloseFeed }}</ui-btn>
      <ui-btn v-else color="success" class="w-full h-14" @click="openFeed">{{ strings.ButtonOpenFeed }}</ui-btn>
    </div>
  </modals-fullscreen-modal>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useStrings, getString } from '~/composables/useStrings'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useToast } from '~/composables/useToast'
import { useUtils } from '~/composables/useUtils'
import { useUserStore } from '~/stores/user'
import { useGlobalsStore } from '~/stores/globals'

interface MetadataDetails {
  preventIndexing: boolean
  ownerName: string
  ownerEmail: string
}

const strings = useStrings()
const nativeHttp = useNativeHttp()
const toast = useToast()
const utils = useUtils()
const userStore = useUserStore()
const globalsStore = useGlobalsStore()

const processing = ref(false)
const newFeedSlug = ref<string | null>(null)
const currentFeed = ref<Record<string, unknown> | null>(null)
const metadataDetails = ref<MetadataDetails>({
  preventIndexing: true,
  ownerName: '',
  ownerEmail: ''
})
const linkCopied = ref(false)

const show = computed({
  get() { return globalsStore.showRSSFeedOpenCloseModal },
  set(val: boolean) { globalsStore.showRSSFeedOpenCloseModal = val }
})

const serverAddress = computed(() => userStore.getServerAddress)
const rssFeedEntity = computed(() => (globalsStore.rssFeedEntity as Record<string, unknown> | null | undefined) || {})
const entityId = computed(() => rssFeedEntity.value.id as string)
const entityType = computed(() => rssFeedEntity.value.type as string)
const entityFeed = computed(() => rssFeedEntity.value.feed as Record<string, unknown>)
const hasEpisodesWithoutPubDate = computed(() => !!rssFeedEntity.value.hasEpisodesWithoutPubDate)
const userIsAdminOrUp = computed(() => userStore.getIsAdminOrUp)

const demoFeedUrl = computed(() => `${serverAddress.value}/feed/${newFeedSlug.value}`)

const fullFeedUrl = computed(() => {
  if (!currentFeed.value) return ''
  return `${serverAddress.value}${currentFeed.value.feedUrl}`
})

const isHttp = computed(() => !!serverAddress.value?.startsWith('http://'))

watch(show, (newVal: boolean) => {
  if (newVal) {
    linkCopied.value = false
    init()
  }
}, { immediate: true })

function openFeed() {
  if (!newFeedSlug.value) {
    toast.error('Must set a feed slug')
    return
  }

  const sanitized = utils.sanitizeSlug(newFeedSlug.value)
  if (newFeedSlug.value !== sanitized) {
    newFeedSlug.value = sanitized
    toast.warning('Slug had to be modified - Run again')
    return
  }

  const payload = {
    serverAddress: serverAddress.value,
    slug: newFeedSlug.value,
    metadataDetails: metadataDetails.value
  }

  console.log('Payload', payload)
  nativeHttp
    .post(`/api/feeds/${entityType.value}/${entityId.value}/open`, payload)
    .then((data) => {
      console.log('Opened RSS Feed', data)
      currentFeed.value = (data as Record<string, unknown>).feed as Record<string, unknown>
    })
    .catch((error) => {
      console.error('Failed to open RSS Feed', error)
      const errorMsg = (error as Record<string, Record<string, string>>).response ? (error as Record<string, Record<string, string>>).response.data : null
      toast.error((errorMsg as string) || 'Failed to open RSS Feed')
    })
}

async function copyToClipboard(str: string) {
  await utils.copyToClipboard(str)
  linkCopied.value = true
}

function closeFeed() {
  processing.value = true
  nativeHttp
    .post(`/api/feeds/${currentFeed.value!.id}/close`, null)
    .then(() => {
      toast.success(strings.ToastRSSFeedCloseSuccess)
      show.value = false
    })
    .catch((error) => {
      console.error('Failed to close RSS feed', error)
      toast.error(strings.ToastRSSFeedCloseFailed)
    })
    .finally(() => {
      processing.value = false
    })
}

function init() {
  if (!entityId.value) return
  newFeedSlug.value = entityId.value
  currentFeed.value = entityFeed.value
}
</script>
