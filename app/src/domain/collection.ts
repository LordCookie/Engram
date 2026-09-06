import type { Card, CardIndex, CollectionEntry, Color, Printing } from './types';

/**
 * Sammlungslogik (framework-frei). Verbindet die Printing-basierte Speicherung
 * (§ 2) mit der karten-basierten Sicht, die Solver und Ansichten brauchen.
 */

export type PrintingIndex = ReadonlyMap<string, Printing>;

/**
 * Aggregiert Bestand von Printing-Ebene auf Karten-Ebene (cardId → Stückzahl).
 * Genau die Eingabe, die `solveLegends` erwartet. Unbekannte printingId fällt
 * auf sich selbst als cardId zurück (Platzhalter-Printings: id === cardId).
 */
export function collectionToOwnedCounts(
  entries: readonly CollectionEntry[],
  printingIndex: PrintingIndex,
): Map<string, number> {
  const owned = new Map<string, number>();
  for (const e of entries) {
    if (e.quantity <= 0) continue;
    const cardId = printingIndex.get(e.printingId)?.cardId ?? e.printingId;
    owned.set(cardId, (owned.get(cardId) ?? 0) + e.quantity);
  }
  return owned;
}

/** Gesamtzahl der Karten im Bestand (Summe aller Stückzahlen). */
export function totalCards(entries: readonly CollectionEntry[]): number {
  return entries.reduce((sum, e) => sum + Math.max(0, e.quantity), 0);
}

export interface ColorProgress {
  color: Color;
  /** Unterschiedliche besessene Karten dieser Farbe. */
  owned: number;
  /** Unterschiedliche Karten dieser Farbe im Katalog. */
  total: number;
}

/**
 * Fortschritt „x von y" je Farbe (PLAN.md § 5, Aufgabe 6): wie viele
 * unterschiedliche Karten einer Farbe man besitzt, gemessen am Katalog.
 */
export function collectionProgress(
  entries: readonly CollectionEntry[],
  printingIndex: PrintingIndex,
  catalog: readonly Card[],
  cardIndex: CardIndex,
  colors: readonly Color[],
): ColorProgress[] {
  const ownedCardIds = new Set<string>();
  for (const e of entries) {
    if (e.quantity <= 0) continue;
    const cardId = printingIndex.get(e.printingId)?.cardId ?? e.printingId;
    if (cardIndex.has(cardId)) ownedCardIds.add(cardId);
  }

  return colors.map((color) => {
    const total = catalog.filter((c) => c.color === color).length;
    let owned = 0;
    for (const id of ownedCardIds) {
      if (cardIndex.get(id)?.color === color) owned++;
    }
    return { color, owned, total };
  });
}
