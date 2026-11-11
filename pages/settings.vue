<template>
  <div class="w-full h-full px-4 py-6 overflow-y-auto bg-md-surface-0">
    <!-- Display settings -->
    <p class="text-md-label-m text-md-primary mb-3 uppercase tracking-widest">{{ $strings.HeaderUserInterfaceSettings }}</p>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="enableBookshelfView" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelUseBookshelfView }}</p>
    </div>
    <!-- screen.orientation.lock not supported on iOS webview -->
    <div v-if="!isiOS" class="py-3">
      <div class="flex items-center">
        <div class="w-10 flex justify-center" @click.stop="toggleLockOrientation">
          <ui-toggle-switch v-model="lockCurrentOrientation" class="pointer-events-none" :disabled="!orientationLockHonored" />
        </div>
        <p class="pl-4" :class="{ 'opacity-40': !orientationLockHonored }">{{ $strings.LabelLockOrientation }}</p>
      </div>
      <p v-if="!orientationLockHonored" class="pl-14 pr-4 pt-1 text-md-body-s text-md-on-surface-variant">{{ $strings.MessageOrientationLockLargeScreen }}</p>
    </div>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelHapticFeedback }}</p>
      <div @click.stop="showHapticFeedbackOptions">
        <ui-text-input :model-value="hapticFeedbackOption" readonly append-icon="expand_more" style="max-width: 200px" />
      </div>
    </div>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelLanguage }}</p>
      <div @click.stop="showLanguageOptions">
        <ui-text-input :model-value="languageOption" readonly append-icon="expand_more" style="max-width: 200px" />
      </div>
    </div>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelTheme }}</p>
      <div @click.stop="showThemeOptions">
        <ui-text-input :model-value="themeOption" readonly append-icon="expand_more" style="max-width: 200px" />
      </div>
    </div>

    <!-- Playback settings -->
    <p class="text-md-label-m text-md-primary mb-3 mt-8 uppercase tracking-widest">{{ $strings.HeaderPlaybackSettings }}</p>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelJumpBackwardsTime }}</p>
      <div @click.stop="showJumpBackwardsOptions">
        <ui-text-input :model-value="jumpBackwardsOption" readonly append-icon="expand_more" style="width: 145px; max-width: 145px" />
      </div>
    </div>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelJumpForwardsTime }}</p>
      <div @click.stop="showJumpForwardOptions">
        <ui-text-input :model-value="jumpForwardOption" readonly append-icon="expand_more" style="width: 145px; max-width: 145px" />
      </div>
    </div>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.disableAutoRewind" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelDisableAutoRewind }}</p>
    </div>
    <div v-if="!isiOS" class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.enableMp3IndexSeeking" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelEnableMp3IndexSeeking }}</p>
      <span class="material-symbols text-xl ml-2" @click.stop="showConfirmMp3IndexSeeking">info</span>
    </div>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.allowSeekingOnMediaControls" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelAllowSeekingOnMediaControls }}</p>
    </div>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.autoContinuePlaylists" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelAutoContinuePlaylists }}</p>
    </div>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.autoCacheUnplayedEpisodes" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelAutoCacheUnplayedEpisodes }}</p>
    </div>

    <!-- Minimal mode -->
    <p class="text-md-label-m text-md-primary mb-3 mt-8 uppercase tracking-widest">{{ $strings.LabelMinimalMode }}</p>
    <p class="text-md-body-s text-md-on-surface-variant mb-2">{{ $strings.LabelMinimalModeHelp }}</p>
    <button type="button" class="w-full flex items-center py-3 text-left active:opacity-60" @click="openMinimalMode">
      <div class="w-10 flex justify-center">
        <span class="material-symbols text-2xl text-md-on-surface-variant">close_fullscreen</span>
      </div>
      <p class="pl-4">{{ $strings.LabelOpenMinimalMode }}</p>
    </button>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="minimalModeOnLaunch" @update:modelValue="saveMinimalModeOnLaunch" />
      </div>
      <p class="pl-4">{{ $strings.LabelStartInMinimalMode }}</p>
    </div>

    <!-- Sleep timer settings -->
    <template v-if="!isiOS">
      <p class="text-md-label-m text-md-primary mb-3 mt-8 uppercase tracking-widest">{{ $strings.HeaderSleepTimerSettings }}</p>
      <div class="flex items-center py-3">
        <div class="w-10 flex justify-center">
          <ui-toggle-switch v-model="settings.disableShakeToResetSleepTimer" @update:modelValue="saveSettings" />
        </div>
        <p class="pl-4">{{ $strings.LabelDisableShakeToReset }}</p>
        <span class="material-symbols text-xl ml-2" @click.stop="showInfo('disableShakeToResetSleepTimer')">info</span>
      </div>
      <div v-if="!settings.disableShakeToResetSleepTimer" class="py-3 flex items-center">
        <p class="pr-4 w-36">{{ $strings.LabelShakeSensitivity }}</p>
        <div @click.stop="showShakeSensitivityOptions">
          <ui-text-input :model-value="shakeSensitivityOption" readonly append-icon="expand_more" style="width: 145px; max-width: 145px" />
        </div>
      </div>
    </template>
    <div class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.disableSleepTimerFadeOut" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelDisableAudioFadeOut }}</p>
      <span class="material-symbols text-xl ml-2" @click.stop="showInfo('disableSleepTimerFadeOut')">info</span>
    </div>
    <template v-if="!isiOS">
      <div class="flex items-center py-3">
        <div class="w-10 flex justify-center">
          <ui-toggle-switch v-model="settings.disableSleepTimerResetFeedback" @update:modelValue="saveSettings" />
        </div>
        <p class="pl-4">{{ $strings.LabelDisableVibrateOnReset }}</p>
        <span class="material-symbols text-xl ml-2" @click.stop="showInfo('disableSleepTimerResetFeedback')">info</span>
      </div>
      <div class="flex items-center py-3">
        <div class="w-10 flex justify-center">
          <ui-toggle-switch v-model="settings.enableSleepTimerAlmostDoneChime" @update:modelValue="saveSettings" />
        </div>
        <p class="pl-4">{{ $strings.LabelSleepTimerAlmostDoneChime }}</p>
        <span class="material-symbols text-xl ml-2" @click.stop="showInfo('enableSleepTimerAlmostDoneChime')">info</span>
      </div>
      <div class="flex items-center py-3">
        <div class="w-10 flex justify-center">
          <ui-toggle-switch v-model="settings.autoSleepTimer" @update:modelValue="saveSettings" />
        </div>
        <p class="pl-4">{{ $strings.LabelAutoSleepTimer }}</p>
        <span class="material-symbols text-xl ml-2" @click.stop="showInfo('autoSleepTimer')">info</span>
      </div>
    </template>
    <!-- Auto Sleep timer settings -->
    <div v-if="settings.autoSleepTimer" class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelStartTime }}</p>
      <ui-text-input type="time" v-model="settings.autoSleepTimerStartTime" style="width: 145px; max-width: 145px" @update:modelValue="autoSleepTimerTimeUpdated" />
    </div>
    <div v-if="settings.autoSleepTimer" class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelEndTime }}</p>
      <ui-text-input type="time" v-model="settings.autoSleepTimerEndTime" style="width: 145px; max-width: 145px" @update:modelValue="autoSleepTimerTimeUpdated" />
    </div>
    <div v-if="settings.autoSleepTimer" class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelSleepTimer }}</p>
      <div @click.stop="showSleepTimerOptions">
        <ui-text-input :model-value="sleepTimerLengthOption" readonly append-icon="expand_more" style="width: 145px; max-width: 145px" />
      </div>
    </div>
    <div v-if="settings.autoSleepTimer" class="flex items-center py-3">
      <div class="w-10 flex justify-center">
        <ui-toggle-switch v-model="settings.autoSleepTimerAutoRewind" @update:modelValue="saveSettings" />
      </div>
      <p class="pl-4">{{ $strings.LabelAutoSleepTimerAutoRewind }}</p>
      <span class="material-symbols text-xl ml-2" @click.stop="showInfo('autoSleepTimerAutoRewind')">info</span>
    </div>
    <div v-if="settings.autoSleepTimerAutoRewind" class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelAutoRewindTime }}</p>
      <div @click.stop="showAutoSleepTimerRewindOptions">
        <ui-text-input :model-value="autoSleepTimerRewindLengthOption" readonly append-icon="expand_more" style="width: 145px; max-width: 145px" />
      </div>
    </div>

    <!-- Data settings -->
    <p class="text-md-label-m text-md-primary mb-3 mt-8 uppercase tracking-widest">{{ $strings.HeaderDataSettings }}</p>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelDownloadUsingCellular }}</p>
      <div @click.stop="showDownloadUsingCellularOptions">
        <ui-text-input :model-value="downloadUsingCellularOption" readonly append-icon="expand_more" style="max-width: 200px" />
      </div>
    </div>
    <div class="py-3 flex items-center">
      <p class="pr-4 w-36">{{ $strings.LabelStreamingUsingCellular }}</p>
      <div @click.stop="showStreamingUsingCellularOptions">
        <ui-text-input :model-value="streamingUsingCellularOption" readonly append-icon="expand_more" style="max-width: 200px" />
      </div>
    </div>

    <!-- Android Auto settings -->
    <template v-if="!isiOS">
      <p class="text-md-label-m text-md-primary mb-3 mt-8 uppercase tracking-widest">{{ $strings.HeaderAndroidAutoSettings }}</p>
      <div class="py-3 flex items-center">
        <p class="pr-4 w-36">{{ $strings.LabelAndroidAutoBrowseLimitForGrouping }}</p>
        <ui-text-input type="number" v-model="settings.androidAutoBrowseLimitForGrouping" style="width: 145px; max-width: 145px" @update:modelValue="androidAutoBrowseLimitForGroupingUpdated" />
        <span class="material-symbols text-xl ml-2" @click.stop="showInfo('androidAutoBrowseLimitForGrouping')">info</span>
      </div>
      <div class="py-3 flex items-center">
        <p class="pr-4 w-36">{{ $strings.LabelAndroidAutoBrowseSeriesSequenceOrder }}</p>
        <div @click.stop="showAndroidAutoBrowseSeriesSequenceOrderOptions">
          <ui-text-input :model-value="androidAutoBrowseSeriesSequenceOrderOption" readonly append-icon="expand_more" style="max-width: 200px" />
        </div>
      </div>
    </template>

    <div v-show="loading" class="w-full h-full absolute top-0 left-0 flex items-center justify-center z-10">
      <ui-loading-indicator />
    </div>

    <modals-dialog v-model="showMoreMenuDialog" :items="moreMenuItems" :selected="moreMenuSelected" @action="clickMenuAction" />
    <modals-sleep-timer-length-modal v-model="showSleepTimerLengthModal" @change="sleepTimerLengthModalSelection" />
    <modals-auto-sleep-timer-rewind-length-modal v-model="showAutoSleepTimerRewindLengthModal" @change="showAutoSleepTimerRewindLengthModalSelection" />
  </div>
