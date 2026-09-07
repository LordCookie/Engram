import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  createGame,
  playGame,
  playTurn,
  beginTurn,
  applyDecision,
  endTurn,
  view,
  type Game,
  type PlayerId,
  type SimConfig,
  type SimParams,
  type Decision,
  type GameResult,
  DEFAULT_PARAMS,
} from './engine';
import { heuristic } from './policies';
import { loadDecks, findDeck, makeConfig } from './data';

/**
 * CLI der Test-Engine. Bewusst nüchtern gehalten — ein Dev-Werkzeug zum groben
 * Durchspielen von Decks/Synergien, kein Spiel zum Vorzeigen.
 *
 *   npx tsx run.ts battle --a "The Heist" --b "Embracing Power" --games 200
 *   npx tsx run.ts battle --a "The Heist" --b "The Heist" --synergy off   # A/B-Test
 *   npx tsx run.ts game   --a "The Heist" --b "Embracing Power" --seed 7   # ein Spiel, ausführlich
 *   npx tsx run.ts decks                                                   # spielbare Decks listen
 *   npx tsx run.ts agent-init --a "The Heist" --b "Embracing Power" --agent b
 *   npx tsx run.ts agent-step --play 0,2 --attack true
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const DEFAULT_STATE = join(HERE, '.state.json');

function args(argv: string[]): Record<string, string> {
  const o: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[(i += 1)] : 'true';
      o[k] = v;
    }
  }
  return o;
}

function paramsFrom(a: Record<string, string>): Partial<SimParams> {
  const p: Partial<SimParams> = {};
  if (a.synergy === 'off') p.synergyBonus = 0;
  if (a.gigwin) p.gigWin = Number(a.gigwin);
  if (a.turncap) p.turnCap = Number(a.turncap);
  return p;
}

function pickDecks(a: Record<string, string>) {
  const decks = loadDecks();
  const A = findDeck(decks, a.a ?? decks[0]?.name ?? '');
  const B = findDeck(decks, a.b ?? decks[1]?.name ?? decks[0]?.name ?? '');
  if (!A || !B) {
    console.error('Deck(s) nicht gefunden. Verfügbar:', decks.map((d) => d.name).join(', '));
    process.exit(1);
  }
  return { A, B };
}

// --- Modi ---------------------------------------------------------------

function cmdDecks() {
  const decks = loadDecks();
  console.log(`${decks.length} spielbare Decks:`);
  for (const d of decks) console.log(`  · ${d.name} (${d.cardIds.length} Karten)`);
}

function cmdBattle(a: Record<string, string>) {
  const { A, B } = pickDecks(a);
  const cfg = makeConfig(paramsFrom(a));
  const games = Number(a.games ?? 200);
  const seed0 = Number(a.seed ?? 1);
  // Jede Paarung in BEIDEN Sitzpositionen spielen → der Anzieh-Vorteil hebt sich
  // auf, die Quote misst die Deckstärke statt „wer zuerst dran ist".
  let winA = 0, winB = 0, draw = 0, turnsSum = 0, first = 0;
  const total = games * 2;
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i * 7919;
    for (const swap of [false, true]) {
      const [d1, d2] = swap ? [B, A] : [A, B];
      const r = playGame(createGame(d1, d2, cfg, seed), cfg, { a: heuristic, b: heuristic });
      const winnerDeck = r.winner === 'a' ? d1 : r.winner === 'b' ? d2 : null;
      if (winnerDeck === A) winA++;
      else if (winnerDeck === B) winB++;
      else draw++;
      if (r.winner === 'a') first++; // Anziehender hat gewonnen
      turnsSum += r.turns;
    }
  }
  const pct = (n: number) => ((100 * n) / total).toFixed(1) + '%';
  console.log(`Battle · ${A.name} vs ${B.name} · ${total} Spiele (beide Sitzpositionen)` +
    (cfg.synergyBonus === 0 ? ' · Synergie AUS' : ''));
  console.log(`  ${A.name}: ${winA} (${pct(winA)})   ${B.name}: ${winB} (${pct(winB)})   Remis: ${draw} (${pct(draw)})`);
  console.log(`  Ø Züge: ${(turnsSum / total).toFixed(1)} · Anzieh-Vorteil: ${pct(first)} Siege für den Startenden`);
}

function cmdGame(a: Record<string, string>) {
  const { A, B } = pickDecks(a);
  const cfg = makeConfig(paramsFrom(a));
  const g = createGame(A, B, cfg, Number(a.seed ?? 1));
  const r = playGame(g, cfg, { a: heuristic, b: heuristic });
  for (const line of r.log) console.log(line);
  console.log('—');
  console.log(`Ergebnis: ${r.winner ? (r.winner === 'a' ? A.name : B.name) : 'Remis'} — ${r.reason}`);
  console.log(`Gigs: ${A.name} ${r.finalGigs.a} : ${r.finalGigs.b} ${B.name} · ${r.turns} Züge`);
}

// --- Schrittbetrieb für einen Subagenten --------------------------------

interface AgentState {
  game: Game;
  params: SimParams;
  agent: PlayerId;
  names: Record<PlayerId, string>;
}

/** Bis zur nächsten Entscheidung des Agenten (oder Spielende) vorspielen. */
function advance(g: Game, cfg: SimConfig, agent: PlayerId): { awaiting: boolean; result?: GameResult } {
  for (let guard = 0; guard < cfg.turnCap * 2 + 8; guard++) {
    if (g.winner) break;
    if (g.active === agent) {
      if (!beginTurn(g, cfg)) break; // Zugbeginn beendet evtl. das Spiel (Sieg/Auskarten)
      return { awaiting: true };
    }
    playTurn(g, cfg, heuristic); // Gegnerzug (Heuristik)
  }
  return {
    awaiting: false,
    result: {
      winner: g.winner,
      reason: g.reason || 'Zugobergrenze',
      turns: Math.max(g.turnNo.a, g.turnNo.b),
      log: g.log,
      finalGigs: { a: g.a.gigs, b: g.b.gigs },
    },
  };
}

