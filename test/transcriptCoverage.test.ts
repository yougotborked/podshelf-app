import { describe, expect, it } from 'vitest'
// A plain .mjs script, imported for the pure functions it exports.
import { analyseFeed, isTimedFormat, parseAttributes, parseTranscripts, percent, splitItems, summarise, verdict } from '~/scripts/check-transcripts.mjs'

// Roadmap item 5 rests on one number: how many feeds publish transcripts, and how many of those
// carry timings. Without timings there is nothing to cut, so a story can be described but not
// played - which is the difference between the feature and a summary.

const ITEM = (inner: string) => `<item><title>Ep</title>${inner}</item>`

describe('parseAttributes', () => {
  it('reads double and single quoted values', () => {
    expect(parseAttributes(`<podcast:transcript url="a.vtt" type='text/vtt' />`)).toEqual({ url: 'a.vtt', type: 'text/vtt' })
  })

  it('lowercases attribute names, which feeds vary on', () => {
    expect((parseAttributes(`<podcast:transcript URL="a.vtt" TYPE="text/vtt" />`) as Record<string, string>).url).toBe('a.vtt')
  })

  it('survives a tag with no attributes', () => {
    expect(parseAttributes('<item>')).toEqual({})
  })
})

describe('parseTranscripts', () => {
  it('finds a transcript on an episode', () => {
    const [t] = parseTranscripts(ITEM(`<podcast:transcript url="https://x/a.vtt" type="text/vtt" language="en" />`))
    expect(t?.url).toBe('https://x/a.vtt')
    expect(t?.type).toBe('text/vtt')
    expect(t?.language).toBe('en')
  })

  it('finds several, since a feed may publish more than one format', () => {
    const transcripts = parseTranscripts(ITEM(`<podcast:transcript url="a.vtt" type="text/vtt"/><podcast:transcript url="a.srt" type="application/srt"/>`))
    expect(transcripts.map((t: { type: string }) => t.type)).toEqual(['text/vtt', 'application/srt'])
  })

  it('records a missing type as unknown rather than dropping the transcript', () => {
    // The spec requires type, feeds in the wild omit it, and the publisher still meant to say
    // a transcript exists
    expect(parseTranscripts(ITEM(`<podcast:transcript url="a.vtt" />`))[0]?.type).toBe('unknown')
  })

  it('ignores a declaration with no url, which points at nothing', () => {
    expect(parseTranscripts(ITEM(`<podcast:transcript type="text/vtt" />`))).toEqual([])
  })

  it('marks rel=captions', () => {
    expect(parseTranscripts(ITEM(`<podcast:transcript url="a.vtt" type="text/vtt" rel="captions"/>`))[0]?.isCaptions).toBe(true)
  })

  it('finds nothing in an episode without one', () => {
    expect(parseTranscripts(ITEM('<enclosure url="a.mp3"/>'))).toEqual([])
  })
})

describe('isTimedFormat', () => {
  it('accepts the formats that carry timings', () => {
    expect(isTimedFormat('text/vtt')).toBe(true)
    expect(isTimedFormat('application/srt')).toBe(true)
    expect(isTimedFormat('application/x-subrip')).toBe(true)
    expect(isTimedFormat('application/json')).toBe(true)
  })

  it('rejects prose formats, which cannot be cut into playable segments', () => {
    expect(isTimedFormat('text/html')).toBe(false)
    expect(isTimedFormat('text/plain')).toBe(false)
    expect(isTimedFormat('unknown')).toBe(false)
  })

  it('is case-insensitive and safe on nothing', () => {
    expect(isTimedFormat('TEXT/VTT')).toBe(true)
    expect(isTimedFormat(undefined)).toBe(false)
  })
})

describe('splitItems', () => {
  it('splits episodes', () => {
    expect(splitItems(`<rss><channel>${ITEM('<a/>')}${ITEM('<b/>')}</channel></rss>`)).toHaveLength(2)
  })

  it('starts an episode at <item>, not at any element whose name begins with it', () => {
    // Without the boundary this starts matching at <itemized> and swallows everything up to the
    // real episode's closing tag - one "episode" containing another element's content
    const items = splitItems('<itemized>junk</itemized><item><title>Real</title></item>')
    expect(items).toHaveLength(1)
    expect(items[0]).not.toContain('junk')
  })

  it('is safe on an empty or unparseable feed', () => {
    expect(splitItems('')).toEqual([])
    expect(splitItems(undefined)).toEqual([])
  })
})

