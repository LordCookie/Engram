import {
  createGame,
  playGame,
  playTurn,
  beginTurn,
  applyDecision,
  endTurn,
  DEFAULT_PARAMS,
  type SimConfig,
  type SimCardStat,
  type SimDeck,
  type PlayerId,
  type GameResult,
} from './engine';
import { heuristic } from './policies';
import { makeConfig, loadDecks, findDeck } from './data';

/**
 * Prüft, „wie richtig" die Test-Engine ist — auf zwei Ebenen:
 *  A) Implementierungs-Korrektheit: Determinismus, Schritt-Modus == Batch,
 *     harte Invarianten (Gigs ≥ 0, Zugzähler, Terminierung, Budget).
 *  B) Modell-Plausibilität: Spiegel ≈ 50/50 (keine versteckte Seite-Bias),
 *     stärkeres Deck dominiert, Monte-Carlo-Schätzung stabil, Anzieh-Vorteil.
 *
 * Harte Checks brechen mit Exit 1 ab; Plausibilitäts-Metriken werden berichtet.
 */

let hardFails = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`  ${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) hardFails++;
}
function info(name: string, detail: string) {
  console.log(`  · ${name}: ${detail}`);
}

// --- Stub-Welt für reine Engine-Checks (ohne Kartendaten) ----------------
const STUB: Record<string, SimCardStat> = {
  big: { id: 'big', name: 'Big', type: 'UNIT', cost: 3, power: 8 },
  small: { id: 'small', name: 'Small', type: 'UNIT', cost: 3, power: 2 },
  cheap: { id: 'cheap', name: 'Cheap', type: 'UNIT', cost: 1, power: 2 },
};
function stubCfg(over: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_PARAMS,
    syn: () => 0,
    stat: (id) => STUB[id] ?? { id, name: id, type: 'UNIT', cost: 2, power: 2 },
    ...over,
  };
}
const stubDeck = (name: string, id: string): SimDeck => ({
  name,
  cardIds: Array.from({ length: 40 }, () => id),
});

/** Ein Spiel Schritt für Schritt (wie der agent-Modus), Agent = Heuristik. */
function playViaSteps(A: SimDeck, B: SimDeck, cfg: SimConfig, seed: number, agent: PlayerId): GameResult {
  const g = createGame(A, B, cfg, seed);
  const advance = (): boolean => {
    for (let k = 0; k < cfg.turnCap * 2 + 8; k++) {
      if (g.winner) return false;
      if (g.active === agent) {
        if (!beginTurn(g, cfg)) return false;
        return true;
      }
      playTurn(g, cfg, heuristic);
    }
    return false;
  };
  let awaiting = advance();
  while (awaiting) {
    applyDecision(g, cfg, heuristic(g, cfg));
    endTurn(g);
    awaiting = advance();
  }
  return {
    winner: g.winner,
    reason: g.reason,
    turns: Math.max(g.turnNo.a, g.turnNo.b),
    log: g.log,
    finalGigs: { a: g.a.gigs, b: g.b.gigs },
  };
}

/** Seat-faire Siegquote von A gegen B über `games` Paarungen (beide Positionen). */
function winRate(A: SimDeck, B: SimDeck, cfg: SimConfig, games: number, seed0 = 1) {
  let winA = 0, winB = 0, draw = 0, firstWins = 0, turns = 0;
  const total = games * 2;
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i * 7919;
    for (const swap of [false, true]) {
      const [d1, d2] = swap ? [B, A] : [A, B];
      const r = playGame(createGame(d1, d2, cfg, seed), cfg, { a: heuristic, b: heuristic });
      // Nach ROLLE zählen, nicht nach Objekt-Identität (Spiegel-fest):
      const roleAWon = swap ? r.winner === 'b' : r.winner === 'a';
      if (r.winner === null) draw++; else if (roleAWon) winA++; else winB++;
      if (r.winner === 'a') firstWins++;
      turns += r.turns;
    }
  }
  return { winA, winB, draw, total, pctA: (100 * winA) / total, pctFirst: (100 * firstWins) / total, avgTurns: turns / total };
}

console.log('verify.ts — Engine-Prüfung\n');
const cfg = makeConfig();
const decks = loadDecks();
const heist = findDeck(decks, 'The Heist')!;
const embrace = findDeck(decks, 'Embracing Power')!;

// === A) Implementierungs-Korrektheit ====================================
console.log('A) Implementierungs-Korrektheit');

// A1 Determinismus (echte Decks)
{
  const r1 = playGame(createGame(heist, embrace, cfg, 42), cfg, { a: heuristic, b: heuristic });
  const r2 = playGame(createGame(heist, embrace, cfg, 42), cfg, { a: heuristic, b: heuristic });
  check('Determinismus: gleicher Seed → identischer Ausgang',
    r1.winner === r2.winner && r1.turns === r2.turns && r1.finalGigs.a === r2.finalGigs.a);
}

// A2 Schritt-Modus == Batch (Agent spielt exakt die Heuristik)
{
  let mism = 0;
  for (let s = 1; s <= 200; s++) {
    const batch = playGame(createGame(heist, embrace, cfg, s), cfg, { a: heuristic, b: heuristic });
    const step = playViaSteps(heist, embrace, cfg, s, 'b');
    if (batch.winner !== step.winner || batch.turns !== step.turns ||
        batch.finalGigs.a !== step.finalGigs.a || batch.finalGigs.b !== step.finalGigs.b) mism++;
  }
  check('Schritt-Modus == Batch über 200 Seeds (Agent=Heuristik)', mism === 0, `${mism} Abweichungen`);
}

// A3 Invarianten über viele Spiele (Gigs≥0, Zugzähler +1, Terminierung, Budget)
{
  let bad = 0, budgetBad = 0, longest = 0;
  for (let s = 1; s <= 500; s++) {
    const g = createGame(heist, embrace, cfg, s);
    let guard = 0;
    while (!g.winner && guard++ < cfg.turnCap * 2 + 4) {
      const active = g.active;
      const before = g.turnNo[active];
      if (!beginTurn(g, cfg)) break;
      const eddies = DEFAULT_PARAMS.eddiesBase + Math.floor((g.turnNo[active] - 1) / DEFAULT_PARAMS.eddiesRampEvery);
      const handBefore = [...g[active].hand];
      applyDecision(g, cfg, heuristic(g, cfg));
      // Summe der Kosten der tatsächlich gespielten Karten ≤ Eddies-Budget?
      if (sumCost(handBefore, g[active].hand, cfg) > eddies) budgetBad++;
      if (g.turnNo[active] !== before + 1) bad++; // genau ein Zug weiter
      endTurn(g);
      if (g.a.gigs < 0 || g.b.gigs < 0) bad++; // Gigs nie negativ
    }
    longest = Math.max(longest, Math.max(g.turnNo.a, g.turnNo.b));
    if (!g.winner) bad++; // muss innerhalb der Obergrenze enden
  }
  check('Invarianten (Gigs≥0, Zug+1/Zug, Terminierung) über 500 Spiele', bad === 0, `${bad} Verletzungen`);
  check('Eddies-Budget nie überschritten (500 Spiele)', budgetBad === 0, `${budgetBad} Verletzungen`);
  info('längstes Spiel', `${longest} Züge (Cap ${cfg.turnCap})`);
}

// A4 attack-Grenzfälle
{
  const g = createGame(heist, embrace, cfg, 1);
  g.a.readyPower = 5; g.b.boardPower = 100; g.b.gigs = 3;
  const before = g.b.gigs; playTurnAttackOnly(g, cfg);
  check('kein negativer Klau bei starker Gegner-Verteidigung', g.b.gigs === before && g.a.gigs === 0);
}

// === B) Modell-Plausibilität ============================================
console.log('\nB) Modell-Plausibilität');

// B1 Spiegel ≈ 50/50 (keine versteckte Seite-Bias, seat-fair)
{
  const m = winRate(heist, heist, cfg, 500);
  check('Spiegel Heist vs Heist ≈ 50% (seat-fair, ±3)', Math.abs(m.pctA - 50) <= 3, `${m.pctA.toFixed(1)}%`);
  info('Anzieh-Vorteil (Spiegel)', `${m.pctFirst.toFixed(1)}% Siege für den Startenden`);
}

// B2 Dominanz: starkes Deck (Power 8) schlägt schwaches (Power 2) fast immer
{
  const strong = stubDeck('Stark', 'big');
  const weak = stubDeck('Schwach', 'small');
  const d = winRate(strong, weak, stubCfg(), 300);
  check('Dominanz: stärkeres Deck ≥ 90% (seat-fair)', d.pctA >= 90, `${d.pctA.toFixed(1)}%`);
}

// B3 Monte-Carlo-Stabilität: Quote über 3 Seed-Basen dicht beieinander
{
  const rs = [1, 5000, 9999].map((s0) => winRate(heist, embrace, cfg, 400, s0).pctA);
  const spread = Math.max(...rs) - Math.min(...rs);
  check('Schätzung stabil über 3 Seed-Basen (Spanne ≤ 4 Punkte)', spread <= 4,
    `${rs.map((r) => r.toFixed(1)).join(' / ')} % → Spanne ${spread.toFixed(1)}`);
}

// B4 Synergie-Monotonie: mehr Bonus hilft dem synergistischeren Deck (nicht schlechter)
{
  const rates = [0, 1, 3, 6].map((b) => ({ b, p: winRate(heist, embrace, makeConfig({ synergyBonus: b }), 300).pctA }));
  const monotone = rates.every((r, i) => i === 0 || r.p >= rates[i - 1].p - 1.5); // ~monoton (kleine Toleranz)
  check('Synergie-Monotonie: höherer Bonus ⇒ Heist nicht schlechter', monotone,
    rates.map((r) => `b${r.b}:${r.p.toFixed(0)}%`).join(' '));
}

console.log(`\n${hardFails === 0 ? 'Alle harten Checks bestanden.' : hardFails + ' HARTE CHECKS FEHLGESCHLAGEN.'}`);
process.exit(hardFails > 0 ? 1 : 0);

// --- Hilfen -------------------------------------------------------------
function sumCost(handBefore: string[], handAfter: string[], cfg: SimConfig): number {
  // gespielte Karten = Multiset-Differenz handBefore \ handAfter
  const after = [...handAfter];
  let spent = 0;
  for (const id of handBefore) {
    const i = after.indexOf(id);
    if (i >= 0) after.splice(i, 1); // noch auf der Hand → nicht gespielt
    else spent += cfg.stat(id).cost; // verschwunden → gespielt
  }
  return spent;
}
function playTurnAttackOnly(g: ReturnType<typeof createGame>, cfg: SimConfig) {
  applyDecision(g, cfg, { play: [], attack: true });
}
