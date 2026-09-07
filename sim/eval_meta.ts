import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createGame2, playGame2, DEFAULT2, type Sim2Params } from './engine2';
import { heuristic2 } from './policies2';
import { loadDecks, findDeck } from './data';
import { loadMetaDecks, META_DIR } from './pull_meta';
import { model } from './model';
import type { SimDeck } from './engine';

/**
 * eval_meta — belastbarer Test der eigenen Decks gegen die gezogenen Online-Meta-
 * Decks (sim/meta-decks/). Fährt eine große Matrix (v2-Kampfmodell) mit
 * Konfidenzintervallen, nimmt die offiziellen Starter als KONTROLLE mit, rankt die
 * Meta-Decks intern (meta-vs-meta) und misst, wie viel jedes Deck für die Engine
 * überhaupt „lesbar" ist (Körper/Effekt vs. blinde Effekt-/Gear-/Control-Karten).
 * Schreibt sim/meta-decks/REPORT.md; die Konsole bekommt nur eine Kurzfassung.
 *
 * Ehrlichkeit (§ 12): die Sim ist ein grobes Modell. Effektlastige Meta-Decks
 * werden systematisch unterschätzt — deshalb die Kontrolle + die Lesbarkeits-Spalte.
 *
 *   npx tsx eval_meta.ts                 # Standard (matrix 400 Spiele, rr 200)
 *   npx tsx eval_meta.ts --games 800 --rr 400
 */

function argNum(flag: string, def: number): number {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? Number(process.argv[i + 1]) : def;
}
const MATRIX_GAMES = argNum('--games', 400);
const RR_GAMES = argNum('--rr', 200);
const cfg: Sim2Params = { ...DEFAULT2 };

const win = (A: SimDeck, B: SimDeck, seed: number) => playGame2(createGame2(A, B, cfg, seed), cfg, heuristic2, heuristic2).winner;

interface MU { p: number; ci: number; total: number; }
/** Seat-fair: jede Paarung in beiden Sitzpositionen; 95%-CI (Normalapprox.). */
function matchup(A: SimDeck, B: SimDeck, games: number, seed0 = 1): MU {
  let wa = 0, total = 0;
  for (let i = 0; i < games; i++) {
    const seed = seed0 + i * 7919;
    for (const swap of [false, true]) {
      const [d1, d2] = swap ? [B, A] : [A, B];
      const w = win(d1, d2, seed);
      if (swap ? w === 'b' : w === 'a') wa++;
      total++;
    }
  }
  const p = wa / total;
  return { p: 100 * p, ci: 100 * 1.96 * Math.sqrt((p * (1 - p)) / total), total };
}

// --- Engine-Lesbarkeit: Anteil Karten, die die Engine wirklich nutzt ----------
interface Comp { total: number; bodies: number; legible: number; blind: number; }
function composition(deck: SimDeck): Comp {
  let total = 0, bodies = 0, legible = 0;
  for (const id of deck.cardIds) {
    const m = model(id);
    total++;
    const body = m.isUnit && m.power > 0;
    const effect = !!m.onPlay.defeat || (m.onPlay.draw ?? 0) > 0 || m.eddieSource || m.blocker || m.adrenaline;
    if (body) bodies++;
    if (body || effect) legible++;
  }
  return { total, bodies, legible, blind: total - legible };
}
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

// --- Decks laden -------------------------------------------------------------
const all = loadDecks();
const meta = loadMetaDecks();
if (meta.length === 0) { console.error('Keine Meta-Decks in sim/meta-decks/. Erst `npm run pull-meta`.'); process.exit(1); }

const testNames = ['Top A (v2)', 'Top B (v2)', 'Top C (v2)', 'The Heist', 'Embracing Power'];
const tests = testNames.map((n) => findDeck(all, n)).filter((d): d is SimDeck => !!d);
const controls = new Set(['The Heist', 'Embracing Power']);

console.log(`Meta-Decks: ${meta.length} · Testdecks: ${tests.map((d) => d.name).join(', ')}`);
console.log(`Matrix: ${MATRIX_GAMES}×2 Spiele/Paarung, Meta-Rundenturnier: ${RR_GAMES}×2 · Modell v2\n`);

// --- 1) Matrix Testdecks × Meta ---------------------------------------------
const matrix = tests.map((t) => ({ deck: t, cells: meta.map((m) => ({ m, mu: matchup(t, m, MATRIX_GAMES) })) }));
const avgVsMeta = (row: typeof matrix[number]) => row.cells.reduce((s, c) => s + c.mu.p, 0) / row.cells.length;

// --- 2) Meta-vs-Meta Rundenturnier (interne Rangliste im Modell) -------------
const metaField = meta.map((m) => {
  let sum = 0, k = 0;
  for (const o of meta) { if (o === m) continue; sum += matchup(m, o, RR_GAMES).p; k++; }
  return { m, field: sum / k };
}).sort((a, b) => b.field - a.field);

// --- 3) Lesbarkeit ------------------------------------------------------------
const comps = [...tests, ...meta].map((d) => ({ d, c: composition(d) }));

