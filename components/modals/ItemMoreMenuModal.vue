<template>
  <div>
    <modals-dialog v-model="show" :items="moreMenuItems" @action="moreMenuAction" />
    <modals-item-details-modal v-model="showDetailsModal" :library-item="libraryItem" />
    <modals-dialog v-model="showSendEbookDevicesModal" :title="strings.LabelSelectADevice" :items="ereaderDeviceItems" @action="sendEbookToDeviceAction" />
    <modals-dialog
      v-model="showAutoPlaylistRuleModal"
      :title="strings.HeaderAutoPlaylistPodcast"
      :items="autoPlaylistRuleItems"
      :selected="autoPlaylistRuleValue"
      @action="autoPlaylistRuleAction"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, watch } from 'vue'
import { Dialog } from '@capacitor/dialog'
import { AbsFileSystem, AbsLogger } from '@/plugins/capacitor'
import { useStrings, getString } from '~/composables/useStrings'
import { useHaptics } from '~/composables/useHaptics'
import { useNativeHttp } from '~/composables/useNativeHttp'
import { useToast } from '~/composables/useToast'
import { useDb } from '~/composables/useDb'
import { usePlatform } from '~/composables/usePlatform'
import { useUserStore } from '~/stores/user'
import { useGlobalsStore } from '~/stores/globals'
import { useLibrariesStore } from '~/stores/libraries'
import { useRouter } from 'vue-router'
import {
  AUTO_PLAYLIST_LATEST_LIMITS,
  getAutoPlaylistPodcastRule,
  refreshAutoPlaylistPodcastRules,
  setAutoPlaylistPodcastRule,
  type AutoPlaylistPodcastRule
} from '~/composables/useAutoPlaylist'

import type { LibraryItem, Playlist, PodcastEpisode } from '~/types'

const props = defineProps<{
  modelValue: boolean
  processing?: boolean
  libraryItem: LibraryItem
  episode?: PodcastEpisode
  rssFeed?: Record<string, unknown> | null
  playlist?: Playlist | null
  hideRssFeedOption?: boolean
}>()
const emit = defineEmits<{
  'update:modelValue': [val: boolean]
  'update:processing': [val: boolean]
  'removed-from-auto-playlist': [payload?: { refresh: boolean }]
  'auto-playlist-rule-changed': []
}>()

const strings = useStrings()
const { impact } = useHaptics()
const nativeHttp = useNativeHttp()
const toast = useToast()
const db = useDb()
const platform = usePlatform()
const userStore = useUserStore()
const globalsStore = useGlobalsStore()
const librariesStore = useLibrariesStore()
const router = useRouter()

const showDetailsModal = ref(false)
const showSendEbookDevicesModal = ref(false)
const showAutoPlaylistRuleModal = ref(false)
const autoPlaylistRule = ref<AutoPlaylistPodcastRule>({ mode: 'include' })

const show = computed({
  get() { return props.modelValue },
  set(val: boolean) { emit('update:modelValue', val) }
})

const userIsAdminOrUp = computed(() => userStore.getIsAdminOrUp)

const isLocal = computed(() => !!props.libraryItem?.isLocal)

const localLibraryItem = computed(() => {
  if (isLocal.value) return props.libraryItem
  return (props.libraryItem?.localLibraryItem as Record<string, unknown>) || null
})

const localLibraryItemId = computed(() => (localLibraryItem.value?.id as string) || null)

const serverLibraryItemId = computed(() => {
  if (!isLocal.value) return (props.libraryItem?.id || props.libraryItem?.libraryItemId) as string
  if (isConnectedToServer.value) {
    return props.libraryItem.libraryItemId as string
  }
  return (props.libraryItem?.libraryItemId || props.libraryItem?.id || null) as string | null
})

const isConnectedToServer = computed(() => {
  if (!isLocal.value) return true
  if (!props.libraryItem?.serverAddress) return false
  return userStore.getServerAddress === props.libraryItem.serverAddress
})

const localEpisode = computed(() => {
  if (isLocal.value) return props.episode
  return (props.episode?.localEpisode as Record<string, unknown>) || undefined
})

const localEpisodeId = computed(() => (localEpisode.value?.id as string) || null)

const serverEpisodeId = computed(() => {
  if (!isLocal.value) return (props.episode?.id || props.episode?.serverEpisodeId) as string
  if (isConnectedToServer.value) {
    return props.episode?.serverEpisodeId as string
  }
  return (props.episode?.serverEpisodeId || props.episode?.id || null) as string | null
})

