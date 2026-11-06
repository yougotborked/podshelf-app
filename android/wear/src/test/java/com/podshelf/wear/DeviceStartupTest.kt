package com.podshelf.wear

import android.content.ComponentName
import android.content.Intent
import android.os.Looper
import androidx.media3.session.MediaController
import androidx.media3.session.MediaSessionService
import androidx.media3.session.SessionToken
import androidx.startup.InitializationProvider
import com.podshelf.wear.player.WearPlayerService
import java.util.concurrent.TimeUnit
import org.junit.After
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.android.controller.ServiceController
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The first second on the watch, as the device runs it rather than as the harness allows.
 *
 * MainActivityLaunchTest answers the activity's bind to the player service with null, so the
 * media controller there never connects: the connection, the service starting because of it, and
 * the controller future completing - everything that happens on a real launch - had never run in
 * any test. Nor had the androidx.startup initialisers the merged manifest lists, which a device
 * runs before the first activity and Robolectric does not run at all.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(sdk = [34, 35, 36], qualifiers = "w192dp-h192dp-round-watch-xhdpi")
class DeviceStartupTest {
  private val app get() = RuntimeEnvironment.getApplication()
  private val playerComponent get() = ComponentName(app, WearPlayerService::class.java)
  private lateinit var serviceController: ServiceController<WearPlayerService>

  // media3 registers every session in a process-wide map and refuses a second one with the same
  // id, so a service left alive here would fail the next test's onCreate.
  @After
  fun stopThePlayer() {
    serviceController.destroy()
    shadowOf(Looper.getMainLooper()).idle()
  }

  @Before
  fun runStartupAndConnectThePlayerForReal() {
    // The real InitializationProvider, so every initialiser the merged manifest lists runs the
    // way a device runs it - eagerly, before any component. Started by hand because Robolectric
    // does not start providers. WorkManager and androidx.startup keep process-wide singletons
    // that outlive a test, so earlier tests' instances are cleared first; a device process
    // starts with neither.
    resetStatic("androidx.work.impl.WorkManagerImpl", "sDefaultInstance", "sDelegatedInstance")
    resetStatic("androidx.startup.AppInitializer", "sInstance")
    Robolectric.setupContentProvider(InitializationProvider::class.java, "${app.packageName}.androidx-startup")

    // The real service, answering the bind with its real binder - the path a device takes.
    serviceController = Robolectric.buildService(WearPlayerService::class.java).create()
    val service = serviceController.get()
    val binder = service.onBind(Intent(MediaSessionService.SERVICE_INTERFACE).setComponent(playerComponent))
    shadowOf(app).setComponentNameAndServiceForBindService(playerComponent, binder)
  }

  @Test
  fun `a controller connects to the player service`() {
    // Exactly what rememberMediaController does on launch; its listener calls future.get(),
    // which throws on the main thread if the connection fails.
    val future = MediaController.Builder(app, SessionToken(app, playerComponent)).buildAsync()
    repeat(20) { shadowOf(Looper.getMainLooper()).idleFor(50, TimeUnit.MILLISECONDS) }
    check(future.isDone) { "the controller never connected" }
    future.get().release()
  }

  @Test
  fun `the app launches and stays open with the player connected`() {
    Robolectric.buildActivity(MainActivity::class.java).setup().use { controller ->
      repeat(20) { shadowOf(Looper.getMainLooper()).idleFor(50, TimeUnit.MILLISECONDS) }
      check(!controller.get().isFinishing) { "MainActivity finished itself on launch" }
    }
  }

  @Test
  fun `closing the screen before the player connects does not crash`() {
    // The window rememberMediaController leaves open: the screen goes away while the controller
    // is still connecting - a swipe away straight after launch, or the activity being recreated
    // - so onDispose cancels the future and the listener calls get() on a cancelled one. That
    // throws, and is survivable only because Guava catches what a future's listener throws; this
    // keeps it that way if the listener or the executor ever changes.
    Robolectric.buildActivity(MainActivity::class.java).setup().use { controller ->
      // Destroyed before the main looper has delivered the service connection.
      controller.pause().stop().destroy()
    }
    repeat(20) { shadowOf(Looper.getMainLooper()).idleFor(50, TimeUnit.MILLISECONDS) }
  }

  private fun resetStatic(className: String, vararg fields: String) {
    val type = Class.forName(className)
    fields.forEach { name -> type.getDeclaredField(name).apply { isAccessible = true }.set(null, null) }
  }
}
