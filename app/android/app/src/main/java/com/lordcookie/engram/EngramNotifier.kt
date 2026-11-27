package com.lordcookie.engram

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.job.JobInfo
import android.app.job.JobScheduler
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.util.Calendar

/**
 * Täglicher Update-Blick (Muster aus ScryGlass): gegen 12 Uhr bei GitHub nachsehen, ob es
 * eine neue App-Version oder ein neues Datenpaket (Korpus + Meta-Decks, Release „data") gibt,
 * und per Benachrichtigung Bescheid geben — auch wenn die App zu ist. Läuft über den
 * eingebauten JobScheduler (keine Bibliothek, wartet auf Netz, übersteht Neustarts).
 *
 * Prüft dasselbe wie die App (`ui/updates.ts`): höchstes `vX.Y.Z` mit APK (Pre-Releases
 * zählen mit, engram veröffentlicht so) und das Label des Datenpakets gegen den Stand, den die
 * App mitteilt. Jede Version wird nur einmal gemeldet. Texte in der App-Sprache (de/en).
 */
object EngramNotifier {
    const val JOB_ID = 4713
    const val EXTRA_OPEN_UPDATES = "engram.openUpdates"
    private const val CHANNEL = "updates"
    private const val PREFS = "engram_updates"
    private const val REPO = "LordCookie/Engram"
    private const val DATA_ASSET = "engram-data.json"
    /** Fenster: ab 12 Uhr, spätestens 14 Uhr (Android bündelt Hintergrundarbeit). */
    private const val HOUR = 12
    private const val WINDOW_MS = 2L * 60 * 60 * 1000
    private val VERSION = Regex("^v?(\\d+)\\.(\\d+)(?:\\.(\\d+))?$", RegexOption.IGNORE_CASE)
    private val STAMP = Regex("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$")

    private fun prefs(ctx: Context) = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    fun configure(ctx: Context, enabled: Boolean, dataStamp: String?, lang: String?) {
        val e = prefs(ctx).edit().putBoolean("enabled", enabled)
        if (!dataStamp.isNullOrEmpty()) e.putString("dataStamp", dataStamp)
        if (!lang.isNullOrEmpty()) e.putString("lang", lang)
        e.apply()
        if (enabled) schedule(ctx) else cancel(ctx)
    }

    private fun enabled(ctx: Context): Boolean = prefs(ctx).getBoolean("enabled", false)

