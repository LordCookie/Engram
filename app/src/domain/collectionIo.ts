import type { CollectionEntry, WantEntry } from './types';
import type { DeckDraft } from './deckDraft';
import { t } from '../i18n';

/**
 * Backup als JSON (PLAN.md § 5, Aufgabe 7 — „vor allem anderen bauen").
 * Datenverlust in IndexedDB durch einen Browser-Reset / eine Neuinstallation ist real.
 * Round-Trip ist byte-identisch (alles deterministisch sortiert).
 *
 * **Format v3 = Komplett-Backup:** Sammlung, Want-Liste, **Decks** und
 * **Einstellungen** (Farbthema, Sprache, Vibration, App-Icon, gemeldete Erfolge,
 * aktuelles Deck). v1 (nur Sammlung) und v2 (+ Want-Liste) bleiben importierbar —
 * dann bleiben Decks und Einstellungen beim Wiederherstellen unangetastet
 * (`hasDecks`/`hasSettings` = false).
 */

export const COLLECTION_SCHEMA = 'engram-collection';
export const COLLECTION_SCHEMA_VERSION = 3;

/**
 * Welche `meta`-Einträge als Einstellungen mitgesichert werden. Bewusst NICHT dabei:
 * gerätebezogene Dinge (Bild-URL-Cache, Backup-Datum/-Erinnerung).
 */
export const BACKUP_SETTING_KEYS = [
  'theme',
  'language',
  'scanVibration',
  'iconFollowsTheme',
  'achievementsSeen',
  'currentDeckId',
] as const;

export type BackupSettings = Partial<Record<(typeof BACKUP_SETTING_KEYS)[number], unknown>>;

export interface CollectionExport {
  schema: typeof COLLECTION_SCHEMA;
  version: number;
  exportedAt: number;
  entries: CollectionEntry[];
  wants: WantEntry[];
  decks: DeckDraft[];
  settings: BackupSettings;
}

/** Ergebnis von `parseCollection`: plus Angabe, was das Backup überhaupt enthält. */
export interface ParsedBackup extends CollectionExport {
  hasDecks: boolean;
  hasSettings: boolean;
}

export interface BackupExtras {
  decks?: readonly DeckDraft[];
  settings?: BackupSettings;
}

const byKey =
  <T>(key: (x: T) => string) =>
  (a: T, b: T) =>
    key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0;

function sortEntries(entries: readonly CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort(byKey((e) => e.printingId));
}

function sortWants(wants: readonly WantEntry[]): WantEntry[] {
  return [...wants].sort(byKey((w) => w.cardId));
}

function sortDecks(decks: readonly DeckDraft[]): DeckDraft[] {
  return [...decks].sort(byKey((d) => d.id));
}

/** Nur bekannte Schlüssel, in fester Reihenfolge (byte-identischer Round-Trip). */
function cleanSettings(s: Record<string, unknown> | undefined): BackupSettings {
  const out: BackupSettings = {};
  if (!s) return out;
  for (const k of BACKUP_SETTING_KEYS) {
    const v = s[k];
    if (typeof v === 'string' || typeof v === 'boolean' || typeof v === 'number') out[k] = v;
    else if (Array.isArray(v) && v.every((x) => typeof x === 'string')) out[k] = [...v];
  }
  return out;
}

export function buildExport(
  entries: readonly CollectionEntry[],
  wants: readonly WantEntry[] = [],
  exportedAt: number = Date.now(),
  extras: BackupExtras = {},
): CollectionExport {
  return {
    schema: COLLECTION_SCHEMA,
    version: COLLECTION_SCHEMA_VERSION,
    exportedAt,
    entries: sortEntries(entries),
    wants: sortWants(wants),
    decks: sortDecks(extras.decks ?? []),
    settings: cleanSettings(extras.settings),
  };
}

export function serializeCollection(
  entries: readonly CollectionEntry[],
  wants: readonly WantEntry[] = [],
  exportedAt?: number,
  extras?: BackupExtras,
): string {
  return JSON.stringify(buildExport(entries, wants, exportedAt, extras), null, 2);
}

export class CollectionImportError extends Error {}

function isValidEntry(value: unknown): value is CollectionEntry {
  if (typeof value !== 'object' || value === null) return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.printingId === 'string' &&
    typeof e.quantity === 'number' &&
    Number.isFinite(e.quantity) &&
    typeof e.addedAt === 'number'
  );
}

function isValidWant(value: unknown): value is WantEntry {
  if (typeof value !== 'object' || value === null) return false;
  const w = value as Record<string, unknown>;
  return (
    typeof w.cardId === 'string' &&
    typeof w.count === 'number' &&
    Number.isFinite(w.count) &&
    w.count > 0 &&
    typeof w.addedAt === 'number'
  );
}

function isValidDeck(value: unknown): value is DeckDraft {
  if (typeof value !== 'object' || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.id === 'string' &&
    d.id.length > 0 &&
    typeof d.name === 'string' &&
    typeof d.rulesetVersion === 'string' &&
    typeof d.updatedAt === 'number' &&
    Array.isArray(d.legendIds) &&
    d.legendIds.every((x) => typeof x === 'string') &&
    Array.isArray(d.cards) &&
    d.cards.every(
      (c) =>
        typeof c === 'object' &&
        c !== null &&
        typeof (c as Record<string, unknown>).cardId === 'string' &&
        typeof (c as Record<string, unknown>).count === 'number',
    )
  );
}

/** Nur die Deck-Felder übernehmen (keine Fremdfelder aus der Datei in die DB). */
function pickDeck(d: DeckDraft): DeckDraft {
  return {
    id: d.id,
    name: d.name,
    rulesetVersion: d.rulesetVersion,
    legendIds: [...d.legendIds],
    cards: d.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
    updatedAt: d.updatedAt,
  };
}

/**
 * Parst und validiert ein Backup. Wirft `CollectionImportError` bei kaputtem
 * oder fremdem JSON — lieber laut scheitern als eine Sammlung still zerschießen.
 * Kaputte Wants/Decks werden still übersprungen (der Rest wird trotzdem gerettet).
 */
export function parseCollection(json: string): ParsedBackup {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CollectionImportError(t('Kein gültiges JSON.'));
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new CollectionImportError(t('Erwartet wird ein Objekt.'));
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schema !== COLLECTION_SCHEMA) {
    throw new CollectionImportError(t('Unbekanntes Schema — keine engram-Sammlung.'));
  }
  if (!Array.isArray(obj.entries) || !obj.entries.every(isValidEntry)) {
    throw new CollectionImportError(t('Feld „entries" fehlt oder ist beschädigt.'));
  }
  // Wants sind optional (v1-Backups haben keine); kaputte Einträge werden still
  // übersprungen, statt den ganzen Restore der Sammlung zu blockieren.
  const wants = Array.isArray(obj.wants) ? obj.wants.filter(isValidWant) : [];
  const hasDecks = Array.isArray(obj.decks);
  const decks = hasDecks ? (obj.decks as unknown[]).filter(isValidDeck).map(pickDeck) : [];
  const hasSettings = typeof obj.settings === 'object' && obj.settings !== null && !Array.isArray(obj.settings);
  return {
    schema: COLLECTION_SCHEMA,
    version: typeof obj.version === 'number' ? obj.version : COLLECTION_SCHEMA_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    entries: sortEntries(obj.entries),
    wants: sortWants(wants),
    decks: sortDecks(decks),
    settings: hasSettings ? cleanSettings(obj.settings as Record<string, unknown>) : {},
    hasDecks,
    hasSettings,
  };
}
