import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * Brücke zum täglichen Update-Blick (android/…/EngramNotifierPlugin.kt): gegen 12 Uhr bei
 * GitHub nachsehen und per Benachrichtigung Bescheid geben, auch wenn die App zu ist.
 * Im Browser und in APKs vor v0.5 nicht vorhanden.
 */
interface EngramNotifierPlugin {
  /** an/aus, Stand der Daten (zum Vergleichen im Hintergrund) und Sprache der Texte */
  configure(opts: { enabled: boolean; dataStamp?: string; lang?: string }): Promise<void>;
  /** Android 13+: Erlaubnis für Benachrichtigungen (vorher immer erlaubt) */
  requestPermission(): Promise<{ granted: boolean }>;
  /** Wurde die App über die Update-Benachrichtigung geöffnet? */
  consumeLaunch(): Promise<{ openUpdates: boolean }>;
  addListener(event: 'openUpdates', cb: () => void): Promise<PluginListenerHandle>;
}

export const EngramNotifier = registerPlugin<EngramNotifierPlugin>('EngramNotifier');

/** Läuft die App nativ (Android) mit dem Benachrichtigungs-Plugin? */
export const nativeNotifier = (): boolean =>
  Capacitor.getPlatform() === 'android' && Capacitor.isPluginAvailable('EngramNotifier');
