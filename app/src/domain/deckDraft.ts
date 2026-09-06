/**
 * Deck-Entwurf und seine reinen Mutatoren (PLAN.md § 5, Aufgabe 2).
 * Framework-frei, immutabel — jede Änderung liefert einen neuen Entwurf.
 * Strukturell kompatibel mit `ValidatableDeck` (rules/validate.ts).
 */
export interface DeckDraft {
  id: string;
  name: string;
  rulesetVersion: string;
  legendIds: string[];
  cards: { cardId: string; count: number }[];
  updatedAt: number;
}

/** Eindeutige Deck-ID (crypto.randomUUID, mit Fallback). */
export function newDeckId(): string {
  try {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* Fallback unten */
  }
  return `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

export function emptyDraft(
  rulesetVersion: string,
  id: string = newDeckId(),
  name = 'Neues Deck',
): DeckDraft {
  return { id, name, rulesetVersion, legendIds: [], cards: [], updatedAt: 0 };
}

export function deckCardCount(d: DeckDraft, cardId: string): number {
  return d.cards.find((c) => c.cardId === cardId)?.count ?? 0;
}

export function addLegend(d: DeckDraft, cardId: string, max = 3): DeckDraft {
  if (d.legendIds.includes(cardId) || d.legendIds.length >= max) return d;
  return { ...d, legendIds: [...d.legendIds, cardId] };
}

export function removeLegend(d: DeckDraft, cardId: string): DeckDraft {
  return { ...d, legendIds: d.legendIds.filter((id) => id !== cardId) };
}

/** Setzt die Anzahl einer Karte (0 entfernt sie); Reihenfolge bleibt stabil. */
export function setCard(d: DeckDraft, cardId: string, count: number): DeckDraft {
  let cards: DeckDraft['cards'];
  if (count <= 0) {
    cards = d.cards.filter((c) => c.cardId !== cardId);
  } else if (d.cards.some((c) => c.cardId === cardId)) {
    cards = d.cards.map((c) => (c.cardId === cardId ? { ...c, count } : c));
  } else {
    cards = [...d.cards, { cardId, count }];
  }
  return { ...d, cards };
}

export function incCard(d: DeckDraft, cardId: string, delta: number): DeckDraft {
  return setCard(d, cardId, deckCardCount(d, cardId) + delta);
}
