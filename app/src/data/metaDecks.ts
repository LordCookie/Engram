import { cardIndex } from './catalog';
import { EMPTY_META, parseMetaDecks, type MetaDeckSet } from '../domain/metaDecks';

/**
 * Meta-Decks aus `metaDecks.json` (erzeugt von `sim/build_meta_decks.ts`, gitignored:
 * fremde Decklisten). Fehlt die Datei (frischer Clone/CI), bleibt die Liste leer und die
 * App baut trotzdem — daher optional per `import.meta.glob`. Klein (~10 KB) → eager.
 */
const mods = import.meta.glob<{ default: unknown }>('./metaDecks.json', { eager: true });
const raw = Object.values(mods)[0]?.default;

export const metaDecks: MetaDeckSet = raw ? parseMetaDecks(raw, cardIndex) : EMPTY_META;
