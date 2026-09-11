import type { CollectionEntry, WantEntry } from './types';

/**
 * Export/Import der Sammlung als JSON (PLAN.md § 5, Aufgabe 7 — „vor allem
 * anderen bauen"). Datenverlust in IndexedDB durch einen Browser-Reset ist real.
 * Round-Trip ist byte-identisch (Einträge deterministisch sortiert).
 *
 * **Format v2** sichert zusätzlich die **Want-Liste**. v1-Backups (ohne `wants`)
 * bleiben importierbar — `wants` ist dann leer.
 */

export const COLLECTION_SCHEMA = 'engram-collection';
export const COLLECTION_SCHEMA_VERSION = 2;

export interface CollectionExport {
  schema: typeof COLLECTION_SCHEMA;
  version: number;
  exportedAt: number;
  entries: CollectionEntry[];
  wants: WantEntry[];
}

function sortEntries(entries: readonly CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort((a, b) =>
    a.printingId < b.printingId ? -1 : a.printingId > b.printingId ? 1 : 0,
  );
}

function sortWants(wants: readonly WantEntry[]): WantEntry[] {
  return [...wants].sort((a, b) => (a.cardId < b.cardId ? -1 : a.cardId > b.cardId ? 1 : 0));
}

export function buildExport(
  entries: readonly CollectionEntry[],
  wants: readonly WantEntry[] = [],
  exportedAt: number = Date.now(),
): CollectionExport {
  return {
    schema: COLLECTION_SCHEMA,
    version: COLLECTION_SCHEMA_VERSION,
    exportedAt,
    entries: sortEntries(entries),
    wants: sortWants(wants),
  };
}

export function serializeCollection(
  entries: readonly CollectionEntry[],
  wants: readonly WantEntry[] = [],
  exportedAt?: number,
): string {
  return JSON.stringify(buildExport(entries, wants, exportedAt), null, 2);
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

/**
 * Parst und validiert einen Export. Wirft `CollectionImportError` bei kaputtem
 * oder fremdem JSON — lieber laut scheitern als eine Sammlung still zerschießen.
 */
export function parseCollection(json: string): CollectionExport {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    throw new CollectionImportError('Kein gültiges JSON.');
  }
  if (typeof raw !== 'object' || raw === null) {
    throw new CollectionImportError('Erwartet wird ein Objekt.');
  }
  const obj = raw as Record<string, unknown>;
  if (obj.schema !== COLLECTION_SCHEMA) {
    throw new CollectionImportError('Unbekanntes Schema — keine engram-Sammlung.');
  }
  if (!Array.isArray(obj.entries) || !obj.entries.every(isValidEntry)) {
    throw new CollectionImportError('Feld „entries" fehlt oder ist beschädigt.');
  }
  // Wants sind optional (v1-Backups haben keine); kaputte Einträge werden still
  // übersprungen, statt den ganzen Restore der Sammlung zu blockieren.
  const wants = Array.isArray(obj.wants) ? obj.wants.filter(isValidWant) : [];
  return {
    schema: COLLECTION_SCHEMA,
    version: typeof obj.version === 'number' ? obj.version : COLLECTION_SCHEMA_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    entries: sortEntries(obj.entries),
    wants: sortWants(wants),
  };
}
