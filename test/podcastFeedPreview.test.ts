import { describe, it, expect } from 'vitest'
import { normalizeFeedUrl, isSameFeed, indexLibraryByFeed, parseItunesDuration, parsePodcastFeed } from '../composables/usePodcastFeedPreview'

describe('normalizeFeedUrl', () => {
  it('ignores the scheme', () => {
    expect(isSameFeed('http://feeds.example.com/show', 'https://feeds.example.com/show')).toBe(true)
  })

  it('ignores a www prefix', () => {
    expect(isSameFeed('https://www.example.com/rss', 'https://example.com/rss')).toBe(true)
  })

  it('ignores a trailing slash', () => {
    expect(isSameFeed('https://example.com/rss/', 'https://example.com/rss')).toBe(true)
  })

  it('ignores case', () => {
    expect(isSameFeed('https://Example.COM/RSS', 'https://example.com/rss')).toBe(true)
  })

  // Hosting platforms bolt analytics onto the URL a directory publishes. Those are not identity.
  it('ignores query strings and fragments', () => {
    expect(isSameFeed('https://example.com/rss?utm_source=apple', 'https://example.com/rss')).toBe(true)
    expect(isSameFeed('https://example.com/rss#latest', 'https://example.com/rss')).toBe(true)
  })

  it('still tells different podcasts apart', () => {
    expect(isSameFeed('https://example.com/show-a', 'https://example.com/show-b')).toBe(false)
    expect(isSameFeed('https://a.example.com/rss', 'https://b.example.com/rss')).toBe(false)
  })

  it('treats a path as significant beyond the host', () => {
    expect(isSameFeed('https://example.com/a/rss', 'https://example.com/b/rss')).toBe(false)
  })

  it('never matches on nothing', () => {
    expect(isSameFeed(undefined, undefined)).toBe(false)
    expect(isSameFeed('', '')).toBe(false)
    expect(isSameFeed(null, 'https://example.com/rss')).toBe(false)
    expect(normalizeFeedUrl('   ')).toBe('')
  })

  // Directories do return malformed entries; URL() would throw on them.
  it('does not throw on a malformed url', () => {
    expect(() => normalizeFeedUrl('not a url at all')).not.toThrow()
    expect(normalizeFeedUrl('not a url at all')).toBe('not a url at all')
  })
})

describe('indexLibraryByFeed', () => {
  const items = [
    { id: 'li-1', feed: 'https://www.example.com/pod-save/' },
    { id: 'li-2', feed: 'http://other.example.com/rss?utm=1' },
    { id: 'li-3', feed: undefined }
  ]
  const index = indexLibraryByFeed(
    items,
    (i) => i.feed,
    (i) => i.id
  )

  it('finds a library item through a differently written url', () => {
    expect(index.get(normalizeFeedUrl('https://example.com/pod-save'))).toBe('li-1')
    expect(index.get(normalizeFeedUrl('https://other.example.com/rss'))).toBe('li-2')
  })

  it('skips items with no feed url', () => {
    expect(index.size).toBe(2)
  })

  it('keeps the first of a duplicate rather than the last', () => {
    const dupes = indexLibraryByFeed(
      [
        { id: 'first', feed: 'https://example.com/rss' },
        { id: 'second', feed: 'https://www.example.com/rss/' }
      ],
      (i) => i.feed,
      (i) => i.id
    )
    expect(dupes.get(normalizeFeedUrl('https://example.com/rss'))).toBe('first')
  })
})