describe('analyseFeed', () => {
  const feed = `<rss><channel>
    ${ITEM('<podcast:transcript url="1.vtt" type="text/vtt"/>')}
    ${ITEM('<podcast:transcript url="2.html" type="text/html"/>')}
    ${ITEM('<enclosure url="3.mp3"/>')}
  </channel></rss>`

  it('counts episodes, transcripts and timed transcripts separately', () => {
    const result = analyseFeed(feed)
    expect(result.episodes).toBe(3)
    expect(result.withTranscript).toBe(2)
    expect(result.withTimed).toBe(1)
  })

  it('counts an episode once however many transcripts it declares', () => {
    const result = analyseFeed(`<rss>${ITEM('<podcast:transcript url="a.vtt" type="text/vtt"/><podcast:transcript url="a.srt" type="application/srt"/>')}</rss>`)
    expect(result.withTranscript).toBe(1)
    expect(result.withTimed).toBe(1)
    expect(result.formats).toEqual({ 'text/vtt': 1, 'application/srt': 1 })
  })

  it('reports nothing for a feed with no transcripts', () => {
    expect(analyseFeed(`<rss>${ITEM('<enclosure url="a.mp3"/>')}</rss>`)).toEqual({ episodes: 1, withTranscript: 0, withTimed: 0, formats: {} })
  })
})

describe('summarise', () => {
  const feed = (over: Record<string, unknown> = {}) => ({ episodes: 10, withTranscript: 0, withTimed: 0, formats: {}, ...over })

  it('counts shows and episodes separately, since one show can carry many episodes', () => {
    const s = summarise([feed({ withTranscript: 10, withTimed: 10, formats: { 'text/vtt': 10 } }), feed()])
    expect(s.feedsWithAny).toBe(1)
    expect(s.episodes).toBe(20)
    expect(s.episodesWithTranscript).toBe(10)
  })

  it('counts a show as mostly covered only at 90% of its episodes', () => {
    // A show that transcribed two episodes is not something a story can be followed across
    expect(summarise([feed({ withTranscript: 9 })]).feedsMostlyCovered).toBe(1)
    expect(summarise([feed({ withTranscript: 8 })]).feedsMostlyCovered).toBe(0)
  })

  it('keeps failed feeds out of the totals but reports them', () => {
    const s = summarise([feed({ withTranscript: 10 }), { ...feed(), error: 'HTTP 404' }])
    expect(s.feedsFailed).toBe(1)
    expect(s.episodes).toBe(10)
  })

  it('merges format counts across feeds', () => {
    const s = summarise([feed({ formats: { 'text/vtt': 3 } }), feed({ formats: { 'text/vtt': 2, 'text/html': 1 } })])
    expect(s.formats).toEqual({ 'text/vtt': 5, 'text/html': 1 })
  })
})

describe('percent', () => {
  it('rounds to one decimal', () => {
    expect(percent(1, 3)).toBe(33.3)
  })

  it('is zero rather than NaN when there is nothing to divide', () => {
    expect(percent(0, 0)).toBe(0)
  })
})

describe('verdict', () => {
  const summary = (over: Record<string, unknown>) => ({ feeds: 20, feedsFailed: 0, feedsWithAny: 0, feedsWithTimed: 0, feedsMostlyCovered: 0, episodes: 1000, episodesWithTranscript: 0, episodesWithTimed: 0, formats: {}, ...over })

  it('says do not build it when nothing carries timings', () => {
    expect(verdict(summary({}))).toMatch(/Do not build this on feed transcripts/)
  })

  it('calls one or two shows too thin, because a story needs several covering it', () => {
    expect(verdict(summary({ feedsWithTimed: 2, episodesWithTimed: 900 }))).toMatch(/too thin/)
  })

  it('offers a narrow trial when shows exist but coverage is sparse', () => {
    expect(verdict(summary({ feedsWithTimed: 5, episodesWithTimed: 100 }))).toMatch(/narrow trial/)
  })

  it('backs the feature when both the shows and the coverage are there', () => {
    expect(verdict(summary({ feedsWithTimed: 8, episodesWithTimed: 500 }))).toMatch(/real base/)
  })
})
