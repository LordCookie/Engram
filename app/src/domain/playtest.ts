import type { PlaytestRules } from '../rules/playtest';

/**
 * Simulationsmodus — reine Zustandsmaschine für ein **manuelles Playtest**
 * (Vorbild ManaBox: echte Zonen, du bewegst Karten selbst; KEINE erzwungene
 * Regel-Engine — das wäre unehrlich und riesig). Framework-frei, immutabel,
 * voll testbar. Die Spielparameter kommen aus `rules/playtest.ts` (JSON).
 *
 * Zonen entsprechen dem echten Spiel: Deck (verdeckt), Hand, Feld (im Spiel,
 * bereit/gespendet), Trash. Legends liegen separat verdeckt und werden per
 * „Call a Legend" aufgedeckt. Gigs/Eddies sind Zähler (würfel-/zahlungsgetrieben,
 * daher manuell mit Auto-+1 Gig je Start-Phase).
 */

export type Zone = 'deck' | 'hand' | 'play' | 'trash';

/** Eine Karteninstanz mit eigener uid, damit mehrere Kopien unterscheidbar sind. */
export interface PlayCard {
  uid: string;
  cardId: string;
  /** Nur relevant auf dem Feld: seitwärts gedreht (gespendet) vs. bereit. */
  spent: boolean;
}

export interface LegendSlot {
  cardId: string;
  /** via „Call a Legend" aufgedeckt. */
  revealed: boolean;
  /** als 1 €$ gespendet (seitwärts). */
  spent: boolean;
}

export interface PlaytestState {
  deckName: string;
  turn: number;
  deck: PlayCard[]; // Index 0 = oberste Karte
  hand: PlayCard[];
  play: PlayCard[];
  trash: PlayCard[];
  legends: LegendSlot[];
  gigs: number;
  eddies: number;
  mulligans: number;
  seed: number;
  log: string[];
}

/** Minimale Deckform fürs Playtest (kompatibel mit Entwürfen/Startern). */
export interface PlayDeck {
  name: string;
  legendIds: readonly string[];
  cards: readonly { cardId: string; count: number }[];
}

/** Deterministischer PRNG (mulberry32) — reproduzierbar für Tests. */
export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const clip = (log: string[], line: string): string[] => [line, ...log].slice(0, 30);

/** Zählt die Deckkarten (ohne Legends) — für „spielbar?"-Checks im UI. */
export function deckCardTotal(deck: PlayDeck): number {
  return deck.cards.reduce((s, c) => s + c.count, 0);
}

/** Frisches Spiel: Deck expandieren, mischen, Starthand ziehen, Legends verdeckt. */
export function newGame(deck: PlayDeck, rules: PlaytestRules, seed: number): PlaytestState {
  let n = 0;
  const all: PlayCard[] = [];
  for (const { cardId, count } of deck.cards) {
    for (let i = 0; i < count; i++) all.push({ uid: `u${n++}`, cardId, spent: false });
  }
  const shuffled = shuffle(all, makeRng(seed));
  const hand = shuffled.slice(0, rules.openingHand);
  return {
    deckName: deck.name,
    turn: 1,
    deck: shuffled.slice(rules.openingHand),
    hand,
    play: [],
    trash: [],
    legends: deck.legendIds.map((cardId) => ({ cardId, revealed: false, spent: false })),
    gigs: 0,
    eddies: 0,
    mulligans: 0,
    seed,
    log: [`Neues Spiel „${deck.name}" — ${hand.length} Karten gezogen.`],
  };
}

/** Mulligan: Hand zurück ins Deck, neu mischen, neue Starthand (deterministisch). */
export function mulligan(s: PlaytestState, rules: PlaytestRules): PlaytestState {
  const pool = [...s.deck, ...s.hand];
  const seed = (s.seed + 0x9e3779b1 * (s.mulligans + 1)) >>> 0;
  const shuffled = shuffle(pool, makeRng(seed));
  return {
    ...s,
    deck: shuffled.slice(rules.openingHand),
    hand: shuffled.slice(0, rules.openingHand),
    mulligans: s.mulligans + 1,
    log: clip(s.log, `Mulligan ${s.mulligans + 1} — neue Hand (${rules.openingHand}).`),
  };
}

