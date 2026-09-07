import type { Policy2, View2, HandCardV, UnitV } from './engine2';

/**
 * Heuristik für die Kampf-Engine. Bewusst einfach, aber interaktiv:
 * - spielen: bezahlbare Karten nach Nutzen (Units = Power; Removal = Wert des
 *   getroffenen Ziels; Ramp/Draw = Tempo) greedy kaufen.
 * - angreifen: mit bereiten Einheiten, aber die stärkste als Blocker zurückhalten,
 *   wenn der Gegner ein Feld hat (sonst stünde man in dessen Zug offen).
 * - blocken: günstig „hochblocken" (kleinster Blocker mit Power ≥ Angreifer) oder
 *   chumpen, wenn der Gegner am Siegrand steht.
 */

function playValue(c: HandCardV, v: View2): number {
  if (c.isUnit) return c.power + (c.adrenaline ? 1 : 0) + (c.blocker ? 1 : 0);
  if (c.defeat) {
    // Wert = stärkste gegnerische Einheit, die wir treffen könnten
    const best = v.oppBoard.reduce((m, u) => Math.max(m, u.power), 0);
    return best > 0 ? best + 2 : 1;
  }
  if (c.eddie) return 4; // laufender Ramp
  if (c.draw > 0) return 2 + c.draw;
  return 1;
}

export const heuristic2: Policy2 = {
  play(v) {
    let budget = v.eddies;
    const order = [...v.hand].sort((a, b) => playValue(b, v) - playValue(a, v) || a.cost - b.cost);
    const play: number[] = [];
    for (const c of order) if (c.cost <= budget) { budget -= c.cost; play.push(c.i); }
    return play;
  },

  attackers(v) {
    const ready = v.yourBoard.filter((u) => !u.spent && !u.lag);
    const oppHasBoard = v.oppBoard.some((u) => u.power > 0);
    // Nah am Sieg des Gegners? Alles rein, um Tempo/Gigs zu klauen.
    const pressure = v.oppGigs >= v.gigWin - 2;
    if (!oppHasBoard || ready.length <= 1 || pressure) return ready.map((u) => u.uid);
    // sonst die stärkste Einheit als Verteidiger zurückhalten
    const keep = [...ready].sort((a, b) => b.power - a.power)[0]?.uid;
    return ready.filter((u) => u.uid !== keep).map((u) => u.uid);
  },

  block(attacker: UnitV, v) {
    const cands = v.yourBoard.filter((u) => !u.spent || u.blocker);
    if (cands.length === 0) return null;
    // günstig hochblocken: kleinster Blocker mit Power ≥ Angreifer (Trade/Glance, kein Klau)
    const good = cands.filter((u) => u.power >= attacker.power).sort((a, b) => a.power - b.power)[0];
    if (good) return good.uid;
    // sonst chumpen, wenn der Angreifer nah am Sieg ist (Klau verhindern)
    if (v.oppGigs >= v.gigWin - 2) return [...cands].sort((a, b) => a.power - b.power)[0].uid;
    return null;
  },
};

/** Immer voll angreifen, nie blocken — als Baseline/Extremfall. */
export const allOut2: Policy2 = {
  play: heuristic2.play,
  attackers: (v) => v.yourBoard.filter((u) => !u.spent && !u.lag).map((u) => u.uid),
  block: () => null,
};
