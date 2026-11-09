package com.audiobookshelf.app.device

import android.Manifest
import android.annotation.SuppressLint
import android.os.Build

object PermissionHelper {
    fun requiredAudioPermission(): String {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            Manifest.permission.READ_MEDIA_AUDIO
        } else {
            Manifest.permission.READ_EXTERNAL_STORAGE
        }
    }

    /**
     * The local network permission, when this device enforces it.
     *
     * Android 17 blocks an app from reaching a private address unless it holds
     * ACCESS_LOCAL_NETWORK. INTERNET is no longer enough. That matters more here than in most
     * apps: a self-hosted Audiobookshelf is usually on the same LAN as the phone, and split
     * horizon DNS means the very same hostname that works over mobile data resolves to a
     * 10.x/192.168.x address over Wi-Fi. Without the permission that connection does not fail
     * fast - the TCP connect simply times out - so it surfaces as "Failed to ping server" with
     * an address that looks perfectly reachable.
     *
     * Null below 37, where the permission does not exist and the platform grants local access
     * implicitly through INTERNET. Asking for it there is not just useless, it is what Google
     * explicitly tells apps not to do.
     */
    // The SDK check is on the parameter, which lint cannot follow; the constant is only a string.
    @SuppressLint("InlinedApi")
    fun localNetworkPermission(sdkInt: Int = Build.VERSION.SDK_INT): String? {
        return if (sdkInt >= Build.VERSION_CODES.CINNAMON_BUN) {
            Manifest.permission.ACCESS_LOCAL_NETWORK
        } else {
            null
        }
    }
}
