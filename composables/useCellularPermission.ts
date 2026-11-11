import { Dialog } from '@capacitor/dialog'

export function useCellularPermission() {
  const checkCellularPermission = async (actionType: 'download' | 'streaming'): Promise<boolean> => {
    const appStore = useAppStore()
    if (appStore.networkConnectionType !== 'cellular') return true

    let permission: string | undefined
    const strings = useStrings()
    const toast = useToast()

    if (actionType === 'download') {
      permission = appStore.getCanDownloadUsingCellular
      if (permission === 'NEVER') {
        toast.error(strings.ToastDownloadNotAllowedOnCellular || 'Download not allowed on cellular')
        return false
      }
    } else {
      permission = appStore.getCanStreamingUsingCellular
      if (permission === 'NEVER') {
        toast.error(strings.ToastStreamingNotAllowedOnCellular || 'Streaming not allowed on cellular')
        return false
      }
    }

    if (permission === 'ASK') {
      return confirmAction(actionType)
    }

    return true
  }

  const confirmAction = async (actionType: 'download' | 'streaming'): Promise<boolean> => {
    const strings = useStrings()
    const message = actionType === 'download'
      ? (strings.MessageConfirmDownloadUsingCellular || 'Download using cellular?')
      : (strings.MessageConfirmStreamingUsingCellular || 'Stream using cellular?')

    const { value } = await Dialog.confirm({
      title: strings.HeaderConfirm || 'Confirm',
      message
    })
    return value
  }

  return { checkCellularPermission, confirmAction }
}
