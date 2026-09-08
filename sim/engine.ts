/**
 * engram · Konsolen-Test-Engine (Dev-Werkzeug).
 *
 * Ein bewusst **grobes, heuristisches** Kampfmodell, um Decks und unsere
 * vorhergesagten Synergien in Szenarien gegeneinander durchzuspielen. Das ist
 * NICHT das echte Cyberpunk-TCG-Regelwerk und kein regeltreuer Simulator — es
 * ist ein Messwerkzeug: Wenn ein besser gebautes / synergistischeres Deck hier
 * öfter gewinnt, ist das ein (schwaches) Signal. Ehrlichkeit vor Effekthascherei.
 *
 * Rein und deterministisch (Seed) → reproduzierbar und testbar. Der Zufall steckt
 * nur im Mischen bei Spielbeginn; danach sind Züge deterministisch (Front-Pop),
 * deshalb ist der Spielzustand ohne RNG serialisierbar (für den Schritt-Modus).
 */

// Geteilter RNG + SimDeck-Typ leben jetzt in der App (einzige Quelle der Wahrheit).
import { mulberry32, shuffle, type SimDeck } from '../app/src/domain/sim/rng';
export { mulberry32, shuffle };
export type { SimDeck };

export interface SimCardStat {
  id: string;
  name: string;
  type: string;
  cost: number;
  power: number;
}

/** Reine Zahlenparameter (serialisierbar). */
export interface SimParams {
  openingHand: number;
  gigWin: number;
  eddiesBase: number;
  eddiesRampEvery: number;
  synergyBonus: number;
  lag: boolean;
  turnCap: number;
  /** Anzieh-Malus: der startende Spieler hat in Zug 1 so viele Eddies weniger
   *  (Abbildung der Regel „first player spends 2 Legends" gegen den Startvorteil). */
  firstPlayerPenalty: number;
}

/** Params + injizierte Funktionen (Kartenwerte, paarweise Synergie). */
export interface SimConfig extends SimParams {
  syn: (aId: string, bId: string) => number;
  stat: (id: string) => SimCardStat;
}

export const DEFAULT_PARAMS: SimParams = {
  openingHand: 6,
  gigWin: 7,
  eddiesBase: 3,
  eddiesRampEvery: 2,
  synergyBonus: 3,
  lag: true,
  turnCap: 40,
  firstPlayerPenalty: 2,
};

export type PlayerId = 'a' | 'b';

export interface Side {
  name: string;
  deck: string[];
  hand: string[];
  boardPower: number;
  readyPower: number;
  gigs: number;
  developed: string[];
  played: number;
}

export interface Game {
  a: Side;
  b: Side;
  active: PlayerId;
  turnNo: Record<PlayerId, number>;
  winner: PlayerId | null;
  reason: string;
  log: string[];
}

// SimDeck: siehe ../app/src/domain/sim/rng (oben re-exportiert).

export interface Decision {
  /** Hand-Indizes, die (in dieser Reihenfolge) gespielt werden. */
  play: number[];
  attack: boolean;
}

// mulberry32 / shuffle: siehe ../app/src/domain/sim/rng (oben re-exportiert).

export function eddiesFor(turn: number, cfg: SimParams): number {
  return cfg.eddiesBase + Math.floor((turn - 1) / cfg.eddiesRampEvery);
}

/** Verfügbare Eddies des aktiven Spielers: Ramp minus Anzieh-Malus in dessen Zug 1. */
export function eddiesAvail(g: Game, cfg: SimConfig): number {
  const p = g.active;
  const penalty = p === 'a' && g.turnNo[p] === 1 ? cfg.firstPlayerPenalty : 0;
  return Math.max(0, eddiesFor(g.turnNo[p], cfg) - penalty);
}

function newSide(deck: SimDeck, cfg: SimConfig, rng: () => number): Side {
  const shuffled = shuffle(deck.cardIds, rng);
  return {
    name: deck.name,
    deck: shuffled.slice(cfg.openingHand),
    hand: shuffled.slice(0, cfg.openingHand),
    boardPower: 0,
    readyPower: 0,
    gigs: 0,
    developed: [],
    played: 0,
  };
}

export function createGame(deckA: SimDeck, deckB: SimDeck, cfg: SimConfig, seed: number): Game {
  return {
    a: newSide(deckA, cfg, mulberry32(seed ^ 0x1a2b3c)),
    b: newSide(deckB, cfg, mulberry32(seed ^ 0x4d5e6f)),
    active: 'a',
    turnNo: { a: 0, b: 0 },
    winner: null,
    reason: '',
    log: [],
  };
}

const other = (p: PlayerId): PlayerId => (p === 'a' ? 'b' : 'a');

/** Entwicklungs-Beitrag einer Karte (Power, mit Support-Basiswert + Synergie-Bonus). */
export function contribution(id: string, developed: string[], cfg: SimConfig): number {
  const st = cfg.stat(id);
  let base = st.power > 0 ? st.power : 2; // 0-Power-Karten (Gear/Programs) entwickeln trotzdem
  const synergizes = developed.some((d) => cfg.syn(id, d) > 0 || cfg.syn(d, id) > 0);
  if (synergizes) base += cfg.synergyBonus;
  return base;
}

/**
 * Start des Zugs des aktiven Spielers: bereitstellen, 1 ziehen (Deck leer → Verlust
 * durch Auskarten), +1 Gig (Fixer). Prüft die Sieg-Bedingung (Zugbeginn mit genug
 * Gigs). Gibt false zurück, wenn das Spiel damit endet.
 */
