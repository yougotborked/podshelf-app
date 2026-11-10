// Playback
export interface PlayItemPayload {
  libraryItemId: string
  episodeId?: string | null
  serverLibraryItemId?: string | null
  serverEpisodeId?: string | null
  queue?: QueueItem[]
  queueIndex?: number
  startTime?: number
}

export interface QueueItem {
  libraryItemId: string
  episodeId: string | null
  serverLibraryItemId?: string | null
  serverEpisodeId?: string | null
  episode?: Record<string, unknown> | null
  localEpisode?: Record<string, unknown> | null
  localLibraryItem?: Record<string, unknown> | null
  [key: string]: unknown
}

export interface PlaybackSession {
  id: string
  libraryItemId?: string
  episodeId?: string
  localLibraryItemId?: string
  localEpisodeId?: string
  mediaPlayer?: string
  playMethod?: number
  localLibraryItem?: Record<string, unknown>
  [key: string]: unknown
}

export interface DeviceData {
  deviceSettings?: {
    jumpForwardTime?: number
    jumpBackwardsTime?: number
    enableAltView?: boolean
    lockOrientation?: string
    downloadUsingCellular?: string
    streamingUsingCellular?: string
    autoCacheUnplayedEpisodes?: boolean
    hapticFeedback?: string
    autoContinuePlaylists?: boolean
  }
  lastPlaybackSession?: PlaybackSession
  [key: string]: unknown
}

export interface ServerConnectionConfig {
  id: string
  name: string
  address: string
  token: string
  [key: string]: unknown
}

export interface UserSettings {
  mobileOrderBy: string
  mobileOrderDesc: boolean
  mobileFilterBy: string
  playbackRate: number
  collapseSeries: boolean
  collapseBookSeries: boolean
}

// Library items, as the server sends them (expanded) and as the device stores local copies. The
// two share a shape on purpose - a local item is a downloaded server item - so one type covers
// both and the fields only one side has are optional.
//
// Only what the app reads is declared. Everything is optional except identity, because the
// server omits fields (a podcast has no narrators, an item still scanning has no duration) and
// the old `any` hid every one of those: a read of an absent field is now a type error that asks
// what should happen, instead of a runtime `undefined` that decides for us.

export interface AuthorRef {
  id?: string
  name: string
}

export interface SeriesRef {
  id?: string
  name: string
  sequence?: string | null
}

export interface Chapter {
  id?: number
  start: number
  end: number
  title: string
}

export interface AudioTrack {
  index?: number
  startOffset?: number
  duration?: number
  title?: string
  contentUrl?: string
  mimeType?: string
  localFileId?: string
  metadata?: { size?: number; [key: string]: unknown }
  [key: string]: unknown
}

export interface EbookFile {
  ino?: string
  ebookFormat?: string
  // Local copies: which of the item's local files holds the book.
  localFileId?: string
  metadata?: { filename?: string; ext?: string; size?: number }
  [key: string]: unknown
}

export interface LibraryFile {
  ino?: string
  fileType?: string
  metadata?: { filename?: string; ext?: string; size?: number; relPath?: string }
  [key: string]: unknown
}

export interface MediaMetadata {
  title?: string
  subtitle?: string | null
  // Books list several authors; a podcast has one `author` string.
  authors?: AuthorRef[]
  author?: string | null
  narrators?: string[]
  series?: SeriesRef[]
  genres?: string[]
  publishedYear?: string | null
  description?: string | null
  explicit?: boolean
  abridged?: boolean
  language?: string | null
  // Podcast kind: 'episodic' or 'serial'.
  type?: string | null
  feedUrl?: string | null
  [key: string]: unknown
}

