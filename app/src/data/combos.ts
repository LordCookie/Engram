import combosJson from './combos.json';
import { cardIndex } from './catalog';
import { getLang } from '../i18n';
import type { Card } from '../domain/types';

/**
 * Kuratierte, benannte Combos (PLAN.md § 12). Quelle: `combos.json` — ein
 * Lesedurchgang des Agents durch die 151 Karten, mit Erklärungen in eigenen
 * Worten (§ 8), auf Deutsch (`name`/`why`) und Englisch (`nameEn`/`whyEn`).
 * Ergänzt die automatisch berechneten `topCombos` um handverlesene, erklärte
 * Kartenpakete.
 */
interface RawCombo {
  name: string;
  cards: string[];
  why: string;
  nameEn?: string;
  whyEn?: string;
}

export interface CuratedCombo {
  name: string;
  cards: Card[];
  why: string;
  nameEn?: string;
  whyEn?: string;
}

const raw = (combosJson as { combos?: RawCombo[] }).combos ?? [];

export const curatedCombos: CuratedCombo[] = raw
  .map((c) => ({
    name: c.name,
    why: c.why,
    nameEn: c.nameEn,
    whyEn: c.whyEn,
    cards: c.cards
      .map((id) => cardIndex.get(id))
      .filter((x): x is Card => x !== undefined),
  }))
  // Nur Combos zeigen, deren Karten im geladenen Set wirklich existieren.
  .filter((c) => c.cards.length >= 2);

export const hasCuratedCombos = curatedCombos.length > 0;

/** Name/Erklärung in der Oberflächensprache (Englisch fällt auf Deutsch zurück). */
export function comboText(c: CuratedCombo): { name: string; why: string } {
  return getLang() === 'en' ? { name: c.nameEn ?? c.name, why: c.whyEn ?? c.why } : { name: c.name, why: c.why };
}
