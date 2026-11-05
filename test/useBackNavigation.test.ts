import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { resolveBackAction, unloadablePageExit } from '~/composables/useBackNavigation'

const open = { isModalOpen: false, showReader: false, playerIsFullscreen: false, hasPageOverlay: false, hasInAppHistory: true }

// The bug this guards: none of this ran. MainActivity registered a back callback after
// Capacitor's AppPlugin had registered its own, and the dispatcher runs them
// last-registered-first, so back went straight to webView.goBack() — which can navigate off the
// app's first history entry and reload everything, looking like a crash and restart.
describe('resolveBackAction', () => {
  it('navigates back when nothing is covering the page', () => {
    expect(resolveBackAction(open)).toBe('history-back')
  })

  it('confirms before leaving the app when there is nowhere back to go', () => {
    expect(resolveBackAction({ ...open, hasInAppHistory: false })).toBe('confirm-exit')
  })

  // The reported case: Catch up starts playback and leaves the mini player up, so nothing is
  // covering the page. Going back from the app's first screen used to pop the webview's own
  // history, which reloads the document - and the player component unmounting with it stopped
  // the audio.
  it('does not navigate off the first screen', () => {
    expect(resolveBackAction({ ...open, hasInAppHistory: false })).not.toBe('history-back')
  })

  it('minimizes the fullscreen player rather than navigating', () => {
    // The reported case: open the player from Catch up, swipe back.
    expect(resolveBackAction({ ...open, playerIsFullscreen: true })).toBe('minimize-player')
  })

  it('minimizes the player rather than leaving the app', () => {
    expect(resolveBackAction({ ...open, playerIsFullscreen: true, hasInAppHistory: false })).toBe('minimize-player')
  })

  it('closes the reader before the player', () => {
    expect(resolveBackAction({ ...open, showReader: true, playerIsFullscreen: true })).toBe('close-ebook')
  })

  it('closes a modal before anything else', () => {
    expect(resolveBackAction({ isModalOpen: true, showReader: true, playerIsFullscreen: true, hasPageOverlay: true, hasInAppHistory: false })).toBe('close-modal')
  })

  it('peels one layer at a time', () => {
    // Each call answers for the state it is given; closing a layer is what changes the next answer.
    expect(resolveBackAction({ ...open, isModalOpen: true, playerIsFullscreen: true })).toBe('close-modal')
    expect(resolveBackAction({ ...open, playerIsFullscreen: true })).toBe('minimize-player')
    expect(resolveBackAction(open)).toBe('history-back')
  })

  // The reported case: in Discover, tapping a podcast covers the page with its details without
  // pushing a history entry. Back used to find nothing covering the page and go back in history,
  // leaving the Discover tab - which reads as "back switched tabs".
  it('closes a page overlay rather than navigating away from the tab', () => {
    expect(resolveBackAction({ ...open, hasPageOverlay: true })).toBe('close-page-overlay')
  })

  it('closes a page overlay even on the first screen, instead of offering to exit', () => {
    expect(resolveBackAction({ ...open, hasPageOverlay: true, hasInAppHistory: false })).toBe('close-page-overlay')
  })

  it('peels the floating layers before the page overlay underneath them', () => {
    // A page overlay is part of the page; a modal, the reader and the fullscreen player all
    // float above it, so each comes off first
    expect(resolveBackAction({ ...open, hasPageOverlay: true, isModalOpen: true })).toBe('close-modal')
    expect(resolveBackAction({ ...open, hasPageOverlay: true, showReader: true })).toBe('close-ebook')
    expect(resolveBackAction({ ...open, hasPageOverlay: true, playerIsFullscreen: true })).toBe('minimize-player')
  })
})

describe('unloadablePageExit', () => {
  it('goes back to where the person came from', () => {
    expect(unloadablePageExit('/bookshelf')).toBe('history-back')
  })

  it('replaces itself when there is nowhere to go back to', () => {
    expect(unloadablePageExit(null)).toBe('replace')
    expect(unloadablePageExit(undefined)).toBe('replace')
    expect(unloadablePageExit('')).toBe('replace')
  })
})

describe('pages that redirect never leave themselves in history', () => {
  // The trap: the episode page pushed '/', and '/' pushed '/bookshelf' after re-initialising the
  // app, so Back always landed on a page that sent the person straight forward again.
  const read = (p: string) => readFileSync(resolve(__dirname, '..', p), 'utf8').replace(/\/\/.*$/gm, '')

  it("'/' replaces itself with wherever the app starts", () => {
    expect(read('pages/index.vue')).not.toMatch(/router\.push\(/)
  })

  it.each(['pages/item/[id]/index.vue', 'pages/item/[id]/[episode]/index.vue'])('%s never pushes a redirect', (page) => {
    // Covers the local-to-server hop too: pushed, Back landed on the local page, which hopped again.
    const pushes = read(page).match(/navigateTo\(.*$/gm)?.filter((call) => !call.includes('replace: true')) ?? []
    expect(pushes).toEqual([])
  })
})
