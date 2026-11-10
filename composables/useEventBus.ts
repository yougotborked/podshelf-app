import mitt from 'mitt'
import type { LibraryItem, PlayItemPayload } from '~/types'

export type AppEvents = {
  'play-item': PlayItemPayload
  'pause-item': void
  'close-modal': void
  /** Dismiss the topmost full-page overlay a page is drawing over itself. */
  'close-page-overlay': void
  'minimize-player': void
  'close-ebook': void
  'close-stream': void
  'cast-local-item': void
  'abs-ui-ready': void
  'user-settings': Record<string, unknown>
  'playback-time-update': { currentTime: number; duration: number }
  'playback-ended': void
  'device-focus-update': boolean
  'socket-reconnected': void
  'go-online': void
  'url-open': string
  'library-changed': string
  'change-lang': string
  'new-local-library-item': LibraryItem
  'bookshelf-total-entities': number
  'download-series-click': void
  /** Advance the play queue from outside the player's own controls, as minimal mode does. */
  'skip-next-queue': void
}

const _emitter = mitt<AppEvents>()

export const useEventBus = () => _emitter
