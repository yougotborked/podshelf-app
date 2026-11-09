package com.podshelf.wear

import androidx.compose.ui.test.junit4.v2.createComposeRule
import androidx.compose.ui.test.onRoot
import com.github.takahirom.roborazzi.captureRoboImage
import com.podshelf.wear.player.NowPlayingContent
import com.podshelf.wearsync.DownloadStatus
import com.podshelf.wearsync.WearQueue
import com.podshelf.wearsync.WearQueueEntry
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * Renders the watch screens to PNG, for the Play listing and for looking at them.
 *
 * Play will not take a Wear OS app without at least one screenshot of its interface, and there
 * was no way to produce one here: the web harness drives the Nuxt app in a browser and this
 * module is native Compose, and an emulator would be software-rendered without KVM. Robolectric
 * renders the real composables instead - the same code the watch runs, at the watch's own
 * screen size - which is what Play asks for: the app interface, 1:1, no device frame.
 *
 * `qualifiers` is a round 384x384 watch, the size Play wants and the shape a Galaxy Watch is.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
// Robolectric 4.13 ships no android-37 jar, so the sandbox runs at 34. The composables do not
// branch on SDK level and the output is the same pixels either way.
@Config(sdk = [34], qualifiers = "w192dp-h192dp-round-watch-xhdpi")
class WearStoreScreenshotTest {
  @get:Rule val compose = createComposeRule()

  private fun entry(id: String, title: String, podcast: String) =
          WearQueueEntry(
                  libraryItemId = "li-$id",
                  episodeId = id,
                  title = title,
                  podcastTitle = podcast,
                  coverPath = null,
                  durationSeconds = 2400.0,
                  currentTimeSeconds = 0.0
          )

  @Test
  fun queue() {
    val queue =
            WearQueue(
                    generatedAtMs = System.currentTimeMillis(),
                    serverConnectionConfigId = "cfg",
                    entries =
                            listOf(
                                    entry("a", "The Trouble With Deadlines", "Hard Fork"),
                                    entry("b", "What We Owe The Future", "Pod Save America"),
                                    entry("c", "A Short History of Nearly Nothing", "99% Invisible")
                            )
            )

    compose.setContent {
      QueuePreview(
              queue = queue,
              statuses =
                      mapOf(
                              "a" to DownloadStatus.READY,
                              "b" to DownloadStatus.READY,
                              "c" to DownloadStatus.STREAMABLE
                      )
      )
    }
    compose.onRoot().captureRoboImage("../../docs/store/wear/01-queue.png")
  }

  @Test
  fun nowPlaying() {
    compose.setContent {
      WearPreviewSurface {
        NowPlayingContent(
                title = "The Trouble With Deadlines",
                artist = "Hard Fork",
                isPlaying = true,
                speed = 2f,
                progress = 0.42f
        )
      }
    }
    compose.onRoot().captureRoboImage("../../docs/store/wear/02-now-playing.png")
  }
}
