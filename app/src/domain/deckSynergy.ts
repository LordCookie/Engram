import type { Card, CardIndex } from './types';
import type { Ruleset } from '../rules/ruleset';
import { computeRamCaps } from '../rules/validate';
import { featureWeights, synergyBetween, type FeatureDB, type SynergyReason } from './synergy';
import { coPlayLift, type Corpus } from './coplay';

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
  /** Stützzahl: in wie vielen Korpus-Decks die Karte mit den Legends zusammen läuft
   *  (nur gesetzt, wenn > 0 — für das „✓ Meta"-Signal). */
  empirical?: number;
}

export interface SuggestOptions {
  limit?: number;
  /** Nur Karten aus dem eigenen Bestand vorschlagen. */
  ownedOnly?: boolean;
  owned?: ReadonlyMap<string, number>;
  /** Optionales Co-Play-Korpus (Meta + eigene Decks) — boostet & markiert Vorschläge. */
  corpus?: Corpus;
  /** Gewicht des empirischen Lift-Boosts (Default 0.5). */
  empiricalWeight?: number;
}

/**
 * Beste Karten zum Einbauen: nicht bereits im Deck, RAM-legal unter den Legends,
 * nach Affinität zu den Legends sortiert (mit Begründung). Optional auf Bestand
 * beschränkt. Mit `corpus` fließt zusätzlich echte Co-Play-Statistik ein: Karten,
 * die laut Meta/eigenen Decks mit den Legends zusammen laufen, werden geboostet und
 * markiert — auch solche, die die Textvorhersage übersieht (Ehrlichkeit: getrennt
 * ausgewiesen über `empirical`).
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
  const corpus = opts.corpus;
  const empW = opts.empiricalWeight ?? 0.5;

  const scored: { s: Suggestion; rank: number }[] = [];
  for (const card of cardIndex.values()) {
    if (card.type === 'LEGEND' || inDeck.has(card.id)) continue;
    if ((card.ram ?? 0) > (caps[card.color] ?? 0)) continue; // RAM-legal unter diesen Legends
    if (opts.ownedOnly && (opts.owned?.get(card.id) ?? 0) <= 0) continue;
    const { score, reasons } = cardDeckAffinity(card.id, legendIds, db, weights);
    let empLift = 0;
    let empCount = 0;
    if (corpus) {
      for (const lid of legendIds) {
        empLift += coPlayLift(card.id, lid, corpus);
        empCount += corpus.co.get(card.id)?.get(lid) ?? 0;
      }
    }
    if (score <= 0 && empLift <= 0) continue; // weder vorhergesagt noch beobachtet → raus
    scored.push({
      s: { card, score, reasons, empirical: empCount > 0 ? empCount : undefined },
      rank: score + empW * empLift,
    });
  }
  scored.sort((a, b) => b.rank - a.rank || a.s.card.name.localeCompare(b.s.card.name));
  return scored.slice(0, opts.limit ?? 8).map((x) => x.s);
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
