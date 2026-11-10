import { defineStore } from 'pinia'

interface Library {
  id: string
  name: string
  mediaType: string
  settings?: Record<string, unknown>
  [key: string]: unknown
}

interface LibrariesState {
  libraries: Library[]
  lastLoad: number
  currentLibraryId: string
  showModal: boolean
  issues: number
  filterData: Record<string, unknown> | null
  numUserPlaylists: number
  ereaderDevices: unknown[]
  offlineMediaTypes: string[]
}

export const useLibrariesStore = defineStore('libraries', {
  state: (): LibrariesState => ({
    libraries: [],
    lastLoad: 0,
    currentLibraryId: '',
    showModal: false,
    issues: 0,
    filterData: null,
    numUserPlaylists: 0,
    ereaderDevices: [],
    offlineMediaTypes: []
  }),

  getters: {
    getCurrentLibrary: (state) => state.libraries.find((lib) => lib.id === state.currentLibraryId),
    getCurrentLibraryName: (state) => {
      return state.libraries.find((lib) => lib.id === state.currentLibraryId)?.name || null
    },
    getCurrentLibraryMediaType: (state) => {
      const lib = state.libraries.find((l) => l.id === state.currentLibraryId)
      const type = lib?.mediaType
      if (type) return type
      if (state.offlineMediaTypes.includes('podcast') && !state.offlineMediaTypes.includes('book')) return 'podcast'
      if (state.offlineMediaTypes.includes('book') && !state.offlineMediaTypes.includes('podcast')) return 'book'
      return null
    },
    getOfflineMediaTypes: (state) => state.offlineMediaTypes,
    getCurrentLibrarySettings: (state) => {
      return state.libraries.find((lib) => lib.id === state.currentLibraryId)?.settings || null
    },
    getLibraryIsAudiobooksOnly: (state) => {
      const lib = state.libraries.find((l) => l.id === state.currentLibraryId)
      return !!(lib?.settings as Record<string, unknown> | undefined)?.audiobooksOnly
    }
  },

  actions: {
    async fetch(libraryId: string) {
      const userStore = useUserStore()
      if (!userStore.user) {
        console.error('libraries/fetch - User not set')
        return false
      }
      const nativeHttp = useNativeHttp()
      try {
        const data = await nativeHttp.get(`/api/libraries/${libraryId}?include=filterdata`, { connectTimeout: 10000 }) as Record<string, unknown>
        const library = data.library as Library
        const filterData = data.filterdata as Record<string, unknown>
        const issues = (data.issues as number) || 0
        const numUserPlaylists = (data.numUserPlaylists as number) || 0

        const userStore2 = useUserStore()
        userStore2.checkUpdateLibrarySortFilter(library.mediaType)

        this.addUpdate(library)
        this.issues = issues
        this.filterData = filterData
        this.numUserPlaylists = numUserPlaylists
        this.currentLibraryId = libraryId
        return data
      } catch (error) {
        console.error('Failed', error)
        return false
      }
    },

    /**
     * Restores the library list from the on-device cache.
     *
     * The home screen picks its layout from the current library's media type, so with no
     * libraries the podcast view - Catch up feed and all - simply does not render. Falling back
     * to the cache keeps the app looking and working the same when the server is unreachable.
     */
    async loadCachedLibraries() {
      if (this.libraries.length) {
        await this.restoreCurrentLibraryId()
        return true
      }
      const cached = (await useLocalStore().getCachedLibraries()) as Library[]
      if (!cached.length) return false
      this.libraries = cached
      await this.restoreCurrentLibraryId()
      return true
    },

    /** Picks the selected library, preferring the one the user last had open. */
    async restoreCurrentLibraryId() {
      if (this.currentLibraryId && this.libraries.some((li) => li.id === this.currentLibraryId)) return
      const lastLibraryId = await useLocalStore().getLastLibraryId()
      if (lastLibraryId && this.libraries.some((li) => li.id === lastLibraryId)) {
        this.currentLibraryId = lastLibraryId
      } else if (this.libraries[0]) {
        this.currentLibraryId = this.libraries[0].id
      }
    },

    async load() {
      const userStore = useUserStore()
      if (!userStore.user) {
        // Not signed in to the server yet - offline, or still connecting
        return this.loadCachedLibraries()
      }
      const lastLoadDiff = Date.now() - this.lastLoad
      if (lastLoadDiff < 5 * 60 * 1000) return false

      const nativeHttp = useNativeHttp()
      try {
        const data = await nativeHttp.get('/api/libraries', { connectTimeout: 10000 }) as Record<string, unknown>
        const libraries = (data.libraries || data) as Library[]
        const firstLibrary = libraries[0]
        if (firstLibrary && (!this.currentLibraryId || !libraries.find((li) => li.id == this.currentLibraryId))) {
          this.currentLibraryId = firstLibrary.id
        }
        this.libraries = libraries
        this.lastLoad = Date.now()
        await useLocalStore().setCachedLibraries(libraries)
        return true
      } catch (error) {
        console.error('Failed', error)
        // Keep whatever is known rather than emptying the list - wiping it collapses the layout
        return this.loadCachedLibraries()
      }
    },

    async updateOfflineMediaTypes() {
      const db = useDb()
      const items = await db.getLocalLibraryItems() as { mediaType: string }[]
      this.offlineMediaTypes = [...new Set(items.map((li) => li.mediaType))]
    },

    reset() {
      this.lastLoad = 0
      this.currentLibraryId = ''
      this.libraries = []
    },

    addUpdate(library: Library) {
      const index = this.libraries.findIndex((a) => a.id === library.id)
      if (index >= 0) {
        this.libraries.splice(index, 1, library)
      } else {
        this.libraries.push(library)
      }
    },

    remove(library: Library) {
      this.libraries = this.libraries.filter((a) => a.id !== library.id)
    },

    updateFilterDataWithAudiobook(audiobook: Record<string, unknown> | null | undefined) {
      if (!audiobook || !audiobook.book || !this.filterData) return
      if (this.currentLibraryId !== audiobook.libraryId) return
      const book = audiobook.book as Record<string, unknown>
      const filterData = this.filterData as Record<string, string[] | undefined>
      const into = (key: string): string[] => (filterData[key] ??= [])
      if (book.authorFL) {
        (book.authorFL as string).split(', ').forEach((author) => {
          if (author && !into('authors').includes(author)) into('authors').push(author)
        })
      }
      if (book.narratorFL) {
        (book.narratorFL as string).split(', ').forEach((narrator) => {
          if (narrator && !into('narrators').includes(narrator)) into('narrators').push(narrator)
        })
      }
      if (book.series && !into('series').includes(book.series as string)) {
        into('series').push(book.series as string)
      }
      const tags = audiobook.tags as string[] | null | undefined || []
      tags.forEach((tag) => {
        if (tag && !into('tags').includes(tag)) into('tags').push(tag)
      })
      const genres = (book.genres as string[] | null | undefined) || []
      genres.forEach((genre) => {
        if (genre && !into('genres').includes(genre)) into('genres').push(genre)
      })
    }
  }
})
