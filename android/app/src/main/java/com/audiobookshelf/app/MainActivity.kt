package com.audiobookshelf.app

import android.Manifest
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.ServiceConnection
import android.content.pm.PackageManager
import android.graphics.Color
import android.net.Uri
import androidx.core.net.toUri
import android.os.Build
import android.os.Bundle
import android.os.IBinder
import android.util.Log
import android.view.ViewGroup
import android.webkit.WebView
import androidx.activity.SystemBarStyle
import androidx.activity.enableEdgeToEdge
import androidx.core.app.ActivityCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.updateLayoutParams
import android.view.WindowInsets
import com.anggrayudi.storage.SimpleStorage
import com.anggrayudi.storage.SimpleStorageHelper
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import androidx.window.layout.FoldingFeature
import androidx.window.layout.WindowInfoTracker
import androidx.window.layout.WindowMetricsCalculator
import com.audiobookshelf.app.device.FoldPostureRules
import com.audiobookshelf.app.device.FoldState
import com.audiobookshelf.app.device.PermissionHelper
import com.audiobookshelf.app.managers.DbManager
import com.audiobookshelf.app.player.PlayerNotificationService
import com.audiobookshelf.app.plugins.AbsAudioPlayer
import com.audiobookshelf.app.plugins.AbsDatabase
import com.audiobookshelf.app.plugins.AbsDownloader
import com.audiobookshelf.app.plugins.AbsFileSystem
import com.audiobookshelf.app.plugins.AbsFoldPosture
import com.audiobookshelf.app.plugins.AbsLogger
import com.audiobookshelf.app.plugins.AbsSystemBars
import com.audiobookshelf.app.plugins.AbsWearSync
import com.getcapacitor.BridgeActivity
import kotlinx.coroutines.launch


class MainActivity : BridgeActivity() {
  private val tag = "MainActivity"

  private var mBounded = false
  lateinit var foregroundService : PlayerNotificationService
  private lateinit var mConnection : ServiceConnection

  lateinit var pluginCallback : () -> Unit

  val storageHelper = SimpleStorageHelper(this)
  val storage = SimpleStorage(this)

  val REQUEST_PERMISSIONS = 1

