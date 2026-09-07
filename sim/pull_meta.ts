import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardIndex } from '../app/src/data/catalog';
import { validate } from '../app/src/rules/validate';
import { rulesetV1Loaded } from '../app/src/rules/ruleset';
import type { SimDeck } from './engine';

/**
 * pull_meta — zieht öffentliche Meta-Decklisten in einen lokalen, gitignoreten
 * Ordner (`sim/meta-decks/`), damit `eval_meta` belastbar dagegen testen kann,
 * ohne dass die Listen im Chat-Kontext bleiben müssen.
 *
 * Leitplanken (wie `pipeline/fetch_cards.py`):
 *  - Nur Quellen mit robots `Allow: /`. Default cyberpunkmeta.org (geprüft).
 *    exburst.dev nennt `anthropic-ai` in robots → bewusst NICHT als Quelle.
 *  - Höflich: selbst-nennender User-Agent + Delay; HTML wird gecached, damit
 *    Re-Runs die Seite nicht erneut abrufen (`--refresh` erzwingt neu).
 *  - § 8: wir speichern NUR Slugs + Stückzahlen (== `cards.json`-IDs), niemals
 *    Kartentexte oder -bilder. Die gezogenen Daten sind gitignored.
 *
 *   npx tsx pull_meta.ts                 # Discovery über die Listing-Seiten + Pull
 *   npx tsx pull_meta.ts --refresh       # Cache ignorieren, frisch ziehen
 *   npx tsx pull_meta.ts --id <uuid> ... # zusätzliche Deck-IDs
 *   npx tsx pull_meta.ts --limit 20
 */

const HERE = dirname(fileURLToPath(import.meta.url));
export const META_DIR = join(HERE, 'meta-decks');
const CACHE_DIR = join(META_DIR, '.cache');
const UA = 'engram-tcg-tool/0.1 (local hobby project; github LordCookie/Engram)';
const POLITE_DELAY_MS = 1200;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const slugify = (s: string) =>
  s.toLowerCase().replace(/\/\/.*$/, '').trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';

interface Args { source: string; listings: string[]; refresh: boolean; limit: number; ids: string[]; }
function parseArgs(argv: string[]): Args {
  const a: Args = { source: 'https://cyberpunkmeta.org', listings: ['decks', 'meta'], refresh: false, limit: 60, ids: [] };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === '--refresh') a.refresh = true;
    else if (t === '--source') a.source = argv[++i];
    else if (t === '--limit') a.limit = Number(argv[++i]);
    else if (t === '--id') a.ids.push(argv[++i]);
  }
  return a;
}

