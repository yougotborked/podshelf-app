import type { AuthorEntity, LibraryItem } from '~/types'

/**
 * The authors page's list when the server cannot be reached: one entry per distinct author name
 * across the downloaded books, counted, A to Z.
 *
 * A downloaded book keeps its authors as `{ id, name }` records, the way the server sent them. The
 * page used to read each one as the name string itself and call toLowerCase() on the record,
 * which throws, so this list could never be built from downloads - the one case it exists for.
 * Names are compared case-insensitively, so "ann leckie" and "Ann Leckie" are one author, keeping
 * the spelling seen first.
 */
export function buildAuthorsFromItems(items: LibraryItem[], libraryId: string | null): AuthorEntity[] {
  const byName = new Map<string, AuthorEntity & { books: number; numAudiobooks: number }>()

  for (const item of items) {
    for (const { name } of item.media.metadata.authors || []) {
      if (!name) continue
      const key = name.toLowerCase()
      let entry = byName.get(key)
      if (!entry) {
        entry = { id: `local_author_${key}`, name, displayName: name, books: 0, numAudiobooks: 0, libraryId }
        byName.set(key, entry)
      }
      entry.books += 1
      entry.numAudiobooks += 1
    }
  }

  return [...byName.values()].sort((a, b) => a.name.localeCompare(b.name))
}
