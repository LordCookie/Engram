import { view, type Policy } from './engine';

/**
 * Gierige Heuristik: bezahlbare Karten nach Wert (Power inkl. Synergie-Bonus)
 * absteigend spielen, bei Gleichstand günstigere zuerst; danach immer angreifen.
 */
export const heuristic: Policy = (g, cfg) => {
  const v = view(g, cfg);
  let budget = v.eddies;
  const order = [...v.hand].sort((a, b) => b.value - a.value || a.cost - b.cost);
  const play: number[] = [];
  for (const c of order) {
    if (c.cost <= budget) {
      budget -= c.cost;
      play.push(c.i);
    }
  }
  return { play, attack: true };
};

/** Zufalls-Policy (für Baselines / Varianz-Checks). */
export function randomPolicy(rng: () => number): Policy {
  return (g, cfg) => {
    const v = view(g, cfg);
    let budget = v.eddies;
    const play: number[] = [];
    for (const c of [...v.hand].sort(() => rng() - 0.5)) {
      if (rng() < 0.7 && c.cost <= budget) {
        budget -= c.cost;
        play.push(c.i);
      }
    }
    return { play, attack: rng() < 0.9 };
  };
}
