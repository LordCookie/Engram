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
 * Offline: die API liefert keine URLs. Wir greifen dann auf die zuletzt in Dexie
 * gespiegelten (evtl. abgelaufenen) URLs zurück — der Service-Worker matcht das
 * Bild anhand des Pfades aus seinem Cache, die abgelaufene Signatur stört nicht.
 */
const API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const META_KEY = 'cardImageUrls';

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

export async function loadCardImages(): Promise<Map<string, string>> {
  if (cache) return cache;
  if (!inflight) {
    inflight = (async () => {
      const map = new Map<string, string>();
      try {
        const limit = 100;
        for (let offset = 0; ; offset += limit) {
          const res = await fetch(`${API}?limit=${limit}&offset=${offset}`);
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
        /* offline oder API nicht erreichbar → unten auf Dexie zurückfallen */
      }
      if (map.size > 0) {
        cache = map;
        void persist(map);
        return map;
      }
      const stored = await loadPersisted();
      cache = stored;
      return stored;
    })();
  }
  return inflight;
}

/** React-Hook: liefert die (gecachte) Slug→Bild-URL-Tabelle, lädt bei Bedarf. */
export function useCardImages(): ReadonlyMap<string, string> {
  const [map, setMap] = useState<ReadonlyMap<string, string>>(() => cache ?? new Map());
  useEffect(() => {
    let alive = true;
    void loadCardImages().then((m) => {
      if (alive) setMap(m);
    });
    return () => {
      alive = false;
    };
  }, []);
  return map;
}
