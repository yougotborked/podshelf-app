<template>
  <div class="w-full h-full py-4">
    <div class="flex items-center mb-2 space-x-2 px-4">
      <p class="text-lg font-bold">{{ $strings.ButtonLogs }}</p>
      <ui-icon-btn outlined borderless :icon="isCopied ? 'check' : 'content_copy'" @click="copyToClipboard" />
      <ui-icon-btn outlined borderless icon="share" @click="shareLogs" />
      <div class="flex-grow"></div>
      <ui-icon-btn outlined borderless icon="more_vert" @click="showDialog = true" />
    </div>

    <div class="w-full h-[calc(100%-40px)] overflow-y-auto relative" ref="logContainer">
      <div v-if="!logs.length && !isLoading" class="flex items-center justify-center h-32 p-4">
        <p class="text-md-on-surface-variant">{{ $strings.MessageNoLogs }}</p>
      </div>
      <div v-if="hasScrolled" class="sticky top-0 left-0 w-full h-10 bg-gradient-to-t from-transparent to-md-surface-0 z-10 pointer-events-none"></div>

      <div v-for="(log, index) in logs" :key="log.id" class="py-2 px-4" :class="{ 'bg-white/5': index % 2 === 0 }">
        <div class="flex items-center space-x-4 mb-1">
          <div class="text-xs uppercase font-bold" :class="{ 'text-error': log.level === 'error', 'text-info': log.level === 'info' }">{{ log.level }}</div>
          <div class="text-xs text-md-on-surface-variant">{{ formatEpochToDatetimeString(log.timestamp) }}</div>
          <div class="flex-grow"></div>
          <div class="text-xs text-md-on-surface-variant">{{ log.tag }}</div>
        </div>
        <div class="text-xs break-words">{{ maskServerAddress ? log.maskedMessage : log.message }}</div>
      </div>
    </div>

    <modals-dialog v-model="showDialog" :items="dialogItems" @action="dialogAction" />
  </div>
</template>
<script setup lang="ts">
import { AbsLogger } from '@/plugins/capacitor'

const strings = useStrings()
const toast = useToast()
const runtimeConfig = useRuntimeConfig()

type LogEntry = { id: string; level: string; message: string; maskedMessage: string; timestamp: number; tag: string }

const logs = ref<LogEntry[]>([])
const isLoading = ref(true)
const isCopied = ref(false)
const hasScrolled = ref(false)
const maskServerAddress = ref(true)
const showDialog = ref(false)
const logContainer = ref<HTMLElement | null>(null)

const dialogItems = computed(() => [
  {
    text: maskServerAddress.value ? strings.ButtonUnmaskServerAddress : strings.ButtonMaskServerAddress,
    value: 'toggle-mask-server-address',
    icon: maskServerAddress.value ? 'remove_moderator' : 'shield'
  },
  {
    text: strings.ButtonClearLogs,
    value: 'clear-logs',
    icon: 'delete'
  }
])

async function dialogAction(action: string) {
  await useHaptics().impact()

  if (action === 'clear-logs') {
    await AbsLogger.clearLogs()
    logs.value = []
  } else if (action === 'toggle-mask-server-address') {
    maskServerAddress.value = !maskServerAddress.value
  }
  showDialog.value = false
}

async function copyToClipboard() {
  await useHaptics().impact()
  void useUtils().copyToClipboard(getLogsString()).then(() => {
    isCopied.value = true
    setTimeout(() => {
      isCopied.value = false
    }, 2000)
  })
}

/**
 * Formats an epoch timestamp to YYYY-MM-DD HH:mm:ss.SSS
 * Use 24 hour time format
 * @param {number} epoch
 * @returns {string}
 */
function formatEpochToDatetimeString(epoch: number): string {
  return new Date(epoch)
    .toLocaleString('en-US', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      hour12: false
    } as Intl.DateTimeFormatOptions)
    .replace(',', '')
}

function getLogsString(): string {
  return logs.value
    .map((log) => {
      const logMessage = maskServerAddress.value ? log.maskedMessage : log.message
      return `${formatEpochToDatetimeString(log.timestamp)} [${log.level.toUpperCase()}] ${logMessage}`
    })
    .join('\n')
}

async function shareLogs() {
  await useHaptics().impact()
  const logsString = getLogsString()
  const platform = usePlatform()
  const version = runtimeConfig.public.version
  const filename = `abs_logs_${platform}_${version}.txt`

  if (!navigator.share) {
    toast.error('Share not supported on this device')
    return
  }

  const shareData: ShareData = { title: filename }
  if (navigator.canShare) {
    const file = new File([logsString], filename, { type: 'text/plain' })
    if (navigator.canShare({ files: [file] })) {
      shareData.files = [file]
    } else {
      shareData.text = logsString
    }
  } else {
    shareData.text = logsString
  }

  navigator.share(shareData).catch((err: Error) => {
    if (err.name !== 'AbortError') {
      console.error('Failed to share', err.message)
      toast.error('Failed to share: ' + err.message)
    }
  })
}

function scrollToBottom() {
  if (!logContainer.value) return
  logContainer.value.scrollTop = logContainer.value.scrollHeight
  hasScrolled.value = logContainer.value.scrollTop > 0
}

function maskLogMessage(message: string): string {
  return message.replace(/(https?:\/\/)\S+/g, '$1[SERVER_ADDRESS]')
}

function loadLogs() {
  isLoading.value = true
  AbsLogger.getAllLogs()
    .then((logData: { value?: LogEntry[] }) => {
      const rawLogs = logData.value || []
      logs.value = rawLogs.map((log) => {
        log.maskedMessage = maskLogMessage(log.message)
        return log
      })
      void nextTick(() => {
        scrollToBottom()
      })
      isLoading.value = false
    })
    .catch((error: Error) => {
      isLoading.value = false
      console.error('Failed to load logs', error)
      toast.error('Failed to load logs: ' + error.message)
    })
}

onMounted(() => {
  AbsLogger.addListener('onLog', (log: LogEntry) => {
    log.maskedMessage = maskLogMessage(log.message)
    logs.value.push(log)
    logs.value.sort((a, b) => a.timestamp - b.timestamp)

    void nextTick(() => {
      scrollToBottom()
    })
  })
  loadLogs()
})

onBeforeUnmount(() => {
  AbsLogger.removeAllListeners()
})
</script>

