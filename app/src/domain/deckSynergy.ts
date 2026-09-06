import type { Card, CardIndex } from './types';
import type { Ruleset } from '../rules/ruleset';
import { computeRamCaps } from '../rules/validate';
import { featureWeights, synergyBetween, type FeatureDB, type SynergyReason } from './synergy';

/**
 * Synergie-Hilfen fürs Deckbauen (PLAN.md § 5 / § 12). Reine Funktionen.
 *
 * „Affinität" einer Karte zum Deck = Summe ihrer vorhergesagten Synergie mit den
 * (bis zu 3) Legends des Decks — genau das Signal, das bei diesem Spiel am meisten
 * festlegt. Daraus: eine Gesamt-Bewertung des Decks und Vorschläge, was man als
 * Nächstes einbaut.
 */

export interface DeckAffinity {
  score: number;
  reasons: SynergyReason[];
}

/** Affinität einer Karte zu den Legends des Decks (mit Begründungen). */
export function cardDeckAffinity(
  cardId: string,
  legendIds: readonly string[],
  db: FeatureDB,
  weights: ReadonlyMap<string, number>,
): DeckAffinity {
  const fa = db.get(cardId);
  if (!fa) return { score: 0, reasons: [] };
  let score = 0;
  const reasons: SynergyReason[] = [];
  for (const lid of legendIds) {
    const fl = db.get(lid);
    if (!fl) continue;
    const r = synergyBetween(fa, fl, weights);
    score += r.score;
    reasons.push(...r.reasons);
  }
  return { score, reasons };
}

export interface Suggestion {
  card: Card;
  score: number;
  reasons: SynergyReason[];
}

export interface SuggestOptions {
  limit?: number;
  /** Nur Karten aus dem eigenen Bestand vorschlagen. */
  ownedOnly?: boolean;
  owned?: ReadonlyMap<string, number>;
}

/**
 * Beste Karten zum Einbauen: nicht bereits im Deck, RAM-legal unter den Legends,
 * nach Affinität zu den Legends sortiert (mit Begründung). Optional auf Bestand
 * beschränkt.
 */
export function suggestAdditions(
  legendIds: readonly string[],
  currentCardIds: readonly string[],
  cardIndex: CardIndex,
  db: FeatureDB,
  ruleset: Ruleset,
  opts: SuggestOptions = {},
): Suggestion[] {
  const weights = featureWeights(db);
  const legends = legendIds
    .map((id) => cardIndex.get(id))
    .filter((c): c is Card => c !== undefined);
  const caps = computeRamCaps(legends, ruleset);
  const inDeck = new Set<string>([...currentCardIds, ...legendIds]);

  const out: Suggestion[] = [];
  for (const card of cardIndex.values()) {
    if (card.type === 'LEGEND' || inDeck.has(card.id)) continue;
    if ((card.ram ?? 0) > (caps[card.color] ?? 0)) continue; // RAM-legal unter diesen Legends
    if (opts.ownedOnly && (opts.owned?.get(card.id) ?? 0) <= 0) continue;
    const { score, reasons } = cardDeckAffinity(card.id, legendIds, db, weights);
    if (score <= 0) continue;
    out.push({ card, score, reasons });
  }
  out.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  return out.slice(0, opts.limit ?? 8);
}

/**
 * Durchschnittliche Affinität der Deckkarten zu den Legends — ein Maß für die
 * Synergie-Dichte des Decks (0 = keine erkennbare Synergie).
 */
export function deckSynergyRating(
  legendIds: readonly string[],
  cardIds: readonly string[],
  cardIndex: CardIndex,
  db: FeatureDB,
): number {
  return deckSynergyStats(legendIds, cardIds, cardIndex, db).avg;
}

export interface DeckSynergyStats {
  /** Karten (Typen) mit erkennbarer Synergie zu den Legends. */
  synergyCount: number;
  /** Gesamtzahl der Nicht-Legend-Karten(-typen) im Deck. */
  cardCount: number;
  /** Durchschnittliche Affinität pro Karte (sinkt zwangsläufig mit Füllkarten). */
  avg: number;
}

/**
 * Aufschlüsselung der Deck-Synergie. Der Durchschnitt allein täuscht: ein Deck
 * braucht ~40 Karten, und viele davon sind neutrale Füllkarten, die den Schnitt
 * drücken. Die ZAHL synergierender Karten wächst dagegen, während man baut — das
 * ist das ehrlichere „mache ich Fortschritt?"-Signal.
 */
export function deckSynergyStats(
  legendIds: readonly string[],
  cardIds: readonly string[],
  cardIndex: CardIndex,
  db: FeatureDB,
): DeckSynergyStats {
  const weights = featureWeights(db);
  const cards = cardIds.filter((id) => cardIndex.get(id)?.type !== 'LEGEND');
  let sum = 0;
  let synergyCount = 0;
  for (const id of cards) {
    const a = cardDeckAffinity(id, legendIds, db, weights).score;
    sum += a;
    if (a > 0) synergyCount++;
  }
  return {
    synergyCount,
    cardCount: cards.length,
    avg: cards.length ? sum / cards.length : 0,
  };
}