// --- Report schreiben --------------------------------------------------------
const fmt = (mu: MU) => `${mu.p.toFixed(1)} ±${mu.ci.toFixed(1)}`;
const L: string[] = [];
L.push('# Meta-Test — engram Decks vs. Online-Meta (Kampfmodell v2)');
L.push('');
L.push(`Erzeugt: ${new Date().toISOString()} · Quelle Meta: cyberpunkmeta.org (gitignored) · Modell: v2`);
L.push(`Stichprobe: Matrix ${MATRIX_GAMES}×2 Spiele/Paarung (95%-CI), Meta-Rundenturnier ${RR_GAMES}×2.`);
L.push('');
L.push('> Ehrlichkeitshinweis: Die Sim ist ein grobes Modell. Effektlastige Decks (Control/Gear/Combo)');
L.push('> werden unterschätzt — siehe Kontrolle (Starter) und die Spalte „blind%". Die Zahlen sind ein');
L.push('> Modell-Signal, KEIN reales Meta-Ranking.');
L.push('');

L.push('## 1) Siegquote der Testdecks vs. jedes Meta-Deck (%, ±95%-CI)');
L.push('');
L.push(`| Testdeck | ${meta.map((m) => m.name.replace('Deck: ', '')).join(' | ')} | **Ø vs Meta** |`);
L.push(`|---|${meta.map(() => '---').join('|')}|---|`);
for (const row of matrix) {
  const tag = controls.has(row.deck.name) ? ' _(Kontrolle)_' : '';
  L.push(`| ${row.deck.name}${tag} | ${row.cells.map((c) => fmt(c.mu)).join(' | ')} | **${avgVsMeta(row).toFixed(1)}** |`);
}
L.push('');

L.push('## 2) Meta-intern (meta-vs-meta Feld-%, welches Meta-Deck das Modell am höchsten rankt)');
L.push('');
L.push('| # | Meta-Deck | Feld-% | Legends |');
L.push('|---|---|---|---|');
metaField.forEach((r, i) => L.push(`| ${i + 1} | ${r.m.name} | ${r.field.toFixed(1)} | ${r.m.cardIds.length} Karten |`));
L.push('');

L.push('## 3) Engine-Lesbarkeit (wie viel jedes Deck die Engine wirklich nutzt)');
L.push('');
L.push('„Körper" = Einheit mit Power>0. „Lesbar" = Körper ODER modellierter Effekt (Removal/Draw/Eddie/Blocker/Adrenaline).');
L.push('„blind%" = Karten, die die Engine als Nichts behandelt (Gear/Programme/Control ohne modellierten Effekt).');
L.push('');
L.push('| Deck | Karten | Körper | lesbar% | blind% |');
L.push('|---|---|---|---|---|');
for (const { d, c } of comps) {
  const tag = controls.has(d.name) ? ' _(Kontrolle)_' : (tests.includes(d) ? '' : ' _(Meta)_');
  L.push(`| ${d.name}${tag} | ${c.total} | ${c.bodies} | ${pct(c.legible, c.total)}% | **${pct(c.blind, c.total)}%** |`);
}
L.push('');

const starterAvg = matrix.filter((r) => controls.has(r.deck.name)).map((r) => avgVsMeta(r));
const mineAvg = matrix.filter((r) => !controls.has(r.deck.name)).map((r) => avgVsMeta(r));
const mean = (a: number[]) => a.reduce((s, x) => s + x, 0) / (a.length || 1);
L.push('## 4) Lesart');
L.push('');
L.push(`- Eigene Decks Ø vs Meta: **${mean(mineAvg).toFixed(1)}%** · Starter (Kontrolle) Ø vs Meta: **${mean(starterAvg).toFixed(1)}%**.`);
L.push('- Liegen beide ähnlich hoch, misst der Test v. a. den **Modell-Bias** (Power/Kurve schlägt Effekt), nicht die Deckstärke.');
L.push('- Je höher „blind%" eines Meta-Decks, desto stärker unterschätzt die Engine es.');
L.push('- Belastbar ist damit die **Funktion** der Kette (ziehen→parsen→validieren→spielen), nicht das Zahlurteil.');
L.push('');

const reportPath = join(META_DIR, 'REPORT.md');
writeFileSync(reportPath, L.join('\n') + '\n', 'utf-8');

// --- Konsolen-Kurzfassung ----------------------------------------------------
console.log('Ø Siegquote vs Meta:');
for (const row of matrix) console.log(`  ${row.deck.name.padEnd(18)} ${avgVsMeta(row).toFixed(1)}%${controls.has(row.deck.name) ? '  (Kontrolle)' : ''}`);
console.log(`\nBestes Meta-Deck im Modell: ${metaField[0].m.name} (${metaField[0].field.toFixed(1)}% Feld)`);
console.log(`Eigene Ø ${mean(mineAvg).toFixed(1)}%  vs  Starter-Kontrolle Ø ${mean(starterAvg).toFixed(1)}%`);
console.log(`\nReport: ${reportPath}`);
