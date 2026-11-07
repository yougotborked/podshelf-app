package com.audiobookshelf.app.player

/**
 * Where the queue should start a downloaded item it advances to.
 *
 * A downloaded item's session starts from this device's own progress record. That record only
 * hears about listening the server saw while the app was open to receive it, so an episode
 * half-heard by streaming came back from the beginning when the queue moved on to its download.
 *
 * The webview knows better when it builds the queue - it holds the server's progress as well -
 * and sends that position along with the time it was recorded. This picks whichever record is
 * newer, so listening done on this device after the queue was built still wins.
 *
 * A finished local record restarts from the top, as it did before; the queued position is
 * already null for anything finished.
 */
fun queuedResumeTime(
        localCurrentTime: Double?,
        localIsFinished: Boolean,
        localLastUpdate: Long?,
        queuedStartTime: Double?,
        queuedLastUpdate: Long?
): Double {
  val local = if (localIsFinished) 0.0 else localCurrentTime ?: 0.0
  if (queuedStartTime == null || queuedStartTime <= 0.0) return local
  if (localLastUpdate != null && queuedLastUpdate != null && localLastUpdate > queuedLastUpdate) {
    return local
  }
  return queuedStartTime
}
