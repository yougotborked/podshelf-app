package com.audiobookshelf.app.data

import com.fasterxml.jackson.annotation.JsonIgnoreProperties

@JsonIgnoreProperties(ignoreUnknown = true)
data class PlayQueueItem(
    var libraryItemId: String = "",
    var episodeId: String? = null,
    /**
     * Where to resume, as the webview judged it from the newest record - server or device - when
     * it built the queue. Null for an item to start from the top. See queuedResumeTime.
     */
    var startTime: Double? = null,
    /** When that position was recorded, so a newer local record can still win. */
    var progressLastUpdate: Long? = null
)
