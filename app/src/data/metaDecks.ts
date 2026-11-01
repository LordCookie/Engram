import { cardIndex } from './catalog';
import { loadedBundle } from './overrides';
import { pickNewer } from '../domain/dataBundle';
import { EMPTY_META, parseMetaDecks, type MetaDeckSet } from '../domain/metaDecks';

/**
 * Meta-Decks aus `metaDecks.json` (erzeugt von `sim/build_meta_decks.ts`, gitignored:
 * fremde Decklisten). Fehlt die Datei (frischer Clone/CI), bleibt die Liste leer und die
 * App baut trotzdem — daher optional per `import.meta.glob`. Klein (~10 KB) → eager.
 * Hat „Daten aktualisieren" ein neueres Datenpaket geladen, gilt dessen Fassung.
 */
const mods = import.meta.glob<{ default: unknown }>('./metaDecks.json', { eager: true });
const bundledRaw = Object.values(mods)[0]?.default;
const loadedRaw = loadedBundle()?.metaDecks;

const updatedOf = (x: unknown): string | undefined =>
  typeof x === 'object' && x !== null && typeof (x as { updated?: unknown }).updated === 'string'
    ? (x as { updated: string }).updated
    : undefined;

const raw = pickNewer(bundledRaw, updatedOf(bundledRaw), loadedRaw, updatedOf(loadedRaw));

export const metaDecks: MetaDeckSet = raw ? parseMetaDecks(raw, cardIndex) : EMPTY_META;
