package com.lordcookie.engram

import android.content.ComponentName
import android.content.pm.PackageManager
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * App-Icon passend zum Farbthema. Jedes Icon ist ein eigener Launcher-Alias im Manifest
 * (.MainActivity = Standard, .IconViolet, .IconSynth, .IconLime); genau einer ist aktiv.
 *
 * Umgeschaltet wird erst, wenn die App in den Hintergrund geht (handleOnStop): das
 * Deaktivieren des gerade laufenden Alias kann die App sonst sichtbar schließen. Je nach
 * Launcher verschwindet das alte Icon dabei vom Startbildschirm (Android-Verhalten).
 */
@CapacitorPlugin(name = "EngramIcon")
class EngramIconPlugin : Plugin() {

    private val aliases = linkedMapOf(
        "default" to ".MainActivity",
        "violet" to ".IconViolet",
        "synth" to ".IconSynth",
        "lime" to ".IconLime",
    )

    @Volatile private var pending: String? = null

    /** Aktuell aktives Icon (bzw. das vorgemerkte, falls noch nicht angewandt). */
    @PluginMethod
    fun get(call: PluginCall) {
        val ret = JSObject()
        ret.put("icon", pending ?: current())
        ret.put("pending", pending != null)
        call.resolve(ret)
    }

    /** Icon vormerken — wird beim Verlassen der App übernommen. */
    @PluginMethod
    fun set(call: PluginCall) {
        val name = call.getString("icon") ?: "default"
        if (!aliases.containsKey(name)) {
            call.reject("Unbekanntes Icon: $name")
            return
        }
        pending = if (name == current()) null else name
        val ret = JSObject()
        ret.put("pending", pending != null)
        call.resolve(ret)
    }

    override fun handleOnStop() {
        super.handleOnStop()
        val name = pending ?: return
        pending = null
        try {
            apply(name)
        } catch (_: Exception) {
            // Launcher/Gerät verweigert es — dann bleibt das bisherige Icon.
        }
    }

    private fun component(alias: String) = ComponentName(context.packageName, context.packageName + alias)

    private fun current(): String {
        val pm = context.packageManager
        for ((name, alias) in aliases) {
            val state = pm.getComponentEnabledSetting(component(alias))
            val enabled = state == PackageManager.COMPONENT_ENABLED_STATE_ENABLED ||
                (state == PackageManager.COMPONENT_ENABLED_STATE_DEFAULT && name == "default")
            if (enabled) return name
        }
        return "default"
    }

    /** Erst das neue Icon aktivieren, dann die anderen deaktivieren (nie ohne Launcher-Eintrag). */
    private fun apply(name: String) {
        val pm = context.packageManager
        pm.setComponentEnabledSetting(
            component(aliases.getValue(name)),
            PackageManager.COMPONENT_ENABLED_STATE_ENABLED,
            PackageManager.DONT_KILL_APP,
        )
        for ((other, alias) in aliases) {
            if (other == name) continue
            pm.setComponentEnabledSetting(
                component(alias),
                PackageManager.COMPONENT_ENABLED_STATE_DISABLED,
                PackageManager.DONT_KILL_APP,
            )
        }
    }
}
