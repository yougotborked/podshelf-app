import { describe, expect, it } from 'vitest'
import { buildListeningProfile, describeBand, describeLengthFit, durationBand, MIN_FINISHED_FOR_PROFILE, rankCandidates, scoreCandidate, type ProgressRow } from '~/composables/useListeningProfile'

// Roadmap item 4's angle is that genre is the weakest signal: someone working through a
// marathon show wants another long one, not another one on the same subject. So the profile is
// built from the shape of what gets finished, and these cover the judgements in that.

const MIN = 60
function finished(duration: number, libraryItemId = 'li-1'): ProgressRow {
  return { libraryItemId, duration, isFinished: true }
}

/** A profile with enough finished listening to be trusted. */
function profileOf(rows: ProgressRow[], podcasts: Record<string, { genres: string[] }> = {}) {
  return buildListeningProfile(rows, podcasts)
}

describe('durationBand', () => {
  it('bands by length', () => {
    expect(durationBand(10 * MIN)).toBe('short')
    expect(durationBand(30 * MIN)).toBe('medium')
    expect(durationBand(90 * MIN)).toBe('long')
    expect(durationBand(300 * MIN)).toBe('marathon')
  })

  it('puts a boundary value in the lower band', () => {
    expect(durationBand(20 * MIN)).toBe('short')
    expect(durationBand(20 * MIN + 1)).toBe('medium')
  })

  it('is null for a duration that says nothing', () => {
    expect(durationBand(0)).toBeNull()
    expect(durationBand(undefined)).toBeNull()
    expect(durationBand(Number.NaN)).toBeNull()
  })
})

describe('buildListeningProfile', () => {
  it('counts only finished episodes', () => {
    // Starting something is a reaction to its title; finishing it is a verdict
    const profile = profileOf([finished(30 * MIN), { libraryItemId: 'li-1', duration: 30 * MIN, isFinished: false }])
    expect(profile.episodesFinished).toBe(1)
  })

  it('prefers the band it finishes most', () => {
    const profile = profileOf([...Array(6).fill(finished(100 * MIN)), finished(10 * MIN)])
    expect(profile.preferredBand).toBe('long')
  })

  it('weights genres by finished episodes, not by how many shows carry them', () => {
    const profile = profileOf([finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'b')], { a: { genres: ['News'] }, b: { genres: ['Comedy'] } })
    expect(profile.genreWeights).toEqual({ News: 5, Comedy: 1 })
    expect(profile.topGenres[0]).toBe('News')
  })

  it('refuses to be confident on a thin history', () => {
    // A considered-looking recommendation built on two episodes is worse than none
    const thin = profileOf([finished(30 * MIN), finished(30 * MIN)])
    expect(thin.isConfident).toBe(false)
    expect(thin.preferredBand).toBeNull()
  })

  it('becomes confident exactly at the threshold', () => {
    expect(profileOf(Array(MIN_FINISHED_FOR_PROFILE).fill(finished(30 * MIN))).isConfident).toBe(true)
    expect(profileOf(Array(MIN_FINISHED_FOR_PROFILE - 1).fill(finished(30 * MIN))).isConfident).toBe(false)
  })

  it('survives rows with no duration or no matching podcast', () => {
    const profile = profileOf([{ isFinished: true }, finished(30 * MIN, 'missing')])
    expect(profile.episodesFinished).toBe(2)
    expect(profile.bandCounts.medium).toBe(1)
  })

  it('is empty for someone who has finished nothing', () => {
    expect(buildListeningProfile().episodesFinished).toBe(0)
    expect(buildListeningProfile().isConfident).toBe(false)
  })
})

