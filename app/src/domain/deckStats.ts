import type { Card, CardIndex, CardType, Color } from './types';
import type { Ruleset } from '../rules/ruleset';
import { computeRamCaps, type ValidatableDeck } from '../rules/validate';

/**
 * Live-Statistiken des Deckeditors (PLAN.md § 5, Aufgabe 2): RAM-Cap pro Farbe
 * und Ausnutzung, Eddie-(Cost-)Kurve, Kartentyp-Verteilung, Deckgröße.
 * Reine Funktion.
 */
export interface ColorStat {
  color: Color;
  cap: number;
  /** Karten dieser Farbe im Deck (mit Stückzahl). */
  cardCount: number;
  /** Höchster RAM-Wert einer gespielten Karte dieser Farbe. */
  maxRam: number;
}

export interface DeckStats {
  deckSize: number;
  legendCount: number;
  byColor: ColorStat[];
  costCurve: { cost: number; count: number }[];
  typeCounts: Partial<Record<CardType, number>>;
}

export function computeDeckStats(
  deck: ValidatableDeck,
  ruleset: Ruleset,
  cardIndex: CardIndex,
): DeckStats {
  const legends = deck.legendIds
    .map((id) => cardIndex.get(id))
    .filter((c): c is Card => c !== undefined && c.type === 'LEGEND');
  const caps = computeRamCaps(legends, ruleset);

  const counts = new Map<string, number>();
  for (const e of deck.cards) counts.set(e.cardId, (counts.get(e.cardId) ?? 0) + e.count);

  let deckSize = 0;
  const typeCounts: Partial<Record<CardType, number>> = {};
  const costBuckets = new Map<number, number>();
  const colorAgg = Object.fromEntries(
    ruleset.colors.map((c) => [c, { count: 0, maxRam: 0 }]),
  ) as Record<Color, { count: number; maxRam: number }>;

  for (const [cardId, count] of counts) {
    const card = cardIndex.get(cardId);
    if (!card || card.type === 'LEGEND') continue;
    deckSize += count;
    typeCounts[card.type] = (typeCounts[card.type] ?? 0) + count;
    const cost = card.cost ?? 0;
    costBuckets.set(cost, (costBuckets.get(cost) ?? 0) + count);
    const agg = colorAgg[card.color];
    agg.count += count;
    agg.maxRam = Math.max(agg.maxRam, card.ram ?? 0);
  }

  const byColor: ColorStat[] = ruleset.colors.map((color) => ({
    color,
    cap: caps[color] ?? 0,
    cardCount: colorAgg[color].count,
    maxRam: colorAgg[color].maxRam,
  }));

  const maxCost = costBuckets.size > 0 ? Math.max(...costBuckets.keys()) : 0;
  const costCurve: { cost: number; count: number }[] = [];
  for (let c = 0; c <= maxCost; c++) costCurve.push({ cost: c, count: costBuckets.get(c) ?? 0 });

  return { deckSize, legendCount: legends.length, byColor, costCurve, typeCounts };
}
