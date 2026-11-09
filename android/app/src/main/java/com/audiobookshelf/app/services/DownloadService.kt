package com.audiobookshelf.app.services

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.audiobookshelf.app.R
import com.audiobookshelf.app.models.DownloadItemPart
import com.audiobookshelf.app.plugins.AbsLogger

/** Android-owned foreground lifecycle for transfers that must outlive the WebView and Activity. */
class DownloadService : Service() {
  override fun onCreate() {
    super.onCreate()
    createChannel()
    if (!startForegroundWithType(DownloadServiceHost.notificationStrings(this).preparing)) {
      stopSelf()
      return
    }
    DownloadServiceHost.attachService(this)
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    when (intent?.action) {
      ACTION_CANCEL -> DownloadServiceHost.cancelAll(this)
      else -> {
        if (!startForegroundWithType(DownloadServiceHost.notificationStrings(this).preparing)) {
          stopSelf()
          return START_NOT_STICKY
        }
        DownloadServiceHost.startWork(this)
      }
    }
    // Deliberately not START_STICKY. The system restarts a sticky service after it dies, which
    // runs onCreate and startForeground again - and when the reason it died was the platform
    // refusing that very call, the restart crashes the same way, on a loop. Downloads survive
    // without it: parts resume from their byte offset and DownloadServiceHost restarts the
    // service when there is work and the app is able to.
    return START_NOT_STICKY
  }

  /**
   * Android 15+ caps how long a dataSync foreground service may run per day. When the system
   * times it out we must stand down promptly; ignoring it gets the app killed.
   */
  override fun onTimeout(startId: Int, fgsType: Int) {
    AbsLogger.error(TAG, "Download foreground service timed out (type $fgsType), stopping")
    stopForeground(STOP_FOREGROUND_REMOVE)
    stopSelf()
  }

  override fun onDestroy() {
    DownloadServiceHost.detachService(this)
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null

  fun onPartUpdate(part: DownloadItemPart) {
    val strings = DownloadServiceHost.notificationStrings(this)
    val text =
            if (part.waitingForSpace) strings.waitingForStorage
            else strings.downloadingFile.replace("{0}", part.filename)
    val progress = part.progress.coerceIn(0L, 100L).toInt()
    val notification = notification(text, progress, part.fileSize > 0L)
    (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(NOTIFICATION_ID, notification)
  }

  fun onQueueChanged(hasWork: Boolean) {
    if (!hasWork) {
      stopForeground(STOP_FOREGROUND_REMOVE)
      stopSelf()
    }
  }

  /**
   * Returns whether the service is now in the foreground.
   *
   * startForeground is not safe to call unguarded: from Android 12 the platform throws when the
   * app may not start a foreground service from the background, and later versions add type and
   * quota failures on top. Thrown from onCreate that takes the whole app down, so a background
   * auto-download could crash the app instead of just failing to download.
   */
  private fun startForegroundWithType(text: String): Boolean {
    return try {
      val notification = notification(text)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC)
      } else {
        startForeground(NOTIFICATION_ID, notification)
      }
      true
    } catch (e: Exception) {
      AbsLogger.error(TAG, "Could not move download service to the foreground: ${e.message}")
      false
    }
  }

  private fun notification(text: String, progress: Int = 0, determinate: Boolean = false): Notification {
    val cancelIntent = PendingIntent.getService(
            this, 1, Intent(this, DownloadService::class.java).setAction(ACTION_CANCEL), pendingIntentFlags())
    return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.icon)
            .setContentTitle(DownloadServiceHost.notificationStrings(this).downloads)
            .setContentText(text)
            .setOnlyAlertOnce(true)
            .setOngoing(true)
            .setProgress(100, progress, !determinate)
            .addAction(0, DownloadServiceHost.notificationStrings(this).cancel, cancelIntent)
            .build()
  }

  private fun createChannel() {
    val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
    manager.createNotificationChannel(
            NotificationChannel(
                    CHANNEL_ID,
                    DownloadServiceHost.notificationStrings(this).downloads,
                    NotificationManager.IMPORTANCE_LOW))
  }

  private fun pendingIntentFlags(): Int = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE

  companion object {
    private const val TAG = "DownloadService"
    private const val CHANNEL_ID = "downloads"
    private const val NOTIFICATION_ID = 11
    private const val ACTION_CANCEL = "com.audiobookshelf.app.download.CANCEL"
    fun intent(context: Context) = Intent(context, DownloadService::class.java)
  }
}
