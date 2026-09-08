import assert from 'node:assert/strict';
import { catalog } from '../app/src/data/catalog';
import { model } from './model';
import {
  createGame2,
  playGame2,
  playCards,
  attackPhase,
  beginTurn2,
  DEFAULT2,
  type Game2,
  type Unit,
  type Policy2,
} from './engine2';
import { heuristic2 } from './policies2';
import { loadDecks, findDeck } from './data';

let pass = 0, fail = 0;
function test(name: string, fn: () => void) {
  try { fn(); pass++; console.log(`  ✓ ${name}`); }
  catch (e) { fail++; console.error(`  ✗ ${name}\n    ${(e as Error).message}`); }
}

const cfg = DEFAULT2;
const decks = loadDecks();
const H = findDeck(decks, 'The Heist')!;

// synthetische Einheit
let U = 0;
const unit = (power: number, over: Partial<Unit> = {}): Unit =>
  ({ uid: `t${U++}`, cardId: 'x', power, spent: false, lag: false, blocker: false, ...over });
// Spiel mit gesetzten Feldern
function mkGame(): Game2 {
  const g = createGame2(H, H, cfg, 1);
  g.a.board = []; g.b.board = []; g.a.gigs = 0; g.b.gigs = 0; g.active = 'a';
  g.turnNo.a = 3; g.turnNo.b = 3; // genug Eddies, kein Anzieh-Malus
  return g;
}
const block = (uid: string | null): Policy2 => ({ play: () => [], attackers: () => [], block: () => uid });
const noBlock = block(null);

console.log('engine2.test.ts');

test('Determinismus (gleicher Seed = gleich)', () => {
  const r1 = playGame2(createGame2(H, H, cfg, 42), cfg, heuristic2, heuristic2);
  const r2 = playGame2(createGame2(H, H, cfg, 42), cfg, heuristic2, heuristic2);
  assert.equal(r1.winner, r2.winner);
  assert.equal(r1.turns, r2.turns);
  assert.equal(r1.finalGigs.a, r2.finalGigs.a);
});

test('beginTurn2: bereitstellen (Lag/Spent ab), ziehen, +Gig', () => {
  const g = mkGame();
  g.a.board = [unit(5, { spent: true, lag: true })];
  const hand = g.a.hand.length;
  assert.equal(beginTurn2(g, cfg), true);
  assert.equal(g.a.board[0].spent, false);
  assert.equal(g.a.board[0].lag, false);
  assert.equal(g.a.gigs, 1);
  assert.equal(g.a.hand.length, hand + 1);
});

test('unblocked: Klau = 1 + floor(Power/10)', () => {
  const g = mkGame();
  g.a.board = [unit(8)]; g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], noBlock);
  assert.equal(g.a.gigs, 1); assert.equal(g.b.gigs, 4); // P8 -> 1
  const g2 = mkGame();
  g2.a.board = [unit(14)]; g2.b.gigs = 5;
  attackPhase(g2, cfg, [g2.a.board[0].uid], noBlock);
  assert.equal(g2.a.gigs, 2); assert.equal(g2.b.gigs, 3); // P14 -> 2
});

test('geblockt: kein Klau; Blocker>Angreifer besiegt Angreifer', () => {
  const g = mkGame();
  g.a.board = [unit(4)]; g.b.board = [unit(6)]; g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], block(g.b.board[0].uid));
  assert.equal(g.b.gigs, 5); // kein Klau
  assert.equal(g.a.board.length, 0); // Angreifer besiegt
  assert.equal(g.b.board.length, 1); // Blocker überlebt
});

test('Angreifer>Blocker besiegt Blocker, trotzdem kein Klau', () => {
  const g = mkGame();
  g.a.board = [unit(9)]; g.b.board = [unit(3)]; g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], block(g.b.board[0].uid));
  assert.equal(g.b.gigs, 5);
  assert.equal(g.b.board.length, 0); // Blocker besiegt
  assert.equal(g.a.board.length, 1); // Angreifer überlebt
});

