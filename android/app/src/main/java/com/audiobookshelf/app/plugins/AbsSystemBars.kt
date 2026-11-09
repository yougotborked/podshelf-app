package com.audiobookshelf.app.plugins

import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Shows and hides the status bar - the one thing the app needed from @capacitor/status-bar.
 *
 * That plugin is excluded from the Android build (android.includePlugins in capacitor.config.json)
 * because its colour and overlay methods call Window.setStatusBarColor and the
 * SYSTEM_UI_FLAG_LAYOUT_* flags, which Android 15 deprecated and Play flags wherever they appear in
 * the dex - whether or not the app ever calls them. Bar colour is now MainActivity's job, through
 * enableEdgeToEdge(); visibility is this, through the insets controller, which is not deprecated.
 */
@CapacitorPlugin(name = "AbsSystemBars")
class AbsSystemBars : Plugin() {
  @PluginMethod
  fun setStatusBarVisible(call: PluginCall) {
    val visible = call.getBoolean("visible") ?: true
    activity.runOnUiThread {
      val window = activity.window
      val controller = WindowCompat.getInsetsController(window, window.decorView)
      if (visible) controller.show(WindowInsetsCompat.Type.statusBars())
      else controller.hide(WindowInsetsCompat.Type.statusBars())
      call.resolve()
    }
  }
}