</template>

<script setup lang="ts">
import { getScreenOrientation } from '~/composables/useScreenOrientation'
import { Dialog } from '@capacitor/dialog'
import { useAppStore } from '~/stores/app'
import { useGlobalsStore } from '~/stores/globals'
import { languageCodeOptions, setLanguageCode } from '~/composables/useStrings'

const appStore = useAppStore()
const globalsStore = useGlobalsStore()
const { getJumpLabel } = useJumpLabel()

const loading = ref(false)
const deviceData = ref<Record<string, unknown> | null>(null)
const showMoreMenuDialog = ref(false)
const showSleepTimerLengthModal = ref(false)
const showAutoSleepTimerRewindLengthModal = ref(false)
const moreMenuSetting = ref('')
const theme = ref('dark')
const lockCurrentOrientation = ref(false)

/**
 * Whether a lock would actually be applied at the current window size.
 *
 * Recomputed on resize because folding the device changes the answer - the cover screen honors
 * a lock and the inner screen does not.
 */
const orientationLockHonored = ref(isOrientationLockHonored(windowShortestSideDp()))
function updateOrientationLockHonored() {
  orientationLockHonored.value = isOrientationLockHonored(windowShortestSideDp())
}

const settings = reactive({
  disableAutoRewind: false,
  enableAltView: true,
  allowSeekingOnMediaControls: false,
  jumpForwardTime: 10,
  jumpBackwardsTime: 10,
  enableMp3IndexSeeking: false,
  disableShakeToResetSleepTimer: false,
  shakeSensitivity: 'MEDIUM',
  lockOrientation: 'NONE' as string | number,
  hapticFeedback: 'LIGHT',
  autoSleepTimer: false,
  autoSleepTimerStartTime: '22:00',
  autoSleepTimerEndTime: '06:00',
  sleepTimerLength: 900000, // 15 minutes
  disableSleepTimerFadeOut: false,
  disableSleepTimerResetFeedback: false,
  enableSleepTimerAlmostDoneChime: false,
  autoContinuePlaylists: false,
  autoCacheUnplayedEpisodes: false,
  autoSleepTimerAutoRewind: false,
  autoSleepTimerAutoRewindTime: 300000, // 5 minutes
  languageCode: 'en-us',
  downloadUsingCellular: 'ALWAYS',
  streamingUsingCellular: 'ALWAYS',
  androidAutoBrowseLimitForGrouping: 100,
  androidAutoBrowseSeriesSequenceOrder: 'ASC'
})

