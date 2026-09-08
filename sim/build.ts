import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, cardIndex } from '../app/src/data/catalog';
import { computeRamCaps, validate } from '../app/src/rules/validate';
import { rulesetV1Loaded } from '../app/src/rules/ruleset';
import type { Card, Color } from '../app/src/domain/types';
import { createGame, playGame, type SimConfig, type SimDeck } from './engine';
import { heuristic } from './policies';
import { createGame2, playGame2, DEFAULT2 } from './engine2';
import { heuristic2 } from './policies2';
import { synPair, makeConfig, loadDecks } from './data';
import { model, type CardModel } from './model';

/**
 * Baut aus allen legalen Legend-Triples synergie-/kurvenoptimierte Decks und lässt
 * die aussichtsreichsten im Rundenturnier (seat-fair) gegeneinander + gegen die
 * Starter spielen. Ausgabe: die 3 stärksten. „Stärkste" = beste Siegquote in der
 * (groben) Sim, aufgebaut auf unserer Synergie-Vorhersage + RAM-Legalität.
 *
 * ACHTUNG Ehrlichkeit: die Sim ist ein grober Proxy — das Ergebnis ist ein
 * Richtungssignal, keine Turnier-Wahrheit.
 */

const HERE = dirname(fileURLToPath(import.meta.url));

// --- Synergie memoisiert -------------------------------------------------
const synMemo = new Map<string, number>();
function syn(a: string, b: string): number {
  const k = a < b ? `${a}|${b}` : `${b}|${a}`;
  let v = synMemo.get(k);
  if (v === undefined) { v = synPair(a, b) + synPair(b, a); synMemo.set(k, v); }
  return v;
}
const base = (c: Card) => ((c.power ?? 0) > 0 ? (c.power as number) : 2);
const cost = (c: Card) => c.cost ?? 0;

// --- Legends & Triples ---------------------------------------------------
const legends = catalog.filter((c) => c.type === 'LEGEND');
const nonLegends = catalog.filter((c) => c.type !== 'LEGEND');
console.log(`${legends.length} Legends, ${nonLegends.length} Nicht-Legend-Karten.`);

function* triples(): Generator<Card[]> {
  for (let i = 0; i < legends.length; i++)
    for (let j = i + 1; j < legends.length; j++)
      for (let k = j + 1; k < legends.length; k++) {
        const t = [legends[i], legends[j], legends[k]];
        const names = new Set(t.map((c) => c.name));
        if (names.size === 3) yield t; // unterschiedliche Namen (§1)
      }
}

function eligiblePool(caps: Record<Color, number>): Card[] {
  return nonLegends.filter((c) => (c.ram ?? 0) <= (caps[c.color] ?? 0));
}

function synToLegends(cardId: string, legendIds: string[]): number {
  let s = 0;
  for (const l of legendIds) s += syn(cardId, l);
  return s;
}

// --- Deckbau (greedy: Power − Kosten + Synergie) -------------------------
interface BuiltDeck {
  name: string;
  legendIds: string[];
  cards: Map<string, number>;
}

/** Optionaler Themen-Bonus (für „unique" Decks: Mechanik-Fokus statt reiner Power). */
type ThemeBonus = (m: CardModel) => number;

function buildDeck(t: Card[], name: string, themeBonus?: ThemeBonus): BuiltDeck | null {
  const caps = computeRamCaps(t, rulesetV1Loaded);
  const pool = eligiblePool(caps);
  if (pool.length < 15) return null; // zu wenig freigeschaltet
  const legendIds = t.map((c) => c.id);
  const count = new Map<string, number>();
  const distinct: string[] = [];
  let total = 0;
  while (total < 40) {
    let best: Card | null = null;
    let bestVal = -Infinity;
    for (const c of pool) {
      if ((count.get(c.id) ?? 0) >= 3) continue;
      let synChosen = 0;
      for (const d of distinct) synChosen += syn(c.id, d);
      const theme = themeBonus ? 1.7 * themeBonus(model(c.id)) : 0;
      const val = 2 * base(c) - 1.4 * cost(c) + 1.0 * synChosen + 0.7 * synToLegends(c.id, legendIds) + theme;
      if (val > bestVal) { bestVal = val; best = c; }
    }
    if (!best) break;
    const n = (count.get(best.id) ?? 0) + 1;
    count.set(best.id, n);
    if (n === 1) distinct.push(best.id);
    total += 1;
  }
  if (total < 40) return null;
  return { name, legendIds, cards: count };
}

