import type { Corpus } from '../domain/coplay';

/**
 * Vorab aggregiertes Co-Play-Korpus aus der Ingest-Pipeline (PLAN.md § 12 C,
 * Phase 4a): `pipeline/ingest_decks.py` → `coplay.json`. Die Datei ist gitignored
 * (generiert) und fehlt auf einem frischen Clone / in der CI — daher **optional**
 * per `import.meta.glob` referenziert, damit die App auch ohne sie baut.
 *
 * **Lazy geladen:** `coplay.json` ist mit Abstand die größte Datendatei (~155 KB,
 * das Co-Play-Matrix) und wird nur für die **empirischen** Synergie-Vorschläge
 * gebraucht (Deck/Synergie). Sie liegt deshalb in einem **eigenen Chunk**, der erst
 * beim ersten `useCorpus` geladen wird — das hält den App-Start (Sammlung/Deck/
 * Solver) schlank. `useCorpus` (deckCorpus.ts) mischt das Basis-Korpus dann mit den
 * live aus Dexie gebauten eigenen Decks.
 */
interface RawCoplay {
  n?: number;
  df?: Record<string, number>;
  co?: Record<string, Record<string, number>>;
}

export interface IngestedCorpus {
  corpus: Corpus | null;
  count: number;
}

// Non-eager: liefert Lade-Funktionen statt den Inhalt sofort ins Bundle zu ziehen.
const loaders = import.meta.glob<{ default: RawCoplay }>('./coplay.json');

function toCorpus(raw: RawCoplay | undefined): IngestedCorpus {
  if (!raw || !raw.n || raw.n <= 0) return { corpus: null, count: 0 };
  return {
    corpus: {
      n: raw.n,
      df: new Map(Object.entries(raw.df ?? {})),
      co: new Map(Object.entries(raw.co ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))])),
    },
    count: raw.n,
  };
}

let cache: IngestedCorpus | null = null;

/** Lädt das Ingest-Korpus einmalig (eigener Chunk). Fehlt die Datei, ist es leer. */
export async function loadIngestedCorpus(): Promise<IngestedCorpus> {
  if (cache) return cache;
  const load = Object.values(loaders)[0];
  if (!load) {
    cache = { corpus: null, count: 0 };
    return cache;
  }
  try {
    const mod = await load();
    cache = toCorpus(mod.default);
  } catch {
    cache = { corpus: null, count: 0 };
  }
  return cache;
}