const mediaType = computed(() => props.libraryItem?.mediaType as string)
const isPodcast = computed(() => mediaType.value == 'podcast')
const media = computed(() => (props.libraryItem?.media as Record<string, unknown>) || {})
const mediaMetadata = computed(() => (media.value.metadata as Record<string, unknown>) || {})
const title = computed(() => mediaMetadata.value.title as string)
const tracks = computed(() => (media.value.tracks as unknown[]) || [])
const episodes = computed(() => (media.value.episodes as unknown[]) || [])
const ebookFile = computed(() => media.value.ebookFile)

const localItemProgress = computed(() => {
  if (isPodcast.value) {
    if (!localEpisodeId.value) return null
    return globalsStore.getLocalMediaProgressById(localLibraryItemId.value!, localEpisodeId.value)
  }
  return globalsStore.getLocalMediaProgressById(localLibraryItemId.value!)
})

const serverItemProgress = computed(() => {
  if (isPodcast.value) {
    if (!serverEpisodeId.value) return null
    return userStore.getUserMediaProgress(serverLibraryItemId.value!, serverEpisodeId.value)
  }
  return userStore.getUserMediaProgress(serverLibraryItemId.value!)
})

const userItemProgress = computed(() => {
  if (isLocal.value) return localItemProgress.value
  return serverItemProgress.value
})

const userIsFinished = computed(() => {
  if ((userItemProgress.value as Record<string, unknown>)?.isFinished) return true
  return progressPercent.value >= FINISHED_PROGRESS_THRESHOLD
})

const useEBookProgress = computed(() => {
  if (!userItemProgress.value || (userItemProgress.value as Record<string, unknown>).progress) return false
  return (userItemProgress.value as Record<string, unknown>).ebookProgress as number > 0
})

const progressPercent = computed(() => {
  if (useEBookProgress.value) return Math.max(Math.min(1, (userItemProgress.value as Record<string, unknown>).ebookProgress as number), 0)
  return Math.max(Math.min(1, ((userItemProgress.value as Record<string, unknown>)?.progress as number) || 0), 0)
})

const ereaderDeviceItems = computed(() => {
  if (!ebookFile.value || !librariesStore.ereaderDevices?.length) return []
  return librariesStore.ereaderDevices.map((d) => {
    const device = d as Record<string, string>
    return { text: device.name, value: device.name }
  })
})

const showRSSFeedOption = computed(() => {
  if (props.hideRssFeedOption) return false
  if (!serverLibraryItemId.value) return false
  if (!props.rssFeed && !episodes.value.length && !tracks.value.length) return false
  return userIsAdminOrUp.value || !!props.rssFeed
})

const mediaId = computed(() => {
  if (isPodcast.value) return null
  return serverLibraryItemId.value || localLibraryItemId.value
})

/**
 * Per-podcast catch up rule.
 *
 * Shown on the podcast itself (including from an episode row in the auto playlist), so a show
 * whose backlog is not worth listening to can be capped or dropped without marking every old
 * episode finished. The rule drives the Catch up feed, the auto playlist and the auto-download
 * passes, so it is offered whether or not auto-caching is switched on.
 */
const showAutoPlaylistRuleOption = computed(() => isPodcast.value && !!serverLibraryItemId.value)

const autoPlaylistRuleValue = computed(() => {
  if (autoPlaylistRule.value.mode === 'exclude') return 'exclude'
  if (autoPlaylistRule.value.mode === 'latest') return `latest:${autoPlaylistRule.value.limit}`
  return 'include'
})

const autoPlaylistRuleLabel = computed(() => {
  if (autoPlaylistRule.value.mode === 'exclude') return strings.LabelAutoPlaylistExclude
  if (autoPlaylistRule.value.mode === 'latest') {
    return getString('LabelAutoPlaylistNewestOnly', [autoPlaylistRule.value.limit as number])
  }
  return strings.LabelAutoPlaylistIncludeAll
})

const autoPlaylistRuleItems = computed(() => [
  { text: strings.LabelAutoPlaylistIncludeAll, value: 'include', icon: 'playlist_add' },
  ...AUTO_PLAYLIST_LATEST_LIMITS.map((limit) => ({
    text: getString('LabelAutoPlaylistNewestOnly', [limit]),
    value: `latest:${limit}`,
    icon: 'filter_list'
  })),
  { text: strings.LabelAutoPlaylistExclude, value: 'exclude', icon: 'playlist_remove' }
])

