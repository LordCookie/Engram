import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, cardIndex } from '../app/src/data/catalog';
import { parseDeckText } from '../app/src/domain/deckText';
import { validate } from '../app/src/rules/validate';
import { rulesetV1Loaded } from '../app/src/rules/ruleset';

/**
 * build_meta_decks — Dev-Tool (Konsole, KEIN App-Feature): baut die Meta-Decks für den
 * Reiter „Synergie → Meta-Decks". Quelle ist `sim/meta-decks-src.json` (gitignored):
 * je Deck die Liste im Deck-Textformat der App plus eigene Einordnung auf Deutsch und
 * Englisch (Belege, Spielplan, Schwäche, Sideboard, Quelle). Jede Liste wird mit
 * `parseDeckText` aufgelöst und mit `validate` geprüft — eine unauflösbare Zeile oder
 * ein illegales Deck bricht ab, statt still eine falsche Liste auszuliefern.
 *
 * Ausgabe: `app/src/data/metaDecks.json` (gitignored, § 8: nur Slugs + Stückzahlen).
 *
 *   npx vite-node --script build_meta_decks.ts      (oder: npm run build-meta-decks)
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const SRC = join(HERE, 'meta-decks-src.json');
const OUT = resolve(HERE, '..', 'app', 'src', 'data', 'metaDecks.json');

interface SrcDeck {
  id: string;
  name: { de: string; en: string };
  list: string;
  [key: string]: unknown;
}

function main() {
  if (!existsSync(SRC)) {
    console.log(`Keine Quelle: ${SRC} fehlt.`);
    process.exit(1);
  }
  const src = JSON.parse(readFileSync(SRC, 'utf-8')) as { updated: string; decks: SrcDeck[] };
  const decks = [];
  let failed = 0;
  for (const d of src.decks) {
    const parsed = parseDeckText(d.list, catalog, cardIndex);
    if (parsed.unresolved.length) {
      console.log(`  ✗ ${d.name.de}: unauflösbar: ${parsed.unresolved.join(' | ')}`);
      failed++;
      continue;
    }
    const cards = parsed.cards.map((c) => ({ cardId: c.cardId, count: c.count }));
    const v = validate({ legendIds: parsed.legendIds, cards }, rulesetV1Loaded, cardIndex);
    if (!v.ok) {
      console.log(`  ✗ ${d.name.de}: illegal: ${v.violations.map((e) => e.message).join('; ')}`);
      failed++;
      continue;
    }
    const { list: _list, ...info } = d;
    decks.push({ ...info, legendIds: parsed.legendIds, cards });
    const total = cards.reduce((s, c) => s + c.count, 0);
    console.log(`  ✓ ${d.name.de} — ${total} Karten, legal`);
  }
  if (failed > 0) {
    console.log(`\nAbbruch: ${failed} Deck(s) fehlerhaft, ${OUT} bleibt unverändert.`);
    process.exit(1);
  }
  writeFileSync(OUT, JSON.stringify({ version: 1, updated: src.updated, decks }, null, 2) + '\n', 'utf-8');
  console.log(`\n${decks.length} Meta-Decks → app/src/data/metaDecks.json (gitignored).`);
}

main();
