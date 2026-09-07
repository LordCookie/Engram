import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardIndex } from '../app/src/data/catalog';
import { starters } from '../app/src/domain/starters';
import { validate } from '../app/src/rules/validate';
import { rulesetV1Loaded } from '../app/src/rules/ruleset';
import { featureDB } from '../app/src/data/features';
import { featureWeights, synergyBetween } from '../app/src/domain/synergy';
import type { SimCardStat, SimConfig, SimDeck, SimParams } from './engine';
import { DEFAULT_PARAMS } from './engine';

/**
 * Brücke zwischen der Engine und den echten App-Daten: paarweise Synergie (unsere
 * Vorhersage), Kartenwerte, und die spielbaren Decks (Starter + optionale lokale
 * slug-Decklisten in `sim/decks/`). Braucht die (gitignored) `cards.json` /
 * `features.json` lokal — wie die App.
 */

const weights = featureWeights(featureDB);

/** Paarweiser Synergie-Score aus unserer Vorhersage (0 = keine Merkmale/keine Kante). */
export function synPair(aId: string, bId: string): number {
  const fa = featureDB.get(aId);
  const fb = featureDB.get(bId);
  if (!fa || !fb) return 0;
  return synergyBetween(fa, fb, weights).score;
}

export function stat(id: string): SimCardStat {
  const c = cardIndex.get(id);
  return c
    ? { id, name: c.name, type: c.type, cost: c.cost ?? 0, power: c.power ?? 0 }
    : { id, name: id, type: 'UNIT', cost: 3, power: 2 };
}

export function makeConfig(params: Partial<SimParams> = {}): SimConfig {
  return { ...DEFAULT_PARAMS, ...params, syn: synPair, stat };
}

const HERE = dirname(fileURLToPath(import.meta.url));

function expand(cards: Record<string, number>): string[] {
  const out: string[] = [];
  for (const [slug, n] of Object.entries(cards)) for (let i = 0; i < n; i++) out.push(slug);
  return out;
}

/** Spielbare Decks: die zwei Starter + jede legale Deckliste aus `sim/decks/*.json`. */
export function loadDecks(): SimDeck[] {
  const decks: SimDeck[] = starters.map((st) => ({ name: st.name, cardIds: expand(st.cards) }));

  const dir = join(HERE, 'decks');
  if (existsSync(dir)) {
    for (const f of readdirSync(dir).filter((x) => x.endsWith('.json'))) {
      try {
        const raw = JSON.parse(readFileSync(join(dir, f), 'utf-8'));
        for (const d of Array.isArray(raw) ? raw : [raw]) {
          const cards: Record<string, number> = d.cards ?? {};
          const vd = {
            legendIds: d.legends ?? [],
            cards: Object.entries(cards).map(([cardId, count]) => ({ cardId, count: count as number })),
          };
          if (!validate(vd, rulesetV1Loaded, cardIndex).ok) {
            console.error(`  übersprungen (illegal): ${f}`);
            continue;
          }
          decks.push({ name: d.name ?? f.replace(/\.json$/, ''), cardIds: expand(cards) });
        }
      } catch (e) {
        console.error(`  übersprungen (kein JSON): ${f}`);
      }
    }
  }
  return decks;
}

export function findDeck(decks: SimDeck[], name: string): SimDeck | undefined {
  const n = name.toLowerCase();
  return (
    decks.find((d) => d.name.toLowerCase() === n) ??
    decks.find((d) => d.name.toLowerCase().includes(n))
  );
}