test('Blocker-Keyword blockt auch gespendet', () => {
  const g = mkGame();
  g.a.board = [unit(4)];
  g.b.board = [unit(6, { spent: true, blocker: true })]; // gespendet, aber Blocker
  g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], block(g.b.board[0].uid));
  assert.equal(g.b.gigs, 5); // erfolgreich geblockt
  assert.equal(g.a.board.length, 0);
});

test('gespendete Nicht-Blocker können nicht blocken → Klau geht durch', () => {
  const g = mkGame();
  g.a.board = [unit(4)];
  g.b.board = [unit(6, { spent: true, blocker: false })];
  g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], block(g.b.board[0].uid));
  assert.equal(g.b.gigs, 4); // Block ungültig → 1 geklaut
});

test('gelaggte/gespendete Angreifer greifen nicht an', () => {
  const g = mkGame();
  g.a.board = [unit(8, { lag: true })]; g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], noBlock);
  assert.equal(g.b.gigs, 5); // Lag → kein Angriff
});

test('playCards: Unit kommt mit Lag, Adrenaline ohne; Budget zählt', () => {
  const vanilla = catalog.find((c) => { const m = model(c.id); return m.isUnit && !m.adrenaline && !m.onPlay.defeat && (c.cost ?? 0) >= 1 && (c.cost ?? 0) <= 3 && (c.power ?? 0) > 0; })!;
  const g = mkGame();
  g.a.hand = [vanilla.id];
  playCards(g, cfg, [0]);
  assert.equal(g.a.board.length, 1);
  assert.equal(g.a.board[0].lag, true); // frisch gespielt = Lag
  const adr = catalog.find((c) => model(c.id).adrenaline && model(c.id).isUnit);
  if (adr) {
    const g2 = mkGame(); g2.turnNo.a = 20; g2.a.hand = [adr.id]; playCards(g2, cfg, [0]);
    assert.equal(g2.a.board.length, 1, 'Adrenaline-Unit sollte gespielt sein');
    assert.equal(g2.a.board[0].lag, false); // Adrenaline hebt Lag auf
  }
});

test('{Play} Defeat entfernt eine gegnerische Einheit', () => {
  const removal = catalog.find((c) => { const d = model(c.id).onPlay.defeat; return d && !d.all; });
  if (!removal) { console.log('    (kein Removal in den Daten — übersprungen)'); return; }
  const cap = model(removal.id).onPlay.defeat!.maxCost;
  const g = mkGame();
  // gegnerische Einheit mit passender Kosten (falls Cap) auf das Feld
  const targetCost = cap ?? 2;
  g.b.board = [unit(3, { cardId: catalog.find((c) => (c.cost ?? 0) <= targetCost && c.type === 'UNIT')?.id ?? 'x' })];
  g.a.hand = [removal.id];
  g.turnNo.a = 20; // reichlich Eddies, damit das Removal sicher bezahlbar ist
  const before = g.b.board.length;
  playCards(g, cfg, [0]);
  assert.ok(g.b.board.length < before, 'gegnerische Einheit sollte besiegt sein');
});

test('{Play} Spend-all erschöpft alle gegnerischen Einheiten', () => {
  const prog = catalog.find((c) => model(c.id).onPlay.spendRival?.all);
  if (!prog) { console.log('    (kein Spend-all in den Daten — übersprungen)'); return; }
  const cheap = catalog.find((c) => c.type === 'UNIT' && (c.cost ?? 0) <= 2)?.id ?? 'x';
  const g = mkGame();
  g.b.board = [unit(5, { cardId: cheap }), unit(3, { cardId: cheap })];
  g.a.hand = [prog.id]; g.turnNo.a = 20;
  playCards(g, cfg, [0]);
  assert.ok(g.b.board.length >= 1 && g.b.board.every((u) => u.spent), 'verbliebene gegnerische Einheiten gespendet');
});

