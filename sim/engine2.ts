import { mulberry32, shuffle, type SimDeck } from './engine';
import { model, type Effect } from './model';

/**
 * engine2 — Kampf-/Keyword-/Interaktions-Modell (näher an den echten Regeln als
 * der Power-Proxy in engine.ts). Einheiten kommen aufs Feld (mit Lag), greifen die
 * Gig-Area an, der Verteidiger kann blocken; Kämpfe entscheiden sich an der Power,
 * besiegte Einheiten wandern in den Trash. Keywords aus dem Kartentext: Lag,
 * Adrenaline, Blocker, Go Solo; einfache {Play}-Effekte: Defeat (Removal), Draw;
 * Ramp über Eddie-Quellen. Eddies kommen aus den 3 Legends (+ Ramp), nicht aus
 * einer abstrakten Kurve.
 *
 * Weiterhin ein Modell, kein perfekter Regel-Nachbau (Einzeltexte, Reaktionen,
 * Würfel-Details bleiben abstrahiert) — aber Interaktion zählt jetzt echt.
 */

export interface Sim2Params {
  openingHand: number;
  gigWin: number;
  baseEddies: number; // Eddies/Zug aus den 3 Legends
  eddiesRampEvery: number; // alle N Züge +1 Eddie (teurere Karten werden spielbar)
  firstPlayerPenalty: number; // Eddies weniger in Zug 1 für den Startenden
  turnCap: number;
}
export const DEFAULT2: Sim2Params = {
  openingHand: 6,
  gigWin: 7,
  baseEddies: 3,
  eddiesRampEvery: 2,
  firstPlayerPenalty: 2,
  turnCap: 40,
};

export interface Unit {
  uid: string;
  cardId: string;
  power: number;
  spent: boolean;
  lag: boolean;
  blocker: boolean;
}
export interface Side {
  name: string;
  deck: string[];
  hand: string[];
  board: Unit[];
  gigs: number;
  eddieSources: number;
}
export type PlayerId = 'a' | 'b';
export interface Game2 {
  a: Side;
  b: Side;
  active: PlayerId;
  turnNo: Record<PlayerId, number>;
  winner: PlayerId | null;
  reason: string;
  log: string[];
  uid: number;
}

const other = (p: PlayerId): PlayerId => (p === 'a' ? 'b' : 'a');

function newSide(deck: SimDeck, cfg: Sim2Params, rng: () => number): Side {
  const s = shuffle(deck.cardIds, rng);
  return { name: deck.name, deck: s.slice(cfg.openingHand), hand: s.slice(0, cfg.openingHand), board: [], gigs: 0, eddieSources: 0 };
}

export function createGame2(A: SimDeck, B: SimDeck, cfg: Sim2Params, seed: number): Game2 {
  return {
    a: newSide(A, cfg, mulberry32(seed ^ 0x1a2b3c)),
    b: newSide(B, cfg, mulberry32(seed ^ 0x4d5e6f)),
    active: 'a',
    turnNo: { a: 0, b: 0 },
    winner: null,
    reason: '',
    log: [],
    uid: 0,
  };
}

export function eddiesOf(turn: number, eddieSources: number, isStarter: boolean, cfg: Sim2Params): number {
  const ramp = Math.floor((turn - 1) / cfg.eddiesRampEvery);
  const penalty = isStarter && turn === 1 ? cfg.firstPlayerPenalty : 0;
  return Math.max(0, cfg.baseEddies + ramp + eddieSources - penalty);
}
export function eddies(g: Game2, cfg: Sim2Params): number {
  const p = g.active;
  return eddiesOf(g.turnNo[p], g[p].eddieSources, p === 'a', cfg);
}

/** Start-Phase: bereitstellen (Lag ab), 1 ziehen (Deck leer → Verlust), +1 Gig. */
export function beginTurn2(g: Game2, cfg: Sim2Params): boolean {
  if (g.winner) return false;
  const p = g.active;
  const me = g[p];
  g.turnNo[p] += 1;
  for (const u of me.board) { u.spent = false; u.lag = false; }
  if (me.deck.length === 0) { g.winner = other(p); g.reason = `${me.name} deckt aus`; return false; }
  me.hand.push(me.deck.shift()!);
  me.gigs += 1;
  if (me.gigs >= cfg.gigWin) { g.winner = p; g.reason = `${me.name} beginnt Zug ${g.turnNo[p]} mit ${me.gigs} Gigs`; return false; }
  return true;
}