describe('scoreCandidate', () => {
  const profile = profileOf([finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'a'), finished(30 * MIN, 'b'), finished(30 * MIN, 'b')], { a: { genres: ['News'] }, b: { genres: ['Comedy'] } })

  it('scores a shared genre above an unrelated one', () => {
    expect(scoreCandidate({ genres: ['News'] }, profile).score).toBeGreaterThan(scoreCandidate({ genres: ['Fiction'] }, profile).score)
  })

  it('weights by how much listening a genre represents, not by how many genres match', () => {
    // News is 4 of 6 finished episodes; Comedy is 2. One heavily-listened match beats a lighter one
    expect(scoreCandidate({ genres: ['News'] }, profile).score).toBeGreaterThan(scoreCandidate({ genres: ['Comedy'] }, profile).score)
  })

  it('explains itself', () => {
    expect(scoreCandidate({ genres: ['News'] }, profile).reasons[0]).toMatch(/you listen to News/)
  })

  it('scores nothing, and says nothing, without a confident profile', () => {
    const thin = profileOf([finished(30 * MIN, 'a')], { a: { genres: ['News'] } })
    expect(scoreCandidate({ genres: ['News'] }, thin)).toEqual({ score: 0, reasons: [] })
  })

  it('handles a candidate with no genres', () => {
    expect(scoreCandidate({}, profile).score).toBe(0)
  })
})

describe('rankCandidates', () => {
  const profile = profileOf(Array(6).fill(finished(30 * MIN, 'a')), { a: { genres: ['News'] } })

  it('puts the best fit first', () => {
    const ranked = rankCandidates(
      [
        { id: 1, genres: ['Fiction'] },
        { id: 2, genres: ['News'] }
      ],
      profile
    )
    expect(ranked[0]?.id).toBe(2)
  })

  it('leaves the chart order alone when there is no profile to rank by', () => {
    // The charts are a reasonable default; reordering them on no evidence makes them arbitrary
    const thin = buildListeningProfile()
    const ranked = rankCandidates([{ id: 1 }, { id: 2 }, { id: 3 }], thin)
    expect(ranked.map((c) => c.id)).toEqual([1, 2, 3])
  })

  it('is stable among equal scores, so the chart order survives within a tier', () => {
    const ranked = rankCandidates(
      [
        { id: 1, genres: ['Fiction'] },
        { id: 2, genres: ['Fiction'] },
        { id: 3, genres: ['News'] }
      ],
      profile
    )
    expect(ranked.map((c) => c.id)).toEqual([3, 1, 2])
  })

  it('attaches the match to every candidate, scored or not', () => {
    expect(rankCandidates([{ id: 1 }], profile)[0]?.match).toBeDefined()
  })
})

describe('describeLengthFit', () => {
  const longListener = profileOf(Array(6).fill(finished(100 * MIN)))

  it('uses the median, so one omnibus does not redefine a show', () => {
    const fit = describeLengthFit([30 * MIN, 30 * MIN, 30 * MIN, 600 * MIN], longListener)
    expect(fit).toMatch(/^Typically 30 min/)
  })

  it('says when a show matches the length they usually finish', () => {
    expect(describeLengthFit([100 * MIN, 100 * MIN], longListener)).toMatch(/about the length you usually finish/)
  })

  it('says when a show is shorter than their habit', () => {
    expect(describeLengthFit([10 * MIN, 10 * MIN], longListener)).toMatch(/shorter than most of what you finish/)
  })

  it('says when a show is longer than their habit', () => {
    const shortListener = profileOf(Array(6).fill(finished(10 * MIN)))
    expect(describeLengthFit([100 * MIN], shortListener)).toMatch(/longer than most of what you finish/)
  })

  it('still states the length without a confident profile, making no claim about fit', () => {
    const fit = describeLengthFit([45 * MIN], buildListeningProfile())
    expect(fit).toBe('Typically 45 min')
  })

  it('switches to hours once an episode is long enough for minutes to read badly', () => {
    expect(describeLengthFit([240 * MIN], buildListeningProfile())).toMatch(/Typically 4 hr/)
  })

  it('is null when no duration is usable', () => {
    expect(describeLengthFit([], buildListeningProfile())).toBeNull()
    expect(describeLengthFit([0, Number.NaN], buildListeningProfile())).toBeNull()
  })
})

describe('describeBand', () => {
  it('phrases each band for a sentence', () => {
    expect(describeBand('marathon')).toBe('marathon episodes')
    expect(describeBand(null)).toBe('episodes')
  })
})
