package com.lordcookie.engram

import android.content.Intent
import android.content.pm.PackageInfo
import android.content.pm.PackageManager
import android.content.pm.Signature
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.concurrent.Executors

/**
 * App-Update aus der App heraus: lädt die APK des neuesten GitHub-Releases, prüft sie und
 * öffnet den Android-Installer (der Nutzer bestätigt dort mit einem Tipp — still installieren
 * dürfen Apps außerhalb des Play Stores nicht).
 *
 * Geprüft wird vor dem Installer: Prüfsumme (SHA-256 aus der `.sha256` im Release, seit v0.5),
 * gleiches Paket, höhere Version, gleicher Signierschlüssel.
 * Ein anderer Schlüssel (z. B. APK auf einem anderen PC gebaut) ließe Android die Installation
 * ohnehin ablehnen — so gibt es vorher eine verständliche Meldung.
 *
 * Außerdem `fetchText` für das Datenpaket: Downloads von GitHub-Releases haben kein CORS,
 * die WebView darf sie nicht selbst laden.
 */
@CapacitorPlugin(name = "EngramUpdate")
class EngramUpdatePlugin : Plugin() {

    private val io = Executors.newSingleThreadExecutor()

    private fun updateDir() = File(context.cacheDir, "updates")
    private fun apkFile() = File(updateDir(), "engram-update.apk")

    override fun load() {
        // Reste eines früheren Updates aufräumen (nach dem Installieren bleibt die APK liegen).
        io.execute { updateDir().deleteRecursively() }
    }

    private fun open(url: String): HttpURLConnection {
        val conn = URL(url).openConnection() as HttpURLConnection
        conn.instanceFollowRedirects = true // github.com → Download-Server (beides https)
        conn.connectTimeout = 15_000
        conn.readTimeout = 30_000
        conn.setRequestProperty("User-Agent", "engram-app")
        return conn
    }

