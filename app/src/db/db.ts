import Dexie, { type Table } from 'dexie';
import type { CollectionEntry, WantEntry } from '../domain/types';
import { emptyDraft, type DeckDraft } from '../domain/deckDraft';
import { BACKUP_SETTING_KEYS, type BackupSettings, type ParsedBackup } from '../domain/collectionIo';

export type { WantEntry };

/**
 * Persistenz via IndexedDB/Dexie (PLAN.md § 3, § 4). Kein LocalStorage.
 * Tabellen: collection, decks, meta. Schema ist versioniert — Migrationen
 * kommen als neue `version(n).stores(...).upgrade(...)`-Blöcke dazu, alte
 * bleiben stehen (§ 7).
 */

export interface MetaEntry {
  key: string;
  value: unknown;
}

export class EngramDB extends Dexie {
  collection!: Table<CollectionEntry, string>; // Primärschlüssel: printingId
  decks!: Table<DeckDraft, string>; // Primärschlüssel: id
  meta!: Table<MetaEntry, string>; // Primärschlüssel: key
  wants!: Table<WantEntry, string>; // Primärschlüssel: cardId

  constructor(name = 'engram') {
    super(name);
    this.version(1).stores({
      collection: '&printingId, source, addedAt',
      decks: '&id, updatedAt',
      meta: '&key',
    });
    // v2 legte eine `hashes`-Tabelle für den früheren Bild-Hash-Scanner an.
    this.version(2).stores({ hashes: '&cardId' });
    // v3: Scanner läuft jetzt über OCR (kein Referenz-Hash mehr) → Tabelle löschen.
    this.version(3).stores({ hashes: null });
    // v4: Want-Liste (Wunschliste).
    this.version(4).stores({ wants: '&cardId, addedAt' });
  }
}

export const db = new EngramDB();

/**
 * Ändert den Bestand eines Printings um `delta` (+1 beim Erfassen, −1 beim
 * Undo). Fällt die Menge auf 0, wird der Eintrag gelöscht. Transaktional,
 * damit gleichzeitige Schnellerfassungs-Events nicht kollidieren.
 */
export async function addToCollection(
  printingId: string,
  delta = 1,
  source?: string,
): Promise<number> {
  return db.transaction('rw', db.collection, async () => {
    const existing = await db.collection.get(printingId);
    const quantity = (existing?.quantity ?? 0) + delta;
    if (quantity <= 0) {
      await db.collection.delete(printingId);
      return 0;
    }
    await db.collection.put({
      printingId,
      quantity,
      addedAt: existing?.addedAt ?? Date.now(),
      source: source ?? existing?.source,
    });
    return quantity;
  });
}

/** Ersetzt die komplette Sammlung (für Import/Restore). */
export async function replaceCollection(entries: CollectionEntry[]): Promise<void> {
  await db.transaction('rw', db.collection, async () => {
    await db.collection.clear();
    if (entries.length > 0) await db.collection.bulkPut(entries);
  });
}

/** Trägt mehrere Karten auf einmal ein (je +1). */
export async function bulkAdd(printingIds: string[], source?: string): Promise<void> {
  await addCounts(printingIds.map((printingId) => ({ printingId, count: 1 })), source);
}

// --- Mehr-Deck-Verwaltung (benannte Decks, § 5 Aufgabe 2) -----------------

const CURRENT_DECK_KEY = 'currentDeckId';