// --- Themen für „unique" Decks (Mechanik-Archetypen aus dem Effekt-Modell) ----
interface Theme { key: string; label: string; bonus: ThemeBonus; }
const THEMES: Theme[] = [
  { key: 'control', label: 'Control / Removal', bonus: (m) => (m.onPlay.defeat ? 3 : 0) + (m.onPlay.spendRival ? 2.5 : 0) + (m.blocker ? 1.5 : 0) + ((m.onPlay.draw ?? 0) > 0 ? 1 : 0) },
  { key: 'wide', label: 'Go-Wide / Adrenaline', bonus: (m) => (m.adrenaline ? 2.5 : 0) + (m.onPlay.buff?.allies ? 2.5 : 0) + (m.isUnit && m.cost <= 3 && m.power > 0 ? 1.2 : 0) },
  { key: 'gig', label: 'Gig-Swing / Tempo', bonus: (m) => (m.onAttack.gig ? 3 : 0) + (m.onPlay.gig ? 2.5 : 0) + (m.isUnit && m.cost <= 4 && m.power > 0 ? 0.8 : 0) },
];
/** Wie gut passt ein Triple zu einem Thema (Summe der besten Themen-Boni im Pool). */
function themeFit(t: Card[], bonus: ThemeBonus): number {
  const caps = computeRamCaps(t, rulesetV1Loaded);
  return eligiblePool(caps).map((c) => bonus(model(c.id))).sort((a, b) => b - a).slice(0, 15).reduce((s, x) => s + x, 0);
}
/** Archetyp-Label eines fertigen Decks: dominantes Thema oder „Beatdown". */
function archetypeLabel(d: BuiltDeck): string {
  const scored = THEMES.map((th) => ({ th, s: [...d.cards].reduce((sum, [id, n]) => sum + n * th.bonus(model(id)), 0) })).sort((a, b) => b.s - a.s);
  return scored[0].s >= 10 ? scored[0].th.label : 'Beatdown (Power/Kurve)';
}

function toSimDeck(d: BuiltDeck): SimDeck {
  const cardIds: string[] = [];
  for (const [id, n] of d.cards) for (let i = 0; i < n; i++) cardIds.push(id);
  return { name: d.name, cardIds };
}

/** Karten-Überschneidung zweier Decks (0–1, geteilte Kopien / 40). */
function overlap(a: BuiltDeck, b: BuiltDeck): number {
  let shared = 0;
  for (const [id, n] of a.cards) shared += Math.min(n, b.cards.get(id) ?? 0);
  return shared / 40;
}

// --- Kandidaten: Triples billig vorranken, Top-N voll bauen -------------
function tripleCeiling(t: Card[]): number {
  const caps = computeRamCaps(t, rulesetV1Loaded);
  const pool = eligiblePool(caps);
  const legendIds = t.map((c) => c.id);
  const scored = pool
    .map((c) => 2 * base(c) - 1.4 * cost(c) + 0.7 * synToLegends(c.id, legendIds))
    .sort((a, b) => b - a);
  // beste 40 „Slots" (bis zu 3 je Karte ⇒ grob Top-Karten mehrfach) — Näherung:
  let s = 0;
  for (let i = 0; i < Math.min(scored.length, 20); i++) s += scored[i] * 2; // ~2 Kopien
  return s;
}

console.log('ranke Triples …');
const ranked = [...triples()]
  .map((t) => ({ t, c: tripleCeiling(t), colors: [...new Set(t.map((x) => x.color))].sort() }))
  .sort((a, b) => b.c - a.c);
console.log(`${ranked.length} legale Triples.`);