export interface PodcastEpisode {
  id: string
  // Local episodes carry the server's id so progress can be matched across the two copies.
  serverEpisodeId?: string | null
  localEpisodeId?: string | null
  localLibraryItemId?: string | null
  libraryItemId?: string
  title?: string
  subtitle?: string | null
  description?: string | null
  season?: string | null
  episode?: string | null
  episodeType?: string | null
  duration?: number
  publishedAt?: number | null
  size?: number
  audioFile?: Record<string, unknown>
  audioTrack?: AudioTrack
  // The local copy of a server episode, attached by the episode page.
  localEpisode?: PodcastEpisode | null
  chapters?: Chapter[]
  [key: string]: unknown
}

export interface LibraryItemMedia {
  metadata: MediaMetadata
  tags?: string[]
  coverPath?: string | null
  duration?: number
  size?: number
  numTracks?: number
  tracks?: AudioTrack[]
  chapters?: Chapter[]
  ebookFile?: EbookFile | null
  episodes?: PodcastEpisode[]
  [key: string]: unknown
}

export interface LibraryItem {
  id: string
  libraryId?: string
  mediaType?: 'book' | 'podcast' | string
  media: LibraryItemMedia
  libraryFiles?: LibraryFile[]
  // Local copies: the files on the device, and which one each audio track plays from.
  localFiles?: LocalFile[]
  isMissing?: boolean
  isInvalid?: boolean
  // Local copies only.
  isLocal?: boolean
  libraryItemId?: string
  serverAddress?: string
  serverUserId?: string
  serverConnectionConfigId?: string
  localLibraryItem?: LibraryItem | null
  rssFeed?: Record<string, unknown> | null
  [key: string]: unknown
}

// A folder on the device that holds downloaded media (an Android document tree, or the app's own
// storage under id `internal-<mediaType>`).
export interface LocalFolder {
  id: string
  name?: string
  mediaType?: string
  contentUrl?: string
  absolutePath?: string
  basePath?: string
  [key: string]: unknown
}

// What a rejected nativeHttp call carries: a thrown Error (no response) or the server's reply
// (status and body). Annotating a catch handler with this instead of `any` makes
// `error.response?.data` a checked read.
export interface HttpError {
  message?: string
  status?: number
  response?: { status?: number; data?: unknown }
}

// Where someone is in an item. The server's record and the device's copy share these fields; the
// local one adds the local ids. Numbers are optional because an item nobody has started has no
// record at all, and a book read only as an ebook has `ebookProgress` but no `progress`.
export interface MediaProgress {
  id: string
  libraryItemId?: string
  episodeId?: string | null
  progress?: number
  currentTime?: number
  duration?: number
  isFinished?: boolean
  finishedAt?: number | null
  lastUpdate?: number
  ebookProgress?: number
  ebookLocation?: string | null
  [key: string]: unknown
}

export interface LocalMediaProgress extends MediaProgress {
  localLibraryItemId: string
  localEpisodeId?: string | null
}

// One entry of a playlist: a server item (and episode) the server resolved, plus - when the
// device has a download of it - the local copy, which playback prefers.
export interface PlaylistItem {
  id?: string
  libraryItemId?: string
  episodeId?: string | null
  serverLibraryItemId?: string | null
  serverEpisodeId?: string | null
  localLibraryItemId?: string | null
  localEpisodeId?: string | null
  libraryItem?: LibraryItem
  episode?: PodcastEpisode | null
  localLibraryItem?: LibraryItem | null
  localEpisode?: PodcastEpisode | null
  [key: string]: unknown
}

export interface Playlist {
  id: string
  name?: string
  description?: string | null
  libraryId?: string
  items: PlaylistItem[]
  totalItems?: number
  // The "unfinished" playlist the app builds itself rather than the server storing.
  isAutoPlaylist?: boolean
  [key: string]: unknown
}

// A collection: an ordered set of books the server groups under a name.
export interface Collection {
  id: string
  name?: string
  description?: string | null
  libraryId?: string
  books: LibraryItem[]
  [key: string]: unknown
}

// A file on the device belonging to a downloaded item (an audio track, the ebook, a cover).
export interface LocalFile {
  id: string
  filename?: string
  basePath?: string
  contentUrl?: string
  mimeType?: string
  size?: number
  [key: string]: unknown
}