async function loadAutoPlaylistRule() {
  if (!showAutoPlaylistRuleOption.value) {
    autoPlaylistRule.value = { mode: 'include' }
    return
  }
  const rules = await refreshAutoPlaylistPodcastRules()
  autoPlaylistRule.value = getAutoPlaylistPodcastRule(rules, serverLibraryItemId.value as string)
}

async function autoPlaylistRuleAction(value: string) {
  showAutoPlaylistRuleModal.value = false
  const libraryItemId = serverLibraryItemId.value
  if (!libraryItemId) return

  let rule: AutoPlaylistPodcastRule
  if (value === 'exclude') rule = { mode: 'exclude' }
  else if (value.startsWith('latest:')) rule = { mode: 'latest', limit: Number(value.split(':')[1]) }
  else rule = { mode: 'include' }

  await setAutoPlaylistPodcastRule(libraryItemId, rule)
  autoPlaylistRule.value = rule
  toast.success(strings.ToastAutoPlaylistPodcastRuleUpdated)
  emit('auto-playlist-rule-changed')
}

// The menu is rendered from a prop-driven item, so refresh whenever it is opened for a podcast
watch(
  () => [props.modelValue, serverLibraryItemId.value] as const,
  ([isShown]) => {
    if (isShown) void loadAutoPlaylistRule()
  },
  { immediate: true }
)

const moreMenuItems = computed(() => {
  const items: { text: string; value: string; icon: string }[] = []

  if (platform !== 'ios' && !isPodcast.value) {
    items.push({ text: strings.ButtonHistory, value: 'history', icon: 'history' })
  }

  if (!isPodcast.value || props.episode) {
    if (!userIsFinished.value) {
      items.push({ text: strings.MessageMarkAsFinished, value: 'markFinished', icon: 'beenhere' })
    }

    if (progressPercent.value > 0) {
      items.push({ text: strings.MessageDiscardProgress, value: 'discardProgress', icon: 'backspace' })
    }
  }

  if ((!isPodcast.value && serverLibraryItemId.value) || (props.episode && serverEpisodeId.value)) {
    items.push({ text: strings.LabelAddToPlaylist, value: 'playlist', icon: 'playlist_add' })

    if (ereaderDeviceItems.value.length) {
      items.push({ text: strings.ButtonSendEbookToDevice, value: 'sendEbook', icon: 'send' })
    }
  }

  if (props.playlist) {
    items.push({ text: strings.LabelRemoveFromPlaylist, value: 'removeFromPlaylist', icon: 'playlist_remove' })
  }

  if (showAutoPlaylistRuleOption.value) {
    items.push({
      text: `${strings.LabelAutoPlaylistPodcastRule}: ${autoPlaylistRuleLabel.value}`,
      value: 'autoPlaylistRule',
      icon: 'playlist_play'
    })
  }

  if (showRSSFeedOption.value) {
    items.push({
      text: props.rssFeed ? strings.HeaderRSSFeed : strings.HeaderOpenRSSFeed,
      value: 'rssFeed',
      icon: 'rss_feed'
    })
  }

  if (localLibraryItemId.value) {
    items.push({ text: strings.ButtonManageLocalFiles, value: 'manageLocal', icon: 'folder' })

    if (!isPodcast.value) {
      items.push({ text: strings.ButtonDeleteLocalItem, value: 'deleteLocal', icon: 'delete' })
    } else if (localEpisodeId.value) {
      items.push({ text: strings.ButtonDeleteLocalEpisode, value: 'deleteLocalEpisode', icon: 'delete' })
    }
  }

  if (isConnectedToServer.value) {
    items.push({ text: strings.ButtonGoToWebClient, value: 'openWebClient', icon: 'language' })
  }

  if (!props.episode) {
    items.push({ text: strings.LabelMoreInfo, value: 'details', icon: 'info' })
  }

  return items
})

