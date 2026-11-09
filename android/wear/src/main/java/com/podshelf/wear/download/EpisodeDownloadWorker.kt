package com.podshelf.wear.download

import android.content.Context
import android.util.Log
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.podshelf.wear.server.WearApi
import com.podshelf.wear.sync.WearSyncStore
import com.podshelf.wearsync.episodesToDownload
import com.podshelf.wearsync.episodesToEvict
import com.podshelf.wearsync.hasRoomToDownload
import com.podshelf.wearsync.queueMatchesSession
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Fetches the head of the queue onto the watch.
 *
 * What goes and what stays is decided by the rules in :wear-sync, which are pure and tested;
 * this is the part that touches the network and the disk.
 */
class EpisodeDownloadWorker(context: Context, params: WorkerParameters) :
        CoroutineWorker(context, params) {

  private val tag = "EpisodeDownloadWorker"

  override suspend fun doWork(): Result =
          withContext(Dispatchers.IO) {
            val store = WearSyncStore.get(applicationContext)
            val session = store.session.value
            val queue = store.queue.value

            if (session == null || !queueMatchesSession(queue, session)) {
              // No server, or a queue belonging to one the phone has switched away from. Not a
              // failure worth retrying - nothing will change until the phone pushes again, and
              // that push schedules this itself.
              return@withContext Result.success()
            }

            val episodes = EpisodeStore(applicationContext)
            episodes.clearPartials()
            val target = DownloadState.get(applicationContext).downloadTarget.value

            // Eviction first, so a watch that is already full can still take the episode it
            // actually needs next. Costs nothing and needs no network.
            episodesToEvict(episodes.cached(), queue, target).forEach { episodes.delete(it) }

            val pending = episodesToDownload(queue, episodes.cachedIds(), target)
            if (pending.isEmpty()) return@withContext Result.success()

            // WorkManager's UNMETERED constraint got us here, but unmetered is not the same as
            // fast: while the phone is in Bluetooth range the watch's default network is
            // usually the phone proxy, at a few hundred kbps. Ask for Wi-Fi before moving tens
            // of megabytes, and leave it alone if the watch is already somewhere good.
            val network = HighBandwidthNetwork(applicationContext)
            val usingRequestedNetwork =
                    if (network.currentNetworkIsFastEnough()) false else network.acquire()

            val state = DownloadState.get(applicationContext)

            if (!usingRequestedNetwork && !network.currentNetworkIsFastEnough()) {
              // No Wi-Fi turned up. Retry rather than crawl: nothing here is urgent, and a
              // download dribbling over Bluetooth costs battery for an episode that will not
              // finish before the watch leaves the charger.
              //
              // Recorded as "no network acquired" rather than as a failure, because those are
              // different things to tell someone: one is a watch between chances, the other is
              // a watch that cannot download at all until they set up Wi-Fi.
              network.release()
              state.recordAttempt(succeeded = false, acquiredNetwork = false)
              return@withContext Result.retry()
            }

            try {
              // A Boolean, not the Result: Result.Success is restricted to WorkManager's own
              // library group, so `is Result.Success` is an API we are not allowed to use.
              val succeeded = downloadAll(pending, session, episodes)
              state.recordAttempt(succeeded = succeeded, acquiredNetwork = true)
              return@withContext if (succeeded) Result.success() else Result.retry()
            } finally {
              network.release()
            }
          }

  private suspend fun downloadAll(
          pending: List<com.podshelf.wearsync.WearQueueEntry>,
          session: com.podshelf.wearsync.WearServerSession,
          episodes: EpisodeStore
  ): Boolean =
          withContext(Dispatchers.IO) {
            val api = WearApi()
            var failed = false

            for (entry in pending) {
              val url = api.resolveTrackUrl(session, entry)
              if (url == null) {
                Log.d(tag, "No track URL for ${entry.episodeId}")
                failed = true
                continue
              }

              val target = episodes.fileFor(entry.episodeId)
              val partial = episodes.partialFor(entry.episodeId)

              try {
                api.openStream(url).use { response ->
                  if (!response.isSuccessful) {
                    failed = true
                    return@use
                  }
                  val body = response.body
                  val incoming = body.contentLength()
                  // Checked per file rather than per batch: sizes are only known once the
                  // server answers, so a batch that looked like it fit can stop fitting.
                  if (incoming > 0 && !hasRoomToDownload(episodes.usedBytes(), incoming)) {
                    Log.d(tag, "No room for ${entry.episodeId}")
                    return@use
                  }

                  // Written to a .partial and renamed, so a download killed mid-flight - the
                  // watch left the charger, the radio dropped - never leaves a truncated file
                  // that looks complete and plays as silence halfway through a run.
                  partial.outputStream().use { out -> body.byteStream().copyTo(out) }
                  if (!partial.renameTo(target)) {
                    partial.delete()
                    failed = true
                  }
                }
              } catch (e: Exception) {
                Log.d(tag, "Download of ${entry.episodeId} failed: ${e.message}")
                partial.delete()
                failed = true
              }

              if (isStopped) break
            }

            !failed
          }

  companion object {
    private const val WORK_NAME = "podshelf-episode-download"

    /**
     * Asks for a download pass.
     *
     * Unmetered only - an episode is tens of megabytes and nobody wants their watch spending
     * their phone's data plan - and not while the battery is low. Charging is deliberately not
     * required: someone who adds an episode over breakfast and runs at seven would otherwise
     * find nothing downloaded, which is the one failure this feature cannot afford.
     *
     * KEEP rather than REPLACE: the phone publishes several times in a row during a library
     * refresh, and restarting the batch each time means never finishing the first episode.
     */
    fun schedule(context: Context) {
      val constraints =
              Constraints.Builder()
                      .setRequiredNetworkType(NetworkType.UNMETERED)
                      .setRequiresBatteryNotLow(true)
                      .build()

      WorkManager.getInstance(context)
              .enqueueUniqueWork(
                      WORK_NAME,
                      ExistingWorkPolicy.KEEP,
                      OneTimeWorkRequestBuilder<EpisodeDownloadWorker>()
                              .setConstraints(constraints)
                              .build()
              )
    }
  }
}
