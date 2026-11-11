/**
 * What plays next, decided by reading the library rather than by asking.
 *
 * These rules were a computed property inside `PodcastCatchUpFeed.vue`, with the published-date
 * parser written out twice in the same file and the play-queue mapping inline in a click handler.
 * Nothing could reach any of it, so "which episode is next" could only be checked by opening the
 * app and looking. Minimal mode needs the same answer on a surface with no list to look at, which
 * is reason enough to have one definition of it.
 *
 * Everything here is pure: progress is read through injected lookups rather than the stores, so
 * the ordering can be exercised without a server, a database or a player.
 */
import { isProgressFinished, type MaybeProgress } from '~/composables/useMediaProgress'
import { applyPodcastRules, type AutoPlaylistPodcastRule } from '~/composables/useAutoPlaylist'

export interface QueueProgress extends MaybeProgress {
  currentTime?: number
  lastUpdate?: number
}

export interface ListeningEpisode {
  id?: string
  libraryItemId?: string
  publishedAt?: number | string | null
  pubDate?: number | string | null
  progress?: QueueProgress | null
  [key: string]: unknown
}

export interface LocalEpisode {
  id?: string
  localLibraryItemId?: string
  [key: string]: unknown
}

/**
 * How the caller reads progress it did not get with the episode. Both are optional so a caller
 * with only one source - an offline list, a test - does not have to invent the other.
 */
export interface ProgressLookup {
  /** Progress as the server knows it. */
  server?: (libraryItemId: string, episodeId: string | null) => QueueProgress | null | undefined
  /**
   * Progress as the device knows it. The native layer writes this the moment an episode finishes,
   * before the server socket confirms, so without it a just-finished episode stays in the queue.
   */
  local?: (libraryItemId: string, episodeId: string | null) => QueueProgress | null | undefined
}

export interface PlayQueueItem {
  libraryItemId: string
  episodeId: string
  serverLibraryItemId: string
  serverEpisodeId: string
  episode: ListeningEpisode
  localEpisode: LocalEpisode | null
  // The store's QueueItem is open-ended; without this a queue built here cannot be handed to it
  [key: string]: unknown
}

/**
 * Published date as milliseconds, from whichever field and shape a feed happened to supply:
 * `publishedAt` as a number, the same value as a numeric string, `pubDate` as RFC 2822, or
 * nothing at all.
 *
 * Seconds are promoted to milliseconds. A feed that reports seconds looks like 1970 next to one
 * that reports milliseconds, which sorts every one of its episodes to the front of the queue.
 */
export function episodePublishedAt(episode: ListeningEpisode | null | undefined): number {
  if (!episode) return 0
  // First usable of the two, rather than "publishedAt if present": a feed that sends
  // `publishedAt: 0` used to shadow a perfectly good `pubDate` and sort to the front
  let value: unknown = episode.publishedAt || episode.pubDate
  if (!value) return 0
  if (typeof value === 'string') {
    const asNumber = Number(value)
    if (!isNaN(asNumber)) value = asNumber
  }
  if (typeof value === 'number') {
    if (!isFinite(value)) return 0
    // Anything below this is too small to be a millisecond timestamp in the podcast era, so it
    // is seconds. 1e12 ms is Sep 2001; 1e12 s is the year 33658.
    return value < 1e12 ? value * 1000 : value
  }
  const parsed = Date.parse(String(value))
  return isNaN(parsed) ? 0 : parsed
}

/**
 * The best progress record available for an episode: the one that came with it, plus whatever the
 * server and the device know. Merged rather than picked, because each source can be the only one
 * holding a given field - the device has the newest currentTime, the server has lastUpdate from
 * other devices - and the newest wins where they overlap.
 */
export function episodeProgress(episode: ListeningEpisode | null | undefined, lookup: ProgressLookup = {}): QueueProgress | null {
  if (!episode) return null
  const records: QueueProgress[] = []
  if (episode.progress) records.push(episode.progress)
  const libraryItemId = episode.libraryItemId
  const episodeId = episode.id
  if (libraryItemId && episodeId) {
    const server = lookup.server?.(libraryItemId, episodeId)
    if (server) records.push(server)
    const local = lookup.local?.(libraryItemId, episodeId)
    if (local) records.push(local)
  }
  return mergeProgress(records)
}

