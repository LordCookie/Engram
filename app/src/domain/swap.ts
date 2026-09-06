import type { Card, CardIndex, Color } from './types';
import type { Ruleset } from '../rules/ruleset';
import { computeRamCaps } from '../rules/validate';
import type { OwnedCounts } from './solver';

/**
 * Swap-Analyse (PLAN.md § 5, Aufgabe 5): „Legend X gegen Y tauschen ⇒
 * +N Karten freigeschaltet, −M verloren." Genau die Analyse, die ein Ja/Nein-
 * Farbfilter nicht hergibt — hier ist RAM ein Budget. Reine Funktion.
 */

export interface Swap {
  /** Ersetzter Slot (0..2). */
  slot: number;
  out: Card;
  in: Card;
  newTriple: string[];
  newCaps: Record<Color, number>;
  /** Besessene Karten, die durch den Tausch legal spielbar werden. */
  unlocked: Card[];
  /** Besessene Karten, die dadurch unspielbar werden. */
  lost: Card[];
  /** Netto (freigeschaltet − verloren), nach unterschiedlichen Karten. */
  net: number;
}

function ownedNonLegends(owned: OwnedCounts, cardIndex: CardIndex): Card[] {
  const out: Card[] = [];
  for (const [id, qty] of owned) {
    if (qty <= 0) continue;
    const c = cardIndex.get(id);
    if (c && c.type !== 'LEGEND') out.push(c);
  }
  return out;
}

/** Menge der Karten-IDs, die unter diesen Caps legal spielbar sind. */
function playableSet(pool: readonly Card[], caps: Record<Color, number>): Set<string> {
  const s = new Set<string>();
  for (const c of pool) if ((c.ram ?? 0) <= (caps[c.color] ?? 0)) s.add(c.id);
  return s;
}

export function swapAnalysis(
  currentLegendIds: readonly string[],
  owned: OwnedCounts,
  ruleset: Ruleset,
  cardIndex: CardIndex,
): Swap[] {
  const current = currentLegendIds
    .map((id) => cardIndex.get(id))
    .filter((c): c is Card => c !== undefined && c.type === 'LEGEND');
  if (current.length !== ruleset.legendCount) return []; // nur bei vollem Triple

  const pool = ownedNonLegends(owned, cardIndex);
  const currentPlayable = playableSet(pool, computeRamCaps(current, ruleset));
  const currentIds = new Set(current.map((c) => c.id));

  const candidates: Card[] = [];
  for (const [id, qty] of owned) {
    if (qty <= 0) continue;
    const c = cardIndex.get(id);
    if (c && c.type === 'LEGEND' && !currentIds.has(id)) candidates.push(c);
  }

  const swaps: Swap[] = [];
  for (let slot = 0; slot < current.length; slot++) {
    for (const cand of candidates) {
      const newLegends = current.slice();
      newLegends[slot] = cand;
      if (ruleset.legendNamesMustBeUnique) {
        const names = new Set(newLegends.map((l) => l.name));
        if (names.size !== newLegends.length) continue;
      }
      const newCaps = computeRamCaps(newLegends, ruleset);
      const newPlayable = playableSet(pool, newCaps);

      const unlocked = [...newPlayable]
        .filter((id) => !currentPlayable.has(id))
        .map((id) => cardIndex.get(id)!);
      const lost = [...currentPlayable]
        .filter((id) => !newPlayable.has(id))
        .map((id) => cardIndex.get(id)!);
      if (unlocked.length === 0 && lost.length === 0) continue;

      swaps.push({
        slot,
        out: current[slot],
        in: cand,
        newTriple: newLegends.map((l) => l.id),
        newCaps,
        unlocked,
        lost,
        net: unlocked.length - lost.length,
      });
    }
  }

  swaps.sort(
    (a, b) =>
      b.net - a.net ||
      b.unlocked.length - a.unlocked.length ||
      a.in.name.localeCompare(b.in.name),
  );
  return swaps;
}
