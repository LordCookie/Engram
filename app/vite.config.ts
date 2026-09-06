import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import basicSsl from '@vitejs/plugin-basic-ssl';

// Heimnetz-Freigabe fürs Handy: `LAN=1 npm run dev` bindet an 0.0.0.0 und schaltet
// HTTPS (selbstsigniert) ein — nötig, weil die Kamera (getUserMedia) nur in einem
// sicheren Kontext läuft (HTTPS oder localhost), NICHT über http://<LAN-IP>.
// Ohne LAN bleibt der Dev-Server http://localhost (Vorschaufenster unverändert).
const lan = process.env.LAN === '1' || process.env.LAN === 'true';

// https://vitejs.dev/config/
export default defineConfig({
  server: lan ? { host: true, port: 5174 } : undefined,
  plugins: [
    react(),
    ...(lan ? [basicSsl()] : []),
    VitePWA({
      registerType: 'autoUpdate',
      // Kartenbilder offline verfügbar machen (§ 8-konform: nichts im Repo/Bundle,
      // nur ein lokaler Cache auf dem Gerät des Nutzers). Die CDN-URLs sind
      // signiert und wechseln je Session → `ignoreSearch` matcht über die Signatur
      // hinweg am Pfad, `statuses: [0, 200]` erlaubt opaque cross-origin-Antworten.
      workbox: {
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/[^/]+\.cloudfront\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'card-images',
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreSearch: true },
              expiration: { maxEntries: 400, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: { enabled: true, type: 'module' },
      manifest: {
        name: 'engram',
        short_name: 'engram',
        description: 'Local-first Sammlungs- und Deckbau-Tool fürs Cyberpunk TCG',
        theme_color: '#0b0f14',
        background_color: '#0b0f14',
        display: 'standalone',
        start_url: '/',
        icons: [],
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'tests/**/*.test.ts'],
  },
});