  public override fun onCreate(savedInstanceState: Bundle?) {
    DbManager.initialize(applicationContext)

    registerPlugin(AbsAudioPlayer::class.java)
    registerPlugin(AbsDownloader::class.java)
    registerPlugin(AbsFileSystem::class.java)
    registerPlugin(AbsFoldPosture::class.java)
    registerPlugin(AbsDatabase::class.java)
    registerPlugin(AbsLogger::class.java)
    registerPlugin(AbsWearSync::class.java)
    registerPlugin(AbsSystemBars::class.java)

    super.onCreate(savedInstanceState)
    Log.d(tag, "onCreate")

    // Edge-to-edge through androidx, not WindowCompat.setDecorFitsSystemWindows: Play checks the
    // dex for this exact call ("Edge-to-edge may not display for all users") and it also takes
    // over the bar colours that used to come from the deprecated android:statusBarColor theme
    // attributes. Dark styles - transparent bars, light icons - so the bars show the window
    // background behind them (background_dark, as before) rather than following the system theme.
    enableEdgeToEdge(
      statusBarStyle = SystemBarStyle.dark(Color.TRANSPARENT),
      navigationBarStyle = SystemBarStyle.dark(Color.TRANSPARENT)
    )

    // Back navigation is Capacitor's. AppPlugin registers its own OnBackPressedCallback during
    // super.onCreate above, and the dispatcher runs callbacks last-registered-first, so anything
    // added here would be invoked instead of it and the webview would never receive the
    // backButton event. That is what used to happen: a callback here called webView.goBack()
    // directly, which bypassed the app's own handling - closing a modal, closing the reader,
    // minimizing the fullscreen player, confirming an exit - and popped the webview's history
    // instead, which can navigate off the app's first entry and reload the whole thing.
    //
    // With nothing registered here, AppPlugin notifies the webview, and falls back to
    // goBack() itself only when the webview has no listener (before its JS has loaded).

    // Update the margins to handle edge-to-edge enforced in SDK 35
    // See: https://developer.android.com/develop/ui/views/layout/edge-to-edge
    val webView: WebView = findViewById(R.id.webview)
    webView.setOnApplyWindowInsetsListener { v, insets ->
      val sysInsets = WindowInsetsCompat.toWindowInsetsCompat(insets, v)
        // The cutout too: enableEdgeToEdge lets the window extend into it, and in landscape a
        // camera cutout sits beside the content where the system bars' insets do not reach.
        .getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.displayCutout())
      Log.d(tag, "safe sysInsets: $sysInsets")
      val (left, top, right, bottom) = arrayOf(
        sysInsets.left,
        sysInsets.top,
        sysInsets.right,
        sysInsets.bottom
      )

      // The webview is inset by the margins below rather than drawing under the system bars, so
      // it has no safe area of its own to report and the app's CSS uses the browser's own
      // env(safe-area-inset-*) - which is what iOS needs. This used to also push the same
      // numbers in as --safe-area-inset-* custom properties; nothing ever read them, so they
      // were evaluated into the page on every inset change for nothing.
      //
      // Set margins
      v.updateLayoutParams<ViewGroup.MarginLayoutParams> {
        leftMargin = left
        bottomMargin = bottom
        rightMargin = right
        topMargin = top
      }

      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
        WindowInsets.CONSUMED
      } else {
        insets
      }
    }

    observeFoldPosture()

    requestNeededPermissions()
  }

  /**
   * Requests the permissions the app needs but does not yet hold.
   *
   * POST_NOTIFICATIONS is required from Android 13 for the download progress notification, which
   * is also what keeps the download foreground service alive.
   */
  /**
   * Watches the hinge and reports the posture to the webview.
   *
   * WindowManager publishes folding features per activity and only as a Flow, so the collecting
   * has to live here; the decision it feeds does not, and is in FoldPostureRules where it can be
   * tested without a foldable. repeatOnLifecycle(STARTED) keeps the collection off a backgrounded
   * activity - a device folded in a pocket would otherwise wake this for nothing.
   */
  private fun observeFoldPosture() {
    lifecycleScope.launch {
      repeatOnLifecycle(Lifecycle.State.STARTED) {
        WindowInfoTracker.getOrCreate(this@MainActivity)
                .windowLayoutInfo(this@MainActivity)
                .collect { layoutInfo ->
                  val bounds =
                          WindowMetricsCalculator.getOrCreate()
                                  .computeCurrentWindowMetrics(this@MainActivity)
                                  .bounds

                  // Only one folding feature on every shipping device; if that ever stops being
                  // true, the first is still a better answer than none.
                  val fold =
                          layoutInfo.displayFeatures.filterIsInstance<FoldingFeature>()
                                  .firstOrNull()

                  val state =
                          if (fold == null) {
                            FoldState.FLAT
                          } else {
                            val horizontal =
                                    fold.orientation == FoldingFeature.Orientation.HORIZONTAL
                            FoldPostureRules.resolve(
                                    isHalfOpened =
                                            fold.state == FoldingFeature.State.HALF_OPENED,
                                    isHorizontalHinge = horizontal,
                                    hingeStart =
                                            if (horizontal) fold.bounds.top else fold.bounds.left,
                                    hingeEnd =
                                            if (horizontal) fold.bounds.bottom
                                            else fold.bounds.right,
                                    windowExtent =
                                            if (horizontal) bounds.height() else bounds.width())
                          }

                  AbsFoldPosture.update(state)
                }
      }
    }
  }

  private fun requestNeededPermissions() {
    val needed = mutableListOf<String>()
    val audioPermission = PermissionHelper.requiredAudioPermission()
    if (ActivityCompat.checkSelfPermission(this, audioPermission) != PackageManager.PERMISSION_GRANTED) {
      needed.add(audioPermission)
    }
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            ActivityCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
      needed.add(Manifest.permission.POST_NOTIFICATIONS)
    }
    // Asked at startup alongside the others rather than at the first connection attempt,
    // because a denial here is not recoverable in place: the connect screen's failure is a
    // six second timeout with no hint that a permission is missing. It joins an existing
    // batch, and on a device where Bluetooth was already allowed the Nearby Devices group may
    // not prompt again at all.
    PermissionHelper.localNetworkPermission()?.let { localNetwork ->
      if (ActivityCompat.checkSelfPermission(this, localNetwork) != PackageManager.PERMISSION_GRANTED) {
        needed.add(localNetwork)
      }
    }
    if (needed.isNotEmpty()) {
      ActivityCompat.requestPermissions(this, needed.toTypedArray(), REQUEST_PERMISSIONS)
    }
  }

  override fun onDestroy() {
    super.onDestroy()
  }

  override fun onPostCreate(savedInstanceState: Bundle?) {
    super.onPostCreate(savedInstanceState)
    Log.d(tag, "onPostCreate MainActivity")

    mConnection = object : ServiceConnection {
      override fun onServiceDisconnected(name: ComponentName) {
        Log.w(tag, "Service Disconnected $name")
        mBounded = false
      }

      override fun onServiceConnected(name: ComponentName, service: IBinder) {
        Log.d(tag, "Service Connected $name")

        mBounded = true
        val mLocalBinder = service as PlayerNotificationService.LocalBinder
        foregroundService = mLocalBinder.getService()

        // Let NativeAudio know foreground service is ready and setup event listener
        pluginCallback()
      }
    }

    Intent(this, PlayerNotificationService::class.java).also { intent ->
      Log.d(tag, "Binding PlayerNotificationService")
      bindService(intent, mConnection, Context.BIND_AUTO_CREATE)
    }
  }

  fun isPlayerNotificationServiceInitialized():Boolean {
    return ::foregroundService.isInitialized
  }

  fun stopMyService() {
    if (mBounded) {
      mConnection.let { unbindService(it) };
      mBounded = false;
    }
    val stopIntent = Intent(this, PlayerNotificationService::class.java)
    stopService(stopIntent)
  }

  override fun onSaveInstanceState(outState: Bundle) {
    storageHelper.onSaveInstanceState(outState)
    super.onSaveInstanceState(outState)
    outState.clear()
  }

  override fun onRestoreInstanceState(savedInstanceState: Bundle) {
    super.onRestoreInstanceState(savedInstanceState)
    storageHelper.onRestoreInstanceState(savedInstanceState)
  }

  override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
    super.onActivityResult(requestCode, resultCode, data)
    // Mandatory for Activity, but not for Fragment & ComponentActivity
    storageHelper.storage.onActivityResult(requestCode, resultCode, data)
  }

  override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<String>, grantResults: IntArray) {
    super.onRequestPermissionsResult(requestCode, permissions, grantResults)
    Log.d(tag, "onRequestPermissionResult $requestCode")
    permissions.forEach { Log.d(tag, "PERMISSION $it") }
    grantResults.forEach { Log.d(tag, "GRANTREUSLTS $it") }
    // Mandatory for Activity, but not for Fragment & ComponentActivity
    storageHelper.onRequestPermissionsResult(requestCode, permissions, grantResults)
  }
}
