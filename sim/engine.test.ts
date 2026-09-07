import assert from 'node:assert/strict';
import {
  DEFAULT_PARAMS,
  eddiesFor,
  createGame,
  playGame,
  contribution,
  beginTurn,
  attack,
  view,
  type SimConfig,
  type SimCardStat,
  type SimDeck,
} from './engine';
import { heuristic } from './policies';

/** Kleiner Test-Runner ohne Vitest (die Engine liegt außerhalb von app/). */
let pass = 0;
let fail = 0;
function test(name: string, fn: () => void) {
  try {
    fn();
    pass++;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    fail++;
    console.error(`  ✗ ${name}\n    ${(e as Error).message}`);
  }
}

const STATS: Record<string, SimCardStat> = {
  u6: { id: 'u6', name: 'U6', type: 'UNIT', cost: 3, power: 6 },
  u2: { id: 'u2', name: 'U2', type: 'UNIT', cost: 1, power: 2 },
  g0: { id: 'g0', name: 'G0', type: 'GEAR', cost: 2, power: 0 },
};
function cfg(over: Partial<SimConfig> = {}): SimConfig {
  return {
    ...DEFAULT_PARAMS,
    syn: () => 0,
    stat: (id) => STATS[id] ?? { id, name: id, type: 'UNIT', cost: 2, power: 2 },
    ...over,
  };
}
function deck(name: string, ids: string[]): SimDeck {
  return { name, cardIds: ids };
}
const deck40 = (name: string) =>
  deck(name, Array.from({ length: 40 }, (_, i) => (i % 2 ? 'u2' : 'u6')));

console.log('engine.test.ts');

test('eddiesFor rampt korrekt', () => {
  const c = cfg();
  assert.equal(eddiesFor(1, c), 3);
  assert.equal(eddiesFor(2, c), 3);
  assert.equal(eddiesFor(3, c), 4);
  assert.equal(eddiesFor(5, c), 5);
});

test('createGame zieht Starthand, Rest ins Deck', () => {
  const c = cfg();
  const g = createGame(deck40('A'), deck40('B'), c, 1);
  assert.equal(g.a.hand.length, c.openingHand);
  assert.equal(g.a.deck.length, 40 - c.openingHand);
  assert.equal(g.b.hand.length, c.openingHand);
});

test('contribution addiert den Synergie-Bonus', () => {
  const withSyn = cfg({ syn: (a, b) => (a === 'u6' && b === 'u2' ? 1 : 0), synergyBonus: 3 });
  assert.equal(contribution('u2', [], withSyn), 2); // keine Entwicklung, kein Bonus
  // u6 synergiert mit bereits entwickeltem u2 → +3
  assert.equal(contribution('u6', ['u2'], withSyn), 6 + 3);
});

test('Spiel endet deterministisch mit Gewinner (gleicher Seed = gleich)', () => {
  const c = cfg();
  const r1 = playGame(createGame(deck40('A'), deck40('B'), c, 42), c, { a: heuristic, b: heuristic });
  const r2 = playGame(createGame(deck40('A'), deck40('B'), c, 42), c, { a: heuristic, b: heuristic });
  assert.ok(r1.winner === 'a' || r1.winner === 'b', 'es gibt einen Gewinner');
  assert.ok(r1.turns <= c.turnCap);
  assert.equal(r1.winner, r2.winner);
  assert.equal(r1.turns, r2.turns);
});

test('attack klaut Gigs (readyPower gegen Gegner-Feld)', () => {
  const c = cfg();
  const g = createGame(deck40('A'), deck40('B'), c, 1);
  g.a.readyPower = 30;
  g.b.boardPower = 0;
  g.b.gigs = 3;
  attack(g, c); // floor(30/10) = 3, gekappt auf 3
  assert.equal(g.b.gigs, 0);
  assert.equal(g.a.gigs, 3);
});

test('Auskarten (leeres Deck) beendet das Spiel für den Ziehenden', () => {
  const c = cfg({ gigWin: 999 }); // Gig-Sieg ausschalten → nur Auskarten
  const g = createGame(deck('A', ['u2', 'u2', 'u2', 'u2', 'u2', 'u2', 'u2']), deck40('B'), c, 1);
  // A hat 7 Karten: 6 Starthand, 1 im Deck. Ein paar Züge → A deckt aus.
  const r = playGame(g, c, { a: heuristic, b: heuristic });
  assert.equal(r.winner, 'b');
  assert.match(r.reason, /deckt aus/);
});

test('beginTurn: bereitstellen + ziehen + Fixer-Gig', () => {
  const c = cfg();
  const g = createGame(deck40('A'), deck40('B'), c, 5);
  g.a.boardPower = 10;
  g.a.readyPower = 0;
  const handBefore = g.a.hand.length;
  const cont = beginTurn(g, c);
  assert.equal(cont, true);
  assert.equal(g.a.readyPower, 10); // alles bereit
  assert.equal(g.a.gigs, 1); // Fixer
  assert.equal(g.a.hand.length, handBefore + 1); // gezogen
  assert.equal(view(g, c).you, 'a');
});

console.log(`\n${pass} bestanden, ${fail} fehlgeschlagen`);
if (fail > 0) process.exit(1);