test('{Play} Gig-Swing senkt Rival-Gigs', () => {
  const prog = catalog.find((c) => !model(c.id).isUnit && model(c.id).onPlay.gig?.rival);
  if (!prog) { console.log('    (kein Gig-Programm — übersprungen)'); return; }
  const dec = model(prog.id).onPlay.gig!.rival!;
  const g = mkGame(); g.b.gigs = 6; g.a.hand = [prog.id]; g.turnNo.a = 20;
  playCards(g, cfg, [0]);
  assert.equal(g.b.gigs, 6 - dec);
});

test('{Attack} Gig-Swing senkt Rival-Gigs zusätzlich zum Klau', () => {
  const atk = catalog.find((c) => model(c.id).onAttack.gig);
  if (!atk) { console.log('    (kein {Attack}-Gig — übersprungen)'); return; }
  const ag = model(atk.id).onAttack.gig!;
  const g = mkGame(); g.a.board = [unit(4, { cardId: atk.id })]; g.b.gigs = 5;
  attackPhase(g, cfg, [g.a.board[0].uid], noBlock);
  assert.equal(g.b.gigs, 5 - ag - 1); // {Attack} senkt, dann unblocked Klau (P4 → 1)
});

test('{Play} Buff erhöht die Power einer eigenen Einheit', () => {
  const prog = catalog.find((c) => { const m = model(c.id); return !m.isUnit && m.onPlay.buff && !m.onPlay.buff.allies; });
  if (!prog) { console.log('    (kein Einzel-Buff — übersprungen)'); return; }
  const amt = model(prog.id).onPlay.buff!.power;
  const g = mkGame(); g.a.board = [unit(4)]; g.a.hand = [prog.id]; g.turnNo.a = 20;
  playCards(g, cfg, [0]);
  assert.equal(g.a.board[0].power, 4 + amt);
});

test('Auskarten beendet das Spiel für den Ziehenden', () => {
  const tiny = { name: 'Tiny', cardIds: H.cardIds.slice(0, 7) };
  const r = playGame2(createGame2(tiny, H, { ...cfg, gigWin: 999 }, 1), { ...cfg, gigWin: 999 }, heuristic2, heuristic2);
  assert.equal(r.winner, 'b');
  assert.match(r.reason, /deckt aus/);
});

function seatFair(A: { name: string; cardIds: string[] }, B: { name: string; cardIds: string[] }, N: number): number {
  let wa = 0;
  for (let i = 0; i < N; i++) {
    const s = 1 + i * 7919;
    for (const sw of [false, true]) {
      const [d1, d2] = sw ? [B, A] : [A, B];
      const r = playGame2(createGame2(d1, d2, cfg, s), cfg, heuristic2, heuristic2);
      if (sw ? r.winner === 'b' : r.winner === 'a') wa++;
    }
  }
  return (100 * wa) / (N * 2);
}

test('Spiegel ≈ 50 % (keine Seite-Bias, seat-fair)', () => {
  const p = seatFair(H, H, 150);
  assert.ok(Math.abs(p - 50) <= 6, `Spiegel ${p.toFixed(1)}%`);
});

test('Dominanz: gleiche Kosten, mehr Power ⇒ ~100 %', () => {
  const u = catalog.filter((c) => c.type === 'UNIT' && (c.cost ?? 0) === 3 && (c.power ?? 0) > 0).sort((a, b) => (b.power ?? 0) - (a.power ?? 0));
  const strong = { name: 'S', cardIds: Array(40).fill(u[0].id) };
  const weak = { name: 'W', cardIds: Array(40).fill(u[u.length - 1].id) };
  const p = seatFair(strong, weak, 60);
  assert.ok(p >= 90, `stark nur ${p.toFixed(1)}%`);
});

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
if (fail > 0) process.exit(1);
