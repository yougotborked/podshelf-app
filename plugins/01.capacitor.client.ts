import { App } from '@capacitor/app'
import { Dialog } from '@capacitor/dialog'
import { StatusBar, Style } from '@capacitor/status-bar'
import { Capacitor } from '@capacitor/core'
import { AbsLogger } from '@/plugins/capacitor'
import { describeRejection } from '~/composables/useRejectionLog'

export default defineNuxtPlugin(async () => {
  const bus = useEventBus()
  const router = useRouter()

  // The last stop for work started with `void promise` or handed to an event listener: a
  // rejection nobody awaited is written to the in-app log instead of disappearing. See
  // composables/useRejectionLog.ts.
  window.addEventListener('unhandledrejection', (event) => {
    AbsLogger.error({ tag: 'UnhandledRejection', message: describeRejection(event.reason) })
  })

  // Light status bar text over the dark bar. iOS only: on Android the status-bar plugin is not
  // built in, and MainActivity's enableEdgeToEdge sets the same thing natively.
  if (Capacitor.getPlatform() === 'ios') {
    await StatusBar.setStyle({ style: Style.Dark }).catch(() => {})
  }

  // Set theme from local store
  const localStore = useLocalStore()
  const theme = await localStore.getTheme()
  if (theme) {
    document.documentElement.dataset.theme = theme
  }

  // iOS: back navigation via router hook
  if (Capacitor.getPlatform() === 'ios') {
    router.beforeEach((_to, _from, next) => {
      const globalsStore = useGlobalsStore()
      const appStore = useAppStore()
      if (globalsStore.isModalOpen) bus.emit('close-modal')
      if (appStore.playerIsFullscreen) bus.emit('minimize-player')
      if (appStore.showReader) bus.emit('close-ebook')
      if (globalsStore.pageOverlayOpen) bus.emit('close-page-overlay')
      next()
    })
  }

  // Android: hardware back button
  const onBackButton = async () => {
    const globalsStore = useGlobalsStore()
    const appStore = useAppStore()

    const action = resolveBackAction({
      isModalOpen: globalsStore.isModalOpen,
      showReader: appStore.showReader,
      playerIsFullscreen: appStore.playerIsFullscreen,
      hasPageOverlay: globalsStore.pageOverlayOpen,
      // Deliberately not the event's canGoBack - see BackNavigationContext
      hasInAppHistory: window.history.state?.back != null
    })

    if (action === 'close-modal') return bus.emit('close-modal')
    if (action === 'close-ebook') return bus.emit('close-ebook')
    if (action === 'minimize-player') return bus.emit('minimize-player')
    if (action === 'close-page-overlay') return bus.emit('close-page-overlay')
    if (action === 'history-back') return window.history.back()

    const strings = useStrings()
    const { value } = await Dialog.confirm({
      title: strings.HeaderConfirm || 'Confirm',
      message: strings.MessageConfirmAppExit || 'Exit app?'
    })
    if (value) void App.exitApp()
  }
  void App.addListener('backButton', asVoidHandler(onBackButton))

  // Deep links
  void App.addListener('appUrlOpen', (data) => {
    bus.emit('url-open', data.url)
  })
})
