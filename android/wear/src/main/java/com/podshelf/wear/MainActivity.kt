package com.podshelf.wear

import android.Manifest
import android.content.ComponentName
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.core.app.ActivityCompat
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import androidx.wear.compose.foundation.lazy.ScalingLazyColumn
import androidx.wear.compose.foundation.lazy.items
import androidx.wear.compose.foundation.lazy.rememberScalingLazyListState
import androidx.wear.compose.material.Chip
import androidx.wear.compose.material.ChipDefaults
import androidx.wear.compose.material.CompactChip
import androidx.wear.compose.material.ListHeader
import androidx.wear.compose.material.MaterialTheme
import androidx.wear.compose.material.Text
import com.google.common.util.concurrent.MoreExecutors
import android.content.Intent
import com.podshelf.wear.download.DownloadState
import com.podshelf.wear.download.EpisodeDownloadWorker
import com.podshelf.wear.download.EpisodeStore
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import com.podshelf.wear.player.NowPlayingScreen
import com.podshelf.wear.player.WearPlayerService
import com.podshelf.wear.server.WearApi
import com.podshelf.wear.sync.WearSyncStore
import com.podshelf.wearsync.DownloadStatus
import com.podshelf.wearsync.WearQueue
import com.podshelf.wearsync.WearServerSession
import com.podshelf.wearsync.WearQueueEntry
import com.podshelf.wearsync.describeLastSync
import com.podshelf.wearsync.downloadStatus
import com.podshelf.wearsync.isPlayable
import com.podshelf.wearsync.estimateDownloadFootprintMb
import com.podshelf.wearsync.nextDownloadTarget
import com.podshelf.wearsync.queueMatchesSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import com.podshelf.wearsync.shouldOfferWifiSetup

/**
 * The watch app.
 *
 * Shows the catch-up queue the phone resolved and plays it. It does no ordering of its own - see
 * composables/useListeningQueue.ts, the single definition of what plays next - and it reads both
 * the queue and the audio from disk, so a run works with the phone left at home.
 */
class MainActivity : ComponentActivity() {
  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    requestLocalNetworkAccessIfNeeded()

    // Opening the app is a good moment to catch up on anything the Data Layer push could not
    // download at the time - the watch was on mobile data, or off Wi-Fi entirely.
    EpisodeDownloadWorker.schedule(this)

    setContent {
      PodshelfWearApp(WearSyncStore.get(this), EpisodeStore(this), DownloadState.get(this))
    }
  }

  /**
   * Android 17 blocks a private address unless the app holds this.
   *
   * Asked here rather than before the first request because the failure it prevents is a silent
   * six second timeout against a server that looks perfectly reachable - there is no good moment
   * later to explain that. A watch is also the device most likely to be on the same Wi-Fi as a
   * self-hosted server while the phone is not.
   */
  private fun requestLocalNetworkAccessIfNeeded() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.CINNAMON_BUN) return
    val permission = Manifest.permission.ACCESS_LOCAL_NETWORK
    if (ActivityCompat.checkSelfPermission(this, permission) == PackageManager.PERMISSION_GRANTED) {
      return
    }
    ActivityCompat.requestPermissions(this, arrayOf(permission), REQUEST_LOCAL_NETWORK)
  }

  companion object {
    private const val REQUEST_LOCAL_NETWORK = 4201
  }
}