describe('parsePodcastFeed', () => {
  const feed = `<?xml version="1.0"?>
    <rss><channel>
      <title>A Show</title>
      <description><![CDATA[<p>About the <b>show</b>.</p>]]></description>
      <item><title>Episode two</title><pubDate>Tue, 27 Oct 2026 00:00:00 GMT</pubDate><description>Second</description></item>
      <item><title>Episode one</title><pubDate>Mon, 26 Oct 2026 00:00:00 GMT</pubDate><description>First</description></item>
    </channel></rss>`

  it('reads the channel description, unwrapping CDATA and stripping markup', () => {
    expect(parsePodcastFeed(feed).description).toBe('About the show .')
  })

  it('reads episodes in feed order', () => {
    expect(parsePodcastFeed(feed).episodes.map((e) => e.title)).toEqual(['Episode two', 'Episode one'])
  })

  it('carries each episode its own date and description', () => {
    const [first] = parsePodcastFeed(feed).episodes
    expect(first.pubDate).toBe('Tue, 27 Oct 2026 00:00:00 GMT')
    expect(first.description).toBe('Second')
  })

  // The channel description is the one before the first <item>. Taking the document's first
  // <description> would silently show an episode's whenever the channel has none.
  it('does not mistake the first episode description for the channel one', () => {
    const noChannelDesc = `<rss><channel><title>T</title>
      <item><title>Ep</title><description>Episode text</description></item>
      </channel></rss>`
    expect(parsePodcastFeed(noChannelDesc).description).toBe('')
  })

  it('falls back to itunes:summary when there is no description', () => {
    const xml = `<rss><channel><itunes:summary>From iTunes</itunes:summary>
      <item><title>Ep</title></item></channel></rss>`
    expect(parsePodcastFeed(xml).description).toBe('From iTunes')
  })

  it('prefers itunes:summary over a description, which is often truncated', () => {
    const xml = `<rss><channel><description>Short</description><itunes:summary>The long one</itunes:summary>
      </channel></rss>`
    expect(parsePodcastFeed(xml).description).toBe('The long one')
  })

  it('decodes escaped entities', () => {
    const xml = `<rss><channel><description>Rock &amp; roll &quot;live&quot;</description></channel></rss>`
    expect(parsePodcastFeed(xml).description).toBe('Rock & roll "live"')
  })

  // Decoding the ampersand first turns &amp;lt; into a tag that then gets stripped.
  it('does not double-decode an escaped entity', () => {
    const xml = `<rss><channel><description>a &amp;lt;b&amp;gt; c</description></channel></rss>`
    expect(parsePodcastFeed(xml).description).toBe('a &lt;b&gt; c')
  })

  it('caps the episode list', () => {
    const items = Array.from({ length: 50 }, (_, i) => `<item><title>Ep ${i}</title></item>`).join('')
    expect(parsePodcastFeed(`<rss><channel>${items}</channel></rss>`, 20).episodes).toHaveLength(20)
  })

  it('skips an item with no title rather than listing a blank row', () => {
    const xml = `<rss><channel><item><description>no title</description></item><item><title>Real</title></item></channel></rss>`
    expect(parsePodcastFeed(xml).episodes.map((e) => e.title)).toEqual(['Real'])
  })

  it('survives junk, an empty feed and a non-string', () => {
    expect(parsePodcastFeed('')).toEqual({ description: '', episodes: [] })
    expect(parsePodcastFeed('not xml')).toEqual({ description: '', episodes: [] })
    expect(parsePodcastFeed(undefined as unknown as string)).toEqual({ description: '', episodes: [] })
  })

  // A good number of real feeds are not well-formed XML; DOMParser answers that with a
  // parsererror document rather than the ninety per cent that was fine.
  it('still reads a feed with an unclosed tag', () => {
    const xml = `<rss><channel><description>Fine</description><item><title>Ep</title></channel></rss>`
    const parsed = parsePodcastFeed(xml)
    expect(parsed.description).toBe('Fine')
  })
})

describe('parseItunesDuration', () => {
  it('reads the three shapes feeds use', () => {
    expect(parseItunesDuration('3600')).toBe(3600)
    expect(parseItunesDuration('45:30')).toBe(2730)
    expect(parseItunesDuration('1:02:03')).toBe(3723)
  })

  it('leaves anything that is not a length undefined rather than guessing', () => {
    for (const bad of ['', '  ', 'soon', '1:2:3:4', '-5', '12:xx', '0', undefined, null]) {
      expect(parseItunesDuration(bad)).toBeUndefined()
    }
  })
})

describe('parsePodcastFeed episode details', () => {
  const feed = `<rss><channel><description>Show</description>
    <item><title>One</title><pubDate>Mon, 03 Nov 2025 08:00:00 GMT</pubDate><itunes:duration>45:30</itunes:duration>
      <enclosure url="https://cdn.example/one.mp3?a=1&amp;b=2" length="1" type="audio/mpeg"/></item>
    <item><title>Two</title><pubDate>not a date</pubDate></item></channel></rss>`

  it('reads the date, length and audio url the preview shows', () => {
    // The preview template reads these; the parser used to return only title, date text and
    // description, so no date or length was ever shown and the length-fit hint never appeared.
    const [one] = parsePodcastFeed(feed).episodes
    expect(one?.publishedAt).toBe(Date.parse('Mon, 03 Nov 2025 08:00:00 GMT'))
    expect(one?.duration).toBe(2730)
    expect(one?.enclosureUrl).toBe('https://cdn.example/one.mp3?a=1&b=2')
  })

  it('omits what the feed does not give', () => {
    const two = parsePodcastFeed(feed).episodes[1]
    expect(two?.publishedAt).toBeUndefined()
    expect(two?.duration).toBeUndefined()
    expect(two?.enclosureUrl).toBeUndefined()
  })
})
