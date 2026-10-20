import { describe, it, expect } from 'vitest';
import type { CollectionEntry, WantEntry } from './types';
import {
  serializeCollection,
  parseCollection,
  CollectionImportError,
} from './collectionIo';

const sample: CollectionEntry[] = [
  { printingId: 'leg-vex', quantity: 1, addedAt: 111, source: 'schnellerfassung' },
  { printingId: 'grn-sprout', quantity: 3, addedAt: 222 },
];

const wants: WantEntry[] = [
  { cardId: 'red-blast', count: 2, addedAt: 333 },
  { cardId: 'grn-mend', count: 1, addedAt: 444 },
];

describe('Export/Import der Sammlung', () => {
  it('Round-Trip liefert dieselben Einträge', () => {
    const parsed = parseCollection(serializeCollection(sample, [], 1000));
    // Sortiert nach printingId: grn-sprout vor leg-vex.
    expect(parsed.entries).toEqual([
      { printingId: 'grn-sprout', quantity: 3, addedAt: 222 },
      { printingId: 'leg-vex', quantity: 1, addedAt: 111, source: 'schnellerfassung' },
    ]);
  });

  it('sichert und liest die Want-Liste (Format v2)', () => {
    const parsed = parseCollection(serializeCollection(sample, wants, 1000));
    // Sortiert nach cardId: grn-mend vor red-blast.
    expect(parsed.wants).toEqual([
      { cardId: 'grn-mend', count: 1, addedAt: 444 },
      { cardId: 'red-blast', count: 2, addedAt: 333 },
    ]);
  });

  it('Round-Trip ist byte-identisch (inkl. Wants)', () => {
    const once = serializeCollection(sample, wants, 1000);
    const p = parseCollection(once);
    const twice = serializeCollection(p.entries, p.wants, 1000);
    expect(twice).toBe(once);
  });

  it('v1-Backup ohne Wants bleibt importierbar (wants = [])', () => {
    const v1 = JSON.stringify({
      schema: 'engram-collection',
      version: 1,
      exportedAt: 1,
      entries: [{ printingId: 'x', quantity: 1, addedAt: 1 }],
    });
    const parsed = parseCollection(v1);
    expect(parsed.entries).toHaveLength(1);
    expect(parsed.wants).toEqual([]);
  });

  it('überspringt kaputte Want-Einträge, ohne den Import zu sprengen', () => {
    const mixed = JSON.stringify({
      schema: 'engram-collection',
      version: 2,
      exportedAt: 1,
      entries: [{ printingId: 'x', quantity: 1, addedAt: 1 }],
      wants: [{ cardId: 'ok', count: 1, addedAt: 1 }, { cardId: 'bad' }, { count: 2 }],
    });
    const parsed = parseCollection(mixed);
    expect(parsed.wants).toEqual([{ cardId: 'ok', count: 1, addedAt: 1 }]);
  });

  const deck = (id: string, updatedAt = 5) => ({
    id,
    name: `Deck ${id}`,
    rulesetVersion: 'v1',
    legendIds: ['l1', 'l2', 'l3'],
    cards: [{ cardId: 'c1', count: 3 }],
    updatedAt,
  });

  it('Komplett-Backup (v3): Decks und Einstellungen im Round-Trip, byte-identisch', () => {
    const extras = {
      decks: [deck('b'), deck('a')],
      settings: { theme: 'violet', language: 'en', scanVibration: false, achievementsSeen: ['first-card'] },
    };
    const once = serializeCollection(sample, wants, 1000, extras);
    const p = parseCollection(once);
    expect(p.version).toBe(3);
    expect(p.hasDecks).toBe(true);
    expect(p.hasSettings).toBe(true);
    expect(p.decks.map((d) => d.id)).toEqual(['a', 'b']);
    expect(p.settings).toEqual(extras.settings);
    expect(serializeCollection(p.entries, p.wants, 1000, { decks: p.decks, settings: p.settings })).toBe(once);
  });

  it('nimmt nur bekannte Einstellungen und saubere Decks mit', () => {
    const p = parseCollection(
      JSON.stringify({
        schema: 'engram-collection',
        version: 3,
        exportedAt: 1,
        entries: [],
        decks: [deck('ok'), { id: 'kaputt' }, { ...deck('extra'), fremd: 'x' }],
        settings: { theme: 'lime', imageUrlCache: { a: 1 }, lastBackupAt: 5, language: { nope: 1 } },
      }),
    );
    expect(p.decks.map((d) => d.id)).toEqual(['extra', 'ok']);
    expect(Object.keys(p.decks[0])).not.toContain('fremd');
    expect(p.settings).toEqual({ theme: 'lime' });
  });

  it('v2-Backup: Decks/Einstellungen fehlen → werden beim Restore nicht angefasst', () => {
    const v2 = JSON.stringify({ schema: 'engram-collection', version: 2, exportedAt: 1, entries: [], wants: [] });
    const p = parseCollection(v2);
    expect(p.hasDecks).toBe(false);
    expect(p.hasSettings).toBe(false);
    expect(p.decks).toEqual([]);
  });

  it('wirft bei kaputtem JSON', () => {
    expect(() => parseCollection('{nope')).toThrow(CollectionImportError);
  });

  it('wirft bei fremdem Schema', () => {
    expect(() => parseCollection(JSON.stringify({ schema: 'anderes', entries: [] }))).toThrow(
      CollectionImportError,
    );
  });

  it('wirft bei beschädigten Einträgen', () => {
    const bad = JSON.stringify({ schema: 'engram-collection', version: 1, entries: [{ foo: 1 }] });
    expect(() => parseCollection(bad)).toThrow(CollectionImportError);
  });
});