const strings = useStrings()

const settingInfo = computed(() => ({
  disableShakeToResetSleepTimer: {
    name: strings.LabelDisableShakeToReset,
    message: strings.LabelDisableShakeToResetHelp
  },
  autoSleepTimer: {
    name: strings.LabelAutoSleepTimer,
    message: strings.LabelAutoSleepTimerHelp
  },
  disableSleepTimerFadeOut: {
    name: strings.LabelDisableAudioFadeOut,
    message: strings.LabelDisableAudioFadeOutHelp
  },
  disableSleepTimerResetFeedback: {
    name: strings.LabelDisableVibrateOnReset,
    message: strings.LabelDisableVibrateOnResetHelp
  },
  enableSleepTimerAlmostDoneChime: {
    name: strings.LabelSleepTimerAlmostDoneChime,
    message: strings.LabelSleepTimerAlmostDoneChimeHelp
  },
  autoSleepTimerAutoRewind: {
    name: strings.LabelAutoSleepTimerAutoRewind,
    message: strings.LabelAutoSleepTimerAutoRewindHelp
  },
  enableMp3IndexSeeking: {
    name: strings.LabelEnableMp3IndexSeeking,
    message: strings.LabelEnableMp3IndexSeekingHelp
  },
  androidAutoBrowseLimitForGrouping: {
    name: strings.LabelAndroidAutoBrowseLimitForGrouping,
    message: strings.LabelAndroidAutoBrowseLimitForGroupingHelp
  }
}))

