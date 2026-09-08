import type { Policy2, View2, HandCardV, UnitV } from './engine2';

/**
 * Heuristik-„KI" für die Kampf-Sim. Bewusst einfach, aber interaktiv:
 * - spielen: bezahlbare Karten nach Nutzen (Units = Power; Removal/Spend = Wert des
 *   Ziels; Gig/Buff/Draw = Tempo) greedy kaufen.
 * - angreifen: mit bereiten Einheiten, aber die stärkste als Blocker zurückhalten,
 *   wenn der Gegner ein Feld hat.
 * - blocken: günstig „hochblocken" (kleinster Blocker mit Power ≥ Angreifer) oder
 *   chumpen, wenn der Gegner am Siegrand steht.
 */

function playValue(c: HandCardV, v: View2): number {
  const oppBest = v.oppBoard.reduce((m, u) => Math.max(m, u.power), 0);
  if (c.isUnit) {
    let val = c.power + (c.adrenaline ? 1 : 0) + (c.blocker ? 1 : 0);
    if (c.defeat && oppBest > 0) val += oppBest * 0.6 + 1; // Removal am Körper
    if (c.gig) val += 3 * c.gig;
    if (c.buff) val += c.buff;
    if (c.draw) val += 1 + c.draw;
    return val;
  }
  // Nicht-Unit (Programm): reiner Effektwert, nur wertvoll bei Zielen
  let val = 0;
  if (c.defeat) val = Math.max(val, oppBest > 0 ? oppBest + 2 : 1);
  if (c.spend) val = Math.max(val, oppBest > 0 ? oppBest * 0.5 + 1 : 0.5); // Blocker/Tempo-Denial
  if (c.gig) val = Math.max(val, 3 * c.gig); // direkt aufs Siegziel
  if (c.buff) val = Math.max(val, c.buff * Math.max(1, v.yourBoard.length));
  if (c.eddie) val = Math.max(val, 4); // laufender Ramp
  if (c.draw > 0) val = Math.max(val, 2 + c.draw);
  return val > 0 ? val : 1;
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