/**
 * Several records of the same progress - the server's, this device's - read as one.
 *
 * Each field comes from the most recently updated record that has it, except that finished
 * anywhere is finished.
 */
export function mergeProgress(records: (QueueProgress | null | undefined)[]): QueueProgress | null {
  const present = records.filter((r): r is QueueProgress => !!r)
  if (!present.length) return null
  // Latest first, so a `reduce` that keeps the first defined value of each field prefers it
  present.sort((a, b) => (b.lastUpdate || 0) - (a.lastUpdate || 0))
  return present.reduce<QueueProgress>((merged, record) => {
    if (merged.isFinished == null && record.isFinished != null) merged.isFinished = record.isFinished
    if (merged.progress == null && record.progress != null) merged.progress = record.progress
    if (merged.currentTime == null && record.currentTime != null) merged.currentTime = record.currentTime
    if (merged.lastUpdate == null && record.lastUpdate != null) merged.lastUpdate = record.lastUpdate
    // Finished anywhere is finished: the device sets the flag before the server hears about it,
    // and a stale server record saying otherwise must not put the episode back in the queue.
    if (record.isFinished) merged.isFinished = true
    return merged
  }, {})
}

/** Where to pick an item up, and when that position was recorded. */
export interface ResumePoint {
  startTime: number
  lastUpdate: number
}

/**
 * Where to resume an item, by the newest record of it - the server's or this device's.
 *
 * A download plays from the device's own record unless told otherwise, and that record only
 * hears about listening the server saw while the app was open to receive it. So an episode
 * half-heard by streaming - which is how every downloaded episode played while online, until
 * downloads started winning - came back from the beginning when the queue advanced to its
 * download. Null for an item never started or already finished: start it from the top.
 */
export function resumePoint(serverLibraryItemId: string | null | undefined, serverEpisodeId: string | null | undefined, lookup: ProgressLookup = {}): ResumePoint | null {
  if (!serverLibraryItemId) return null
  const episodeId = serverEpisodeId || null
  const merged = mergeProgress([lookup.server?.(serverLibraryItemId, episodeId), lookup.local?.(serverLibraryItemId, episodeId)])
  const currentTime = merged?.currentTime
  if (!merged || isProgressFinished(merged) || typeof currentTime !== 'number' || currentTime <= 0) return null
  return { startTime: currentTime, lastUpdate: merged.lastUpdate || 0 }
}

/** Whether an episode should be kept out of the queue because it has been heard to the end. */
export function isEpisodeFinished(episode: ListeningEpisode | null | undefined, lookup: ProgressLookup = {}): boolean {
  return isProgressFinished(episodeProgress(episode, lookup))
}

/** Whether an episode has been started and not finished - the "finish what you began" case. */
export function isEpisodeStarted(episode: ListeningEpisode | null | undefined, lookup: ProgressLookup = {}): boolean {
  const progress = episodeProgress(episode, lookup)
  if (!progress) return false
  if (isProgressFinished(progress)) return false
  return (progress.currentTime || 0) > 0 || (progress.progress || 0) > 0
}

export interface OrderListeningQueueOptions {
  /** Per-podcast include / newest-N / exclude rules, shared with the auto playlist. */
  rules?: Record<string, AutoPlaylistPodcastRule>
  lookup?: ProgressLookup
  /**
   * Put started-but-unfinished episodes first, most recently played first.
   *
   * Off for a list someone is reading, where a stable oldest-first order is easier to scan than
   * one that reshuffles as you listen. On where there is no list - minimal mode, a watch - because
   * the one thing a single play button must not do is start something new while an episode is
   * half heard.
   */
  resumeFirst?: boolean
}

/**
 * The queue, in the order it should be played: finished episodes dropped, per-podcast rules
 * applied, oldest first, and - when asked - whatever was already started ahead of all of it.
 */