const hapticFeedbackItems = computed(() => [
  { text: strings.LabelOff, value: 'OFF' },
  { text: strings.LabelLight, value: 'LIGHT' },
  { text: strings.LabelMedium, value: 'MEDIUM' },
  { text: strings.LabelHeavy, value: 'HEAVY' }
])

const shakeSensitivityItems = computed(() => [
  { text: strings.LabelVeryLow, value: 'VERY_LOW' },
  { text: strings.LabelLow, value: 'LOW' },
  { text: strings.LabelMedium, value: 'MEDIUM' },
  { text: strings.LabelHigh, value: 'HIGH' },
  { text: strings.LabelVeryHigh, value: 'VERY_HIGH' }
])

const downloadUsingCellularItems = computed(() => [
  { text: strings.LabelAskConfirmation, value: 'ASK' },
  { text: strings.LabelAlways, value: 'ALWAYS' },
  { text: strings.LabelNever, value: 'NEVER' }
])

const streamingUsingCellularItems = computed(() => [
  { text: strings.LabelAskConfirmation, value: 'ASK' },
  { text: strings.LabelAlways, value: 'ALWAYS' },
  { text: strings.LabelNever, value: 'NEVER' }
])

const androidAutoBrowseSeriesSequenceOrderItems = computed(() => [
  { text: strings.LabelSequenceAscending, value: 'ASC' },
  { text: strings.LabelSequenceDescending, value: 'DESC' }
])

// This is flipped because alt view was the default until v0.9.61-beta
const enableBookshelfView = computed({
  get() {
    return !settings.enableAltView
  },
  set(val: boolean) {
    settings.enableAltView = !val
  }
})

const isiOS = computed(() => usePlatform() === 'ios')

const jumpForwardSecondsOptions = computed(() => globalsStore.jumpForwardSecondsOptions)
const jumpBackwardsSecondsOptions = computed(() => globalsStore.jumpBackwardsSecondsOptions)
const languageOptionItems = computed(() => languageCodeOptions)

const jumpForwardOption = computed(() => getJumpLabel(settings.jumpForwardTime))
const jumpBackwardsOption = computed(() => getJumpLabel(settings.jumpBackwardsTime))

const themeOptionItems = computed(() => [
  { text: strings.LabelThemeBlack, value: 'black' },
  { text: strings.LabelThemeDark, value: 'dark' },
  { text: strings.LabelThemeLight, value: 'light' }
])

