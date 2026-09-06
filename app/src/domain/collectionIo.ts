import type { CollectionEntry } from './types';

/**
 * Export/Import der Sammlung als JSON (PLAN.md § 5, Aufgabe 7 — „vor allem
 * anderen bauen"). Datenverlust in IndexedDB durch einen Browser-Reset ist real.
 * Round-Trip ist byte-identisch (Einträge deterministisch nach printingId sortiert).
 */

export const COLLECTION_SCHEMA = 'engram-collection';
export const COLLECTION_SCHEMA_VERSION = 1;

export interface CollectionExport {
  schema: typeof COLLECTION_SCHEMA;
  version: number;
  exportedAt: number;
  entries: CollectionEntry[];
}

function sortEntries(entries: readonly CollectionEntry[]): CollectionEntry[] {
  return [...entries].sort((a, b) =>
    a.printingId < b.printingId ? -1 : a.printingId > b.printingId ? 1 : 0,
  );
}

export function buildExport(
  entries: readonly CollectionEntry[],
  exportedAt: number = Date.now(),
): CollectionExport {
  return {
    schema: COLLECTION_SCHEMA,
    version: COLLECTION_SCHEMA_VERSION,
    exportedAt,
    entries: sortEntries(entries),
  };
}

export function serializeCollection(
  entries: readonly CollectionEntry[],
  exportedAt?: number,
): string {
  return JSON.stringify(buildExport(entries, exportedAt), null, 2);
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
  return {
    schema: COLLECTION_SCHEMA,
    version: typeof obj.version === 'number' ? obj.version : COLLECTION_SCHEMA_VERSION,
    exportedAt: typeof obj.exportedAt === 'number' ? obj.exportedAt : 0,
    entries: sortEntries(obj.entries),
  };
}