    /**
     * APK laden (mit `progress`-Events), danach prüfen. Mit `sha256` (aus der `.sha256` im
     * Release) wird die Prüfsumme beim Laden mitgerechnet — passt sie nicht, ist die Datei weg
     * (Code CHECKSUM). Liegt die passende APK schon da (zweiter Versuch), wird nicht neu geladen.
     */
    @PluginMethod
    fun download(call: PluginCall) {
        val url = call.getString("url")
        val expected = call.getString("sha256")?.lowercase()
        if (url.isNullOrBlank() || !url.startsWith("https://")) {
            call.reject("Ungültige Adresse", "BAD_URL")
            return
        }
        io.execute {
            try {
                val apk = apkFile()
                if (expected != null && apk.isFile && sha256(apk) == expected) {
                    notifyListeners("progress", JSObject().put("done", apk.length()).put("total", apk.length()))
                    call.resolve(inspect(apk).put("reused", true))
                    return@execute
                }
                val dir = updateDir().apply { mkdirs() }
                val tmp = File(dir, "engram-update.part")
                val conn = open(url)
                if (conn.responseCode !in 200..299) {
                    call.reject("Download fehlgeschlagen (HTTP ${conn.responseCode})", "HTTP")
                    return@execute
                }
                val total = conn.contentLengthLong
                var done = 0L
                var lastEmit = 0L
                val md = MessageDigest.getInstance("SHA-256")
                conn.inputStream.use { input ->
                    tmp.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf)
                            if (n < 0) break
                            out.write(buf, 0, n)
                            md.update(buf, 0, n)
                            done += n
                            val now = System.currentTimeMillis()
                            if (now - lastEmit > 200) {
                                lastEmit = now
                                notifyListeners("progress", JSObject().put("done", done).put("total", total))
                            }
                        }
                    }
                }
                if (total > 0 && done != total) {
                    tmp.delete()
                    call.reject("Download unvollständig", "INCOMPLETE")
                    return@execute
                }
                if (expected != null && hex(md.digest()) != expected) {
                    tmp.delete()
                    call.reject("Prüfsumme stimmt nicht", "CHECKSUM")
                    return@execute
                }
                apk.delete()
                tmp.renameTo(apk)
                notifyListeners("progress", JSObject().put("done", done).put("total", done))
                call.resolve(inspect(apk))
            } catch (e: Exception) {
                call.reject("Download fehlgeschlagen: ${e.message}", "NETWORK")
            }
        }
    }

    /** Darf engram Apps installieren? (Ab Android 8 eine Einstellung pro App.) */
    @PluginMethod
    fun canInstall(call: PluginCall) {
        val allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O ||
            context.packageManager.canRequestPackageInstalls()
        call.resolve(JSObject().put("allowed", allowed))
    }

    /** Öffnet die Einstellung „Unbekannte Apps installieren" für engram. */
    @PluginMethod
    fun openInstallSettings(call: PluginCall) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val intent = Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}"))
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            activity.runOnUiThread { activity.startActivity(intent) }
        }
        call.resolve()
    }

    /** Startet den Android-Installer für die geladene APK (nach erneuter Prüfung). */
    @PluginMethod
    fun install(call: PluginCall) {
        val apk = apkFile()
        if (!apk.exists()) {
            call.reject("Keine geladene Version gefunden", "NO_FILE")
            return
        }
        val info = inspect(apk)
        when {
            info.getBoolean("samePackage", false) != true -> call.reject("Die Datei ist keine engram-App", "WRONG_PACKAGE")
            info.getBoolean("newer", false) != true -> call.reject("Die geladene Version ist nicht neuer", "NOT_NEWER")
            info.has("sameSigner") && info.getBoolean("sameSigner", true) == false ->
                call.reject("Die neue Version ist anders signiert", "SIGNATURE")
            else -> {
                val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
                val intent = Intent(Intent.ACTION_VIEW)
                    .setDataAndType(uri, "application/vnd.android.package-archive")
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK)
                activity.runOnUiThread {
                    try {
                        activity.startActivity(intent)
                        call.resolve()
                    } catch (e: Exception) {
                        call.reject("Installer ließ sich nicht öffnen: ${e.message}", "INSTALLER")
                    }
                }
            }
        }
    }

    /** Kleiner Text-Download (Datenpaket), max. 5 MB. */
    @PluginMethod
    fun fetchText(call: PluginCall) {
        val url = call.getString("url")
        if (url.isNullOrBlank() || !url.startsWith("https://")) {
            call.reject("Ungültige Adresse", "BAD_URL")
            return
        }
        io.execute {
            try {
                val conn = open(url)
                if (conn.responseCode !in 200..299) {
                    call.reject("Download fehlgeschlagen (HTTP ${conn.responseCode})", "HTTP")
                    return@execute
                }
                val bytes = conn.inputStream.use { it.readBytes() }
                if (bytes.size > 5 * 1024 * 1024) {
                    call.reject("Datei zu groß", "TOO_LARGE")
                    return@execute
                }
                call.resolve(JSObject().put("text", String(bytes, Charsets.UTF_8)))
            } catch (e: Exception) {
                call.reject("Download fehlgeschlagen: ${e.message}", "NETWORK")
            }
        }
    }

    // --- Prüfung der geladenen APK -----------------------------------------------------

    private fun hex(bytes: ByteArray): String = bytes.joinToString("") { "%02x".format(it) }

    private fun sha256(file: File): String {
        val md = MessageDigest.getInstance("SHA-256")
        file.inputStream().use { input ->
            val buf = ByteArray(64 * 1024)
            while (true) {
                val n = input.read(buf)
                if (n <= 0) break
                md.update(buf, 0, n)
            }
        }
        return hex(md.digest())
    }

    @Suppress("DEPRECATION")
    private fun sigFlags(): Int =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) PackageManager.GET_SIGNING_CERTIFICATES
        else PackageManager.GET_SIGNATURES

    @Suppress("DEPRECATION")
    private fun versionCodeOf(info: PackageInfo): Long =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) info.longVersionCode else info.versionCode.toLong()

    @Suppress("DEPRECATION")
    private fun signerDigests(info: PackageInfo?): Set<String>? {
        if (info == null) return null
        val sigs: Array<Signature>? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            val si = info.signingInfo ?: return null
            if (si.hasMultipleSigners()) si.apkContentsSigners else si.signingCertificateHistory
        } else {
            info.signatures
        }
        if (sigs.isNullOrEmpty()) return null
        val md = MessageDigest.getInstance("SHA-256")
        return sigs.map { s -> md.digest(s.toByteArray()).joinToString("") { "%02x".format(it) } }.toSet()
    }

    private fun inspect(apk: File): JSObject {
        val pm = context.packageManager
        val ret = JSObject().put("size", apk.length())
        @Suppress("DEPRECATION")
        val archive = pm.getPackageArchiveInfo(apk.path, sigFlags())
        if (archive == null) {
            ret.put("samePackage", false).put("newer", false)
            return ret
        }
        @Suppress("DEPRECATION")
        val installed = pm.getPackageInfo(context.packageName, sigFlags())
        ret.put("packageName", archive.packageName)
        ret.put("versionName", archive.versionName ?: "")
        ret.put("versionCode", versionCodeOf(archive))
        ret.put("samePackage", archive.packageName == context.packageName)
        ret.put("newer", versionCodeOf(archive) > versionCodeOf(installed))
        val a = signerDigests(archive)
        val b = signerDigests(installed)
        if (a != null && b != null) ret.put("sameSigner", a.intersect(b).isNotEmpty())
        return ret
    }
}