    /** Nächsten Lauf planen: heute 12 Uhr, wenn noch nicht vorbei, sonst morgen. */
    fun schedule(ctx: Context) {
        if (!enabled(ctx)) return
        val now = Calendar.getInstance()
        val next = (now.clone() as Calendar).apply {
            set(Calendar.HOUR_OF_DAY, HOUR)
            set(Calendar.MINUTE, 0)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)
            if (!after(now)) add(Calendar.DAY_OF_MONTH, 1)
        }
        val delay = next.timeInMillis - now.timeInMillis
        val job = JobInfo.Builder(JOB_ID, ComponentName(ctx, UpdateCheckJob::class.java))
            .setMinimumLatency(delay)
            .setOverrideDeadline(delay + WINDOW_MS)
            .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
            .setPersisted(true)
            .build()
        (ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).schedule(job)
    }

    private fun cancel(ctx: Context) {
        (ctx.getSystemService(Context.JOB_SCHEDULER_SERVICE) as JobScheduler).cancel(JOB_ID)
    }

    // --- Prüfen -----------------------------------------------------------------------

    private fun get(url: String, ua: String): String {
        val c = URL(url).openConnection() as HttpURLConnection
        c.connectTimeout = 15_000
        c.readTimeout = 20_000
        c.setRequestProperty("User-Agent", ua)
        c.setRequestProperty("Accept", "application/vnd.github+json")
        try {
            if (c.responseCode != 200) throw IllegalStateException("HTTP ${c.responseCode}")
            return c.inputStream.bufferedReader().use { it.readText() }
        } finally {
            c.disconnect()
        }
    }

    private fun parse(v: String): List<Int>? {
        val m = VERSION.matchEntire(v.trim()) ?: return null
        return listOf(m.groupValues[1].toInt(), m.groupValues[2].toInt(), m.groupValues[3].ifEmpty { "0" }.toInt())
    }

    private fun newer(a: String, b: String): Boolean {
        val x = parse(a) ?: return false
        val y = parse(b) ?: return true
        for (i in 0..2) if (x[i] != y[i]) return x[i] > y[i]
        return false
    }

    /** Höchstes Release `vX.Y.Z` (kein Entwurf; Pre-Releases zählen) mit einer `.apk`. */
    private fun latestApp(json: String): String? {
        var best: String? = null
        val arr = JSONArray(json)
        for (i in 0 until arr.length()) {
            val r = arr.getJSONObject(i)
            if (r.optBoolean("draft")) continue
            val tag = r.optString("tag_name")
            if (parse(tag) == null) continue
            val assets = r.optJSONArray("assets") ?: continue
            val hasApk = (0 until assets.length()).any { assets.getJSONObject(it).optString("name").lowercase().endsWith(".apk") }
            val version = tag.removePrefix("v").removePrefix("V")
            if (hasApk && (best == null || newer(version, best))) best = version
        }
        return best
    }

    /** Stand des Datenpakets: Label (Erstellungszeit), sonst updated_at — wie `findDataAsset`. */
    private fun dataStamp(json: String): String? {
        val assets = JSONObject(json).optJSONArray("assets") ?: return null
        for (i in 0 until assets.length()) {
            val a = assets.getJSONObject(i)
            if (a.optString("name") != DATA_ASSET) continue
            val label = a.optString("label")
            return if (STAMP.matches(label)) label else a.optString("updated_at").takeIf { STAMP.matches(it) }
        }
        return null
    }

    /** Einmal nachsehen und ggf. benachrichtigen. Fehler (offline …) → still, morgen wieder. */
    fun check(ctx: Context) {
        val installed = try {
            ctx.packageManager.getPackageInfo(ctx.packageName, 0).versionName ?: ""
        } catch (e: Exception) { "" }
        val ua = "engram/$installed (Android; Update-Check)"
        val p = prefs(ctx)

        val app = try { latestApp(get("https://api.github.com/repos/$REPO/releases?per_page=20", ua)) } catch (e: Exception) { null }
        val data = try { dataStamp(get("https://api.github.com/repos/$REPO/releases/tags/data", ua)) } catch (e: Exception) { null }

        val newApp = app?.takeIf { newer(it, installed) && it != p.getString("notifiedApp", null) }
        val local = p.getString("dataStamp", null)
        // Daten nur melden, wenn die App ihren Stand schon mitgeteilt hat (gleiches Format → Textvergleich).
        val newData = data?.takeIf { !local.isNullOrEmpty() && it > local && it != p.getString("notifiedData", null) }
        if (newApp == null && newData == null) return
        if (notify(ctx, newApp, newData != null)) {
            p.edit().apply {
                if (newApp != null) putString("notifiedApp", newApp)
                if (newData != null) putString("notifiedData", newData)
            }.apply()
        }
    }

    private fun notify(ctx: Context, app: String?, data: Boolean): Boolean {
        if (Build.VERSION.SDK_INT >= 33 &&
            ContextCompat.checkSelfPermission(ctx, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            return false
        }
        val en = prefs(ctx).getString("lang", "de") == "en"
        if (Build.VERSION.SDK_INT >= 26) {
            val nm = ctx.getSystemService(NotificationManager::class.java)
            if (nm.getNotificationChannel(CHANNEL) == null) {
                nm.createNotificationChannel(NotificationChannel(CHANNEL, "Updates", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = if (en) "New app version or new data" else "Neue App-Version oder neue Daten"
                })
            }
        }
        val title = when {
            app != null -> if (en) "engram: update available" else "engram: Update verfügbar"
            else -> if (en) "engram: new data" else "engram: Neue Daten"
        }
        val text = when {
            app != null && data -> if (en) "Version $app and fresh corpus & meta decks are ready. Tap to update."
                else "Version $app und frisches Korpus & Meta-Decks sind bereit. Antippen zum Laden."
            app != null -> if (en) "Version $app is ready. Tap to update." else "Version $app ist bereit. Antippen zum Laden."
            else -> if (en) "Fresh corpus & meta decks are ready. Tap to load." else "Frisches Korpus & Meta-Decks sind bereit. Antippen zum Laden."
        }
        val open = ctx.packageManager.getLaunchIntentForPackage(ctx.packageName)?.apply {
            putExtra(EXTRA_OPEN_UPDATES, true)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
        } ?: return false
        val pi = PendingIntent.getActivity(ctx, 0, open, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE)
        val n = NotificationCompat.Builder(ctx, CHANNEL)
            .setSmallIcon(R.drawable.ic_stat_engram)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setContentIntent(pi)
            .setAutoCancel(true)
            .build()
        return try {
            NotificationManagerCompat.from(ctx).notify(JOB_ID, n)
            true
        } catch (e: SecurityException) {
            false
        }
    }
}
