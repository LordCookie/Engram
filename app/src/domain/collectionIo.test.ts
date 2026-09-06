import { describe, it, expect } from 'vitest';
import type { CollectionEntry } from './types';
import {
  serializeCollection,
  parseCollection,
  CollectionImportError,
} from './collectionIo';

const sample: CollectionEntry[] = [
  { printingId: 'leg-vex', quantity: 1, addedAt: 111, source: 'schnellerfassung' },
  { printingId: 'grn-sprout', quantity: 3, addedAt: 222 },
];

describe('Export/Import der Sammlung', () => {
  it('Round-Trip liefert dieselben Einträge', () => {
    const parsed = parseCollection(serializeCollection(sample, 1000));
    // Sortiert nach printingId: grn-sprout vor leg-vex.
    expect(parsed.entries).toEqual([
      { printingId: 'grn-sprout', quantity: 3, addedAt: 222 },
      { printingId: 'leg-vex', quantity: 1, addedAt: 111, source: 'schnellerfassung' },
    ]);
  });

  it('Round-Trip ist byte-identisch', () => {
    const once = serializeCollection(sample, 1000);
    const twice = serializeCollection(parseCollection(once).entries, 1000);
    expect(twice).toBe(once);
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
