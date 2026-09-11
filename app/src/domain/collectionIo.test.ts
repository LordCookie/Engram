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
