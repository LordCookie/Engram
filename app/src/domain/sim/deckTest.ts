import { createGame2, playGame2, DEFAULT2, type Sim2Params } from './engine2';
import type { SimDeck } from './rng';
import { heuristic2 } from './policies2';

/**
 * Deck-Test-API fürs UI: spielt zwei Decks im Kampf-Modell (engine2) seat-fair
 * gegeneinander und liefert eine Siegquote-SCHÄTZUNG (mit 95%-CI) + ein
 * Beispiel-Spielprotokoll. Framework-frei und rein → testbar.
 *
 * Ehrlichkeit (§ 12): Das ist ein grobes MODELL, kein regeltreuer Simulator —
 * die Zahl ist ein Richtungssignal, keine Turnier-Wahrheit. Die UI beschriftet
 * das entsprechend.
 */

export interface DeckTestResult {
  /** Gesamtspiele (beide Sitzpositionen). */
  games: number;
  winsA: number;
  winsB: number;
  draws: number;
  /** Siegquote Deck A in Prozent (Remis zählt nicht als Sieg). */
  winPct: number;
  /** 95%-Konfidenzintervall (Halbbreite, Prozentpunkte). */
  ci: number;
  avgTurns: number;
}

const SEED_STEP = 7919;

/** Seat-fair: jede Paarung in beiden Sitzpositionen; nach ROLLE gezählt. */
export function testMatchup(a: SimDeck, b: SimDeck, games = 200, seed0 = 1, cfg: Sim2Params = DEFAULT2): DeckTestResult {
  let winsA = 0, winsB = 0, draws = 0, turnsSum = 0, total = 0;
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i * SEED_STEP;
    for (const swap of [false, true]) {
      const [d1, d2] = swap ? [b, a] : [a, b];
      const r = playGame2(createGame2(d1, d2, cfg, seed), cfg, heuristic2, heuristic2);
      const aWon = swap ? r.winner === 'b' : r.winner === 'a';
      if (r.winner === null) draws++;
      else if (aWon) winsA++;
      else winsB++;
      turnsSum += r.turns;
      total++;
    }
  }
  const p = total ? winsA / total : 0;
  return {
    games: total,
    winsA, winsB, draws,
    winPct: 100 * p,
    ci: 100 * 1.96 * Math.sqrt((p * (1 - p)) / Math.max(1, total)),
    avgTurns: total ? turnsSum / total : 0,
  };
}

export interface SampleGame {
  winner: 'a' | 'b' | null;
  reason: string;
  turns: number;
  finalGigs: { a: number; b: number };
  log: string[];
}

/** Ein einzelnes, ausführliches Beispielspiel (für das Zug-Protokoll in der UI). */
export function sampleGame(a: SimDeck, b: SimDeck, seed = 7, cfg: Sim2Params = DEFAULT2): SampleGame {
  const r = playGame2(createGame2(a, b, cfg, seed), cfg, heuristic2, heuristic2);
  return { winner: r.winner, reason: r.reason, turns: r.turns, finalGigs: r.finalGigs, log: r.log };
}