function emit(g: Game, cfg: SimConfig, st: AgentState, step: { awaiting: boolean; result?: GameResult }) {
  if (step.awaiting) {
    const v = view(g, cfg);
    console.log(JSON.stringify({
      awaiting: true,
      you: st.names[st.agent],
      goal: `Erreiche ${cfg.gigWin} Gigs zuerst (Zugbeginn). Spiele bezahlbare Karten (Eddies-Budget) und greife an, um Gigs zu klauen.`,
      view: v,
      hint: 'Antworte im agent-step mit --play "i,j" (Hand-Indizes) und --attack true|false.',
    }, null, 2));
  } else {
    const r = step.result!;
    console.log(JSON.stringify({
      done: true,
      winner: r.winner ? st.names[r.winner] : null,
      reason: r.reason,
      turns: r.turns,
      finalGigs: { [st.names.a]: r.finalGigs.a, [st.names.b]: r.finalGigs.b },
    }, null, 2));
  }
}

function saveState(path: string, st: AgentState) {
  writeFileSync(path, JSON.stringify(st), 'utf-8');
}

function cmdAgentInit(a: Record<string, string>) {
  const { A, B } = pickDecks(a);
  const params: SimParams = { ...DEFAULT_PARAMS, ...paramsFrom(a) };
  const cfg = makeConfig(params);
  const agent = (a.agent === 'a' ? 'a' : 'b') as PlayerId;
  const g = createGame(A, B, cfg, Number(a.seed ?? 1));
  const st: AgentState = { game: g, params, agent, names: { a: A.name, b: B.name } };
  const step = advance(g, cfg, agent);
  const path = a.state ?? DEFAULT_STATE;
  saveState(path, st);
  emit(g, cfg, st, step);
}

function cmdAgentStep(a: Record<string, string>) {
  const path = a.state ?? DEFAULT_STATE;
  if (!existsSync(path)) {
    console.error('Kein Spielstand. Erst `agent-init` laufen lassen.');
    process.exit(1);
  }
  const st: AgentState = JSON.parse(readFileSync(path, 'utf-8'));
  const cfg = makeConfig(st.params);
  const g = st.game;
  const decision: Decision = {
    play: (a.play ?? '')
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isInteger(n)),
    attack: a.attack !== 'false',
  };
  applyDecision(g, cfg, decision);
  endTurn(g);
  const step = advance(g, cfg, st.agent);
  saveState(path, st);
  emit(g, cfg, st, step);
}

// --- Dispatch -----------------------------------------------------------

const argv = process.argv.slice(2);
const cmd = argv[0];
const a = args(argv.slice(1));
switch (cmd) {
  case 'decks': cmdDecks(); break;
  case 'battle': cmdBattle(a); break;
  case 'game': cmdGame(a); break;
  case 'agent-init': cmdAgentInit(a); break;
  case 'agent-step': cmdAgentStep(a); break;
  default:
    console.log('Modi: decks | battle | game | agent-init | agent-step');
    console.log('Beispiel: npx tsx run.ts battle --a "The Heist" --b "Embracing Power" --games 200');
}
