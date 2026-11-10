import { AbsDatabase } from '@/plugins/capacitor'

/**
 * Bridges the native layer's token refresh back into the webview.
 *
 * The Kotlin side refreshes access tokens on its own (for playback and for downloads queued while
 * the app is backgrounded). Without these listeners the webview keeps using the token it was
 * given at login, and does not notice when the session has been cleared natively.
 *
 * Ported from upstream plugins/db.js, which was dropped in the Nuxt 3 migration.
 */
export default defineNuxtPlugin(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AbsDatabase.addListener('onTokenRefresh', (data: any) => {
    const accessToken = (data as { accessToken?: string } | null | undefined)?.accessToken
    if (!accessToken) return
    useUserStore().accessToken = accessToken
  })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  AbsDatabase.addListener('onTokenRefreshFailure', async (data: any) => {
    const serverConnectionConfigId = (data as { serverConnectionConfigId?: string } | null | undefined)?.serverConnectionConfigId || ''
    console.warn('[auth] Native token refresh was rejected, logging out', serverConnectionConfigId)
    // The native side has already cleared its own credentials, so do not ask the server again
    await useUserStore().logout()
    if (window.location.pathname !== '/connect') {
      await navigateTo('/connect')
    }
  })
})