export function beginTurn(g: Game, cfg: SimConfig): boolean {
  if (g.winner) return false;
  const p = g.active;
  const me = g[p];
  g.turnNo[p] += 1;
  me.readyPower = me.boardPower; // alles wird bereit
  if (me.deck.length === 0) {
    g.winner = other(p);
    g.reason = `${me.name} deckt aus`;
    return false;
  }
  me.hand.push(me.deck.shift()!);
  me.gigs += 1; // Fixer-Würfel
  if (me.gigs >= cfg.gigWin) {
    g.winner = p;
    g.reason = `${me.name} beginnt Zug ${g.turnNo[p]} mit ${me.gigs} Gigs`;
    return false;
  }
  return true;
}

export interface HandView {
  i: number;
  id: string;
  name: string;
  type: string;
  cost: number;
  power: number;
  /** Beitrag inkl. Synergie-Bonus, wenn jetzt gespielt. */
  value: number;
  synergizes: boolean;
}

export interface TurnView {
  you: PlayerId;
  turn: number;
  eddies: number;
  gigWin: number;
  yourGigs: number;
  oppGigs: number;
  yourBoardPower: number;
  yourReadyPower: number;
  oppBoardPower: number;
  deckLeft: number;
  hand: HandView[];
}

export function view(g: Game, cfg: SimConfig): TurnView {
  const p = g.active;
  const me = g[p];
  const op = g[other(p)];
  const eddies = eddiesAvail(g, cfg);
  return {
    you: p,
    turn: g.turnNo[p],
    eddies,
    gigWin: cfg.gigWin,
    yourGigs: me.gigs,
    oppGigs: op.gigs,
    yourBoardPower: me.boardPower,
    yourReadyPower: me.readyPower,
    oppBoardPower: op.boardPower,
    deckLeft: me.deck.length,
    hand: me.hand.map((id, i) => {
      const st = cfg.stat(id);
      const synergizes = me.developed.some((d) => cfg.syn(id, d) > 0 || cfg.syn(d, id) > 0);
      return {
        i,
        id,
        name: st.name,
        type: st.type,
        cost: st.cost,
        power: st.power,
        value: contribution(id, me.developed, cfg),
        synergizes,
      };
    }),
  };
}

/** Wendet die Entscheidung des aktiven Spielers an (spielen + optional angreifen). */
export function applyDecision(g: Game, cfg: SimConfig, d: Decision): void {
  if (g.winner) return;
  const p = g.active;
  const me = g[p];
  let eddies = eddiesAvail(g, cfg);

  // Eindeutige, gültige Hand-Indizes in gewählter Reihenfolge.
  const seen = new Set<number>();
  const chosen = d.play.filter(
    (i) => i >= 0 && i < me.hand.length && !seen.has(i) && (seen.add(i), true),
  );
  const played = new Set<number>();
  for (const i of chosen) {
    const id = me.hand[i];
    const st = cfg.stat(id);
    if (st.cost > eddies) continue; // nicht bezahlbar → bleibt auf der Hand
    eddies -= st.cost;
    const add = contribution(id, me.developed, cfg);
    me.boardPower += add;
    if (!cfg.lag) me.readyPower += add; // ohne Lag sofort angriffsbereit
    me.developed.push(id);
    me.played += 1;
    played.add(i);
  }
  me.hand = me.hand.filter((_, i) => !played.has(i)); // nur Gespielte verlassen die Hand

  if (d.attack) attack(g, cfg);
}

/** Kampf/Gig-Klau: bereite Power abzüglich halber Gegner-Feldstärke, /10 = geklaute Gigs. */
export function attack(g: Game, cfg: SimConfig): void {
  const p = g.active;
  const me = g[p];
  const op = g[other(p)];
  const effective = Math.floor(Math.max(0, me.readyPower - 0.5 * op.boardPower) / 10);
  const stolen = Math.min(effective, op.gigs);
  if (stolen > 0) {
    op.gigs -= stolen;
    me.gigs += stolen;
    g.log.push(`  ${me.name} klaut ${stolen} Gig(s) (Power ${me.readyPower} vs ${op.boardPower}).`);
  }
}

export function endTurn(g: Game): void {
  g.active = other(g.active);
}

export type Policy = (g: Game, cfg: SimConfig) => Decision;

/** Ein kompletter Zug des aktiven Spielers mit gegebener Entscheidungsfunktion. */
export function playTurn(g: Game, cfg: SimConfig, decide: Policy): void {
  if (!beginTurn(g, cfg)) return;
  const d = decide(g, cfg);
  g.log.push(
    `Zug ${g.turnNo[g.active]} · ${g[g.active].name}: spielt ${d.play.length}, ` +
      `Gigs ${g[g.active].gigs}`,
  );
  applyDecision(g, cfg, d);
  endTurn(g);
}

export interface GameResult {
  winner: PlayerId | null;
  reason: string;
  turns: number;
  log: string[];
  finalGigs: Record<PlayerId, number>;
}

export function playGame(
  g: Game,
  cfg: SimConfig,
  policies: Record<PlayerId, Policy>,
): GameResult {
  let guard = 0;
  while (!g.winner && guard++ < cfg.turnCap * 2 + 4) {
    playTurn(g, cfg, policies[g.active]);
    if (g.turnNo.a >= cfg.turnCap || g.turnNo.b >= cfg.turnCap) {
      if (!g.winner) {
        // Zugobergrenze: höhere Gig-Zahl gewinnt, sonst unentschieden.
        g.winner = g.a.gigs === g.b.gigs ? null : g.a.gigs > g.b.gigs ? 'a' : 'b';
        g.reason = 'Zugobergrenze — mehr Gigs gewinnt';
      }
      break;
    }
  }
  return {
    winner: g.winner,
    reason: g.reason,
    turns: Math.max(g.turnNo.a, g.turnNo.b),
    log: g.log,
    finalGigs: { a: g.a.gigs, b: g.b.gigs },
  };
}