/** Holt eine URL (mit Datei-Cache). Netzabruf nur bei Cache-Miss/`--refresh`. */
async function getCached(url: string, cacheKey: string, refresh: boolean): Promise<string> {
  mkdirSync(CACHE_DIR, { recursive: true });
  const cachePath = join(CACHE_DIR, cacheKey);
  if (!refresh && existsSync(cachePath)) return readFileSync(cachePath, 'utf-8');
  await sleep(POLITE_DELAY_MS); // höflich bleiben
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} für ${url}`);
  const html = await res.text();
  writeFileSync(cachePath, html, 'utf-8');
  return html;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
async function discover(a: Args): Promise<string[]> {
  const ids = new Set<string>(a.ids);
  for (const path of a.listings) {
    try {
      const html = await getCached(`${a.source}/${path}`, `listing-${path}.html`, a.refresh);
      for (const m of html.matchAll(new RegExp(`/deck/(${UUID.source})`, 'g'))) ids.add(m[1]);
    } catch (e) {
      console.error(`  Listing /${path} fehlgeschlagen: ${(e as Error).message}`);
    }
  }
  return [...ids].slice(0, a.limit);
}

// --- Parsing: Slug + Menge direkt aus dem HTML -------------------------------
const ANCHOR = /href="\/cards\/([^"?#]+)[^"]*"(.*?)(?=href="\/cards\/|<\/main|$)/gs;
const QTY = /×(?:<!--\s*-->)?\s*(\d+)/;
const TITLE = /<title>([^<]*)<\/title>/i;

export interface MetaDeck { id: string; name: string; source: string; legends: string[]; cards: Record<string, number>; total: number; }

function parseDeck(id: string, source: string, html: string): { deck?: MetaDeck; reason?: string } {
  let name = (html.match(TITLE)?.[1] ?? id).replace(/\s*\/\/.*$/, '').trim() || id;
  const legends: string[] = [];
  const cards: Record<string, number> = {};
  for (const m of html.matchAll(ANCHOR)) {
    const slug = m[1];
    const c = cardIndex.get(slug);
    if (!c) continue; // fremdes/neueres Set → im Report als Grund vermerkt
    const qm = m[2].match(QTY);
    const qty = qm ? Number(qm[1]) : 0;
    if (c.type === 'LEGEND') { if (!legends.includes(slug)) legends.push(slug); }
    else if (qty > 0) cards[slug] = (cards[slug] ?? 0) + qty;
  }
  const leg3 = legends.slice(0, 3);
  // Namenlose Decks über ihre Legends sprechend machen (sonst überschreiben sich viele "Untitled").
  if (/^untitled|^deck$/i.test(name) || !name) {
    const ln = leg3.map((s) => cardIndex.get(s)?.name ?? s);
    if (ln.length) name = `Deck: ${ln.join(' · ')}`;
  }
  const total = Object.values(cards).reduce((s, n) => s + n, 0);
  const vd = { legendIds: leg3, cards: Object.entries(cards).map(([cardId, count]) => ({ cardId, count })) };
  const v = validate(vd, rulesetV1Loaded, cardIndex);
  if (!v.ok) return { reason: `illegal (${v.violations.map((e) => e.message).join('; ')})` };
  return { deck: { id, name, source, legends: leg3, cards, total } };
}

/** Alle gezogenen Meta-Decks aus dem Ordner laden (für eval_meta). */
export function loadMetaDecks(): (SimDeck & { id: string })[] {
  if (!existsSync(META_DIR)) return [];
  const out: (SimDeck & { id: string })[] = [];
  for (const f of readdirSync(META_DIR).filter((x) => x.endsWith('.json') && x !== 'index.json')) {
    const d = JSON.parse(readFileSync(join(META_DIR, f), 'utf-8')) as MetaDeck;
    if (!d?.cards) continue; // nur echte Deck-Dateien
    const cardIds: string[] = [];
    for (const [slug, n] of Object.entries(d.cards)) for (let i = 0; i < n; i++) cardIds.push(slug);
    out.push({ id: d.id, name: d.name, cardIds });
  }
  return out.sort((x, y) => x.name.localeCompare(y.name));
}

async function main() {
  const a = parseArgs(process.argv.slice(2));
  mkdirSync(META_DIR, { recursive: true });
  console.log(`Quelle: ${a.source} · Cache: ${a.refresh ? 'AUS (frisch)' : 'AN'}`);
  const ids = await discover(a);
  console.log(`${ids.length} Deck-IDs gefunden. Ziehe …`);
  let ok = 0, skipped = 0;
  const index: { file: string; name: string; total: number }[] = [];
  for (const id of ids) {
    try {
      const html = await getCached(`${a.source}/deck/${id}`, `${id}.html`, a.refresh);
      const { deck, reason } = parseDeck(id, a.source, html);
      if (!deck) { console.log(`  – ${id}: übersprungen (${reason})`); skipped++; continue; }
      const file = `${slugify(deck.name)}-${id.slice(0, 8)}.json`;
      writeFileSync(join(META_DIR, file), JSON.stringify(deck, null, 2), 'utf-8');
      index.push({ file, name: deck.name, total: deck.total });
      console.log(`  ✓ ${deck.name} — ${deck.legends.length} Legends, ${deck.total} Karten → ${file}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${id}: ${(e as Error).message}`); skipped++;
    }
  }
  index.sort((x, y) => x.name.localeCompare(y.name));
  writeFileSync(join(META_DIR, 'index.json'), JSON.stringify({ source: a.source, pulledAt: new Date().toISOString(), decks: index }, null, 2), 'utf-8');
  console.log(`\nFertig: ${ok} Decks gespeichert, ${skipped} übersprungen. Ordner: sim/meta-decks/ (gitignored).`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('pull_meta.ts')) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