function moreMenuAction(action: string) {
  show.value = false
  if (action === 'manageLocal') {
    void nextTick(() => {
      void router.push(`/localMedia/item/${localLibraryItemId.value}`)
    })
  } else if (action === 'details') {
    showDetailsModal.value = true
  } else if (action === 'playlist') {
    globalsStore.selectedPlaylistItems = [{ libraryItem: props.libraryItem, episode: props.episode }]
    globalsStore.showPlaylistsAddCreateModal = true
  } else if (action === 'removeFromPlaylist') {
    void removeFromPlaylistClick()
  } else if (action === 'autoPlaylistRule') {
    void nextTick(() => {
      showAutoPlaylistRuleModal.value = true
    })
  } else if (action === 'markFinished') {
    AbsLogger.info({
      tag: 'ItemMoreMenuModal',
      message: `markFinished action: ${JSON.stringify({
        isPodcast: isPodcast.value,
        serverLibraryItemId: serverLibraryItemId.value,
        serverEpisodeId: serverEpisodeId.value,
        localLibraryItemId: localLibraryItemId.value,
        localEpisodeId: localEpisodeId.value,
        isLocal: isLocal.value,
        hasLocalEpisode: !!localEpisode.value,
        userIsFinished: userIsFinished.value
      })}`
    })
    if (props.episode) void toggleEpisodeFinished()
    else void toggleFinished()
  } else if (action === 'history') {
    void router.push(`/media/${mediaId.value}/history?title=${title.value}`)
  } else if (action === 'discardProgress') {
    void clearProgressClick()
  } else if (action === 'deleteLocal') {
    void deleteLocalItem()
  } else if (action === 'deleteLocalEpisode') {
    void deleteLocalEpisode()
  } else if (action === 'rssFeed') {
    clickRSSFeed()
  } else if (action === 'sendEbook') {
    showSendEbookDevicesModal.value = true
  } else if (action === 'openWebClient') {
    void userStore.openWebClient(`/item/${serverLibraryItemId.value}`)
  }
}

