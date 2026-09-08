import type { CapacitorConfig } from '@capacitor/cli';

/**
 * Capacitor-Konfiguration für die native App-Verpackung (Phase 5).
 * webDir = Vite-Build-Ausgabe (`dist`). Die App lädt das gebaute PWA-Bundle nativ;
 * dieselbe framework-freie Domäne (inkl. Deck-Test) läuft unverändert im WebView.
 */
const config: CapacitorConfig = {
  appId: 'com.lordcookie.engram',
  appName: 'engram',
  webDir: 'dist',
};

export default config;