@Composable
fun PodshelfWearApp(store: WearSyncStore, episodes: EpisodeStore, downloads: DownloadState) {
  val session by store.session.collectAsStateWithLifecycle()
  val queue by store.queue.collectAsStateWithLifecycle()
  val lastAttemptFailed by downloads.lastAttemptFailed.collectAsStateWithLifecycle()
  val lastSyncedAtMs by store.lastSyncedAtMs.collectAsStateWithLifecycle()
  val hasEverDownloaded by downloads.hasEverDownloaded.collectAsStateWithLifecycle()
  val downloadTarget by downloads.downloadTarget.collectAsStateWithLifecycle()
  val controller = rememberMediaController()

  var showPlayer by remember { mutableStateOf(false) }
  var hasPlayable by remember { mutableStateOf(false) }
  var isOnline by remember { mutableStateOf(false) }
  var resolving by remember { mutableStateOf(false) }
  val scope = rememberCoroutineScope()
  val appContext = LocalContext.current.applicationContext

  // Whether there is anything to go back to. Polled because the player lives in a service and
  // can finish, or advance to the next episode, while this screen is open.
  LaunchedEffect(controller) {
    while (true) {
      hasPlayable = controller?.currentMediaItem != null
      isOnline = hasInternet(appContext)
      kotlinx.coroutines.delay(1000)
    }
  }

  MaterialTheme {
    if (showPlayer) {
      NowPlayingScreen(controller = controller, onBack = { showPlayer = false })
      return@MaterialTheme
    }

    val current = queue
    // A queue from a server the phone has since switched away from is worse than none: its
    // library item ids mean nothing on the new server, so every track would 404.
    if (current == null || current.entries.isEmpty() || !queueMatchesSession(current, session)) {
      WaitingForPhone(hasSession = session != null, lastSyncedAtMs = lastSyncedAtMs)
    } else {
      QueueList(
              queue = current,
              episodes = episodes,
              hasEverDownloaded = hasEverDownloaded,
              lastAttemptFailed = lastAttemptFailed,
              lastSyncedAtMs = lastSyncedAtMs,
              hasPlayable = hasPlayable,
              downloadTarget = downloadTarget,
              onCycleTarget = { downloads.setDownloadTarget(nextDownloadTarget(downloadTarget)) },
              onOpenPlayer = { showPlayer = true },
              isOnline = isOnline,
              resolving = resolving,
              onPlay = { entry ->
                if (episodes.has(entry.episodeId)) {
                  play(entry, episodes, controller, streamUrl = null, isOnline = false)
                  // Straight to the controls. Starting audio and leaving someone on a list with
                  // no visible way back to it was the whole complaint.
                  showPlayer = true
                } else {
                  // Streaming needs a play session from the server before there is a URL to hand
                  // the player, and that is a round trip - it cannot happen inside a tap handler
                  // that has to answer instantly. The row says "Connecting" meanwhile.
                  resolving = true
                  scope.launch {
                    val url = resolveStreamUrl(session, entry)
                    resolving = false
                    if (url != null) {
                      play(entry, episodes, controller, streamUrl = url, isOnline = true)
                      showPlayer = true
                    }
                  }
                }
              }
      )
    }
  }
}

/**
 * Connects to the playback service for as long as this screen is on it.
 *
 * A controller rather than the player itself, so playback belongs to the service and survives
 * the screen going dark - which on a watch is most of a run.
 */
@Composable
private fun rememberMediaController(): MediaController? {
  val context = LocalContext.current
  var controller by remember { mutableStateOf<MediaController?>(null) }

  DisposableEffect(context) {
    val token = SessionToken(context, ComponentName(context, WearPlayerService::class.java))
    val future = MediaController.Builder(context, token).buildAsync()
    future.addListener({ controller = future.get() }, MoreExecutors.directExecutor())

    onDispose {
      MediaController.releaseFuture(future)
      controller = null
    }
  }

  return controller
}

@Composable
private fun WaitingForPhone(hasSession: Boolean, lastSyncedAtMs: Long) {
  Column(
          modifier = Modifier.fillMaxSize().padding(horizontal = 16.dp),
          verticalArrangement = Arrangement.Center,
          horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(text = "Podshelf", style = MaterialTheme.typography.title3, textAlign = TextAlign.Center)
    Text(
            text =
                    if (hasSession) "No episodes to catch up on yet"
                    else "Open Podshelf on your phone to send your queue here",
            style = MaterialTheme.typography.body2,
            textAlign = TextAlign.Center
    )
    // The difference between "the phone has never reached this watch" and "it did, and there
    // is simply nothing to play" is invisible without this, and only the first has anything
    // the user can do about it.
    LastSyncLine(lastSyncedAtMs)
  }
}