// Kandidaten-Triples: Top-Ceiling (meist dreifarbige Power-Piles) + je bestes
// mono- und zweifarbiges Triple → Archetyp-Vielfalt fürs Turnier.
const chosenTriples: Card[][] = ranked.slice(0, 14).map((x) => x.t);
const bestByKey = new Map<string, Card[]>();
for (const x of ranked) {
  if (x.colors.length === 3) continue;
  const key = x.colors.length === 1 ? `mono-${x.colors[0]}` : `pair-${x.colors.join('/')}`;
  if (!bestByKey.has(key)) bestByKey.set(key, x.t); // ranked ist absteigend → erstes = bestes
}
for (const t of bestByKey.values()) chosenTriples.push(t);
console.log(`Baue ${chosenTriples.length} Kandidaten (Top-Ceiling + mono/2-farbig) …`);

const built: BuiltDeck[] = [];
const seen = new Set<string>();
for (const t of chosenTriples) {
  const d = buildDeck(t, `Deck-${built.length + 1}`);
  if (!d) continue;
  const sig = [...d.cards.entries()].map(([id, n]) => `${id}:${n}`).sort().join(',');
  if (seen.has(sig)) continue; // identische Kartenmenge überspringen
  seen.add(sig);
  const vd = { legendIds: d.legendIds, cards: [...d.cards].map(([cardId, c]) => ({ cardId, count: c })) };
  if (!validate(vd, rulesetV1Loaded, cardIndex).ok) continue; // Legalität hart prüfen
  built.push(d);
}
console.log(`${built.length} legale Kandidaten gebaut.`);

// --- Rundenturnier -------------------------------------------------------
const cfg: SimConfig = makeConfig();
const MODEL = process.argv.includes('v2') ? 'v2' : 'v1';
// Spielfunktion je Modell: v1 = Power-Proxy, v2 = Kampf/Keywords/Interaktion.
const playWinner =
  MODEL === 'v2'
    ? (A: SimDeck, B: SimDeck, seed: number) => playGame2(createGame2(A, B, DEFAULT2, seed), DEFAULT2, heuristic2, heuristic2).winner
    : (A: SimDeck, B: SimDeck, seed: number) => playGame(createGame(A, B, cfg, seed), cfg, { a: heuristic, b: heuristic }).winner;
const candidates = built.map(toSimDeck);
const starters = loadDecks(); // 2 Starter als Gegner/Benchmark
const field: SimDeck[] = [...candidates, ...starters];

function winRate(deck: SimDeck, oppField: SimDeck[], N = 50): number {
  let wins = 0, total = 0;
  for (const opp of oppField) {
    if (opp === deck) continue;
    for (let i = 0; i < N; i++) {
      const seed = 1 + i * 7919;
      for (const swap of [false, true]) {
        const [d1, d2] = swap ? [opp, deck] : [deck, opp];
        const w = playWinner(d1, d2, seed);
        if ((swap ? w === 'b' : w === 'a')) wins++;
        total++;
      }
    }
  }
  return (100 * wins) / total;
}

console.log(`spiele Rundenturnier (Modell ${MODEL}) …`);
const results = built
  .map((d, i) => ({ d, sim: candidates[i], wr: winRate(candidates[i], field), wrS: winRate(candidates[i], starters) }))
  .sort((a, b) => b.wr - a.wr);

// Starter-Referenz
const starterWr = starters.map((s) => ({ name: s.name, wr: winRate(s, field) }));

// Volle Bestenliste (Transparenz): Farb-Identität + beide Messgrößen.
console.log('\n--- Bestenliste (alle Kandidaten) ---');
console.log('  #  Feld%  vsStarter%  Farben        Legends');
results.forEach((r, i) => {
  const legs = r.d.legendIds.map((id) => cardIndex.get(id)!);
  const colors = [...new Set(legs.map((l) => l.color))].sort().join('/');
  console.log(
    `  ${String(i + 1).padStart(2)}  ${r.wr.toFixed(1).padStart(5)}  ${r.wrS.toFixed(1).padStart(9)}   ${colors.padEnd(12)}  ${legs.map((l) => l.name).join(', ')}`,
  );
});

