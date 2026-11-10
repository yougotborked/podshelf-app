import { describe, expect, it } from 'vitest'
import {
  APPLE_GENRE_IDS,
  appleChartUrl,
  describeDiscoveryFailure,
  mergeChartWithLookup,
  parseChartEntries
} from '~/composables/usePodcastDiscovery'

describe('appleChartUrl', () => {
  it('builds the all-categories chart', () => {
    expect(appleChartUrl()).toBe('https://itunes.apple.com/us/rss/toppodcasts/limit=15/json')
  })

  it('adds the genre id for a known category', () => {
    expect(appleChartUrl({ category: 'News', limit: 10 })).toBe(
      'https://itunes.apple.com/us/rss/toppodcasts/limit=10/genre=1489/json'
    )
  })

  // An unknown category must fall back to the unfiltered chart. Interpolating an undefined id
  // would produce genre=undefined, which Apple answers with an empty feed - a silently empty tab.
  it('ignores a category it does not know rather than emitting a bad genre', () => {
    expect(appleChartUrl({ category: 'Knitting' })).not.toContain('genre')
  })

  it('clamps the limit and sanitises the storefront', () => {
    expect(appleChartUrl({ limit: 0 })).toContain('limit=1')
    expect(appleChartUrl({ limit: 9999 })).toContain('limit=200')
    expect(appleChartUrl({ country: 'GB' })).toContain('/gb/')
    expect(appleChartUrl({ country: 'not-a-country' })).toContain('/us/')
  })

  it('offers a genre id for every category the discover screen shows', () => {
    // Each of these was checked against the live chart feed and returned entries.
    for (const label of ['Comedy', 'True Crime', 'Technology', 'News', 'Science', 'History', 'Sports', 'Business']) {
      expect(APPLE_GENRE_IDS[label], label).toBeTypeOf('number')
    }
  })
})

describe('parseChartEntries', () => {
  const entry = (id: string, name: string) => ({
    id: { attributes: { 'im:id': id } },
    'im:name': { label: name },
    'im:artist': { label: `${name} Co` },
    'im:image': [{ label: 'small.png' }, { label: 'large.png' }]
  })

  it('reads ranked entries and takes the largest artwork', () => {
    const feeds = parseChartEntries({ feed: { entry: [entry('1', 'A'), entry('2', 'B')] } })
    expect(feeds.map((f) => f.id)).toEqual(['1', '2'])
    expect(feeds[0]?.title).toBe('A')
    expect(feeds[0]?.author).toBe('A Co')
    expect(feeds[0]?.artwork).toBe('large.png')
  })

  // Apple returns a bare object instead of an array when the chart has exactly one result.
  // Treating that as an array yields nothing, or throws, only in the rare case - in production.
  it('handles a single entry arriving unwrapped', () => {
    const feeds = parseChartEntries({ feed: { entry: entry('9', 'Only') } })
    expect(feeds).toHaveLength(1)
    expect(feeds[0]?.id).toBe('9')
  })

  it('returns nothing rather than throwing on an empty or malformed feed', () => {
    expect(parseChartEntries(undefined)).toEqual([])
    expect(parseChartEntries({})).toEqual([])
    expect(parseChartEntries({ feed: {} })).toEqual([])
    expect(parseChartEntries({ feed: { entry: [] } })).toEqual([])
    // An entry with no id cannot be looked up, so it is not an entry.
    expect(parseChartEntries({ feed: { entry: [{ 'im:name': { label: 'x' } }] } })).toEqual([])
  })
})

describe('mergeChartWithLookup', () => {
  const chart = [
    { id: '1', title: 'First', author: 'A', artwork: 'a.png' },
    { id: '2', title: 'Second', author: 'B', artwork: 'b.png' }
  ]

  it('keeps chart order, not lookup order', () => {
    const merged = mergeChartWithLookup(chart, [
      { collectionId: 2, feedUrl: 'https://two.xml' },
      { collectionId: 1, feedUrl: 'https://one.xml' }
    ])
    expect(merged.map((f) => f.id)).toEqual(['1', '2'])
    expect(merged[0]?.feedUrl).toBe('https://one.xml')
  })

  // The only thing to do with a discovered podcast is add it, which needs an RSS URL. A card
  // that cannot be actioned is worse than one fewer card.
  it('drops anything with no feed URL', () => {
    const merged = mergeChartWithLookup(chart, [{ collectionId: 1, feedUrl: 'https://one.xml' }, { collectionId: 2 }])
    expect(merged.map((f) => f.id)).toEqual(['1'])
  })

  it('prefers the larger artwork from the lookup', () => {
    const merged = mergeChartWithLookup(chart.slice(0, 1), [
      { collectionId: 1, feedUrl: 'f', artworkUrl600: 'big.png', artworkUrl100: 'small.png' }
    ])
    expect(merged[0]?.artwork).toBe('big.png')
  })

  it("strips Apple's catch-all Podcasts genre", () => {
    const merged = mergeChartWithLookup(chart.slice(0, 1), [
      { collectionId: 1, feedUrl: 'f', genres: ['News', 'Podcasts', 'Daily News'] }
    ])
    expect(merged[0]?.genres).toEqual(['News', 'Daily News'])
  })

  it('survives a lookup that returned nothing', () => {
    expect(mergeChartWithLookup(chart, [])).toEqual([])
  })
})

describe('describeDiscoveryFailure', () => {
  it('separates rate limiting, their outage, and everything else', () => {
    expect(describeDiscoveryFailure(429)).toBe('rate-limited')
    expect(describeDiscoveryFailure(503)).toBe('server-error')
    expect(describeDiscoveryFailure(404)).toBe('rejected')
  })
})
