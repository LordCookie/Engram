import { useEffect, useState } from 'react';
import { db } from '../db/db';

/**
 * Frische, signierte Karten-Bild-URLs von der NetDeck-API. Die in
 * `printings.json` gespeicherten source-URLs brauchen eine ablaufende Signatur
 * und laden nicht direkt. Wir holen daher zur Laufzeit frische signierte URLs
 * und zeigen die Bilder via <img> direkt vom offiziellen CDN.
 *
 * PLAN.md § 8: keine Kartenbilder herunterladen/verteilen — nur verlinken.
 * PLAN.md § 3: kein LocalStorage; die letzte URL-Tabelle wird in Dexie gespiegelt.
 * Es werden KEINE Nutzerdaten gesendet (generischer GET auf die Karten-API).
 *
 * Robust gegen die (öfter mal abstürzende) NetDeck-API: **cache-first**. Zuerst die
 * zuletzt in Dexie gespiegelten URLs anzeigen (der Service-Worker matcht das Bild am
 * Pfad aus seinem Cache — abgelaufene Signatur stört nicht), DANN im Hintergrund mit
 * Timeout aktualisieren. Hängt/streikt die API, bleibt die App auf dem letzten Stand
 * statt leer. Einmal „Alle Bilder offline laden" gedrückt → dauerhaft offline-fest.
 */
const API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const META_KEY = 'cardImageUrls';
const FETCH_TIMEOUT_MS = 8000;

let cache: Map<string, string> | null = null;
let inflight: Promise<Map<string, string>> | null = null;

async function persist(map: Map<string, string>): Promise<void> {
  try {
    await db.meta.put({ key: META_KEY, value: Object.fromEntries(map) });
  } catch {
    /* Persistenz ist best-effort; Anzeige funktioniert auch ohne. */
  }
}

async function loadPersisted(): Promise<Map<string, string>> {
  try {
    const row = await db.meta.get(META_KEY);
    const obj = (row?.value ?? {}) as Record<string, string>;
    return new Map(Object.entries(obj));
  } catch {
    return new Map<string, string>();
  }
}

/** fetch mit hartem Timeout — eine hängende API darf die Bildanzeige nicht blockieren. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

export async function loadCardImages(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      // Sofort das zuletzt Gespeicherte übernehmen (falls vorhanden) — die App zeigt
      // Bilder aus dem SW-Cache, auch wenn die API gerade tot ist.
      const persisted = await loadPersisted();
      if (persisted.size > 0 && !cache) cache = persisted;

      const map = new Map<string, string>();
      try {
        const limit = 100;
        for (let offset = 0; ; offset += limit) {
          const res = await fetchWithTimeout(`${API}?limit=${limit}&offset=${offset}`, FETCH_TIMEOUT_MS);
          if (!res.ok) break;
          const json = (await res.json()) as {
            total?: number;
            items?: { slug?: string; image_url?: string }[];
          };
          for (const it of json.items ?? []) {
            if (it.slug && it.image_url) map.set(it.slug, it.image_url);
          }
          if (offset + limit >= (json.total ?? 0)) break;
        }
      } catch {
        /* offline / Timeout / API-Absturz → das Persistierte behalten */
      }
      if (map.size > 0) {
        cache = map;
        void persist(map);
        return map;
      }
      cache = persisted;
      return persisted;
    })();
  }
  return inflight;
}

/**
 * React-Hook: liefert die Slug→Bild-URL-Tabelle. Zeigt SOFORT die persistierten URLs
 * (falls vorhanden) und aktualisiert dann im Hintergrund — so bleibt die Anzeige auch
 * bei langsamer/toter API sofort da.
 */
export function useCardImages(): ReadonlyMap<string, string> {
  const [map, setMap] = useState<ReadonlyMap<string, string>>(() => cache ?? new Map());
  useEffect(() => {
    let alive = true;
    if (!cache) void loadPersisted().then((p) => { if (alive && !cache && p.size) setMap(p); });
    void loadCardImages().then((m) => { if (alive) setMap(m); });
    return () => {
      alive = false;
    };
  }, []);
  return map;
}
