import { describe, it, expect } from 'vitest';
import type { PlaytestRules } from '../rules/playtest';
import {
  newGame,
  mulligan,
  draw,
  nextTurn,
  moveCard,
  toggleSpent,
  callLegend,
  toggleLegendSpent,
  adjustGigs,
  gigWin,
  type PlayDeck,
  type PlaytestState,
} from './playtest';

const rules: PlaytestRules = {
  version: 'test',
  openingHand: 6,
  drawPerTurn: 1,
  gigPerTurn: 1,
  gigWinThreshold: 7,
  mulligansAllowed: 1,
};

const deck: PlayDeck = {
  name: 'Test',
  legendIds: ['L1', 'L2', 'L3'],
  cards: [
    { cardId: 'a', count: 20 },
    { cardId: 'b', count: 20 },
  ],
};

const total = (s: PlaytestState) => s.deck.length + s.hand.length + s.play.length + s.trash.length;

describe('newGame', () => {
  it('zieht die Starthand und legt den Rest ins Deck', () => {
    const s = newGame(deck, rules, 42);
    expect(s.hand).toHaveLength(6);
    expect(s.deck).toHaveLength(40 - 6);
    expect(total(s)).toBe(40);
    expect(s.turn).toBe(1);
  });

  it('legt genau die Legends verdeckt an', () => {
    const s = newGame(deck, rules, 1);
    expect(s.legends.map((l) => l.cardId)).toEqual(['L1', 'L2', 'L3']);
    expect(s.legends.every((l) => !l.revealed && !l.spent)).toBe(true);
  });

  it('mischt deterministisch (gleicher Seed = gleiche Hand)', () => {
    const a = newGame(deck, rules, 7);
    const b = newGame(deck, rules, 7);
    const c = newGame(deck, rules, 8);
    expect(a.hand.map((x) => x.uid)).toEqual(b.hand.map((x) => x.uid));
    expect(a.hand.map((x) => x.uid)).not.toEqual(c.hand.map((x) => x.uid));
  });

  it('vergibt eindeutige uids', () => {
    const s = newGame(deck, rules, 3);
    const uids = [...s.deck, ...s.hand].map((c) => c.uid);
    expect(new Set(uids).size).toBe(40);
  });
});

describe('draw', () => {
  it('bewegt Karten Deck -> Hand', () => {
    const s = draw(newGame(deck, rules, 1), 2);
    expect(s.hand).toHaveLength(8);
    expect(s.deck).toHaveLength(32);
    expect(total(s)).toBe(40);
  });

  it('zieht nicht über ein leeres Deck hinaus', () => {
    let s = newGame(deck, rules, 1);
    s = draw(s, 999);
    expect(s.deck).toHaveLength(0);
    expect(s.hand).toHaveLength(40);
    expect(draw(s, 1).hand).toHaveLength(40); // no-op
  });
});

describe('mulligan', () => {
  it('erhält alle Karten und zieht neu', () => {
    const s0 = newGame(deck, rules, 5);
    const s1 = mulligan(s0, rules);
    expect(s1.hand).toHaveLength(6);
    expect(s1.deck).toHaveLength(34);
    expect(s1.mulligans).toBe(1);
    // Deck+Hand-Instanzen bleiben insgesamt dieselben 40.
    const before = new Set([...s0.deck, ...s0.hand].map((c) => c.uid));
    const after = new Set([...s1.deck, ...s1.hand].map((c) => c.uid));
    expect(after).toEqual(before);
  });
});

describe('nextTurn', () => {
  it('stellt bereit, zieht und erhöht Zug + Gigs', () => {
    let s = newGame(deck, rules, 2);
    // etwas spenden, um das Bereitstellen zu prüfen
    s = moveCard(s, s.hand[0].uid, 'play');
    s = toggleSpent(s, s.play[0].uid);
    s = callLegend(s, 0);
    s = toggleLegendSpent(s, 0);
    expect(s.play[0].spent).toBe(true);
    expect(s.legends[0].spent).toBe(true);

    const t = nextTurn(s, rules);
    expect(t.turn).toBe(2);
    expect(t.play[0].spent).toBe(false); // wieder bereit
    expect(t.legends[0].spent).toBe(false);
    expect(t.legends[0].revealed).toBe(true); // Aufdecken bleibt
    expect(t.gigs).toBe(1);
    expect(t.hand.length).toBe(s.hand.length + 1); // 1 gezogen
  });
});

describe('moveCard', () => {
  it('Hand -> Feld und zurück, Feldverlassen setzt spent zurück', () => {
    let s = newGame(deck, rules, 9);
    const uid = s.hand[0].uid;
    s = moveCard(s, uid, 'play');
    expect(s.play.map((c) => c.uid)).toContain(uid);
    expect(s.hand.map((c) => c.uid)).not.toContain(uid);

    s = toggleSpent(s, uid);
    expect(s.play[0].spent).toBe(true);
    s = moveCard(s, uid, 'trash');
    expect(s.trash[0].uid).toBe(uid);
    expect(s.trash[0].spent).toBe(false); // beim Verlassen zurückgesetzt
    expect(total(s)).toBe(40);
  });

  it('kann auf die Deckoberseite legen', () => {
    let s = newGame(deck, rules, 9);
    const uid = s.hand[0].uid;
    s = moveCard(s, uid, 'deck', true);
    expect(s.deck[0].uid).toBe(uid);
  });

  it('unbekannte uid ist ein No-op', () => {
    const s = newGame(deck, rules, 9);
    expect(moveCard(s, 'nope', 'trash')).toBe(s);
  });
});

describe('Gigs & Sieg', () => {
  it('adjustGigs bleibt >= 0 und gigWin greift an der Schwelle', () => {
    let s = newGame(deck, rules, 1);
    s = adjustGigs(s, -5);
    expect(s.gigs).toBe(0);
    s = adjustGigs(s, 7);
    expect(gigWin(s, rules)).toBe(true);
    expect(gigWin(adjustGigs(s, -1), rules)).toBe(false);
  });
});
