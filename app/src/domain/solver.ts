import type { Card, CardIndex, Color } from './types';
import type { Ruleset } from '../rules/ruleset';
import { computeRamCaps } from '../rules/validate';

/**
 * Legend-Solver (PLAN.md § 5 Phase 2, Aufgabe 4) — das Alleinstellungsmerkmal.
 *
 * Frage: „Welche 3 Legends soll *ich* mit meinem Bestand spielen, und welcher
 * Kartenpool wird dadurch legal spielbar?"
 *
 * Ablauf: alle Legend-Triples aus dem eigenen Bestand aufzählen (Brute Force,
 * C(n,3) ist bei realistischen Zahlen in Millisekunden erledigt), für jedes die
 * RAM-Caps berechnen, den legal spielbaren Bestand bestimmen und per Score
 * bewerten. Reine Funktion, KEINE React-/DOM-Abhängigkeit.
 */

/** Bestand auf Karten-Ebene: cardId → besessene Stückzahl. */
export type OwnedCounts = ReadonlyMap<string, number>;

export interface PlayableCard {
  card: Card;
  /** Besessene Stückzahl. */
  owned: number;
  /** In einem legalen Deck tatsächlich nutzbar: min(owned, maxCopiesPerCard). */
  usable: number;
}

export interface TripleEvaluation {
  /** Die drei Legend-IDs, aufsteigend sortiert (stabile Identität). */
  legendIds: [string, string, string];
  legends: Card[];
  caps: Record<Color, number>;
  /** Legal spielbare Nicht-Legend-Karten aus dem eigenen Bestand. */
  playable: PlayableCard[];
  /** Anzahl unterschiedlicher spielbarer Karten. */
  distinctPlayable: number;
  /** Summe der nutzbaren Kopien (deck-legal gekappt). */
  totalUsable: number;
  score: number;
}

/**
 * Score-Funktion hinter einem Interface (PLAN.md § 5): in Version 1 bewusst
 * simpel, später ersetzbar durch Meta-Daten aus Phase 4 (§ 12, C).
 */
export interface ScoreContext {
  legends: readonly Card[];
  caps: Record<Color, number>;
  playable: readonly PlayableCard[];
  ruleset: Ruleset;
}
export type ScoreFn = (ctx: ScoreContext) => number;

/**
 * Standard-Score V1: Anzahl legal spielbarer Karten im Besitz, gewichtet mit der
 * deck-nutzbaren Stückzahl (bei max. 3 Kopien bringt ein 4. Exemplar nichts).
 */
export const defaultScore: ScoreFn = ({ playable }) =>
  playable.reduce((sum, p) => sum + p.usable, 0);

export interface SolveOptions {
  /** Optionale Ziel-Farbe(n): nur Triples, die für JEDE Zielfarbe RAM liefern,
   *  und der spielbare Pool wird auf diese Farben eingeschränkt. */
  targetColors?: readonly Color[];
  /** Wie viele Top-Triples zurückgeben. Default 10. */
  topN?: number;
  /** Austauschbare Bewertung. Default: defaultScore. */
  score?: ScoreFn;
}

export interface SolveResult {
  /** Absteigend nach Score sortiert, Länge ≤ topN. */
  triples: TripleEvaluation[];
  /** Anzahl Kandidaten-Legends im Bestand. */
  legendCount: number;
  /** Anzahl tatsächlich bewerteter (legaler) Triples. */
  combinationCount: number;
}

/** Legends aus dem Bestand, die mindestens einmal besessen werden. */
function ownedLegends(owned: OwnedCounts, cardIndex: CardIndex): Card[] {
  const legends: Card[] = [];
  for (const [cardId, qty] of owned) {
    if (qty <= 0) continue;
    const card = cardIndex.get(cardId);
    if (card && card.type === 'LEGEND') legends.push(card);
  }
  // Deterministische Reihenfolge für reproduzierbare Ausgabe.
  legends.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return legends;
}

/** Legal spielbare Nicht-Legend-Karten für gegebene RAM-Caps. */
function playableFor(
  owned: OwnedCounts,
  cardIndex: CardIndex,
  caps: Record<Color, number>,
  ruleset: Ruleset,
  targetColors?: readonly Color[],
): PlayableCard[] {
  const targetSet = targetColors && targetColors.length > 0 ? new Set(targetColors) : null;
  const result: PlayableCard[] = [];
  for (const [cardId, qty] of owned) {
    if (qty <= 0) continue;
    const card = cardIndex.get(cardId);
    if (!card || card.type === 'LEGEND') continue;
    if (targetSet && !targetSet.has(card.color)) continue;
    const ram = card.ram ?? 0;
    if (ram > (caps[card.color] ?? 0)) continue; // nicht legal spielbar
    result.push({
      card,
      owned: qty,
      usable: Math.min(qty, ruleset.maxCopiesPerCard),
    });
  }
  result.sort((a, b) => (a.card.id < b.card.id ? -1 : a.card.id > b.card.id ? 1 : 0));
  return result;
}

export function solveLegends(
  owned: OwnedCounts,
  ruleset: Ruleset,
  cardIndex: CardIndex,
  options: SolveOptions = {},
): SolveResult {
  const { targetColors, topN = 10, score = defaultScore } = options;
  const legends = ownedLegends(owned, cardIndex);
  const evaluations: TripleEvaluation[] = [];

  for (let i = 0; i < legends.length; i++) {
    for (let j = i + 1; j < legends.length; j++) {
      for (let k = j + 1; k < legends.length; k++) {
        const triple = [legends[i], legends[j], legends[k]];

        // Regel: 3 Legends mit unterschiedlichen Namen (PLAN.md § 1).
        if (ruleset.legendNamesMustBeUnique) {
          const names = new Set(triple.map((l) => l.name));
          if (names.size !== triple.length) continue;
        }

        const caps = computeRamCaps(triple, ruleset);

        // Ziel-Farben müssen tatsächlich mit RAM versorgt sein.
        if (targetColors && targetColors.some((c) => (caps[c] ?? 0) <= 0)) continue;

        const playable = playableFor(owned, cardIndex, caps, ruleset, targetColors);
        const totalUsable = playable.reduce((s, p) => s + p.usable, 0);
        const legendIds = triple
          .map((l) => l.id)
          .sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) as [string, string, string];

        evaluations.push({
          legendIds,
          legends: triple,
          caps,
          playable,
          distinctPlayable: playable.length,
          totalUsable,
          score: score({ legends: triple, caps, playable, ruleset }),
        });
      }
    }
  }

  // Sortierung: Score desc, dann distinctPlayable desc, dann stabile ID-Reihenfolge.
  evaluations.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (b.distinctPlayable !== a.distinctPlayable) return b.distinctPlayable - a.distinctPlayable;
    const ka = a.legendIds.join(',');
    const kb = b.legendIds.join(',');
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return {
    triples: evaluations.slice(0, topN),
    legendCount: legends.length,
    combinationCount: evaluations.length,
  };
}
