import { describe, expect, it } from 'vitest'
import { buildAuthorsFromItems } from '~/composables/useLocalAuthors'
import type { LibraryItem } from '~/types'

function book(id: string, authors: Array<{ id?: string; name: string }> | undefined): LibraryItem {
  return { id, media: { metadata: { title: id, authors } } }
}

describe('buildAuthorsFromItems', () => {
  it('lists each author once with a count of their downloaded books', () => {
    const result = buildAuthorsFromItems(
      [book('a', [{ id: '1', name: 'Ann Leckie' }]), book('b', [{ id: '1', name: 'Ann Leckie' }, { id: '2', name: 'N. K. Jemisin' }])],
      'lib1'
    )
    expect(result.map((a) => [a.name, a.books])).toEqual([['Ann Leckie', 2], ['N. K. Jemisin', 1]])
    expect(result[0]?.libraryId).toBe('lib1')
  })

  it('reads authors as records, not as name strings', () => {
    // The regression: each author was treated as the name itself and .toLowerCase() threw.
    expect(() => buildAuthorsFromItems([book('a', [{ id: '1', name: 'Ann Leckie' }])], null)).not.toThrow()
  })

  it('treats names that differ only in case as one author and keeps the first spelling', () => {
    const result = buildAuthorsFromItems([book('a', [{ name: 'ann leckie' }]), book('b', [{ name: 'Ann Leckie' }])], null)
    expect(result).toHaveLength(1)
    expect(result[0]?.name).toBe('ann leckie')
    expect(result[0]?.books).toBe(2)
  })

  it('sorts by name and skips books with no authors or an empty name', () => {
    const result = buildAuthorsFromItems([book('a', undefined), book('b', [{ name: '' }, { name: 'Zed' }, { name: 'Abe' }])], null)
    expect(result.map((a) => a.name)).toEqual(['Abe', 'Zed'])
  })
})
