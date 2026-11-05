/**
 * What the Android back gesture does.
 *
 * Back is layered: a modal sits over the reader, the reader over the fullscreen player, and all
 * of them over ordinary navigation. Back should peel off the topmost layer rather than navigate,
 * and only fall through to history once nothing is covering the page.
 *
 * This lived inline in the backButton listener, which never ran: MainActivity registered its own
 * OnBackPressedCallback after Capacitor's AppPlugin had registered its own, and the dispatcher
 * runs them last-registered-first. So back went straight to webView.goBack() and could navigate
 * off the app's first history entry, reloading the whole app - which looks exactly like a crash
 * and restart.
 */
export type BackAction = 'close-modal' | 'close-ebook' | 'minimize-player' | 'close-page-overlay' | 'history-back' | 'confirm-exit'

export interface BackNavigationContext {
  isModalOpen: boolean
  showReader: boolean
  playerIsFullscreen: boolean
  /**
   * A full-page overlay a page is drawing over itself, rather than a route it navigated to.
   *
   * Discover's podcast preview is one: tapping a result covers the page with the podcast's
   * details without pushing a history entry. Back then found nothing covering the page and went
   * back in history, which left the Discover tab entirely - the overlay was still on screen one
   * frame earlier, so it read as "back switched tabs".
   */
  hasPageOverlay: boolean
  /**
   * Whether the app itself has somewhere to go back to.
   *
   * Not the same as the webview's canGoBack, which is true for history the app did not put
   * there and cannot return to - going back then leaves the document and reloads the whole app.
   * Vue Router records the previous in-app entry in history.state.back, and leaves it null on
   * the first one.
   */
  hasInAppHistory: boolean
}

/** The single thing back should do, given what is currently open. */
export function resolveBackAction({ isModalOpen, showReader, playerIsFullscreen, hasPageOverlay, hasInAppHistory }: BackNavigationContext): BackAction {
  if (isModalOpen) return 'close-modal'
  if (showReader) return 'close-ebook'
  if (playerIsFullscreen) return 'minimize-player'
  // Below the floating layers, above navigation: an overlay is part of the page, so it comes off
  // before the page itself does
  if (hasPageOverlay) return 'close-page-overlay'
  // Nothing is covering the page, so this is ordinary navigation - and with nowhere left to go
  // back to, back means leaving the app, which is worth confirming rather than doing silently.
  return hasInAppHistory ? 'history-back' : 'confirm-exit'
}

/**
 * Where a page goes when it cannot load what it was opened for.
 *
 * Back, if the app has somewhere to go back to - that is where the person came from, and the
 * page they tapped will fail the same way again. Otherwise the page *replaces* itself with the
 * fallback, never pushes: a failing page left in history is a trap, because Back lands on it, it
 * fails again, and it sends the person forward to the same place. The episode page did exactly
 * that by pushing '/', and '/' in turn pushed '/bookshelf' after re-initialising the app, so
 * every Back looked like a refresh and none of them went anywhere.
 */
export function unloadablePageExit(historyBack: unknown): 'history-back' | 'replace' {
  return typeof historyBack === 'string' && historyBack.length > 0 ? 'history-back' : 'replace'
}

export function leaveUnloadablePage(router: { back: () => void; replace: (to: string) => unknown }, fallback: string) {
  const historyBack = typeof window !== 'undefined' ? window.history.state?.back : null
  if (unloadablePageExit(historyBack) === 'history-back') return router.back()
  return router.replace(fallback)
}
