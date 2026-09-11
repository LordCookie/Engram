import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalog, cardIndex } from '../app/src/data/catalog';
import { parseDeckText } from '../app/src/domain/deckText';
import { validate } from '../app/src/rules/validate';
import { rulesetV1Loaded } from '../app/src/rules/ruleset';

/**
 * import_decklists — Dev-Tool (Konsole, KEIN App-Feature): liest MTG-artige
 * Deck-Textlisten (`.txt` — genau das Format, das die App exportiert) und schreibt
 * sie als slug-basierte JSONs nach `pipeline/decklists/`, damit `ingest_decks.py`
 * sie ins Co-Play-Korpus (`coplay.json`) zieht. So kann man eigene Decks stapelweise
 * als empirisches Synergie-Futter einspeisen (der EDHREC-Gedanke, lokal).
 *
 * Nur **legale** Decks fließen ein (`validate`). Unauflösbare Zeilen (Tippfehler /
 * fremde Karten) werden gemeldet, damit man nachbessern kann. Alles lokal/gitignored.
 *
 *   npx tsx import_decklists.ts                # liest sim/deck-import/*.txt
 *   npx tsx import_decklists.ts a.txt b.txt    # gezielte Dateien
 *   npx tsx import_decklists.ts --ingest       # danach ingest_decks.py laufen lassen
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const IN_DIR = join(HERE, 'deck-import');
const OUT_DIR = join(ROOT, 'pipeline', 'decklists');

const slugify = (s: string) =>
  s.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'deck';

function collectInputs(argv: string[]): string[] {
  const files = argv.filter((a) => !a.startsWith('--'));
  if (files.length > 0) return files.map((f) => resolve(f));
  if (!existsSync(IN_DIR)) return [];
  return readdirSync(IN_DIR)
    .filter((f) => f.toLowerCase().endsWith('.txt'))
    .map((f) => join(IN_DIR, f));
}

function main() {
  const argv = process.argv.slice(2);
  const doIngest = argv.includes('--ingest');
  const inputs = collectInputs(argv);
  if (inputs.length === 0) {
    console.log(`Keine .txt gefunden. Lege Decklisten in ${IN_DIR}/ ab oder gib Dateien an.`);
    return;
  }
  mkdirSync(OUT_DIR, { recursive: true });

  let ok = 0;
  let skipped = 0;
  for (const file of inputs) {
    let text: string;
    try {
      text = readFileSync(file, 'utf-8');
    } catch (e) {
      console.error(`  ✗ ${basename(file)}: ${(e as Error).message}`);
      skipped++;
      continue;
    }
    const parsed = parseDeckText(text, catalog, cardIndex);
    const name = parsed.name || basename(file).replace(/\.txt$/i, '');
    if (parsed.unresolved.length) {
      const sample = parsed.unresolved.slice(0, 3).join(' | ');
      console.log(
        `  ! ${name}: ${parsed.unresolved.length} unauflösbare Zeile(n) ignoriert: ${sample}${parsed.unresolved.length > 3 ? ' …' : ''}`,
      );
    }
    const vd = {
      legendIds: parsed.legendIds,
      cards: parsed.cards.map((c) => ({ cardId: c.cardId, count: c.count })),
    };
    const v = validate(vd, rulesetV1Loaded, cardIndex);
    if (!v.ok) {
      console.log(`  – ${name}: übersprungen (illegal: ${v.violations.map((e) => e.message).join('; ')})`);
      skipped++;
      continue;
    }
    const deck = {
      name,
      source: 'local-import',
      legends: parsed.legendIds,
      cards: Object.fromEntries(parsed.cards.map((c) => [c.cardId, c.count])),
    };
    const outFile = join(OUT_DIR, `${slugify(name)}.json`);
    writeFileSync(outFile, JSON.stringify(deck, null, 2) + '\n', 'utf-8');
    const total = Object.values(deck.cards).reduce((s, n) => s + n, 0);
    console.log(`  ✓ ${name} — ${deck.legends.length} Legends, ${total} Karten → ${basename(outFile)}`);
    ok++;
  }

  console.log(`\nFertig: ${ok} Decks geschrieben, ${skipped} übersprungen → pipeline/decklists/ (gitignored).`);
  if (ok > 0 && doIngest) {
    console.log('\nIngest …');
    const r = spawnSync('python', [join(ROOT, 'pipeline', 'ingest_decks.py')], {
      cwd: ROOT,
      stdio: 'inherit',
    });
    if (r.status !== 0) console.log('  (ingest fehlgeschlagen — manuell: python pipeline/ingest_decks.py)');
  } else if (ok > 0) {
    console.log('Nächster Schritt: python pipeline/ingest_decks.py');
  }
}

main();