@Composable
private fun LastSyncLine(lastSyncedAtMs: Long) {
  val described = describeLastSync(lastSyncedAtMs, System.currentTimeMillis())
  Text(
          text = described ?: "Never synced with your phone",
          style = MaterialTheme.typography.caption3,
          textAlign = TextAlign.Center
  )
}

@Composable
private fun QueueList(
        queue: WearQueue,
        episodes: EpisodeStore,
        hasEverDownloaded: Boolean,
        lastAttemptFailed: Boolean,
        lastSyncedAtMs: Long,
        hasPlayable: Boolean,
        isOnline: Boolean,
        resolving: Boolean,
        downloadTarget: Int,
        onCycleTarget: () -> Unit,
        onOpenPlayer: () -> Unit,
        onPlay: (WearQueueEntry) -> Unit
) {
  val listState = rememberScalingLazyListState()
  val context = LocalContext.current

  val statuses =
          queue.entries.associate { entry ->
            entry.episodeId to
                    downloadStatus(
                            isDownloaded = episodes.has(entry.episodeId),
                            // Nothing reports per-episode progress yet, so an in-flight fetch
                            // still reads as waiting rather than claiming a state we cannot see.
                            isDownloading = false,
                            isOnline = isOnline,
                            hasWifiConfigured = hasEverDownloaded,
                            lastAttemptFailed = lastAttemptFailed
                    )
          }

  ScalingLazyColumn(modifier = Modifier.fillMaxSize(), state = listState) {
    item { ListHeader { Text(text = "Up next") } }

    // A way back to whatever is playing, from the top of the list. Without it the only route to
    // the transport controls was the system media notification, which you find by swiping the
    // app away - not something anyone should have to discover.
    if (hasPlayable) {
      item {
        Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onOpenPlayer,
                colors = ChipDefaults.primaryChipColors(),
                label = { Text(text = "Now playing", maxLines = 1) }
        )
      }
    }

    // Offered once, above the list, and only when it is the actual obstacle. Repeating it per
    // row - or showing it beside episodes that are already downloaded - teaches people to
    // ignore it.
    if (shouldOfferWifiSetup(
                    hasWifiConfigured = hasEverDownloaded,
                    anyUndownloaded = statuses.values.any { it != DownloadStatus.READY }
            )
    ) {
      item { WifiSetupPrompt(onOpenSettings = { openWifiSettings(context) }) }
    }

    items(queue.entries) { entry ->
      QueueRow(
              entry = entry,
              status = statuses[entry.episodeId] ?: DownloadStatus.WAITING_FOR_WIFI,
              resolving = resolving,
              onPlay = { onPlay(entry) }
      )
    }

    // Below the list rather than above it: on a full queue this is reassurance, not news, and
    // it should not push the first episode off the screen.
    item {
      Column(horizontalAlignment = Alignment.CenterHorizontally) {
        // How much to keep. On the watch rather than pushed from the phone, because it is a
        // fact about this device's storage - a 32GB watch and an 8GB one want different
        // answers from the same phone.
        Chip(
                modifier = Modifier.fillMaxWidth(),
                onClick = onCycleTarget,
                colors = ChipDefaults.secondaryChipColors(),
                label = { Text(text = "Keep $downloadTarget episodes", maxLines = 1) },
                secondaryLabel = {
                  Text(text = "about ${estimateDownloadFootprintMb(downloadTarget)} MB", maxLines = 1)
                }
        )
        LastSyncLine(lastSyncedAtMs)
      }
    }
  }
}

@Composable
private fun WifiSetupPrompt(onOpenSettings: () -> Unit) {
  Column(
          modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 4.dp),
          horizontalAlignment = Alignment.CenterHorizontally
  ) {
    Text(
            text = "Episodes download over Wi-Fi. This watch has none saved yet.",
            style = MaterialTheme.typography.caption2,
            textAlign = TextAlign.Center
    )
    CompactChip(onClick = onOpenSettings, label = { Text(text = "Set up Wi-Fi") })
  }
}

