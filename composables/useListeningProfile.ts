/**
 * What someone's listening looks like, and how well a podcast they have not heard fits it.
 *
 * The roadmap's angle for discovery is that genre is the weakest signal available: someone
 * working through a marathon-length show is in a particular mood, and the useful suggestion is
 * another long-form one rather than another one about the same subject. So the profile here is
 * built from the *shape* of listening - how long the episodes are that actually get finished -
 * alongside the subjects, and both are read from data the app already holds.
 *
 * Nothing here infers anything. It is arithmetic over progress rows the server already sent.
 */

/** Episode length bands, in seconds. The boundaries are where listening habits actually differ. */
export const DURATION_BANDS = [
  { id: 'short', label: 'short', max: 20 * 60 },
  { id: 'medium', label: 'medium', max: 45 * 60 },
  { id: 'long', label: 'long', max: 120 * 60 },
  { id: 'marathon', label: 'marathon', max: Infinity }
] as const

export type DurationBandId = (typeof DURATION_BANDS)[number]['id']

/**
 * Below this there is not enough finished listening to say anything, and a confident-looking
 * recommendation built on two episodes is worse than none - it is wrong in a way that looks
 * considered.
 */
export const MIN_FINISHED_FOR_PROFILE = 5

export interface ProgressRow {
  libraryItemId?: string
  episodeId?: string | null
  duration?: number
  isFinished?: boolean
  [key: string]: unknown
}

/** A podcast in the user's library, as far as this needs to know. */
export interface ProfilePodcast {
  id?: string
  genres?: string[]
  [key: string]: unknown
}

export interface ListeningProfile {
  episodesFinished: number
  /** Finished episodes per band. */
  bandCounts: Record<DurationBandId, number>
  /** The band they finish most, or null when there is not enough to say. */
  preferredBand: DurationBandId | null
  /** Genre to finished-episode count, highest first. */
  genreWeights: Record<string, number>
  topGenres: string[]
  /** False when the profile is too thin to recommend from. */
  isConfident: boolean
}

export function durationBand(seconds: number | undefined | null): DurationBandId | null {
  if (typeof seconds !== 'number' || !isFinite(seconds) || seconds <= 0) return null
  return (DURATION_BANDS.find((band) => seconds <= band.max) as (typeof DURATION_BANDS)[number]).id
}

/** Human phrasing for a band, for the one line that explains a suggestion. */
export function describeBand(band: DurationBandId | null): string {
  if (band === 'short') return 'short episodes'
  if (band === 'medium') return 'half-hour episodes'
  if (band === 'long') return 'long episodes'
  if (band === 'marathon') return 'marathon episodes'
  return 'episodes'
}

/**
 * Builds the profile from finished episodes only.
 *
 * Finishing is the signal. Starting something is a reaction to its title; finishing it is a
 * verdict, and counting both together lets a show someone abandoned twice argue for more like
 * itself.
 */
export function buildListeningProfile(progress: ProgressRow[] = [], podcastsById: Record<string, ProfilePodcast> = {}): ListeningProfile {
  const bandCounts: Record<DurationBandId, number> = { short: 0, medium: 0, long: 0, marathon: 0 }
  const genreWeights: Record<string, number> = {}
  let episodesFinished = 0

  for (const row of progress) {
    if (!row?.isFinished) continue
    episodesFinished++

    const band = durationBand(row.duration)
    if (band) bandCounts[band]++

    const podcast = row.libraryItemId ? podcastsById[row.libraryItemId] : undefined
    for (const genre of podcast?.genres || []) {
      genreWeights[genre] = (genreWeights[genre] || 0) + 1
    }
  }

  const bandEntries = (Object.entries(bandCounts) as [DurationBandId, number][]).filter(([, n]) => n > 0)
  bandEntries.sort((a, b) => b[1] - a[1])

  const isConfident = episodesFinished >= MIN_FINISHED_FOR_PROFILE

  return {
    episodesFinished,
    bandCounts,
    preferredBand: isConfident ? (bandEntries[0]?.[0] ?? null) : null,
    genreWeights,
    topGenres: Object.entries(genreWeights)
      .sort((a, b) => b[1] - a[1])
      .map(([genre]) => genre),
    isConfident
  }
}

export interface DiscoveryCandidate {
  genres?: string[]
  [key: string]: unknown
}

export interface CandidateScore {
  score: number
  /** Short phrases explaining the score, for the line under a card. */
  reasons: string[]
}

/**
 * How well a candidate matches the profile, as a score and the reasons for it.
 *
 * Genre overlap is weighted by how much of the person's listening each genre represents, so one
 * shared genre they listen to constantly beats three they have touched once. The reasons are
 * returned rather than rendered so the caller decides how much to show.
 */
export function scoreCandidate(candidate: DiscoveryCandidate, profile: ListeningProfile): CandidateScore {
  if (!profile.isConfident) return { score: 0, reasons: [] }

  const reasons: string[] = []
  let score = 0

  const shared = (candidate.genres || []).filter((genre) => (profile.genreWeights[genre] ?? 0) > 0)
  if (shared.length) {
    const total = Object.values(profile.genreWeights).reduce((n, v) => n + v, 0) || 1
    // Share of finished listening the overlapping genres account for, so the scale does not
    // depend on how many episodes someone happens to have finished overall
    const weight = shared.reduce((n, genre) => n + (profile.genreWeights[genre] ?? 0), 0) / total
    score += weight
    reasons.push(`you listen to ${shared.slice(0, 2).join(' and ')}`)
  }

  return { score: Math.round(score * 1000) / 1000, reasons }
}

/**
 * Candidates ordered by fit, strongest first.
 *
 * Array.prototype.sort is stable, so equal scores keep the chart's own order - and with no
 * profile every score is 0, which leaves the chart exactly as it came. That is the right
 * behaviour before there is anything to rank by: the charts are a reasonable default, and
 * reordering them on no evidence would only make them arbitrary.
 */
export function rankCandidates<T extends DiscoveryCandidate>(candidates: T[] = [], profile: ListeningProfile): (T & { match: CandidateScore })[] {
  return candidates.map((candidate) => ({ ...candidate, match: scoreCandidate(candidate, profile) })).sort((a, b) => b.match.score - a.match.score)
}

/**
 * How a show's typical episode compares with what this person actually finishes.
 *
 * Shown on the preview, where the feed has already been fetched, so it costs nothing extra. It
 * is the part of the roadmap's "shape of listening" that a genre list cannot express: a
 * four-hour show is a different proposition from a twenty-minute one whatever it is about.
 */
export function describeLengthFit(episodeDurations: number[] = [], profile: ListeningProfile): string | null {
  const usable = episodeDurations.filter((d) => typeof d === 'number' && isFinite(d) && d > 0)
  if (!usable.length) return null

  // Median, not mean: one feed-length omnibus should not redefine a show's typical episode
  const sorted = [...usable].sort((a, b) => a - b)
  const median = sorted[Math.floor(sorted.length / 2)]
  if (median === undefined) return null
  const band = durationBand(median)
  if (!band) return null

  const minutes = Math.round(median / 60)
  const typical = minutes >= 60 ? `${Math.round((minutes / 60) * 10) / 10} hr` : `${minutes} min`

  if (!profile.isConfident || !profile.preferredBand) return `Typically ${typical}`
  if (band === profile.preferredBand) return `Typically ${typical} — about the length you usually finish`

  const order = DURATION_BANDS.map((b) => b.id)
  const longer = order.indexOf(band) > order.indexOf(profile.preferredBand)
  return `Typically ${typical} — ${longer ? 'longer' : 'shorter'} than most of what you finish`
}
