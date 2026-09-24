import { isAltPrintingId, printingIndex } from './catalog';
import type { OwnedCount } from '../domain/binder';
import type { CollectionEntry } from '../domain/types';

/**
 * Bestand je Karte aus den Sammlungs-Einträgen (Printing → Karte über `printingIndex`),
 * getrennt nach Standard- und Alt-Art-Exemplaren. Für Binder und Sammler-Erfolge.
 */
export function ownedByCard(entries: readonly CollectionEntry[]): Map<string, OwnedCount> {
  const m = new Map<string, OwnedCount>();
  for (const e of entries) {
    const cardId = printingIndex.get(e.printingId)?.cardId ?? e.printingId;
    const o = m.get(cardId) ?? { std: 0, alt: 0 };
    if (isAltPrintingId(e.printingId)) o.alt += e.quantity;
    else o.std += e.quantity;
    m.set(cardId, o);
  }
  return m;
}