/**
 * Opens the watch's own add-network screen.
 *
 * A Wear-specific action rather than the handset Settings intent, which does not exist here.
 * Wrapped because a watch without it - an emulator, a stripped build - should not crash the
 * list someone is reading.
 */
private fun openWifiSettings(context: android.content.Context) {
  try {
    // No FLAG_ACTIVITY_NEW_TASK: started from the activity, settings joins our task, so a swipe
    // back returns to the list instead of leaving a stray Settings task in Recents.
    context.startActivity(
            Intent("com.google.android.clockwork.settings.connectivity.wifi.ADD_NETWORK_SETTINGS")
    )
  } catch (e: Exception) {
    // Nothing useful to say on a 1.2 inch screen; the prompt stays and the list still works.
  }
}

@Composable
internal fun QueueRow(
        entry: WearQueueEntry,
        status: DownloadStatus,
        resolving: Boolean,
        onPlay: () -> Unit
) {
  val playable = isPlayable(status)
  Chip(
          modifier = Modifier.fillMaxWidth(),
          onClick = onPlay,
          // A row is tappable when tapping it will produce audio - from disk, or over the
          // network. Everything else says what it is waiting for rather than starting something
          // that fails a second later.
          enabled = playable && !resolving,
          // The accent is reserved for what plays without a radio. A streamable row is
          // available, not ideal: it costs battery and stops at the first dead spot.
          colors =
                  if (status == DownloadStatus.READY) ChipDefaults.primaryChipColors()
                  else ChipDefaults.secondaryChipColors(),
          label = { Text(text = entry.title, maxLines = 2, overflow = TextOverflow.Ellipsis) },
          secondaryLabel = {
            Text(
                    text =
                            when {
                              resolving && status == DownloadStatus.STREAMABLE -> "Connecting"
                              status == DownloadStatus.READY -> entry.podcastTitle
                              status == DownloadStatus.DOWNLOADING -> "Downloading"
                              status == DownloadStatus.STREAMABLE -> "Stream - not downloaded yet"
                              status == DownloadStatus.WAITING_FOR_WIFI -> "Waiting for Wi-Fi"
                              status == DownloadStatus.NEEDS_WIFI_SETUP -> "Needs Wi-Fi"
                              else -> "Could not download - will retry"
                            },
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
            )
          }
  )
}

/**
 * Whether the watch can reach anything at all right now.
 *
 * Capability, not transport: true over Wi-Fi, over LTE, and over the Bluetooth proxy through a
 * paired phone. One episode is worth streaming over any of them, unlike a batch of downloads -
 * which is why this asks a different question from currentNetworkIsFastEnough.
 *
 * VALIDATED as well as INTERNET, because a watch associated to a captive portal or a Wi-Fi
 * network with no route reports the capability and answers nothing.
 */
private fun hasInternet(context: android.content.Context): Boolean {
  val connectivity =
          context.getSystemService(android.content.Context.CONNECTIVITY_SERVICE)
                  as? ConnectivityManager ?: return false
  val network = connectivity.activeNetwork ?: return false
  val capabilities = connectivity.getNetworkCapabilities(network) ?: return false
  return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
          capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
}

/** Asks the server for a play session and returns a URL, off the main thread. */
private suspend fun resolveStreamUrl(session: WearServerSession?, entry: WearQueueEntry): String? {
  val current = session ?: return null
  return withContext(Dispatchers.IO) { WearApi().resolveTrackUrl(current, entry) }
}

/**
 * Starts an episode.
 *
 * Downloaded only, for now: resolving a stream URL means a round trip to the server, which does
 * not belong on the main thread and does not belong in a tap handler that has to answer
 * instantly. Offline is the case that matters here anyway.
 */
private fun play(
        entry: WearQueueEntry,
        episodes: EpisodeStore,
        controller: MediaController?,
        streamUrl: String?,
        isOnline: Boolean
) {
  val player = controller ?: return
  val item = WearPlayerService.mediaItemFor(entry, episodes, streamUrl, isOnline) ?: return

  player.setMediaItem(item, WearPlayerService.startPositionMs(entry))
  player.prepare()
  player.playWhenReady = true
}
