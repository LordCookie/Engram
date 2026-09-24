package com.lordcookie.engram

import android.Manifest
import android.graphics.Bitmap
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.drawable.Drawable
import android.os.SystemClock
import android.util.Base64
import android.util.Size
import android.view.View
import android.view.ViewGroup
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.FocusMeteringAction
import androidx.camera.core.ImageAnalysis
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.core.resolutionselector.AspectRatioStrategy
import androidx.camera.core.resolutionselector.ResolutionSelector
import androidx.camera.core.resolutionselector.ResolutionStrategy
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.Text
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.TextRecognizer
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import java.io.ByteArrayOutputStream
import java.util.concurrent.ExecutorService
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit
import kotlin.math.max
import kotlin.math.min
import kotlin.math.roundToInt

/**
 * Native Scanner-Kamera (Scanner v2, übernommen aus ScryGlass): CameraX-Vorschau
 * HINTER der (dann transparenten) WebView, Bildauswertung direkt auf dem Gerät.
 * Pro Analyse-Bild:
 *   Kartenausschnitt (Reticle) → Schärfeprüfung (Laplace-Varianz, wie domain/focus.ts)
 *   → Texterkennung mit ML Kit (gebündelt, offline) → Event „frame" an JS mit den
 *   Textzeilen (Position relativ zur Karte) + kleinem JPEG des Ausschnitts für den
 *   Bild-Hash (der bleibt bit-identisch in JS/Pipeline).
 * Abgleich, Fusion und Korb bleiben in JS. Keine Kamerabilder verlassen das Gerät.
 * Im Browser gibt es dieses Plugin nicht — dort läuft weiter getUserMedia + Tesseract.
 */
@CapacitorPlugin(
    name = "EngramCamera",
    permissions = [Permission(strings = [Manifest.permission.CAMERA], alias = "camera")]
)
class EngramCameraPlugin : Plugin() {

    private var previewView: PreviewView? = null
    private var camera: Camera? = null
    private var provider: ProcessCameraProvider? = null
    private var analysisExecutor: ExecutorService? = null
    private var recognizer: TextRecognizer? = null
    private var layoutListener: View.OnLayoutChangeListener? = null
    private var webViewBackground: Drawable? = null
    // Use-Cases merken: bei Drehung (Activity wird NICHT neu erzeugt, configChanges)
    // muss ihnen die neue Displaylage mitgeteilt werden — sonst liegt das Analysebild quer.
    private var previewUseCase: Preview? = null
    private var analysisUseCase: ImageAnalysis? = null

    // Reticle normiert auf die WebView (0..1) — von JS gesetzt.
    @Volatile private var retL = 0.1f
    @Volatile private var retT = 0.2f
    @Volatile private var retW = 0.8f
    @Volatile private var retH = 0.6f

    // Geometrie (auf dem Main-Thread gemessen): PreviewView-Größe + WebView-Lage darin.
    @Volatile private var viewW = 0
    @Volatile private var viewH = 0
    @Volatile private var wvOffX = 0f
    @Volatile private var wvOffY = 0f
    @Volatile private var wvW = 0f
    @Volatile private var wvH = 0f

    @Volatile private var analyzing = false
    @Volatile private var busy = false
    @Volatile private var lastRun = 0L
    /** Schärfe-Gate (Laplace-Varianz); 0 = aus. Von JS gesetzt (start). */
    @Volatile private var sharpMin = DEFAULT_SHARP_MIN
    /** „card" = Texterkennung + Hash-Ausschnitt; „qr" = nur Ausschnitt fürs Deck-QR (jsQR in JS). */
    @Volatile private var mode = "card"