/** Karten vom Deck auf die Hand ziehen. */
export function draw(s: PlaytestState, n = 1): PlaytestState {
  const take = Math.max(0, Math.min(n, s.deck.length));
  if (take === 0) return { ...s, log: clip(s.log, 'Deck leer — nichts gezogen.') };
  return {
    ...s,
    deck: s.deck.slice(take),
    hand: [...s.hand, ...s.deck.slice(0, take)],
    log: clip(s.log, `${take} gezogen.`),
  };
}

/** Start-Phase des nächsten Zugs: alles bereitstellen, ziehen, +Gig, Zug hoch. */
export function nextTurn(s: PlaytestState, rules: PlaytestRules): PlaytestState {
  const take = Math.min(rules.drawPerTurn, s.deck.length);
  return {
    ...s,
    turn: s.turn + 1,
    play: s.play.map((c) => ({ ...c, spent: false })),
    legends: s.legends.map((l) => ({ ...l, spent: false })),
    deck: s.deck.slice(take),
    hand: [...s.hand, ...s.deck.slice(0, take)],
    gigs: s.gigs + rules.gigPerTurn,
    log: clip(
      s.log,
      `Zug ${s.turn + 1}: bereitgestellt, ${take} gezogen, +${rules.gigPerTurn} Gig.`,
    ),
  };
}

/** Eine Karteninstanz in eine andere Zone bewegen (Deck: oben oder unten). */
export function moveCard(
  s: PlaytestState,
  uid: string,
  to: Zone,
  toTop = false,
): PlaytestState {
  const zones: Zone[] = ['deck', 'hand', 'play', 'trash'];
  const next: PlaytestState = { ...s };
  let moved: PlayCard | undefined;
  for (const z of zones) {
    const arr = next[z];
    const idx = arr.findIndex((c) => c.uid === uid);
    if (idx >= 0) {
      moved = arr[idx];
      next[z] = [...arr.slice(0, idx), ...arr.slice(idx + 1)];
      break;
    }
  }
  if (!moved) return s;
  // Beim Verlassen des Feldes zurücksetzen (bereit), auf dem Feld Zustand halten.
  const card: PlayCard = { ...moved, spent: to === 'play' ? moved.spent : false };
  const target = next[to];
  next[to] = to === 'deck' && toTop ? [card, ...target] : [...target, card];
  return next;
}

/** Feldkarte bereit/gespendet umschalten. */
export function toggleSpent(s: PlaytestState, uid: string): PlaytestState {
  return { ...s, play: s.play.map((c) => (c.uid === uid ? { ...c, spent: !c.spent } : c)) };
}

/** „Call a Legend": eine verdeckte Legend aufdecken. */
export function callLegend(s: PlaytestState, index: number): PlaytestState {
  if (!s.legends[index] || s.legends[index].revealed) return s;
  const legends = s.legends.map((l, i) => (i === index ? { ...l, revealed: true } : l));
  return { ...s, legends, log: clip(s.log, 'Legend aufgedeckt (Call a Legend).') };
}

/** Legend bereit/gespendet umschalten (als 1 €$ spenden). */
export function toggleLegendSpent(s: PlaytestState, index: number): PlaytestState {
  return {
    ...s,
    legends: s.legends.map((l, i) => (i === index ? { ...l, spent: !l.spent } : l)),
  };
}

export function adjustGigs(s: PlaytestState, delta: number): PlaytestState {
  return { ...s, gigs: Math.max(0, s.gigs + delta) };
}

export function adjustEddies(s: PlaytestState, delta: number): PlaytestState {
  return { ...s, eddies: Math.max(0, s.eddies + delta) };
}

/** Sieg-Bedingung (Zugbeginn mit genug Gigs). Deck-out ist hier KEIN Eigensieg. */
export function gigWin(s: PlaytestState, rules: PlaytestRules): boolean {
  return s.gigs >= rules.gigWinThreshold;
}