// --- Sichten für die Policies -------------------------------------------
export interface HandCardV { i: number; id: string; name: string; type: string; cost: number; power: number; isUnit: boolean; adrenaline: boolean; blocker: boolean; defeat: boolean; spend: boolean; gig: number; buff: number; draw: number; eddie: boolean; }
export interface UnitV { uid: string; name: string; power: number; spent: boolean; lag: boolean; blocker: boolean; }
export interface View2 {
  you: PlayerId; turn: number; eddies: number; gigWin: number;
  yourGigs: number; oppGigs: number; deckLeft: number;
  hand: HandCardV[]; yourBoard: UnitV[]; oppBoard: UnitV[];
}
export function view2(g: Game2, cfg: Sim2Params): View2 {
  return view2For(g, cfg, g.active);
}

/** Sicht aus der Perspektive eines bestimmten Spielers (für Verteidiger-Blocks). */
export function view2For(g: Game2, cfg: Sim2Params, who: PlayerId): View2 {
  const p = who, me = g[p], op = g[other(p)];
  const eddiesVal = eddiesOf(g.turnNo[p], me.eddieSources, p === 'a', cfg);
  return {
    you: p, turn: g.turnNo[p], eddies: eddiesVal, gigWin: cfg.gigWin,
    yourGigs: me.gigs, oppGigs: op.gigs, deckLeft: me.deck.length,
    hand: me.hand.map((id, i) => {
      const m = model(id);
      return { i, id, name: m.name, type: m.type, cost: m.cost, power: m.power, isUnit: m.isUnit, adrenaline: m.adrenaline, blocker: m.blocker, defeat: !!m.onPlay.defeat, spend: !!m.onPlay.spendRival, gig: (m.onPlay.gig?.self ?? 0) + (m.onPlay.gig?.rival ?? 0), buff: m.onPlay.buff?.power ?? 0, draw: m.onPlay.draw ?? 0, eddie: m.eddieSource };
    }),
    yourBoard: me.board.map((u) => ({ uid: u.uid, name: model(u.cardId).name, power: u.power, spent: u.spent, lag: u.lag, blocker: u.blocker })),
    oppBoard: op.board.map((u) => ({ uid: u.uid, name: model(u.cardId).name, power: u.power, spent: u.spent, lag: u.lag, blocker: u.blocker })),
  };
}

// --- Aktionen -----------------------------------------------------------
function defeatUnit(g: Game2, side: PlayerId, uid: string) {
  const s = g[side];
  const i = s.board.findIndex((u) => u.uid === uid);
  if (i >= 0) s.board.splice(i, 1); // in den Trash (nicht weiter modelliert)
}

function checkGigWin(g: Game2, cfg: Sim2Params, p: PlayerId) {
  if (!g.winner && g[p].gigs >= cfg.gigWin) { g.winner = p; g.reason = `${g[p].name} erreicht ${g[p].gigs} Gigs`; }
}

/** Imperativen Karteneffekt anwenden (Removal, Spend-Rival, Gig-Swing, Buff, Draw). */
function applyEffect(g: Game2, cfg: Sim2Params, e: Effect) {
  const p = g.active, me = g[p], op = g[other(p)];
  // Spend zuerst (Text „Spend all … Then defeat a spent Unit" braucht diese Reihenfolge).
  if (e.spendRival) {
    const targets = op.board
      .filter((u) => !u.spent && (e.spendRival!.maxCost == null || model(u.cardId).cost <= e.spendRival!.maxCost))
      .sort((x, y) => y.power - x.power); // stärkste zuerst erschöpfen
    const n = e.spendRival.all ? targets.length : e.spendRival.count ?? 1;
    for (const u of targets.slice(0, n)) u.spent = true;
  }
  if (e.defeat) {
    if (e.defeat.all) {
      const keep = me.board[me.board.length - 1]?.uid; // gerade gespielte Einheit bleibt
      op.board = [];
      me.board = me.board.filter((u) => u.uid === keep);
    } else {
      let targets = op.board.filter((u) => e.defeat!.maxCost == null || model(u.cardId).cost <= e.defeat!.maxCost);
      if (e.defeat.spent) { const sp = targets.filter((u) => u.spent); if (sp.length) targets = sp; }
      if (targets.length) { targets.sort((x, y) => y.power - x.power); defeatUnit(g, other(p), targets[0].uid); }
    }
  }
  if (e.gig) {
    if (e.gig.self) { const s = Math.min(e.gig.self, op.gigs); op.gigs -= s; me.gigs += s; g.log.push(`  ${me.name}: Effekt klaut ${s} Gig(s)`); checkGigWin(g, cfg, p); }
    if (e.gig.rival) op.gigs = Math.max(0, op.gigs - e.gig.rival);
  }
  if (e.buff) {
    if (e.buff.allies) for (const u of me.board) u.power += e.buff.power;
    else { const best = [...me.board].sort((x, y) => y.power - x.power)[0]; if (best) best.power += e.buff.power; }
  }
  if (e.draw) for (let k = 0; k < e.draw; k++) if (me.deck.length) me.hand.push(me.deck.shift()!);
}