async function toggleFinished() {
  await impact()

  if (userItemProgress.value && (userItemProgress.value as Record<string, unknown>).progress as number > 0 && !userIsFinished.value) {
    const { value } = await Dialog.confirm({
      title: strings.HeaderConfirm,
      message: strings.MessageConfirmMarkAsFinished
    })
    if (!value) return
  }

  emit('update:processing', true)
  let markFinishedSucceeded = false

  if (isLocal.value) {
    const isFinished = !userIsFinished.value
    const payload = await db.updateLocalMediaProgressFinished({ localLibraryItemId: localLibraryItemId.value, isFinished }) as Record<string, unknown>
    console.log('toggleFinished payload', JSON.stringify(payload))
    if (payload?.error) {
      toast.error((payload?.error || 'Unknown error') as string)
    } else {
      const localMediaProgress = payload.localMediaProgress as Record<string, unknown>
      console.log('toggleFinished localMediaProgress', JSON.stringify(localMediaProgress))
      if (localMediaProgress) {
        globalsStore.updateLocalMediaProgress(localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
        markFinishedSucceeded = true
      }
    }
  } else {
    const _serverLibraryItemId = serverLibraryItemId.value
    if (!_serverLibraryItemId) {
      AbsLogger.info({ tag: 'ItemMoreMenuModal', message: 'toggleFinished missing serverLibraryItemId, falling back to local update' })
      if (localLibraryItemId.value) {
        await setLocalProgressFinished({ isEpisode: false, isFinished: !userIsFinished.value })
      } else {
        toast.error(strings.ToastItemMarkedAsFinishedFailed)
      }
      emit('update:processing', false)
      return
    }

    const updatePayload = { isFinished: !userIsFinished.value }
    AbsLogger.info({ tag: 'ItemMoreMenuModal', message: `toggleFinished server request: ${JSON.stringify({ _serverLibraryItemId, payload: updatePayload })}` })
    let serverError = null
    await nativeHttp.patch(`/api/me/progress/${_serverLibraryItemId}`, updatePayload, { connectTimeout: 10000 }).catch(async (error) => {
      serverError = error
      const status = (error?.response?.status as number)
      const data = error?.response?.data
      AbsLogger.info({ tag: 'ItemMoreMenuModal', message: `toggleFinished server error: ${JSON.stringify({ status, data })}` })
      console.error('Failed', error)
      const serverNotFound = status === 404
      if (serverNotFound && localLibraryItemId.value) {
        const localSucceeded = await setLocalProgressFinished({ isEpisode: false, isFinished: updatePayload.isFinished })
        if (localSucceeded) markFinishedSucceeded = true
        return
      }
      toast.error(updatePayload.isFinished ? strings.ToastItemMarkedAsFinishedFailed : strings.ToastItemMarkedAsNotFinishedFailed)
    })
    if (!serverError) {
      markFinishedSucceeded = true
    }
  }
  if (markFinishedSucceeded && props.playlist?.id === 'unfinished' && !userIsFinished.value) {
    emit('removed-from-auto-playlist', { refresh: true })
  }
  emit('update:processing', false)
}

async function toggleEpisodeFinished() {
  await impact()

  emit('update:processing', true)
  const _serverLibraryItemId = serverLibraryItemId.value
  const _serverEpisodeId = serverEpisodeId.value
  let markFinishedSucceeded = false

  if (isLocal.value || localEpisode.value) {
    const isFinished = !userIsFinished.value
    const _localLibraryItemId = localLibraryItemId.value
    const _localEpisodeId = localEpisodeId.value
    const payload = await db.updateLocalMediaProgressFinished({ localLibraryItemId: _localLibraryItemId, localEpisodeId: _localEpisodeId, isFinished }) as Record<string, unknown>
    console.log('toggleFinished payload', JSON.stringify(payload))

    if (payload?.error) {
      toast.error((payload?.error || 'Unknown error') as string)
    } else {
      const localMediaProgress = payload.localMediaProgress as Record<string, unknown>
      console.log('toggleFinished localMediaProgress', JSON.stringify(localMediaProgress))
      if (localMediaProgress) {
        globalsStore.updateLocalMediaProgress(localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
        markFinishedSucceeded = true
      }
    }
  } else {
    if (!_serverLibraryItemId || !_serverEpisodeId) {
      AbsLogger.info({
        tag: 'ItemMoreMenuModal',
        message: `toggleEpisodeFinished missing server ids, fallback: ${JSON.stringify({
          _serverLibraryItemId,
          _serverEpisodeId,
          localLibraryItemId: localLibraryItemId.value,
          localEpisodeId: localEpisodeId.value
        })}`
      })
      if (localLibraryItemId.value && localEpisodeId.value) {
        const localSucceeded = await setLocalProgressFinished({ isEpisode: true, isFinished: !userIsFinished.value })
        markFinishedSucceeded = localSucceeded
      } else {
        toast.error(strings.ToastItemMarkedAsFinishedFailed)
      }
      emit('update:processing', false)
      return
    }

    const updatePayload = { isFinished: !userIsFinished.value }
    AbsLogger.info({ tag: 'ItemMoreMenuModal', message: `toggleEpisodeFinished server request: ${JSON.stringify({ _serverLibraryItemId, _serverEpisodeId, payload: updatePayload })}` })
    let serverError = null
    await nativeHttp.patch(`/api/me/progress/${_serverLibraryItemId}/${_serverEpisodeId}`, updatePayload, { connectTimeout: 10000 }).catch(async (error) => {
      serverError = error
      const status = (error?.response?.status as number)
      const data = error?.response?.data
      AbsLogger.info({ tag: 'ItemMoreMenuModal', message: `toggleEpisodeFinished server error: ${JSON.stringify({ status, data })}` })
      console.error('Failed', error)
      const serverNotFound = status === 404
      if (serverNotFound && localLibraryItemId.value) {
        const localSucceeded = await setLocalProgressFinished({ isEpisode: true, isFinished: updatePayload.isFinished })
        if (localSucceeded) markFinishedSucceeded = true
        return
      }
      toast.error(updatePayload.isFinished ? strings.ToastItemMarkedAsFinishedFailed : strings.ToastItemMarkedAsNotFinishedFailed)
    })
    if (!serverError) {
      markFinishedSucceeded = true
    }
  }
  if (markFinishedSucceeded && props.playlist?.id === 'unfinished' && !userIsFinished.value) {
    emit('removed-from-auto-playlist', { refresh: true })
  }
  emit('update:processing', false)
}

async function clearProgressClick() {
  await impact()

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: strings.MessageConfirmDiscardProgress
  })
  if (value) {
    emit('update:processing', true)
    const serverMediaProgressId = (serverItemProgress.value as Record<string, unknown>)?.id as string
    if (localItemProgress.value) {
      await db.removeLocalMediaProgress((localItemProgress.value as Record<string, unknown>).id as string)
      globalsStore.removeLocalMediaProgressForItem((localItemProgress.value as Record<string, unknown>).id as string)
    }

    if (serverMediaProgressId) {
      await nativeHttp
        .delete(`/api/me/progress/${serverMediaProgressId}`)
        .then(() => {
          console.log('Progress reset complete')
          toast.success(`Your progress was reset`)
          userStore.removeMediaProgress(serverMediaProgressId)
        })
        .catch((error) => {
          console.error('Progress reset failed', error)
        })
    }

    emit('update:processing', false)
  }
}