    @PluginMethod
    fun start(call: PluginCall) {
        readReticle(call)
        sharpMin = call.getDouble("sharpMin") ?: DEFAULT_SHARP_MIN
        mode = call.getString("mode") ?: "card"
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "cameraPermsCallback")
            return
        }
        startCamera(call)
    }

    @PermissionCallback
    private fun cameraPermsCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED) startCamera(call)
        else call.reject("Kamerazugriff verweigert.")
    }

    private fun startCamera(call: PluginCall) {
        activity.runOnUiThread {
            try {
                teardown()
                val webView = bridge.webView
                val parent = webView.parent as ViewGroup
                val pv = PreviewView(context).apply {
                    // TextureView (COMPATIBLE) mischt sich sauber hinter die transparente WebView.
                    implementationMode = PreviewView.ImplementationMode.COMPATIBLE
                    scaleType = PreviewView.ScaleType.FILL_CENTER
                }
                parent.addView(
                    pv,
                    0,
                    ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT),
                )
                val listener = View.OnLayoutChangeListener { _, _, _, _, _, _, _, _, _ -> updateGeometry() }
                pv.addOnLayoutChangeListener(listener)
                webView.addOnLayoutChangeListener(listener)
                layoutListener = listener
                previewView = pv
                webViewBackground = webView.background
                webView.setBackgroundColor(Color.TRANSPARENT)
                pv.post { updateGeometry() }

                val executor = Executors.newSingleThreadExecutor()
                analysisExecutor = executor
                recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

                val future = ProcessCameraProvider.getInstance(context)
                future.addListener({
                    try {
                        val prov = future.get()
                        provider = prov
                        // 4:3 = im Hochformat möglichst viel Höhe (Karten sind hochkant).
                        val selector = ResolutionSelector.Builder()
                            .setAspectRatioStrategy(AspectRatioStrategy.RATIO_4_3_FALLBACK_AUTO_STRATEGY)
                            .setResolutionStrategy(
                                // Eher kleiner als größer: ein 12-MP-Analysebild wäre viel zu langsam.
                                ResolutionStrategy(
                                    Size(1920, 1440),
                                    ResolutionStrategy.FALLBACK_RULE_CLOSEST_LOWER_THEN_HIGHER,
                                ),
                            )
                            .build()
                        val preview = Preview.Builder().setResolutionSelector(selector).build()
                        preview.setSurfaceProvider(pv.surfaceProvider)
                        val analysis = ImageAnalysis.Builder()
                            .setResolutionSelector(selector)
                            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
                            .setOutputImageFormat(ImageAnalysis.OUTPUT_IMAGE_FORMAT_RGBA_8888)
                            .build()
                        analysis.setAnalyzer(executor) { proxy -> analyze(proxy) }
                        previewUseCase = preview
                        analysisUseCase = analysis
                        updateGeometry()
                        prov.unbindAll()
                        val cam = prov.bindToLifecycle(activity, CameraSelector.DEFAULT_BACK_CAMERA, preview, analysis)
                        camera = cam
                        analyzing = true

                        val ret = JSObject()
                        ret.put("torch", cam.cameraInfo.hasFlashUnit())
                        cam.cameraInfo.zoomState.value?.let {
                            ret.put("zoomMin", it.minZoomRatio.toDouble())
                            ret.put("zoomMax", it.maxZoomRatio.toDouble())
                        }
                        call.resolve(ret)
                    } catch (e: Exception) {
                        teardown()
                        call.reject("Kamera-Start fehlgeschlagen: ${e.message}")
                    }
                }, ContextCompat.getMainExecutor(context))
            } catch (e: Exception) {
                teardown()
                call.reject("Kamera-Start fehlgeschlagen: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            teardown()
            call.resolve()
        }
    }

    /** Neue Lage des Scan-Rahmens (normiert auf die WebView). */
    @PluginMethod
    fun setReticle(call: PluginCall) {
        readReticle(call)
        call.resolve()
    }

    /** Tipp-zum-Fokussieren: Punkt normiert auf die WebView → Fokus + Belichtung dorthin. */
    @PluginMethod
    fun focus(call: PluginCall) {
        val x = call.getFloat("x") ?: 0.5f
        val y = call.getFloat("y") ?: 0.5f
        activity.runOnUiThread {
            val pv = previewView
            val cam = camera
            if (pv == null || cam == null) {
                call.resolve()
                return@runOnUiThread
            }
            val point = pv.meteringPointFactory.createPoint(wvOffX + x * wvW, wvOffY + y * wvH)
            val action = FocusMeteringAction.Builder(point, FocusMeteringAction.FLAG_AF or FocusMeteringAction.FLAG_AE)
                .setAutoCancelDuration(4, TimeUnit.SECONDS)
                .build()
            cam.cameraControl.startFocusAndMetering(action)
            call.resolve()
        }
    }

    @PluginMethod
    fun setTorch(call: PluginCall) {
        val on = call.getBoolean("on") ?: false
        activity.runOnUiThread {
            camera?.cameraControl?.enableTorch(on)
            call.resolve()
        }
    }

    @PluginMethod
    fun setZoom(call: PluginCall) {
        val ratio = call.getFloat("ratio") ?: 1f
        activity.runOnUiThread {
            camera?.cameraControl?.setZoomRatio(ratio)
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        activity.runOnUiThread { teardown() }
        super.handleOnDestroy()
    }

    // --- intern -------------------------------------------------------------

    private fun readReticle(call: PluginCall) {
        retL = (call.getFloat("left") ?: retL).coerceIn(0f, 1f)
        retT = (call.getFloat("top") ?: retT).coerceIn(0f, 1f)
        retW = (call.getFloat("width") ?: retW).coerceIn(0.01f, 1f)
        retH = (call.getFloat("height") ?: retH).coerceIn(0.01f, 1f)
    }

    /** Main-Thread: Maße der PreviewView und Lage der WebView darin merken. */
    private fun updateGeometry() {
        val pv = previewView ?: return
        val wv = bridge.webView
        val a = IntArray(2)
        val b = IntArray(2)
        wv.getLocationOnScreen(a)
        pv.getLocationOnScreen(b)
        wvOffX = (a[0] - b[0]).toFloat()
        wvOffY = (a[1] - b[1]).toFloat()
        wvW = wv.width.toFloat()
        wvH = wv.height.toFloat()
        viewW = pv.width
        viewH = pv.height
        // Hoch-/Querformat: Analysebild „aufrecht" relativ zum Display halten.
        pv.display?.rotation?.let { rot ->
            previewUseCase?.targetRotation = rot
            analysisUseCase?.targetRotation = rot
        }
    }

    private fun teardown() {
        analyzing = false
        try {
            provider?.unbindAll()
        } catch (_: Exception) {
        }
        provider = null
        camera = null
        previewUseCase = null
        analysisUseCase = null
        val listener = layoutListener
        previewView?.let { pv ->
            if (listener != null) pv.removeOnLayoutChangeListener(listener)
            (pv.parent as? ViewGroup)?.removeView(pv)
        }
        if (listener != null) bridge.webView.removeOnLayoutChangeListener(listener)
        layoutListener = null
        val hadPreview = previewView != null
        previewView = null
        analysisExecutor?.shutdown()
        analysisExecutor = null
        recognizer?.close()
        recognizer = null
        busy = false
        // WebView wieder so deckend wie vorher (die Seite zeichnet ihren eigenen Hintergrund).
        if (hadPreview) bridge.webView.background = webViewBackground
    }

    /** Analyse-Thread: höchstens alle MIN_INTERVAL_MS ein Bild, nie parallel. */
    private fun analyze(proxy: ImageProxy) {
        val now = SystemClock.elapsedRealtime()
        if (!analyzing || busy || now - lastRun < MIN_INTERVAL_MS || viewW == 0 || viewH == 0 || wvW == 0f) {
            proxy.close()
            return
        }
        busy = true
        lastRun = now

        val upright: Bitmap? = try {
            val raw = proxy.toBitmap()
            val rot = proxy.imageInfo.rotationDegrees
            if (rot != 0) {
                val m = Matrix()
                m.postRotate(rot.toFloat())
                val rotated = Bitmap.createBitmap(raw, 0, 0, raw.width, raw.height, m, true)
                if (rotated !== raw) raw.recycle()
                rotated
            } else {
                raw
            }
        } catch (_: Exception) {
            null
        } finally {
            proxy.close()
        }

        // Ab hier darf nichts „busy" hängen lassen — sonst käme nie wieder ein Bild.
        var crop: Bitmap? = null
        var src: Bitmap? = upright
        try {
            val full = src
            val r = full?.let { reticleRect(it) }
            if (full == null || r == null) {
                full?.recycle()
                busy = false
                return
            }
            crop = Bitmap.createBitmap(full, r[0], r[1], r[2], r[3])

            // Deck-QR: kein Schärfe-Gate, keine Texterkennung — nur den Ausschnitt in
            // brauchbarer Auflösung an JS (jsQR dekodiert dort).
            if (mode == "qr") {
                val qr = JSObject()
                qr.put("blurry", false)
                qr.put("sharpness", 0.0)
                qr.put("qr", qrJpeg(crop))
                emit(qr)
                if (crop !== full) full.recycle()
                src = null
                crop.recycle()
                busy = false
                return
            }

            val sharp = sharpness(crop)
            if (sharpMin > 0 && sharp < sharpMin) {
                val blur = JSObject()
                blur.put("blurry", true)
                blur.put("sharpness", sharp)
                emit(blur)
                if (crop !== full) full.recycle()
                src = null
                crop.recycle()
                busy = false
                return
            }

            // Bild-Hash-Ausschnitt MIT Rand (Ausschnitt-Suche gegen Versatz in JS),
            // danach das große Analysebild sofort freigeben.
            val (jpeg, box) = hashJpeg(full, r)
            if (crop !== full) full.recycle()
            src = null

            val rec = recognizer
            if (rec == null) {
                crop.recycle()
                busy = false
                return
            }
            val w = crop.width
            val h = crop.height
            val bmp = crop
            rec.process(InputImage.fromBitmap(bmp, 0))
                .addOnSuccessListener { text -> emit(framePayload(text, w, h, sharp, jpeg, box)) }
                .addOnFailureListener { _ -> emit(framePayload(null, w, h, sharp, jpeg, box)) }
                .addOnCompleteListener {
                    bmp.recycle()
                    busy = false
                }
        } catch (_: Throwable) {
            if (src != null && src !== crop) src.recycle()
            crop?.recycle()
            busy = false
        }
    }

    /** Reticle (WebView-normiert) → Rechteck [x, y, w, h] im aufrechten Analysebild (FILL_CENTER). */
    private fun reticleRect(bmp: Bitmap): IntArray? {
        if (bmp.width < 2 || bmp.height < 2) return null
        val vw = viewW.toFloat()
        val vh = viewH.toFloat()
        val scale = max(vw / bmp.width, vh / bmp.height)
        val offX = (bmp.width * scale - vw) / 2f
        val offY = (bmp.height * scale - vh) / 2f
        val rx = wvOffX + retL * wvW
        val ry = wvOffY + retT * wvH
        val rw = retW * wvW
        val rh = retH * wvH
        val x = ((rx + offX) / scale).roundToInt().coerceIn(0, bmp.width - 1)
        val y = ((ry + offY) / scale).roundToInt().coerceIn(0, bmp.height - 1)
        val w = (rw / scale).roundToInt().coerceIn(1, bmp.width - x)
        val h = (rh / scale).roundToInt().coerceIn(1, bmp.height - y)
        return intArrayOf(x, y, w, h)
    }

    /**
     * Ausschnitt fürs Bild-Hashing: der Rahmen plus HASH_PAD Rand je Seite (am Bildrand
     * gekappt), so skaliert, dass der Rahmen-Anteil ~146×204 px hat. `box` = Lage des
     * Rahmens im JPEG (0..1), damit JS verschobene Ausschnitte korrekt ansetzen kann.
     */
    private fun hashJpeg(src: Bitmap, r: IntArray): Pair<String, JSObject> {
        val px = (r[2] * HASH_PAD).roundToInt()
        val py = (r[3] * HASH_PAD).roundToInt()
        val x0 = max(0, r[0] - px)
        val y0 = max(0, r[1] - py)
        val x1 = min(src.width, r[0] + r[2] + px)
        val y1 = min(src.height, r[1] + r[3] + py)
        val pw = x1 - x0
        val ph = y1 - y0
        val tw = max(1, (146f * pw / r[2]).roundToInt())
        val th = max(1, (204f * ph / r[3]).roundToInt())
        val padded = Bitmap.createBitmap(src, x0, y0, pw, ph)
        val small = Bitmap.createScaledBitmap(padded, tw, th, true)
        val out = ByteArrayOutputStream()
        small.compress(Bitmap.CompressFormat.JPEG, 90, out)
        if (small !== padded && small !== src) small.recycle()
        if (padded !== src) padded.recycle()
        val box = JSObject()
        box.put("l", (r[0] - x0).toDouble() / pw)
        box.put("t", (r[1] - y0).toDouble() / ph)
        box.put("r", (r[0] + r[2] - x0).toDouble() / pw)
        box.put("b", (r[1] + r[3] - y0).toDouble() / ph)
        return Pair(Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP), box)
    }

    /** Laplace-Varianz auf 128 px Breite — dieselbe Formel wie domain/focus.ts. */
    private fun sharpness(crop: Bitmap): Double {
        val w = 128
        val h = max(3, (crop.height * w.toFloat() / crop.width).roundToInt())
        val small = Bitmap.createScaledBitmap(crop, w, h, true)
        val px = IntArray(w * h)
        small.getPixels(px, 0, w, 0, 0, w, h)
        if (small !== crop) small.recycle()
        val g = IntArray(w * h) { i ->
            val c = px[i]
            (0.299 * ((c shr 16) and 0xff) + 0.587 * ((c shr 8) and 0xff) + 0.114 * (c and 0xff)).toInt()
        }
        var sum = 0.0
        var sumSq = 0.0
        var n = 0
        for (y in 1 until h - 1) {
            for (x in 1 until w - 1) {
                val i = y * w + x
                val lap = (4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]).toDouble()
                sum += lap
                sumSq += lap * lap
                n++
            }
        }
        if (n == 0) return 0.0
        val mean = sum / n
        return sumSq / n - mean * mean
    }

    /** QR-Ausschnitt: längste Seite max. 640 px — genug für jsQR, klein genug für die Brücke. */
    private fun qrJpeg(crop: Bitmap): String {
        val scale = minOf(1f, 640f / max(crop.width, crop.height))
        val w = max(1, (crop.width * scale).roundToInt())
        val h = max(1, (crop.height * scale).roundToInt())
        val small = if (scale < 1f) Bitmap.createScaledBitmap(crop, w, h, true) else crop
        val out = ByteArrayOutputStream()
        small.compress(Bitmap.CompressFormat.JPEG, 85, out)
        if (small !== crop) small.recycle()
        return Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
    }

    private fun framePayload(text: Text?, w: Int, h: Int, sharp: Double, jpeg: String, box: JSObject): JSObject {
        val lines = JSArray()
        if (text != null) {
            for (block in text.textBlocks) {
                for (line in block.lines) {
                    val bb = line.boundingBox ?: continue
                    val o = JSObject()
                    o.put("text", line.text)
                    o.put("l", bb.left.toDouble() / w)
                    o.put("t", bb.top.toDouble() / h)
                    o.put("r", bb.right.toDouble() / w)
                    o.put("b", bb.bottom.toDouble() / h)
                    o.put("conf", line.confidence.toDouble())
                    lines.put(o)
                }
            }
        }
        val ret = JSObject()
        ret.put("blurry", false)
        ret.put("sharpness", sharp)
        ret.put("lines", lines)
        ret.put("crop", jpeg)
        ret.put("cropBox", box)
        return ret
    }

    private fun emit(data: JSObject) {
        if (!analyzing) return
        activity.runOnUiThread { notifyListeners("frame", data) }
    }

    companion object {
        /** ~4 Auswertungen pro Sekunde reichen und schonen den Akku. */
        private const val MIN_INTERVAL_MS = 250L
        /**
         * Laplace-Varianz auf 128 px Breite. Gemessen an Cyberpunk-Karten: scharf ≈ 2000,
         * stark verwackelt noch ≈ 150 — 30 verwirft nur wirklich unbrauchbare Bilder.
         */
        private const val DEFAULT_SHARP_MIN = 30.0
        /**
         * Rand um den Rahmen im Hash-Ausschnitt (Anteil der Rahmengröße je Seite). Die
         * Ausschnitt-Suche in JS greift bis ±3 % Versatz × 1,05 Skalierung ≈ 5,5 % hinaus.
         */
        private const val HASH_PAD = 0.08f
    }
}