export function orderListeningQueue(episodes: (ListeningEpisode | null | undefined)[] = [], { rules = {}, lookup = {}, resumeFirst = false }: OrderListeningQueueOptions = {}): ListeningEpisode[] {
  const unfinished = episodes.filter((episode): episode is ListeningEpisode => !!episode && !isEpisodeFinished(episode, lookup))
  // Rules are applied to the unfinished set, so a "newest 3" show offers its newest three
  // *remaining* episodes rather than three it may already have played
  const allowed = applyPodcastRules(unfinished, rules, (episode) => episode.libraryItemId, episodePublishedAt)
  const oldestFirst = allowed.slice().sort((a, b) => episodePublishedAt(a) - episodePublishedAt(b))
  if (!resumeFirst) return oldestFirst

  const started: ListeningEpisode[] = []
  const fresh: ListeningEpisode[] = []
  for (const episode of oldestFirst) {
    if (isEpisodeStarted(episode, lookup)) started.push(episode)
    else fresh.push(episode)
  }
  started.sort((a, b) => (episodeProgress(b, lookup)?.lastUpdate || 0) - (episodeProgress(a, lookup)?.lastUpdate || 0))
  return [...started, ...fresh]
}

/**
 * Turn ordered episodes into play-queue entries.
 *
 * Each entry carries both identities on purpose. A downloaded episode has to be played by its
 * local ids or the player streams a file that is already on disk, while progress is only ever
 * reported against the server ids.
 */
export function toPlayQueueItems(episodes: (ListeningEpisode | null | undefined)[] = [], localEpisodeFor: (episode: ListeningEpisode) => LocalEpisode | null | undefined = () => null): PlayQueueItem[] {
  const items: PlayQueueItem[] = []
  for (const episode of episodes) {
    if (!episode?.libraryItemId || !episode.id) continue
    const localEpisode = localEpisodeFor(episode) || null
    const localLibraryItemId = localEpisode?.localLibraryItemId
    const playLocally = !!(localEpisode && localLibraryItemId && localEpisode.id)
    items.push({
      libraryItemId: playLocally ? (localLibraryItemId as string) : episode.libraryItemId,
      episodeId: playLocally ? (localEpisode.id as string) : episode.id,
      serverLibraryItemId: episode.libraryItemId,
      serverEpisodeId: episode.id,
      episode,
      localEpisode
    })
  }
  return items
}

/** Where to start a queue entry: where it was left off, or nothing for an episode never played. */
export function queueItemStartTime(item: PlayQueueItem | null | undefined, lookup: ProgressLookup = {}): number | null {
  if (!item) return null
  const progress = episodeProgress(item.episode, lookup)
  const currentTime = progress?.currentTime
  if (typeof currentTime !== 'number' || currentTime <= 0) return null
  if (isProgressFinished(progress)) return null
  return currentTime
}

/** A downloaded item, as the device database returns it. */
export interface LocalLibraryItemWithEpisodes {
  id?: string
  /** The server item this download came from. */
  libraryItemId?: string
  media?: { episodes?: Record<string, unknown>[] } | null
  [key: string]: unknown
}

/**
 * Downloads, reshaped into the episodes the queue rules expect.
 *
 * A local episode carries `serverEpisodeId` and its own id, and nothing else that identifies it:
 * `libraryItemId` lives on the parent item, not the episode. Feeding the raw records to the queue
 * therefore dropped every one of them - `toPlayQueueItems` skips an episode with no server
 * identity - so an offline device with a full download folder was told there was nothing left to
 * play. Progress lookups failed for the same reason, so nothing was filtered as finished either.
 */
export function localEpisodesAsQueueCandidates(localLibraryItems: (LocalLibraryItemWithEpisodes | null | undefined)[] = []): ListeningEpisode[] {
  const episodes: ListeningEpisode[] = []
  for (const item of localLibraryItems) {
    if (!item?.libraryItemId) continue
    for (const localEpisode of item.media?.episodes || []) {
      const serverEpisodeId = localEpisode.serverEpisodeId as string | undefined
      // Without a server episode id this download cannot be matched to progress or reported
      // against, and two episodes of the same show would be indistinguishable
      if (!serverEpisodeId) continue
      episodes.push({
        ...localEpisode,
        id: serverEpisodeId,
        libraryItemId: item.libraryItemId,
        localEpisodeId: localEpisode.id as string | undefined,
        localLibraryItemId: item.id
      })
    }
  }
  return episodes
}