/** Karten spielen (bezahlbar, in gegebener Reihenfolge). */
export function playCards(g: Game2, cfg: Sim2Params, handIdx: number[]) {
  const p = g.active, me = g[p];
  let budget = eddies(g, cfg);
  const seen = new Set<number>();
  const chosen = handIdx.filter((i) => i >= 0 && i < me.hand.length && !seen.has(i) && (seen.add(i), true));
  const played = new Set<number>();
  for (const i of chosen) {
    const id = me.hand[i];
    const m = model(id);
    if (m.cost > budget) continue;
    budget -= m.cost;
    played.add(i);
    if (m.isUnit) {
      me.board.push({ uid: `u${g.uid++}`, cardId: id, power: m.power, spent: false, lag: !m.adrenaline, blocker: m.blocker });
    }
    if (m.eddieSource) me.eddieSources += 1;
    applyEffect(g, cfg, m.onPlay);
  }
  me.hand = me.hand.filter((_, i) => !played.has(i));
}

export interface Policy2 {
  play(v: View2): number[];
  attackers(v: View2): string[];
  /** Blocker-uid für einen Angreifer, oder null. */
  block(attacker: UnitV, v: View2): string | null;
}

/** Angriffsphase: erklärte Angreifer nacheinander, Verteidiger blockt reaktiv. */
export function attackPhase(g: Game2, cfg: Sim2Params, attackerUids: string[], defender: Policy2) {
  const p = g.active, me = g[p], op = g[other(p)];
  const usedBlock = new Set<string>();
  for (const uid of attackerUids) {
    const A = me.board.find((u) => u.uid === uid);
    if (!A || A.spent || A.lag) continue; // muss bereit & ohne Lag sein
    A.spent = true;
    const am = model(A.cardId); // {Attack} Gig-Swing (z. B. „decrease a Gig")
    if (am.onAttack.gig) { const d = Math.min(am.onAttack.gig, op.gigs); if (d > 0) { op.gigs -= d; g.log.push(`  ${me.name}: {Attack} senkt Rival-Gig um ${d}`); } }
    const dv = view2For(g, cfg, other(p)); // Sicht des Verteidigers
    const bUid = defender.block({ uid: A.uid, name: model(A.cardId).name, power: A.power, spent: A.spent, lag: A.lag, blocker: A.blocker }, dv);
    const B = bUid ? op.board.find((u) => u.uid === bUid) : undefined;
    const eligible = B && !usedBlock.has(B.uid) && (!B.spent || B.blocker);
    if (B && eligible) {
      usedBlock.add(B.uid);
      B.spent = true;
      if (A.power > B.power) defeatUnit(g, other(p), B.uid); // Blocker besiegt, Angriff gestoppt
      else if (B.power > A.power) defeatUnit(g, p, A.uid); // Angreifer besiegt
      // Gleichstand: beide überleben; in jedem Fall KEIN Gig-Klau (geblockt)
      g.log.push(`  ${me.name}: Angriff (P${A.power}) geblockt von P${B.power}`);
    } else {
      const steal = Math.min(1 + Math.floor(A.power / 10), op.gigs);
      if (steal > 0) { op.gigs -= steal; me.gigs += steal; g.log.push(`  ${me.name} klaut ${steal} Gig(s) (P${A.power}, unblocked)`); }
    }
  }
}

export function endTurn2(g: Game2) { g.active = other(g.active); }

export function playTurn2(g: Game2, cfg: Sim2Params, self: Policy2, opp: Policy2) {
  if (!beginTurn2(g, cfg)) return;
  const v = view2(g, cfg);
  playCards(g, cfg, self.play(v));
  const v2 = view2(g, cfg);
  attackPhase(g, cfg, self.attackers(v2), opp);
  endTurn2(g);
}

export interface Game2Result { winner: PlayerId | null; reason: string; turns: number; finalGigs: Record<PlayerId, number>; log: string[]; }

export function playGame2(g: Game2, cfg: Sim2Params, pa: Policy2, pb: Policy2): Game2Result {
  let guard = 0;
  while (!g.winner && guard++ < cfg.turnCap * 2 + 4) {
    const self = g.active === 'a' ? pa : pb;
    const opp = g.active === 'a' ? pb : pa;
    playTurn2(g, cfg, self, opp);
    if (g.turnNo.a >= cfg.turnCap || g.turnNo.b >= cfg.turnCap) {
      if (!g.winner) { g.winner = g.a.gigs === g.b.gigs ? null : g.a.gigs > g.b.gigs ? 'a' : 'b'; g.reason = 'Zugobergrenze'; }
      break;
    }
  }
  return { winner: g.winner, reason: g.reason, turns: Math.max(g.turnNo.a, g.turnNo.b), finalGigs: { a: g.a.gigs, b: g.b.gigs }, log: g.log };
}