const shakeSensitivityOption = computed(() => {
  const item = shakeSensitivityItems.value.find((i) => i.value === settings.shakeSensitivity)
  return item?.text || 'Error'
})

const hapticFeedbackOption = computed(() => {
  const item = hapticFeedbackItems.value.find((i) => i.value === settings.hapticFeedback)
  return item?.text || 'Error'
})

const languageOption = computed(() => languageOptionItems.value.find((i) => i.value === settings.languageCode)?.text || '')
const themeOption = computed(() => themeOptionItems.value.find((i) => i.value === theme.value)?.text || '')

const sleepTimerLengthOption = computed(() => {
  if (!settings.sleepTimerLength) return strings.LabelEndOfChapter
  const minutes = Number(settings.sleepTimerLength) / 1000 / 60
  return `${minutes} min`
})

const autoSleepTimerRewindLengthOption = computed(() => {
  const minutes = Number(settings.autoSleepTimerAutoRewindTime) / 1000 / 60
  return `${minutes} min`
})

const downloadUsingCellularOption = computed(() => {
  const item = downloadUsingCellularItems.value.find((i) => i.value === settings.downloadUsingCellular)
  return item?.text || 'Error'
})

const streamingUsingCellularOption = computed(() => {
  const item = streamingUsingCellularItems.value.find((i) => i.value === settings.streamingUsingCellular)
  return item?.text || 'Error'
})

const androidAutoBrowseSeriesSequenceOrderOption = computed(() => {
  const item = androidAutoBrowseSeriesSequenceOrderItems.value.find((i) => i.value === settings.androidAutoBrowseSeriesSequenceOrder)
  return item?.text || 'Error'
})

const moreMenuItems = computed(() => {
  if (moreMenuSetting.value === 'shakeSensitivity') return shakeSensitivityItems.value
  else if (moreMenuSetting.value === 'hapticFeedback') return hapticFeedbackItems.value
  else if (moreMenuSetting.value === 'language') return languageOptionItems.value
  else if (moreMenuSetting.value === 'theme') return themeOptionItems.value
  else if (moreMenuSetting.value === 'downloadUsingCellular') return downloadUsingCellularItems.value
  else if (moreMenuSetting.value === 'streamingUsingCellular') return streamingUsingCellularItems.value
  else if (moreMenuSetting.value === 'androidAutoBrowseSeriesSequenceOrder') return androidAutoBrowseSeriesSequenceOrderItems.value
  else if (moreMenuSetting.value === 'jumpForward')
    return jumpForwardSecondsOptions.value.map((value) => ({
      text: getJumpLabel(value),
      value: String(value)
    }))
  else if (moreMenuSetting.value === 'jumpBackwards')
    return jumpBackwardsSecondsOptions.value.map((value) => ({
      text: getJumpLabel(value),
      value: String(value)
    }))
  return []
})

const moreMenuSelected = computed(() => {
  if (moreMenuSetting.value === 'jumpForward') return String(settings.jumpForwardTime)
  if (moreMenuSetting.value === 'jumpBackwards') return String(settings.jumpBackwardsTime)
  if (moreMenuSetting.value === 'language') return settings.languageCode
  if (moreMenuSetting.value === 'theme') return theme.value
  if (moreMenuSetting.value === 'downloadUsingCellular') return settings.downloadUsingCellular
  if (moreMenuSetting.value === 'streamingUsingCellular') return settings.streamingUsingCellular
  if (moreMenuSetting.value === 'androidAutoBrowseSeriesSequenceOrder') return settings.androidAutoBrowseSeriesSequenceOrder
  if (moreMenuSetting.value === 'shakeSensitivity') return settings.shakeSensitivity
  if (moreMenuSetting.value === 'hapticFeedback') return settings.hapticFeedback
  return null
})

function sleepTimerLengthModalSelection(value: number) {
  settings.sleepTimerLength = value
  void saveSettings()
}

function showAutoSleepTimerRewindLengthModalSelection(value: number) {
  settings.autoSleepTimerAutoRewindTime = value
  void saveSettings()
}

function showSleepTimerOptions() {
  showSleepTimerLengthModal.value = true
}

function showAutoSleepTimerRewindOptions() {
  showAutoSleepTimerRewindLengthModal.value = true
}

function showHapticFeedbackOptions() {
  moreMenuSetting.value = 'hapticFeedback'
  showMoreMenuDialog.value = true
}

