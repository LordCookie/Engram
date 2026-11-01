import { db } from '../db/db';
import type { Card } from '../domain/types';
import type { CardPageLink } from '../domain/cardImport';
import { parseDataBundle, type DataBundle } from '../domain/dataBundle';
import { setOverrides } from './overrides';

/**
 * Persistenz der nachgeladenen Daten in Dexie (`meta`, kein LocalStorage) — gerätebezogen,
 * daher nicht im Backup (lässt sich jederzeit neu laden).
 *
 * - `cardExtra`: neue Karten von NetDeck (nur die, die der App fehlten) + DB-Links.
 * - `dataBundle`: das Datenpaket aus dem Release „data" + dessen Hochladezeit.
 */
const CARD_KEY = 'cardExtra';
const BUNDLE_KEY = 'dataBundle';

interface CardExtra {
  fetchedAt: number;
  cards: Card[];
  links: CardPageLink[];
}

interface StoredBundle {
  /** Hochladezeit des Assets bei GitHub — daran erkennt die Prüfung „gibt es Neueres?". */
  assetUpdatedAt: string;
  bundle: unknown;
}

/** Einmal vor dem ersten Rendern (main.tsx): Nachgeladenes für Katalog/Korpus/Meta bereitstellen. */
export async function initDataOverrides(): Promise<void> {
  try {
    const [c, b] = await Promise.all([db.meta.get(CARD_KEY), db.meta.get(BUNDLE_KEY)]);
    const extra = c?.value as CardExtra | undefined;
    const stored = b?.value as StoredBundle | undefined;
    setOverrides({
      cards: Array.isArray(extra?.cards) ? extra.cards : [],
      links: Array.isArray(extra?.links) ? extra.links : [],
      bundle: stored ? parseDataBundle(stored.bundle) : null,
    });
  } catch {
    /* Dexie nicht verfügbar → nur die mitgelieferten Daten */
  }
}

export async function saveExtraCards(cards: Card[], links: CardPageLink[]): Promise<void> {
  const value: CardExtra = { fetchedAt: Date.now(), cards, links };
  await db.meta.put({ key: CARD_KEY, value });
}

export async function saveDataBundle(raw: unknown, assetUpdatedAt: string): Promise<DataBundle> {
  const bundle = parseDataBundle(raw);
  if (!bundle) throw new Error('Datenpaket hat ein unbekanntes Format');
  const value: StoredBundle = { assetUpdatedAt, bundle: raw };
  await db.meta.put({ key: BUNDLE_KEY, value });
  return bundle;
}

/** Hochladezeit des zuletzt geladenen Datenpakets (für „gibt es Neueres?"). */
export async function storedBundleStamp(): Promise<string | undefined> {
  try {
    return ((await db.meta.get(BUNDLE_KEY))?.value as StoredBundle | undefined)?.assetUpdatedAt;
  } catch {
    return undefined;
  }
}

/** Nachgeladenes verwerfen (zurück auf die mitgelieferten Daten). */
export async function clearLoadedData(): Promise<void> {
  await db.meta.bulkDelete([CARD_KEY, BUNDLE_KEY]);
}
