import { Capacitor, registerPlugin } from '@capacitor/core'
import { episodeProgress } from '~/composables/useListeningQueue'
import { isProgressFinished } from '~/composables/useMediaProgress'
import type { ListeningEpisode, ProgressLookup, PlayQueueItem } from '~/composables/useListeningQueue'

/**
 * How many episodes the watch is told about.
 *
 * The watch will eventually download these, on a device with a few gigabytes of space shared
 * with everything else. A catch-up queue two hundred long is the right thing for a phone screen
 * and the wrong thing to hand a watch, so it is cut here rather than on the other side - the
 * entries never cross the Bluetooth link in the first place.
 */
export const WEAR_QUEUE_LIMIT = 20

export interface WearQueueEntryPayload {
  libraryItemId: string
  episodeId: string
  title: string
  podcastTitle: string
  coverPath: string | null
  durationSeconds: number
  currentTimeSeconds: number
  progressUpdatedAtMs: number
}

export interface WearSessionPayload {
  serverAddress: string
  token: string
  userId: string
  serverConnectionConfigId: string
}

/**
 * The server-side identity of a queue item.
 *
 * `toPlayQueueItems` rewrites `libraryItemId`/`episodeId` to the *local* ids when a download
 * exists, because that is what the phone's player needs. The watch has its own downloads and
 * its own server requests, so it needs the server ids - handing it a local id would have it ask
 * the server for something that only exists in the phone's database.
 */
function stringOr(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback
}

function numberOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && isFinite(value) && value > 0 ? value : fallback
}

/**
 * The podcast's name, from wherever this episode happens to carry it.
 *
 * `/recent-episodes` nests it under the parent library item, a locally cached episode carries it
 * flat, and an episode lifted off a library item has neither - so this falls back to empty
 * rather than guessing. The watch shows it as a subtitle; blank is fine, wrong is not.
 */
function podcastTitleOf(episode: ListeningEpisode): string {
  const podcast = episode.podcast as { metadata?: { title?: unknown } } | undefined
  const nested = podcast?.metadata?.title
  if (typeof nested === 'string' && nested.length > 0) return nested
  return stringOr(episode.podcastTitle, '')
}

function serverIdsFor(item: PlayQueueItem): { libraryItemId: string; episodeId: string } {
  return {
    libraryItemId: item.serverLibraryItemId || item.libraryItemId,
    episodeId: item.serverEpisodeId || item.episodeId
  }
}

/**
 * Turns the queue the phone resolved into what the watch is told.
 *
 * Finished episodes are dropped rather than sent with their progress: the watch plays the list
 * in order and has no notion of "finished", by design - the ordering rules live in exactly one
 * place and this is not it.
 */
export function toWearQueueEntries(items: PlayQueueItem[] = [], lookup: ProgressLookup = {}, limit: number = WEAR_QUEUE_LIMIT): WearQueueEntryPayload[] {
  const entries: WearQueueEntryPayload[] = []

  for (const item of items) {
    if (entries.length >= limit) break
    const episode = item.episode as ListeningEpisode | null | undefined
    if (!episode) continue

    const progress = episodeProgress(episode, lookup)
    if (isProgressFinished(progress)) continue

    const { libraryItemId, episodeId } = serverIdsFor(item)
    if (!libraryItemId || !episodeId) continue

    const currentTime = typeof progress?.currentTime === 'number' && progress.currentTime > 0 ? progress.currentTime : 0
    const duration = numberOr(episode.duration, 0)

    entries.push({
      libraryItemId,
      episodeId,
      title: stringOr(episode.title, 'Untitled episode'),
      podcastTitle: podcastTitleOf(episode),
      coverPath: libraryItemId ? `/api/items/${libraryItemId}/cover` : null,
      durationSeconds: duration,
      currentTimeSeconds: currentTime,
      // Carried so the watch can tell whether its own listening is newer than this before
      // reporting it to the server. Without it the watch cannot distinguish "I heard this on a
      // run" from "the phone has since moved past it", and would wind the position backwards.
      progressUpdatedAtMs: numberOr(progress?.lastUpdate, 0)
    })
  }

  return entries
}

/**
 * What to send as the queue, or null to leave the watch's alone.
 *
 * `items` of null means "I have nothing to say about the queue" and is NOT an empty queue.
 * Sending an empty one clears the watch - right when there is genuinely nothing left to hear,
 * and catastrophic from a screen that simply never resolved a queue: a run would lose its list
 * mid-stride. The app layout publishes the session on startup and passes null for this reason.
 */
export function queuePayloadFor(session: WearSessionPayload | null, items: PlayQueueItem[] | null, lookup: ProgressLookup = {}): { entries: WearQueueEntryPayload[] } | null {
  if (!session || !items) return null
  return { entries: toWearQueueEntries(items, lookup) }
}

interface AbsWearSyncPlugin {
  publish(options: { session: WearSessionPayload | null; queue: { entries: WearQueueEntryPayload[] } | null }): Promise<{ published: boolean }>
}

// Registered here rather than in plugins/capacitor/, which nuxt.config.ts puts in `ignore`.
const AbsWearSync = registerPlugin<AbsWearSyncPlugin>('AbsWearSync')

export function useWearSync() {
  /**
   * Tells the watch about the server, and optionally about the queue.
   *
   * `items` of `null` means "I have nothing to say about the queue" and is NOT the same as an
   * empty one. Sending an empty queue clears the watch - which is right when there is genuinely
   * nothing left to hear, and catastrophic when it comes from a screen that simply never
   * resolved a queue: a run would lose its list mid-stride. The app layout publishes the session
   * on startup and passes null for exactly this reason.
   */
  async function publish(session: WearSessionPayload | null, items: PlayQueueItem[] | null, lookup: ProgressLookup = {}) {
    // Native-only, and a missing bridge is not an error worth surfacing: the web build and iOS
    // have no watch to talk to.
    if (!Capacitor.isPluginAvailable('AbsWearSync')) return

    try {
      await AbsWearSync.publish({
        session,
        queue: queuePayloadFor(session, items, lookup)
      })
    } catch (error) {
      console.warn('[useWearSync] Failed to publish to the watch', error)
    }
  }

  return { publish }
}
