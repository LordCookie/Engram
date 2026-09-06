import type { Corpus } from '../domain/coplay';

/**
 * Vorab aggregiertes Co-Play-Korpus aus der Ingest-Pipeline (PLAN.md § 12 C,
 * Phase 4a): `pipeline/ingest_decks.py` → `coplay.json`. Die Datei ist gitignored
 * (generiert) und fehlt auf einem frischen Clone / in der CI — daher **optional**
 * per `import.meta.glob` geladen, damit die App auch ohne sie baut.
 *
 * `useCorpus` (deckCorpus.ts) führt dieses Basis-Korpus mit den live aus Dexie
 * gebauten eigenen Decks zusammen.
 */
interface RawCoplay {
  n?: number;
  df?: Record<string, number>;
  co?: Record<string, Record<string, number>>;
}

const mods = import.meta.glob<{ default: RawCoplay }>('./coplay.json', { eager: true });
const raw = Object.values(mods)[0]?.default;

export const ingestedCorpus: Corpus | null =
  raw && raw.n && raw.n > 0
    ? {
        n: raw.n,
        df: new Map(Object.entries(raw.df ?? {})),
        co: new Map(
          Object.entries(raw.co ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]),
        ),
      }
    : null;

export const ingestedDeckCount = ingestedCorpus?.n ?? 0;
