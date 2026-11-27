package com.lordcookie.engram

import android.Manifest
import android.content.Intent
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback

/**
 * Brücke zum täglichen Update-Blick (EngramNotifier): an/aus, Datenstand und Sprache,
 * Erlaubnis für Benachrichtigungen (Android 13+) und ob die App über die Benachrichtigung
 * geöffnet wurde.
 */
@CapacitorPlugin(
    name = "EngramNotifier",
    permissions = [Permission(strings = [Manifest.permission.POST_NOTIFICATIONS], alias = "notifications")],
)
class EngramNotifierPlugin : Plugin() {

    @PluginMethod
    fun configure(call: PluginCall) {
        EngramNotifier.configure(context, call.getBoolean("enabled") == true, call.getString("dataStamp"), call.getString("lang"))
        call.resolve()
    }

    @PluginMethod
    fun requestPermission(call: PluginCall) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) {
            call.resolve(JSObject().put("granted", true))
            return
        }
        requestPermissionForAlias("notifications", call, "permissionResult")
    }

    @PermissionCallback
    private fun permissionResult(call: PluginCall) {
        call.resolve(JSObject().put("granted", getPermissionState("notifications") == PermissionState.GRANTED))
    }

    /** Wurde die App über die Update-Benachrichtigung geöffnet? (nur einmal „ja") */
    @PluginMethod
    fun consumeLaunch(call: PluginCall) {
        val intent = activity?.intent
        val open = intent?.getBooleanExtra(EngramNotifier.EXTRA_OPEN_UPDATES, false) ?: false
        if (open) intent?.removeExtra(EngramNotifier.EXTRA_OPEN_UPDATES)
        call.resolve(JSObject().put("openUpdates", open))
    }

    // App läuft schon und wird über die Benachrichtigung nach vorn geholt.
    override fun handleOnNewIntent(intent: Intent?) {
        super.handleOnNewIntent(intent)
        if (intent?.getBooleanExtra(EngramNotifier.EXTRA_OPEN_UPDATES, false) == true) {
            intent.removeExtra(EngramNotifier.EXTRA_OPEN_UPDATES)
            notifyListeners("openUpdates", JSObject())
        }
    }
}