/**
 * Only what can actually be played with no server.
 *
 * The cached episode list is the whole library's recent episodes, most of which are streams.
 * Offering one offline starts a stream that cannot connect, which on a surface with a single play
 * button leaves nothing to do about it.
 */
export function restrictToDownloaded(episodes: (ListeningEpisode | null | undefined)[] = [], isDownloaded: (episode: ListeningEpisode) => boolean): ListeningEpisode[] {
  return episodes.filter((episode): episode is ListeningEpisode => !!episode && isDownloaded(episode))
}

/**
 * How much of an episode is left to hear, in seconds.
 *
 * Not its duration: a budget is about what remains. An episode forty minutes long with
 * thirty-five already heard is a five minute item, and treating it as forty is how a
 * "fits your commute" queue ends up holding one thing.
 *
 * null rather than a guess when the duration is unknown. A podcast feed that omits it is
 * common enough, and a queue built on invented lengths is worse than one that leaves the
 * episode out and says so.
 */
export function episodeRemainingSeconds(
  episode: ListeningEpisode | null | undefined,
  lookup: ProgressLookup = {}
): number | null {
  const duration = typeof episode?.duration === 'number' ? episode.duration : null
  if (duration === null || !Number.isFinite(duration) || duration <= 0) return null

  // Through isEpisodeFinished rather than reading the flag, so "finished" means here exactly
  // what it means to the rest of the queue - including the rule that finished on any one
  // device wins over a stale server record saying otherwise.
  if (isEpisodeFinished(episode, lookup)) return 0

  const progress = episodeProgress(episode, lookup)
  const played = typeof progress?.currentTime === 'number' && Number.isFinite(progress.currentTime) ? progress.currentTime : 0
  return Math.max(0, duration - Math.max(0, played))
}

export interface TimeBudgetOptions {
  lookup?: ProgressLookup
  /**
   * Below this, what is left of the budget is not worth filling. Default a minute: queueing a
   * twenty second tail to round out a commute is noise, not service.
   */
  minimumFitSeconds?: number
}

export interface TimeBudgetQueue {
  episodes: ListeningEpisode[]
  /** What the chosen episodes add up to. */
  totalSeconds: number
  /** Budget left over. Never negative - nothing here overruns the budget. */
  remainingSeconds: number
}

/**
 * The longest run of episodes that fits inside a stretch of time.
 *
 * "Fill my forty minute commute" is the thing podcasts can answer and music cannot, because an
 * episode has a length the listener already cares about. The roadmap lists it as one of the
 * four things worth taking from Plexamp that need no inference, and this is all of the
 * mechanism.
 *
 * Three judgements, all of which could reasonably have gone the other way:
 *
 * - **It keeps the order it was given.** Packing optimally would fit more minutes, and would
 *   do it by handing over an episode chosen for its length rather than because it is what you
 *   would have played next. The queue order is the recommendation; this only decides where to
 *   stop.
 * - **It skips rather than stops.** One four-hour episode near the top should not empty the
 *   rest of a commute, so an item that does not fit is passed over and the walk continues.
 * - **Nothing overruns.** An episode is included only if what remains of it fits in what
 *   remains of the budget, so the queue can be handed over as "this fits" without an asterisk.
 *   An episode that runs past arrival is fine in life and wrong in a promise.
 */
export function fillTimeBudget(
  episodes: ListeningEpisode[] = [],
  budgetSeconds: number,
  { lookup = {}, minimumFitSeconds = 60 }: TimeBudgetOptions = {}
): TimeBudgetQueue {
  const budget = Number.isFinite(budgetSeconds) ? Math.max(0, budgetSeconds) : 0
  const chosen: ListeningEpisode[] = []
  let used = 0

  for (const episode of episodes) {
    const left = budget - used
    if (left < minimumFitSeconds) break

    const remaining = episodeRemainingSeconds(episode, lookup)
    // Unknown length, or nothing left to hear: not a candidate either way.
    if (remaining === null || remaining <= 0) continue
    if (remaining > left) continue

    chosen.push(episode)
    used += remaining
  }

  return { episodes: chosen, totalSeconds: used, remainingSeconds: Math.max(0, budget - used) }
}