async function deleteLocalEpisode() {
  await impact()

  const localEp = localEpisode.value as Record<string, unknown>
  const localEpisodeAudioTrack = localEp.audioTrack as Record<string, unknown>
  const localFile = (localLibraryItem.value?.localFiles as Record<string, unknown>[])?.find((lf) => lf.id === localEpisodeAudioTrack.localFileId)
  if (!localFile) {
    toast.error('Audio track does not have matching local file..')
    return
  }

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: getString('MessageConfirmDeleteLocalEpisode', [localFile.basePath as string]) || strings.MessageConfirmDeleteLocalFiles
  })
  if (value) {
    const res = await AbsFileSystem.deleteTrackFromItem({ id: localLibraryItemId.value, trackLocalFileId: localFile.id, trackContentUrl: localEpisodeAudioTrack.contentUrl }) as Record<string, unknown>
    if (res?.id) {
      if (isLocal.value) {
        if (serverEpisodeId.value) {
          void router.replace(`/item/${serverLibraryItemId.value}/${serverEpisodeId.value}`)
        } else {
          void router.replace(`/item/${localLibraryItemId.value}`)
        }
      } else {
        ;(props.libraryItem as Record<string, unknown>).localLibraryItem = res
        if (props.episode) delete (props.episode as Record<string, unknown>).localEpisode
      }
    } else toast.error('Failed to delete')
  }
}

async function deleteLocalItem() {
  await impact()

  const { value } = await Dialog.confirm({
    title: strings.HeaderConfirm,
    message: strings.MessageConfirmDeleteLocalFiles
  })
  if (value) {
    const res = await AbsFileSystem.deleteItem(localLibraryItem.value) as Record<string, unknown>
    if (res?.success) {
      if (isLocal.value) {
        if (serverLibraryItemId.value) {
          void router.replace(`/item/${serverLibraryItemId.value}`)
        } else {
          void router.replace('/bookshelf')
        }
      } else {
        delete (props.libraryItem as Record<string, unknown>).localLibraryItem
      }
    } else toast.error('Failed to delete')
  }
}

function clickRSSFeed() {
  globalsStore.setRSSFeedOpenCloseModal({
    id: serverLibraryItemId.value,
    name: title.value,
    type: 'item',
    feed: props.rssFeed,
    hasEpisodesWithoutPubDate: (episodes.value as Record<string, unknown>[]).some((ep) => !ep.pubDate)
  })
}

function sendEbookToDeviceAction(deviceName: string) {
  showSendEbookDevicesModal.value = false

  const payload = {
    libraryItemId: serverLibraryItemId.value,
    deviceName
  }
  emit('update:processing', true)
  nativeHttp
    .post(`/api/emails/send-ebook-to-device`, payload)
    .then(() => {
      toast.success('Ebook sent successfully')
    })
    .catch((error) => {
      console.error('Failed to send ebook to device', error)
      toast.error('Failed to send ebook to device')
    })
    .finally(() => {
      emit('update:processing', false)
    })
}

async function removeFromPlaylistClick() {
  if (!props.playlist) {
    toast.error('Invalid: No Playlist')
    return
  }

  if (props.playlist.id === 'unfinished') {
    AbsLogger.info({
      tag: 'ItemMoreMenuModal',
      message: `removeFromPlaylistClick (auto): ${JSON.stringify({
        serverLibraryItemId: serverLibraryItemId.value,
        serverEpisodeId: serverEpisodeId.value,
        localLibraryItemId: localLibraryItemId.value,
        localEpisodeId: localEpisodeId.value,
        isLocal: isLocal.value,
        hasLocalEpisode: !!localEpisode.value,
        userIsFinished: userIsFinished.value
      })}`
    })
    if ((userItemProgress.value as Record<string, unknown>)?.isFinished) {
      toast.success('Item removed from playlist')
      emit('removed-from-auto-playlist')
      return
    }

    await forceMarkFinished()
    emit('removed-from-auto-playlist')
    return
  }

  emit('update:processing', true)
  let url = `/api/playlists/${props.playlist.id}/item/${serverLibraryItemId.value}`
  if (serverEpisodeId.value) url += `/${serverEpisodeId.value}`
  nativeHttp
    .delete(url)
    .then(() => {
      toast.success('Item removed from playlist')
    })
    .catch((error) => {
      const errorMsg = (error as Record<string, Record<string, string>>).response?.data || 'Unknown error'
      console.error('Failed to remove item from playlist', error)
      toast.error('Failed to remove from playlist: ' + errorMsg)
    })
    .finally(() => {
      emit('update:processing', false)
    })
}

