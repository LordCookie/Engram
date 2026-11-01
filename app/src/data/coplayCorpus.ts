import { corpusFromIngest, type Corpus } from '../domain/coplay';
import { pickNewer } from '../domain/dataBundle';
import { loadedBundle } from './overrides';

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
  /** Stand der gewählten Fassung (mitgeliefert oder nachgeladen), falls bekannt. */
  generated?: string;
}

const EMPTY: IngestedCorpus = { corpus: null, count: 0, sources: {}, trios: new Map() };

// Non-eager: liefert Lade-Funktionen statt den Inhalt sofort ins Bundle zu ziehen.
const loaders = import.meta.glob<{ default: unknown }>('./coplay.json');

let cache: IngestedCorpus | null = null;

/** Erstellungszeit eines ingest-v2-Korpus (`generated`, seit v0.4 von ingest_decks.py). */
const generatedOf = (x: unknown): string | undefined =>
  typeof x === 'object' && x !== null && typeof (x as { generated?: unknown }).generated === 'string'
    ? (x as { generated: string }).generated
    : undefined;

/**
 * Lädt das Ingest-Korpus einmalig (eigener Chunk). Fehlt die Datei, ist es leer. Hat
 * „Daten aktualisieren" ein neueres Datenpaket geladen, gilt dessen Korpus.
 */
export async function loadIngestedCorpus(): Promise<IngestedCorpus> {
  if (cache) return cache;
  const load = Object.values(loaders)[0];
  const loaded = loadedBundle();
  try {
    const bundledRaw = load ? (await load()).default : undefined;
    const loadedRaw = loaded?.coplay;
    const loadedStamp = generatedOf(loadedRaw) ?? loaded?.created;
    const raw = pickNewer(bundledRaw, generatedOf(bundledRaw), loadedRaw, loadedStamp);
    if (raw === undefined) {
      cache = EMPTY;
      return cache;
    }
    const { corpus, sources, trios } = corpusFromIngest(raw);
    const generated = raw === loadedRaw ? loadedStamp : generatedOf(raw);
    cache = corpus ? { corpus, count: corpus.n, sources, trios, generated } : EMPTY;
  } catch {
    cache = EMPTY;
  }
  return cache;
}
