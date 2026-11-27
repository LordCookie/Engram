import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Brücke zum nativen Plugin `EngramUpdate` (android/…/EngramUpdatePlugin.kt): APK des
 * neuesten Releases laden (mit Fortschritt), prüfen, Android-Installer öffnen; dazu
 * `fetchText` für das Datenpaket (GitHub-Downloads haben kein CORS). Im Browser und in
 * APKs vor v0.4 nicht vorhanden.
 */

export interface DownloadedApk {
  size: number;
  packageName?: string;
  versionName?: string;
  versionCode?: number;
  samePackage: boolean;
  newer: boolean;
  /** Fehlt, wenn sich die Signatur nicht lesen ließ. */
  sameSigner?: boolean;
  /** Die passende APK lag schon da (zweiter Versuch) — nicht neu geladen. */
  reused?: boolean;
}

interface EngramUpdatePlugin {
  /** Mit `sha256` prüft das Plugin die Prüfsumme (sonst Fehlercode CHECKSUM). */
  download(opts: { url: string; sha256?: string }): Promise<DownloadedApk>;
  canInstall(): Promise<{ allowed: boolean }>;
  openInstallSettings(): Promise<void>;
  install(): Promise<void>;
  fetchText(opts: { url: string }): Promise<{ text: string }>;
  addListener(event: 'progress', cb: (p: { done: number; total: number }) => void): Promise<PluginListenerHandle>;
}

export const EngramUpdate = registerPlugin<EngramUpdatePlugin>('EngramUpdate');

/** Läuft die App nativ mit dem Update-Plugin? */
export const nativeUpdates = (): boolean =>
  Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('EngramUpdate');
