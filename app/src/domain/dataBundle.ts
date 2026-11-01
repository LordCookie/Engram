/**
 * Update-Logik ohne Netz und ohne React (rein/getestet):
 *
 * - **Prüfrhythmus**: Die App fragt GitHub höchstens einmal pro Stunde nach einer neuen
 *   Version (beim Start, beim Zurückholen, und stündlich, solange sie offen ist).
 * - **Datenpaket** `engram-data.json` (Release „data", laufend ersetzt): Korpus
 *   (`coplay.json`, ingest-v2) und Meta-Decks (`metaDecks.json`), damit beides ohne neue
 *   APK frisch bleibt. Erzeugt von `pipeline/publish_data.py`.
 */

export const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/** Ist die letzte Prüfung lange genug her? (Ohne letzte Prüfung: ja.) */
export function shouldCheck(now: number, lastCheckedAt: number | undefined, intervalMs = CHECK_INTERVAL_MS): boolean {
  return lastCheckedAt === undefined || !Number.isFinite(lastCheckedAt) || now - lastCheckedAt >= intervalMs;
}

export const DATA_FORMAT = 'engram-data-v1';
export const DATA_ASSET = 'engram-data.json';
export const DATA_TAG = 'data';

export interface DataBundle {
  /** Erstellungszeit des Pakets (ISO). */
  created: string;
  /** Korpus im ingest-v2-Format (Rohdaten, gelesen von `corpusFromIngest`). */
  coplay?: Record<string, unknown>;
  /** Meta-Decks wie `metaDecks.json` (gelesen von `parseMetaDecks`). */
  metaDecks?: Record<string, unknown>;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);

/** Prüft Format und Grundform; Inhalte prüfen später `corpusFromIngest`/`parseMetaDecks`. */
export function parseDataBundle(raw: unknown): DataBundle | null {
  if (!isObj(raw) || raw.format !== DATA_FORMAT || typeof raw.created !== 'string') return null;
  if (Number.isNaN(Date.parse(raw.created))) return null;
  const bundle: DataBundle = { created: raw.created };
  if (isObj(raw.coplay) && raw.coplay.version === 'ingest-v2') bundle.coplay = raw.coplay;
  if (isObj(raw.metaDecks) && Array.isArray(raw.metaDecks.decks)) bundle.metaDecks = raw.metaDecks;
  return bundle.coplay || bundle.metaDecks ? bundle : null;
}

/** Zeitstempel als Zahl; fehlend/kaputt = 0 (gilt als ältester Stand). */
export function stamp(iso: string | undefined): number {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isNaN(t) ? 0 : t;
}

/** Ist `a` echt neuer als `b`? (ISO-Datum oder -Zeit.) */
export function isNewerStamp(a: string | undefined, b: string | undefined): boolean {
  return stamp(a) > stamp(b);
}

/**
 * Welche Fassung gilt: die mitgelieferte oder die nachgeladene? Die neuere — so gewinnt nach
 * einem App-Update mit frischeren Daten wieder die mitgelieferte Fassung.
 */
export function pickNewer<T>(
  bundled: T | undefined,
  bundledStamp: string | undefined,
  loaded: T | undefined,
  loadedStamp: string | undefined,
): T | undefined {
  if (loaded === undefined) return bundled;
  if (bundled === undefined) return loaded;
  return isNewerStamp(loadedStamp, bundledStamp) ? loaded : bundled;
}

/** Ausschnitt des GitHub-Release „data" (`GET /repos/{repo}/releases/tags/data`). */
export interface DataReleaseInfo {
  assets?: { name?: string; label?: string | null; browser_download_url?: string; size?: number; updated_at?: string }[];
}

export interface DataAsset {
  url: string;
  /** Hochladezeit bei GitHub. */
  updatedAt: string;
  /** Erstellungszeit des Pakets — steht im Asset-Label (publish_data.py), sonst die Hochladezeit. */
  created: string;
  size: number;
}

/** Das Datenpaket im Release „data": Download-Link + Stand, ohne es herunterzuladen. */
export function findDataAsset(release: DataReleaseInfo | null | undefined): DataAsset | null {
  const a = release?.assets?.find((x) => x.name === DATA_ASSET && x.browser_download_url && x.updated_at);
  if (!a?.browser_download_url || !a.updated_at) return null;
  const created = a.label && stamp(a.label) > 0 ? a.label : a.updated_at;
  return { url: a.browser_download_url, updatedAt: a.updated_at, created, size: a.size ?? 0 };
}
