import combosJson from './combos.json';
import { cardIndex } from './catalog';
import type { Card } from '../domain/types';

/**
 * Kuratierte, benannte Combos (PLAN.md § 12). Quelle: `combos.json` — ein
 * Lesedurchgang des Agents durch die 151 Karten, mit Erklärungen in eigenen
 * Worten (§ 8). Ergänzt die automatisch berechneten `topCombos` um handverlesene,
 * erklärte Kartenpakete.
 */
interface RawCombo {
  name: string;
  cards: string[];
  why: string;
}

export interface CuratedCombo {
  name: string;
  cards: Card[];
  why: string;
}

const raw = (combosJson as { combos?: RawCombo[] }).combos ?? [];

export const curatedCombos: CuratedCombo[] = raw
  .map((c) => ({
    name: c.name,
    why: c.why,
    cards: c.cards
      .map((id) => cardIndex.get(id))
      .filter((x): x is Card => x !== undefined),
  }))
  // Nur Combos zeigen, deren Karten im geladenen Set wirklich existieren.
  .filter((c) => c.cards.length >= 2);

export const hasCuratedCombos = curatedCombos.length > 0;
