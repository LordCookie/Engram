import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import type { TextLine } from '../domain/cardText';

/**
 * Brücke zum nativen Kotlin-Plugin `EngramCamera` (android/…/EngramCameraPlugin.kt,
 * Scanner v2 aus ScryGlass): CameraX-Vorschau hinter der transparenten WebView +
 * ML-Kit-Texterkennung auf dem Gerät. Liefert pro ausgewertetem Bild ein
 * `frame`-Event. Im Browser (und in alten APKs) nicht vorhanden — dort bleibt der
 * Scanner bei getUserMedia + Tesseract.
 */

/** Rechteck normiert auf die WebView (0..1). */
export interface ReticleRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface NativeFrame {
  /** Bild zu unscharf → keine Texterkennung gelaufen. */
  blurry: boolean;
  sharpness: number;
  /** Textzeilen mit Position relativ zum Kartenausschnitt. */
  lines?: TextLine[];
  /**
   * Kartenausschnitt als JPEG (Base64) für den Bild-Hash — der Rahmen plus etwas Rand
   * (für die Ausschnitt-Suche gegen Versatz).
   */
  crop?: string;
  /** Lage des Rahmens im `crop`-Bild, normiert 0..1 (fehlt = ganzes Bild). */
  cropBox?: { l: number; t: number; r: number; b: number };
}

export interface EngramCameraPlugin {
  start(
    options: ReticleRect & { sharpMin?: number },
  ): Promise<{ torch: boolean; zoomMin?: number; zoomMax?: number }>;
  stop(): Promise<void>;
  setReticle(options: ReticleRect): Promise<void>;
  focus(options: { x: number; y: number }): Promise<void>;
  setTorch(options: { on: boolean }): Promise<void>;
  setZoom(options: { ratio: number }): Promise<void>;
  addListener(eventName: 'frame', cb: (frame: NativeFrame) => void): Promise<PluginListenerHandle>;
}

export const EngramCamera = registerPlugin<EngramCameraPlugin>('EngramCamera');

/** Native Kamera nutzbar? (nur in der Android-App mit registriertem Plugin) */
export function hasNativeCamera(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('EngramCamera');
}

/** Rechteck eines Elements, normiert auf das Browserfenster (= WebView). */
export function reticleOf(el: Element): ReticleRect {
  const r = el.getBoundingClientRect();
  const w = window.innerWidth || 1;
  const h = window.innerHeight || 1;
  return { left: r.left / w, top: r.top / h, width: r.width / w, height: r.height / h };
}