async function forceMarkFinished() {
  AbsLogger.info({
    tag: 'ItemMoreMenuModal',
    message: `forceMarkFinished: ${JSON.stringify({
      serverLibraryItemId: serverLibraryItemId.value,
      serverEpisodeId: serverEpisodeId.value,
      localLibraryItemId: localLibraryItemId.value,
      localEpisodeId: localEpisodeId.value,
      isLocal: isLocal.value,
      hasLocalEpisode: !!localEpisode.value
    })}`
  })
  let markFinishedSucceeded = false

  if (props.episode) {
    if ((userItemProgress.value as Record<string, unknown>)?.isFinished) return
    if (isLocal.value || localEpisode.value) {
      const payload = await db.updateLocalMediaProgressFinished({
        localLibraryItemId: localLibraryItemId.value,
        localEpisodeId: localEpisodeId.value,
        isFinished: true
      }) as Record<string, unknown>

      if (payload?.error) {
        toast.error((payload?.error || 'Unknown error') as string)
        return
      }

      if (payload?.localMediaProgress) {
        globalsStore.updateLocalMediaProgress(payload.localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
        markFinishedSucceeded = true
      }
    } else if (serverLibraryItemId.value && serverEpisodeId.value) {
      let serverError = null
      await nativeHttp
        .patch(`/api/me/progress/${serverLibraryItemId.value}/${serverEpisodeId.value}`, { isFinished: true })
        .catch((error) => {
          serverError = error
          console.error('Failed to mark finished', error)
          toast.error(strings.ToastItemMarkedAsFinishedFailed)
        })
      if (!serverError) {
        markFinishedSucceeded = true
      }
    }
  } else {
    if ((userItemProgress.value as Record<string, unknown>)?.isFinished) return
    if (isLocal.value) {
      const payload = await db.updateLocalMediaProgressFinished({
        localLibraryItemId: localLibraryItemId.value,
        isFinished: true
      }) as Record<string, unknown>

      if (payload?.error) {
        toast.error((payload?.error || 'Unknown error') as string)
        return
      }

      if (payload?.localMediaProgress) {
        globalsStore.updateLocalMediaProgress(payload.localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
        markFinishedSucceeded = true
      }
    } else if (serverLibraryItemId.value) {
      let serverError = null
      await nativeHttp
        .patch(`/api/me/progress/${serverLibraryItemId.value}`, { isFinished: true })
        .catch((error) => {
          serverError = error
          console.error('Failed to mark finished', error)
          toast.error(strings.ToastItemMarkedAsFinishedFailed)
        })
      if (!serverError) {
        markFinishedSucceeded = true
      }
    }
  }

  if (markFinishedSucceeded && props.playlist?.id === 'unfinished' && !(userItemProgress.value as Record<string, unknown>)?.isFinished) {
    emit('removed-from-auto-playlist', { refresh: true })
  }
}

async function setLocalProgressFinished({ isEpisode, isFinished }: { isEpisode: boolean; isFinished: boolean }): Promise<boolean> {
  if (!localLibraryItemId.value) return false

  const payload = await db.updateLocalMediaProgressFinished({
    localLibraryItemId: localLibraryItemId.value,
    localEpisodeId: isEpisode ? localEpisodeId.value : null,
    isFinished
  }) as Record<string, unknown>

  if (payload?.error) {
    toast.error((payload?.error || 'Unknown error') as string)
    return false
  }

  if (payload?.localMediaProgress) {
    globalsStore.updateLocalMediaProgress(payload.localMediaProgress as Parameters<typeof globalsStore.updateLocalMediaProgress>[0])
    const message = isFinished ? strings.ToastItemMarkedAsFinished : strings.ToastItemMarkedAsNotFinished
    toast.success(message)
    return true
  }

  return false
}
</script>