/** Alle Decks, zuletzt bearbeitet zuerst. */
export async function listDecks(): Promise<DeckDraft[]> {
  const all = await db.decks.toArray();
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getDeck(id: string): Promise<DeckDraft | undefined> {
  return db.decks.get(id);
}

/** Speichert ein Deck (Persistenz über Reloads, § 3/§ 4). */
export async function saveDeck(draft: DeckDraft): Promise<void> {
  await db.decks.put({ ...draft, updatedAt: Date.now() });
}

// --- Farbthema (UI-Präferenz, Persistenz über Dexie statt LocalStorage) ---------

const THEME_KEY = 'theme';

export async function getThemePref(): Promise<string> {
  const row = await db.meta.get(THEME_KEY);
  return typeof row?.value === 'string' ? row.value : 'default';
}

export async function setThemePref(theme: string): Promise<void> {
  await db.meta.put({ key: THEME_KEY, value: theme });
}

// --- Sammler-Erfolge: welche schon gemeldet wurden (Einblendung nur einmal) ---------

const ACHIEVEMENTS_SEEN_KEY = 'achievementsSeen';

/** Schon gemeldete Erfolge; `null` = noch nie gespeichert (erster Start). */
export async function getSeenAchievements(): Promise<string[] | null> {
  const row = await db.meta.get(ACHIEVEMENTS_SEEN_KEY);
  return Array.isArray(row?.value) ? (row.value as string[]).filter((x) => typeof x === 'string') : null;
}

export async function setSeenAchievements(ids: string[]): Promise<void> {
  await db.meta.put({ key: ACHIEVEMENTS_SEEN_KEY, value: ids });
}

// --- App-Icon folgt dem Farbthema (Einstellung unter „Mehr", nur Android-App) -------

const ICON_FOLLOWS_KEY = 'iconFollowsTheme';

export async function getIconFollowsThemePref(): Promise<boolean> {
  const row = await db.meta.get(ICON_FOLLOWS_KEY);
  return row?.value === true;
}

export async function setIconFollowsThemePref(on: boolean): Promise<void> {
  await db.meta.put({ key: ICON_FOLLOWS_KEY, value: on });
}

// --- Vibration beim Scannen (Einstellung unter „Mehr") ------------------------------

const VIBRATION_KEY = 'scanVibration';

/** Vibration beim Scannen an? Default an. */
export async function getVibrationPref(): Promise<boolean> {
  const row = await db.meta.get(VIBRATION_KEY);
  return typeof row?.value === 'boolean' ? row.value : true;
}

export async function setVibrationPref(on: boolean): Promise<void> {
  await db.meta.put({ key: VIBRATION_KEY, value: on });
}

// --- Willkommenskarte beim ersten Start (ausblendbar) ------------------------------

const WELCOME_KEY = 'welcomeDismissed';

export async function getWelcomeDismissed(): Promise<boolean> {
  return (await db.meta.get(WELCOME_KEY))?.value === true;
}

export async function dismissWelcome(): Promise<void> {
  await db.meta.put({ key: WELCOME_KEY, value: true });
}

// --- Oberflächensprache (Einstellung unter „Mehr"; ohne Wahl gilt die Gerätesprache) ---

const LANGUAGE_KEY = 'language';

/** Gespeicherte Sprache (`de`/`en`) oder `null` = noch nie gewählt. */
export async function getLanguagePref(): Promise<string | null> {
  const row = await db.meta.get(LANGUAGE_KEY);
  return typeof row?.value === 'string' ? row.value : null;
}

export async function setLanguagePref(lang: string): Promise<void> {
  await db.meta.put({ key: LANGUAGE_KEY, value: lang });
}

export async function getCurrentDeckId(): Promise<string | undefined> {
  const row = await db.meta.get(CURRENT_DECK_KEY);
  return typeof row?.value === 'string' ? row.value : undefined;
}

export async function setCurrentDeckId(id: string): Promise<void> {
  await db.meta.put({ key: CURRENT_DECK_KEY, value: id });
}

/** Legt ein neues, leeres Deck an und macht es zum aktuellen. */
export async function createDeck(rulesetVersion: string, name?: string): Promise<DeckDraft> {
  const draft = emptyDraft(rulesetVersion, undefined, name);
  await db.decks.put({ ...draft, updatedAt: Date.now() });
  await setCurrentDeckId(draft.id);
  return draft;
}

/** Löscht ein Deck; verschiebt ggf. den aktuellen Zeiger auf ein anderes. */
export async function deleteDeck(id: string, rulesetVersion: string): Promise<void> {
  await db.decks.delete(id);
  if ((await getCurrentDeckId()) === id) {
    const rest = await listDecks();
    if (rest.length > 0) await setCurrentDeckId(rest[0].id);
    else await createDeck(rulesetVersion);
  }
}

/** Sorgt für mind. ein Deck + gesetzte currentDeckId; liefert die aktuelle ID. */
export async function ensureCurrentDeck(rulesetVersion: string): Promise<string> {
  const current = await getCurrentDeckId();
  if (current && (await db.decks.get(current))) return current;
  const decks = await listDecks();
  if (decks.length > 0) {
    await setCurrentDeckId(decks[0].id);
    return decks[0].id;
  }
  return (await createDeck(rulesetVersion)).id;
}

// --- Want-Liste (Wunschliste) ----------------------------------------------

/** Ändert die Wunschmenge einer Karte um `delta`; fällt sie auf 0, wird sie entfernt. */
export async function addWant(cardId: string, delta = 1): Promise<number> {
  return db.transaction('rw', db.wants, async () => {
    const existing = await db.wants.get(cardId);
    const count = (existing?.count ?? 0) + delta;
    if (count <= 0) {
      await db.wants.delete(cardId);
      return 0;
    }
    await db.wants.put({ cardId, count, addedAt: existing?.addedAt ?? Date.now() });
    return count;
  });
}

/** Entfernt eine Karte ganz aus der Want-Liste. */
export async function removeWant(cardId: string): Promise<void> {
  await db.wants.delete(cardId);
}

/** Ersetzt die komplette Want-Liste (für Import/Restore aus dem Backup). */
export async function replaceWants(wants: WantEntry[]): Promise<void> {
  await db.transaction('rw', db.wants, async () => {
    await db.wants.clear();
    if (wants.length > 0) await db.wants.bulkPut(wants);
  });
}

/**
 * Hebt die Wunschmenge je Karte auf mind. `count` an (senkt nie) — für
 * „fehlende Deckkarten → Want-Liste". Transaktional.
 */
export async function wantAtLeast(items: { cardId: string; count: number }[]): Promise<void> {
  await db.transaction('rw', db.wants, async () => {
    for (const { cardId, count } of items) {
      if (count <= 0) continue;
      const existing = await db.wants.get(cardId);
      const next = Math.max(existing?.count ?? 0, count);
      await db.wants.put({ cardId, count: next, addedAt: existing?.addedAt ?? Date.now() });
    }
  });
}

// --- Komplett-Backup (Format v3) + Backup-Erinnerung ---------------------------

export interface BackupData {
  entries: CollectionEntry[];
  wants: WantEntry[];
  decks: DeckDraft[];
  settings: BackupSettings;
}

/** Alles, was ins Backup gehört (Sammlung, Wants, Decks, Einstellungen). */
export async function readBackupData(): Promise<BackupData> {
  const [entries, wants, decks, metaRows] = await Promise.all([
    db.collection.toArray(),
    db.wants.toArray(),
    db.decks.toArray(),
    db.meta.bulkGet([...BACKUP_SETTING_KEYS]),
  ]);
  const settings: BackupSettings = {};
  BACKUP_SETTING_KEYS.forEach((k, i) => {
    const row = metaRows[i];
    if (row && row.value !== undefined) settings[k] = row.value;
  });
  return { entries, wants, decks, settings };
}

/**
 * Stellt ein Backup wieder her (ersetzt). Sammlung + Want-Liste immer; Decks und
 * Einstellungen nur, wenn das Backup sie enthält (v3) — ältere Backups lassen sie
 * unangetastet. Alles in einer Transaktion.
 */
export async function restoreBackup(b: ParsedBackup): Promise<void> {
  await db.transaction('rw', [db.collection, db.wants, db.decks, db.meta], async () => {
    await db.collection.clear();
    if (b.entries.length > 0) await db.collection.bulkPut(b.entries);
    await db.wants.clear();
    if (b.wants.length > 0) await db.wants.bulkPut(b.wants);
    if (b.hasDecks) {
      await db.decks.clear();
      if (b.decks.length > 0) await db.decks.bulkPut(b.decks);
    }
    if (b.hasSettings) {
      for (const k of BACKUP_SETTING_KEYS) {
        if (b.settings[k] !== undefined) await db.meta.put({ key: k, value: b.settings[k] });
      }
    }
    // Zeiger aufs aktuelle Deck muss auf ein vorhandenes Deck zeigen.
    const current = await db.meta.get(CURRENT_DECK_KEY);
    if (typeof current?.value !== 'string' || !(await db.decks.get(current.value))) {
      const first = await db.decks.orderBy('updatedAt').last();
      if (first) await db.meta.put({ key: CURRENT_DECK_KEY, value: first.id });
      else await db.meta.delete(CURRENT_DECK_KEY);
    }
  });
}

const LAST_BACKUP_KEY = 'lastBackupAt';
const BACKUP_SNOOZE_KEY = 'backupSnoozeUntil';

export async function getBackupTimes(): Promise<{ lastBackupAt: number | null; snoozeUntil: number | null }> {
  const [last, snooze] = await db.meta.bulkGet([LAST_BACKUP_KEY, BACKUP_SNOOZE_KEY]);
  return {
    lastBackupAt: typeof last?.value === 'number' ? last.value : null,
    snoozeUntil: typeof snooze?.value === 'number' ? snooze.value : null,
  };
}

export async function setLastBackupAt(ts: number): Promise<void> {
  await db.meta.put({ key: LAST_BACKUP_KEY, value: ts });
}

export async function snoozeBackupReminder(until: number): Promise<void> {
  await db.meta.put({ key: BACKUP_SNOOZE_KEY, value: until });
}

/** Trägt mehrere Karten mit Stückzahlen ein (für den Starter-Quickadd, Aufgabe 7). */
export async function addCounts(
  items: { printingId: string; count: number }[],
  source?: string,
): Promise<void> {
  await db.transaction('rw', db.collection, async () => {
    for (const { printingId, count } of items) {
      if (count <= 0) continue;
      const existing = await db.collection.get(printingId);
      await db.collection.put({
        printingId,
        quantity: (existing?.quantity ?? 0) + count,
        addedAt: existing?.addedAt ?? Date.now(),
        source: source ?? existing?.source,
      });
    }
  });
}
