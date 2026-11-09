<template>
  <div v-if="icon" class="flex h-full items-center px-1">
    <button
      type="button"
      :aria-label="icon"
      class="flex items-center gap-1 px-2 py-0.5 rounded-md-full bg-md-surface-2 transition-md-standard"
      @click="showAlertDialog"
    >
      <span class="material-symbols text-base leading-none" :class="iconClass">{{ icon }}</span>
    </button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { Dialog } from '@capacitor/dialog'
import { useAppStore } from '~/stores/app'
import { useUserStore } from '~/stores/user'
import { useStrings } from '~/composables/useStrings'

const appStore = useAppStore()
const userStore = useUserStore()
const strings = useStrings()

const user = computed(() => userStore.user)
const socketConnected = computed(() => appStore.socketConnected)
const serverReachable = computed(() => appStore.serverReachable)
const networkConnected = computed(() => appStore.networkConnected)
const networkConnectionType = computed(() => appStore.networkConnectionType)
const isNetworkUnmetered = computed(() => appStore.isNetworkUnmetered)
const attemptingConnection = computed(() => appStore.attemptingConnection)
const isCellular = computed(() => networkConnectionType.value === 'cellular')

const icon = computed(() => {
  if (!user.value && !attemptingConnection.value) return null

  if (attemptingConnection.value) {
    return 'cloud_sync'
  } else if (!networkConnected.value) {
    return 'wifi_off'
  } else if (!socketConnected.value || !serverReachable.value) {
    return 'cloud_off'
  } else if (isCellular.value) {
    return 'signal_cellular_alt'
  } else {
    return 'cloud_done'
  }
})

const iconClass = computed(() => {
  if (!networkConnected.value) return 'text-md-error'
  else if (!socketConnected.value || !serverReachable.value) return 'text-md-error'
  else if (!isNetworkUnmetered.value) return 'text-warning'
  else if (isCellular.value) return 'text-md-on-surface-variant'
  else return 'text-md-primary'
})

function showAlertDialog() {
  let msg = ''
  if (attemptingConnection.value) {
    msg = strings.MessageAttemptingServerConnection
  } else if (!networkConnected.value) {
    msg = strings.MessageNoNetworkConnection
  } else if (!socketConnected.value) {
    msg = strings.MessageSocketNotConnected
  } else if (!serverReachable.value) {
    msg = strings.MessageServerConnectionUnavailable
  } else if (isCellular.value) {
    msg = isNetworkUnmetered.value ? strings.MessageSocketConnectedOverUnmeteredCellular : strings.MessageSocketConnectedOverMeteredCellular
  } else {
    msg = isNetworkUnmetered.value ? strings.MessageSocketConnectedOverUnmeteredWifi : strings.MessageSocketConnectedOverMeteredWifi
  }
  void Dialog.alert({
    title: strings.HeaderConnectionStatus,
    message: msg
  })
}
</script>
