import type { NetdeckItem } from '../domain/cardImport';

/**
 * Die Kartenliste der NetDeck-API (dieselbe Quelle wie `pipeline/fetch_cards.py`), einmal
 * pro App-Start geholt und geteilt: die Bilder (`cardImages.ts`) brauchen die frischen
 * signierten URLs, die Update-Prüfung sieht daran, ob es neue Karten gibt. Kein Nutzer-
 * datum geht raus (generischer GET). Mit hartem Timeout, weil die API öfter mal hängt.
 */
const API = 'https://api.netdeck.gg/api/cards/cyberpunk';
const PAGE = 100;
const FETCH_TIMEOUT_MS = 8000;

export type NetdeckCardItem = NetdeckItem & { image_url?: string };

export interface NetdeckList {
  items: NetdeckCardItem[];
  /** Alle Seiten geladen (sonst nur ein Teil — für neue Karten nicht verwenden). */
  complete: boolean;
}

let inflight: Promise<NetdeckList> | null = null;

/** fetch mit hartem Timeout — eine hängende API darf nichts blockieren. */
async function fetchWithTimeout(url: string, ms: number): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function fetchAll(): Promise<NetdeckList> {
  const items: NetdeckCardItem[] = [];
  try {
    for (let offset = 0; ; offset += PAGE) {
      const res = await fetchWithTimeout(`${API}?limit=${PAGE}&offset=${offset}`, FETCH_TIMEOUT_MS);
      if (!res.ok) return { items, complete: false };
      const json = (await res.json()) as { total?: number; items?: NetdeckCardItem[] };
      items.push(...(json.items ?? []));
      const total = json.total ?? 0;
      if (offset + PAGE >= total) return { items, complete: items.length >= total && total > 0 };
    }
  } catch {
    return { items, complete: false }; // offline / Timeout / API-Absturz
  }
}

/** Kartenliste (einmal pro Sitzung; `force` holt neu, z. B. für „Daten aktualisieren"). */
export function loadNetdeckList(force = false): Promise<NetdeckList> {
  if (!inflight || force) {
    const p = fetchAll();
    inflight = p;
    // Ein Fehlversuch soll den nächsten Aufruf nicht blockieren.
    void p.then((r) => {
      if (r.items.length === 0 && inflight === p) inflight = null;
    });
  }
  return inflight;
}
