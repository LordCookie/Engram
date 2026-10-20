import { corpusFromIngest, type Corpus } from '../domain/coplay';

/**
 * Vorab aggregiertes Co-Play-Korpus aus der Ingest-Pipeline (PLAN.md § 12 C,
 * Phase 4a): `pipeline/ingest_decks.py` → `coplay.json`. Die Datei ist gitignored
 * (generiert) und fehlt auf einem frischen Clone / in der CI — daher **optional**
 * per `import.meta.glob` referenziert, damit die App auch ohne sie baut.
 *
 * **Lazy geladen:** `coplay.json` ist die größte Datendatei und wird nur für die
 * **empirischen** Synergie-Vorschläge gebraucht (Deck/Synergie/Solver). Sie liegt
 * deshalb in einem **eigenen Chunk**, der erst beim ersten `useCorpus` geladen wird —
 * das hält den App-Start schlank. Format `ingest-v2` (kompakt) oder altes v1, gelesen
 * von `corpusFromIngest`. `useCorpus` (deckCorpus.ts) mischt das Basis-Korpus dann mit
 * den live aus Dexie gebauten eigenen Decks.
 */
export interface IngestedCorpus {
  corpus: Corpus | null;
  count: number;
  /** Decks je Quelle (meta / community / eigene). */
  sources: Record<string, number>;
  /** Legend-Trios → Zahl der Decks (für den Legend-Explorer). */
  trios: ReadonlyMap<string, number>;
}

const EMPTY: IngestedCorpus = { corpus: null, count: 0, sources: {}, trios: new Map() };

// Non-eager: liefert Lade-Funktionen statt den Inhalt sofort ins Bundle zu ziehen.
const loaders = import.meta.glob<{ default: unknown }>('./coplay.json');

let cache: IngestedCorpus | null = null;

/** Lädt das Ingest-Korpus einmalig (eigener Chunk). Fehlt die Datei, ist es leer. */
export async function loadIngestedCorpus(): Promise<IngestedCorpus> {
  if (cache) return cache;
  const load = Object.values(loaders)[0];
  if (!load) {
    cache = EMPTY;
    return cache;
  }
  try {
    const { corpus, sources, trios } = corpusFromIngest((await load()).default);
    cache = corpus ? { corpus, count: corpus.n, sources, trios } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}
