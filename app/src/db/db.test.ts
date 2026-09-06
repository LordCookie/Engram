import 'fake-indexeddb/auto';
import { describe, it, expect, beforeEach } from 'vitest';
import {
  db,
  addToCollection,
  replaceCollection,
  bulkAdd,
  addCounts,
  createDeck,
  listDecks,
  getDeck,
  saveDeck,
  getCurrentDeckId,
  setCurrentDeckId,
  deleteDeck,
  ensureCurrentDeck,
} from './db';

const RV = 'beta-2026-05-29';

describe('Dexie-Persistenz', () => {
  beforeEach(async () => {
    await db.collection.clear();
  });

  it('legt einen Eintrag an und erhöht die Menge', async () => {
    expect(await addToCollection('leg-vex', 1, 'schnellerfassung')).toBe(1);
    expect(await addToCollection('leg-vex', 1)).toBe(2);
    const row = await db.collection.get('leg-vex');
    expect(row?.quantity).toBe(2);
    expect(row?.source).toBe('schnellerfassung'); // Quelle bleibt erhalten
  });

  it('verringert die Menge und löscht bei 0 (Undo)', async () => {
    await addToCollection('grn-sprout', 1);
    await addToCollection('grn-sprout', 1);
    expect(await addToCollection('grn-sprout', -1)).toBe(1);
    expect(await addToCollection('grn-sprout', -1)).toBe(0);
    expect(await db.collection.get('grn-sprout')).toBeUndefined();
  });

  it('ersetzt die gesamte Sammlung beim Import', async () => {
    await addToCollection('leg-vex', 5);
    await replaceCollection([{ printingId: 'grn-mend', quantity: 2, addedAt: 1 }]);
    expect(await db.collection.get('leg-vex')).toBeUndefined();
    expect((await db.collection.get('grn-mend'))?.quantity).toBe(2);
  });

  it('trägt mehrere Karten auf einmal ein (bulkAdd, je +1)', async () => {
    await bulkAdd(['leg-vex', 'grn-sprout', 'grn-sprout'], 'starter');
    expect((await db.collection.get('grn-sprout'))?.quantity).toBe(2);
    expect((await db.collection.get('leg-vex'))?.quantity).toBe(1);
  });

  it('trägt Karten mit Stückzahlen ein und summiert (addCounts)', async () => {
    await addCounts([{ printingId: 'a', count: 3 }, { printingId: 'b', count: 2 }], 'starter:x');
    expect((await db.collection.get('a'))?.quantity).toBe(3);
    await addCounts([{ printingId: 'a', count: 2 }]);
    expect((await db.collection.get('a'))?.quantity).toBe(5);
  });
});

describe('Mehr-Deck-Verwaltung', () => {
  beforeEach(async () => {
    await db.decks.clear();
    await db.meta.clear();
  });

  it('createDeck legt an und setzt es als aktuell', async () => {
    const a = await createDeck(RV, 'Deck A');
    const b = await createDeck(RV, 'Deck B');
    expect((await listDecks()).map((d) => d.name).sort()).toEqual(['Deck A', 'Deck B']);
    expect(await getCurrentDeckId()).toBe(b.id);
    expect(a.id).not.toBe(b.id);
  });

  it('saveDeck persistiert Änderungen', async () => {
    const a = await createDeck(RV, 'Deck A');
    await saveDeck({ ...a, cards: [{ cardId: 'x', count: 3 }] });
    expect((await getDeck(a.id))?.cards).toEqual([{ cardId: 'x', count: 3 }]);
  });

  it('setCurrentDeckId wechselt das aktuelle Deck', async () => {
    const a = await createDeck(RV, 'A');
    await createDeck(RV, 'B');
    await setCurrentDeckId(a.id);
    expect(await getCurrentDeckId()).toBe(a.id);
  });

  it('deleteDeck entfernt und verschiebt den aktuellen Zeiger', async () => {
    const a = await createDeck(RV, 'A');
    const b = await createDeck(RV, 'B'); // aktuell = b
    await deleteDeck(b.id, RV);
    expect(await getDeck(b.id)).toBeUndefined();
    expect(await getCurrentDeckId()).toBe(a.id);
  });

  it('deleteDeck des letzten Decks legt automatisch ein neues an', async () => {
    const a = await createDeck(RV, 'A');
    await deleteDeck(a.id, RV);
    const decks = await listDecks();
    expect(decks.length).toBe(1);
    expect(await getCurrentDeckId()).toBe(decks[0].id);
  });

  it('ensureCurrentDeck legt bei leerem Zustand eins an, sonst nicht', async () => {
    const id = await ensureCurrentDeck(RV);
    expect((await listDecks()).length).toBe(1);
    expect(await ensureCurrentDeck(RV)).toBe(id); // kein zweites
  });
});