// --- Ausgabe -------------------------------------------------------------
const colorOrder: Record<Color, number> = { RED: 0, GREEN: 1, BLUE: 2, YELLOW: 3 };
function describe(d: BuiltDeck): string[] {
  const lines: string[] = [];
  const legs = d.legendIds.map((id) => cardIndex.get(id)!);
  const colors = new Set(legs.map((l) => l.color));
  lines.push(`Legends: ${legs.map((l) => `${l.name}${l.subtitle ? ` (${l.subtitle})` : ''} [${l.color} RAM ${l.ram ?? 0}]`).join(' · ')}`);
  lines.push(`Farben: ${[...colors].join('/')}`);
  const entries = [...d.cards.entries()]
    .map(([id, n]) => ({ c: cardIndex.get(id)!, n }))
    .sort((a, b) => colorOrder[a.c.color] - colorOrder[b.c.color] || (a.c.cost ?? 0) - (b.c.cost ?? 0) || a.c.name.localeCompare(b.c.name));
  const total = entries.reduce((s, e) => s + e.n, 0);
  lines.push(`Deck (${total}):`);
  for (const e of entries) lines.push(`  ${e.n}× ${e.c.name}${e.c.subtitle ? ` (${e.c.subtitle})` : ''}  [${e.c.color} · Cost ${e.c.cost ?? 0} · Power ${e.c.power ?? 0}${e.c.ram != null ? ` · RAM ${e.c.ram}` : ''}]`);
  return lines;
}

function toDeckText(d: BuiltDeck): string {
  const dn = (c: Card) => (c.subtitle ? `${c.name}: ${c.subtitle}` : c.name);
  const lines = [`// engram deck: ${d.name}`, '// Legends'];
  for (const id of d.legendIds) lines.push(`1 ${dn(cardIndex.get(id)!)}`);
  lines.push('// Deck');
  for (const [id, n] of d.cards) lines.push(`${n} ${dn(cardIndex.get(id)!)}`);
  return lines.join('\n') + '\n';
}

console.log('\n===== ERGEBNIS =====');
console.log('Starter-Referenz (Siegquote im Feld):');
for (const s of starterWr) console.log(`  ${s.name}: ${s.wr.toFixed(1)}%`);
console.log('');

// Diverse Top-3: bestes Deck, dann die besten mit < 55 % Überschneidung zu den
// bereits Gewählten → 3 echte Alternativen statt drei Varianten desselben Piles.
const top3: typeof results = [];
for (const r of results) {
  if (top3.every((p) => overlap(r.d, p.d) < 0.55)) top3.push(r);
  if (top3.length === 3) break;
}
for (const r of results) { // auffüllen, falls Vielfalt < 3 Decks hergibt
  if (top3.length === 3) break;
  if (!top3.includes(r)) top3.push(r);
}

// --- 2 „unique" Decks: bewusst anders als die Top-3 (Farbe/Struktur/Mechanik),
//     aber noch spielbar. Distinktheit × Viabilität statt starrer Ausschlüsse. ---
interface UniqueCand { d: BuiltDeck; wr: number; label: string; }
const deckColors = (d: BuiltDeck) => new Set(d.legendIds.map((id) => cardIndex.get(id)!.color));
const top3Labels = new Set(top3.map((r) => archetypeLabel(r.d)));
const top3Colors = new Set(top3.flatMap((r) => [...deckColors(r.d)]));
const uniqueCands: UniqueCand[] = [];
// (a) je Thema das best passende Triple themen-gebaut + gegen das Feld gemessen
for (const th of THEMES) {
  let bestT: Card[] | null = null, bestFit = -Infinity;
  for (const x of ranked) { const f = themeFit(x.t, th.bonus); if (f > bestFit) { bestFit = f; bestT = x.t; } }
  if (!bestT) continue;
  const d = buildDeck(bestT, `Unique-${th.key}`, th.bonus);
  if (!d) continue;
  const vd = { legendIds: d.legendIds, cards: [...d.cards].map(([cardId, c]) => ({ cardId, count: c })) };
  if (!validate(vd, rulesetV1Loaded, cardIndex).ok) continue;
  uniqueCands.push({ d, wr: winRate(toSimDeck(d), field), label: th.label });
}
// (b) auch natürlich abweichende Turnier-Decks (nicht in Top-3) — oft die stärkeren Uniques
for (const r of results) if (!top3.includes(r)) uniqueCands.push({ d: r.d, wr: r.wr, label: archetypeLabel(r.d) });

