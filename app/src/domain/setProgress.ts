import type { Card, CollectionEntry, Color, Printing } from './types';

/**
 * Set-Fortschritt (Sammlungs-Vollständigkeit) — reine Logik, framework-frei.
 * „Wie viel des Sets besitze ich?" ist der Kernnutzen eines Sammlungstrackers.
 * Gezählt werden **eindeutige Karten** (nicht Stückzahlen): eine Karte gilt als
 * besessen, sobald irgendein Printing davon mit Menge > 0 in der Sammlung liegt.
 */

export interface ProgressBucket {
  /** Anzeige-Schlüssel, z. B. "RED" oder "Common". */
  key: string;
  /** Eindeutige besessene Karten in diesem Eimer. */
  owned: number;
  /** Eindeutige Karten des Sets in diesem Eimer. */
  total: number;
}

export interface SetProgress {
  ownedCards: number;
  totalCards: number;
  byColor: ProgressBucket[];
  byRarity: ProgressBucket[];
}

const COLOR_ORDER: readonly Color[] = ['RED', 'GREEN', 'BLUE', 'YELLOW'];

/** Feste Rarity-Reihenfolge; Unbekanntes hängt hinten an (stabil, alphabetisch). */
const RARITY_ORDER: readonly string[] = [
  'Common',
  'Uncommon',
  'Rare',
  'Epic',
  'Nova Rare',
  'Secret',
];

/** Menge der besessenen Karten-IDs (Printing→Karte aufgelöst, Menge > 0). */
export function ownedCardIdSet(
  entries: readonly CollectionEntry[],
  printingIndex: ReadonlyMap<string, Printing>,
): Set<string> {
  const owned = new Set<string>();
  for (const e of entries) {
    if (e.quantity <= 0) continue;
    const cardId = printingIndex.get(e.printingId)?.cardId;
    if (cardId) owned.add(cardId);
  }
  return owned;
}

function bucketize(
  cards: readonly Card[],
  owned: ReadonlySet<string>,
  keyOf: (c: Card) => string,
  order: readonly string[],
): ProgressBucket[] {
  const totals = new Map<string, number>();
  const owns = new Map<string, number>();
  for (const c of cards) {
    const k = keyOf(c);
    totals.set(k, (totals.get(k) ?? 0) + 1);
    if (owned.has(c.id)) owns.set(k, (owns.get(k) ?? 0) + 1);
  }
  const rank = (k: string) => {
    const i = order.indexOf(k);
    return i === -1 ? order.length : i;
  };
  return [...totals.keys()]
    .sort((a, b) => rank(a) - rank(b) || (a < b ? -1 : a > b ? 1 : 0))
    .map((key) => ({ key, owned: owns.get(key) ?? 0, total: totals.get(key) ?? 0 }));
}

export function computeSetProgress(
  catalog: readonly Card[],
  owned: ReadonlySet<string>,
): SetProgress {
  const ownedInSet = catalog.reduce((n, c) => (owned.has(c.id) ? n + 1 : n), 0);
  return {
    ownedCards: ownedInSet,
    totalCards: catalog.length,
    byColor: bucketize(catalog, owned, (c) => c.color, COLOR_ORDER),
    byRarity: bucketize(catalog, owned, (c) => c.rarity, RARITY_ORDER),
  };
}