function showShakeSensitivityOptions() {
  moreMenuSetting.value = 'shakeSensitivity'
  showMoreMenuDialog.value = true
}

function showLanguageOptions() {
  moreMenuSetting.value = 'language'
  showMoreMenuDialog.value = true
}

function showThemeOptions() {
  moreMenuSetting.value = 'theme'
  showMoreMenuDialog.value = true
}

function showJumpForwardOptions() {
  moreMenuSetting.value = 'jumpForward'
  showMoreMenuDialog.value = true
}

function showJumpBackwardsOptions() {
  moreMenuSetting.value = 'jumpBackwards'
  showMoreMenuDialog.value = true
}

function showDownloadUsingCellularOptions() {
  moreMenuSetting.value = 'downloadUsingCellular'
  showMoreMenuDialog.value = true
}

function showStreamingUsingCellularOptions() {
  moreMenuSetting.value = 'streamingUsingCellular'
  showMoreMenuDialog.value = true
}

function showAndroidAutoBrowseSeriesSequenceOrderOptions() {
  moreMenuSetting.value = 'androidAutoBrowseSeriesSequenceOrder'
  showMoreMenuDialog.value = true
}

function clickMenuAction(action: string) {
  showMoreMenuDialog.value = false
  if (moreMenuSetting.value === 'shakeSensitivity') {
    settings.shakeSensitivity = action
    void saveSettings()
  } else if (moreMenuSetting.value === 'hapticFeedback') {
    settings.hapticFeedback = action
    hapticFeedbackUpdated(action)
  } else if (moreMenuSetting.value === 'language') {
    settings.languageCode = action
    void saveSettings()
  } else if (moreMenuSetting.value === 'theme') {
    theme.value = action
    saveTheme(action)
  } else if (moreMenuSetting.value === 'downloadUsingCellular') {
    settings.downloadUsingCellular = action
    void saveSettings()
  } else if (moreMenuSetting.value === 'streamingUsingCellular') {
    settings.streamingUsingCellular = action
    void saveSettings()
  } else if (moreMenuSetting.value === 'androidAutoBrowseSeriesSequenceOrder') {
    settings.androidAutoBrowseSeriesSequenceOrder = action
    void saveSettings()
  } else if (moreMenuSetting.value === 'jumpForward') {
    settings.jumpForwardTime = Number(action)
    void saveSettings()
  } else if (moreMenuSetting.value === 'jumpBackwards') {
    settings.jumpBackwardsTime = Number(action)
    void saveSettings()
  }
}

function saveTheme(t: string) {
  document.documentElement.dataset.theme = t
  void useLocalStore().setTheme(t)
}

function autoSleepTimerTimeUpdated(val: string | number) {
  if (!val) return // invalid times return falsy
  void saveSettings()
}

function androidAutoBrowseLimitForGroupingUpdated(input: string | number) {
  let val = Number(input)
  if (!val) return // invalid values return falsy
  if (val > 1000) val = 1000
  if (val < 30) val = 30
  void saveSettings()
}

function hapticFeedbackUpdated(val: string) {
  globalsStore.hapticFeedback = val
  void saveSettings()
}

function showInfo(setting: string) {
  const info = (settingInfo.value as Record<string, { name: string; message: string }>)[setting]
  if (info) {
    void Dialog.alert({
      title: info.name,
      message: info.message
    })
  }
}

async function showConfirmMp3IndexSeeking() {
  const info = settingInfo.value.enableMp3IndexSeeking
  const confirmResult = await Dialog.confirm({
    title: info.name,
    message: info.message,
    cancelButtonTitle: 'View More'
  })
  if (!confirmResult.value) {
    window.open('https://exoplayer.dev/troubleshooting.html#why-is-seeking-inaccurate-in-some-mp3-files', '_blank')
  }
}

function getCurrentOrientation(): string {
  const type = getScreenOrientation()?.type || ''

  if (type.includes('landscape')) return 'LANDSCAPE'
  return 'PORTRAIT' // default
}

function toggleLockOrientation() {
  if (!orientationLockHonored.value) return

  lockCurrentOrientation.value = !lockCurrentOrientation.value
  if (lockCurrentOrientation.value) {
    settings.lockOrientation = getCurrentOrientation()
  } else {
    settings.lockOrientation = 'NONE'
  }
  useUtils().setOrientationLock(settings.lockOrientation)
  void saveSettings()
}