/** Wie „unique" ist der Kandidat? Farb-/Struktur-/Label-Neuheit + Restsiegquote. */
function uniqScore(c: UniqueCand): number {
  const maxOv = Math.max(0, ...top3.map((p) => overlap(c.d, p.d)));
  const novelColors = [...deckColors(c.d)].filter((x) => !top3Colors.has(x)).length;
  const labelNovel = top3Labels.has(c.label) ? 0 : 1;
  return c.wr + (1 - maxOv) * 45 + novelColors * 14 + labelNovel * 8;
}
const VIABLE = 40; // Mindest-Feld-Siegquote — „unique" soll nicht „schlecht" heißen
const unique: UniqueCand[] = [];
function pick(minWr: number) {
  for (const cand of uniqueCands.filter((c) => c.wr >= minWr).sort((a, b) => uniqScore(b) - uniqScore(a))) {
    if (unique.length === 2) break;
    if (unique.some((u) => u.d === cand.d)) continue;
    if (unique.every((u) => overlap(cand.d, u.d) < 0.5)) unique.push(cand); // untereinander verschieden
  }
}
pick(VIABLE);
if (unique.length < 2) pick(0); // Notfalls Viabilitäts-Floor fallenlassen

const outDir = join(HERE, 'decks');
mkdirSync(outDir, { recursive: true });
const suffix = MODEL === 'v2' ? '-v2' : '';
top3.forEach((r, i) => {
  const label = ['A', 'B', 'C'][i];
  r.d.name = `Top ${label}${MODEL === 'v2' ? ' (v2)' : ''}`;
  console.log(`\n########## Top ${label} — Siegquote ${r.wr.toFixed(1)}% (Modell ${MODEL}) ##########`);
  for (const line of describe(r.d)) console.log(line);
  // Slug-JSON für die Sim + .txt für den App-Import (beide gitignored)
  const slugJson = { name: r.d.name, legends: r.d.legendIds, cards: Object.fromEntries(r.d.cards) };
  const base = `top-${label.toLowerCase()}${suffix}`;
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify(slugJson, null, 2));
  writeFileSync(join(outDir, `${base}.txt`), toDeckText(r.d));
});

// „unique" Decks: eigene Identität, ausgewiesen mit Label + Abstand zu Top-A.
unique.forEach((u, i) => {
  const n = i + 1;
  u.d.name = `Unique ${n} — ${u.label}${MODEL === 'v2' ? ' (v2)' : ''}`;
  const ovTopA = top3[0] ? Math.round(100 * overlap(u.d, top3[0].d)) : 0;
  console.log(`\n########## Unique ${n} — ${u.label} — Siegquote ${u.wr.toFixed(1)}% (Modell ${MODEL}) ##########`);
  console.log(`(Identität: ${u.label} · nur ${ovTopA}% Kartenüberschneidung mit Top A)`);
  for (const line of describe(u.d)) console.log(line);
  const slugJson = { name: u.d.name, legends: u.d.legendIds, cards: Object.fromEntries(u.d.cards) };
  const base = `unique-${n}${suffix}`;
  writeFileSync(join(outDir, `${base}.json`), JSON.stringify(slugJson, null, 2));
  writeFileSync(join(outDir, `${base}.txt`), toDeckText(u.d));
});

console.log(`\nDecklisten geschrieben nach sim/decks/ (top-a/b/c${suffix} + unique-1/2${suffix} .json + .txt).`);