const minimalModeOnLaunch = ref(false)

async function saveMinimalModeOnLaunch(enabled: boolean) {
  await useHaptics().impact()
  await useLocalStore().setMinimalModeOnLaunch(enabled)
}

async function openMinimalMode() {
  await useHaptics().impact()
  void useRouter().push('/minimal')
}

async function saveSettings() {
  await useHaptics().impact()
  const db = useDb()
  const updatedDeviceData = (await db.updateDeviceSettings({ ...settings })) as Record<string, unknown> | null
  if (updatedDeviceData) {
    appStore.setDeviceData(updatedDeviceData as Parameters<typeof appStore.setDeviceData>[0])
    deviceData.value = updatedDeviceData
    const deviceSettings = updatedDeviceData.deviceSettings as Record<string, unknown> | undefined
    await setLanguageCode((deviceSettings?.languageCode as string) || 'en-us')
    setDeviceSettings()
  }
}

function setDeviceSettings() {
  const ds = (deviceData.value?.deviceSettings as Record<string, unknown> | null | undefined) || {}
  settings.disableAutoRewind = !!ds.disableAutoRewind
  settings.enableAltView = !!ds.enableAltView
  settings.allowSeekingOnMediaControls = !!ds.allowSeekingOnMediaControls
  settings.jumpForwardTime = (ds.jumpForwardTime as number) || 10
  settings.jumpBackwardsTime = (ds.jumpBackwardsTime as number) || 10
  settings.enableMp3IndexSeeking = !!ds.enableMp3IndexSeeking

  settings.lockOrientation = (ds.lockOrientation as string) || 'NONE'
  lockCurrentOrientation.value = settings.lockOrientation !== 'NONE'
  settings.hapticFeedback = (ds.hapticFeedback as string) || 'LIGHT'

  settings.disableShakeToResetSleepTimer = !!ds.disableShakeToResetSleepTimer
  settings.shakeSensitivity = (ds.shakeSensitivity as string) || 'MEDIUM'
  settings.autoSleepTimer = !!ds.autoSleepTimer
  settings.autoSleepTimerStartTime = (ds.autoSleepTimerStartTime as string) || '22:00'
  settings.autoSleepTimerEndTime = (ds.autoSleepTimerEndTime as string) || '06:00'
  settings.sleepTimerLength = !isNaN(ds.sleepTimerLength as number) ? (ds.sleepTimerLength as number) : 900000 // 15 minutes
  settings.disableSleepTimerFadeOut = !!ds.disableSleepTimerFadeOut
  settings.disableSleepTimerResetFeedback = !!ds.disableSleepTimerResetFeedback
  settings.enableSleepTimerAlmostDoneChime = !!ds.enableSleepTimerAlmostDoneChime

  settings.autoContinuePlaylists = !!ds.autoContinuePlaylists
  settings.autoCacheUnplayedEpisodes = !!ds.autoCacheUnplayedEpisodes
  settings.autoSleepTimerAutoRewind = !!ds.autoSleepTimerAutoRewind
  settings.autoSleepTimerAutoRewindTime = !isNaN(ds.autoSleepTimerAutoRewindTime as number) ? (ds.autoSleepTimerAutoRewindTime as number) : 300000 // 5 minutes

  settings.languageCode = (ds.languageCode as string) || 'en-us'

  settings.downloadUsingCellular = (ds.downloadUsingCellular as string) || 'ALWAYS'
  settings.streamingUsingCellular = (ds.streamingUsingCellular as string) || 'ALWAYS'

  settings.androidAutoBrowseLimitForGrouping = (ds.androidAutoBrowseLimitForGrouping as number) || 100
  settings.androidAutoBrowseSeriesSequenceOrder = (ds.androidAutoBrowseSeriesSequenceOrder as string) || 'ASC'
}

async function init() {
  loading.value = true
  const localStore = useLocalStore()
  const db = useDb()
  theme.value = (await localStore.getTheme()) || 'dark'
  deviceData.value = (await db.getDeviceData()) as Record<string, unknown> | null
  appStore.setDeviceData(deviceData.value as Parameters<typeof appStore.setDeviceData>[0])
  setDeviceSettings()
  loading.value = false
}

onMounted(async () => {
  void init()
  minimalModeOnLaunch.value = await useLocalStore().getMinimalModeOnLaunch()
  window.addEventListener('resize', updateOrientationLockHonored)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateOrientationLockHonored)
})
</script>
