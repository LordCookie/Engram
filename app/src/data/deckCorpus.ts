import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDecks } from '../db/db';
import { cardIndex } from './catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { starters } from '../domain/starters';
import {
  buildCorpus,
  countTrios,
  dedupeDecks,
  mergeCorpora,
  sumCounts,
  toCorpusDeck,
  type Corpus,
} from '../domain/coplay';
import { validate } from '../rules/validate';
import { loadIngestedCorpus, type IngestedCorpus } from './coplayCorpus';
import type { ValidatableDeck } from '../rules/validate';
import type { DeckDraft } from '../domain/deckDraft';
import { t } from '../i18n';

/**
 * Baut das Deck-Korpus für die empirische Synergie (PLAN.md § 12 C).
 *
 * Quellen: (1) das vorab aggregierte **Ingest-Korpus** (`coplay.json`, Phase 4a,
 * optional), (2) die offiziellen Starter, (3) die eigenen in Dexie gespeicherten
 * Decks. Reaktiv über `useLiveQuery` — jedes gespeicherte/importierte Deck fließt
 * live ein. Nur legale Decks zählen (Filter über unseren Validator; das Ingest-
 * Korpus ist bereits legal gefiltert).
 */
export interface CorpusInfo {
  corpus: Corpus;
  /** Gesamtzahl der Decks im Korpus (Ingest + Starter + eigene). */
  n: number;
  /** Decks aus der Ingest-Pipeline. */
  ingested: number;
  /** …davon je Quelle (meta / community / eigene). */
  ingestedSources: Record<string, number>;
  /** Legend-Trios (Ingest + Starter + eigene legale Decks) → Zahl der Decks. */
  trios: ReadonlyMap<string, number>;
  /** Wie viele eigene Decks es insgesamt gibt. */
  ownTotal: number;
  /** Wie viele davon legal (= zählen mit). */
  ownLegal: number;
}

// WICHTIG: Legends gehören NUR in legendIds. `starterEntries` würde sie auch in
// `cards` legen (das ist für den Sammlungs-Import) — der Validator flaggt das als
// LEGEND_IN_DECK. Für ein ValidatableDeck also nur die reinen Deckkarten (s.cards).
const starterDecks: ValidatableDeck[] = starters.map((s) => ({
  legendIds: s.legendIds,
  cards: Object.entries(s.cards).map(([cardId, count]) => ({ cardId, count })),
}));

/** „8 Meta + 812 Community + 3 eigene Listen" — Herkunft des Ingest-Korpus. */
export function sourcesLabel(sources: Record<string, number>): string {
  // `unbekannt` = altes coplay.json (ingest-v1) ohne Quellenangabe.
  const names: Record<string, string> = { meta: 'Meta', community: 'Community', eigene: t('eigene Listen'), unbekannt: 'Ingest' };
  const order = ['meta', 'community', 'eigene', 'unbekannt'];
  const rank = (k: string) => (order.includes(k) ? order.indexOf(k) : order.length);
  return Object.entries(sources)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => rank(a) - rank(b))
    .map(([k, v]) => `${v} ${names[k] ?? k}`)
    .join(' + ');
}

export function useCorpus(): CorpusInfo {
  const own = useLiveQuery(() => listDecks(), [], [] as DeckDraft[]);
  // Das Ingest-Korpus (`coplay.json`, ~107 KB) wird lazy in einem eigenen Chunk
  // geladen — anfangs leer (Vorschläge laufen sofort aus Startern + eigenen Decks),
  // nach dem Laden fließt die Meta-Empirie dazu.
  const [ingested, setIngested] = useState<IngestedCorpus>({ corpus: null, count: 0, sources: {}, trios: new Map() });
  useEffect(() => {
    let alive = true;
    void loadIngestedCorpus().then((r) => {
      if (alive) setIngested(r);
    });
    return () => {
      alive = false;
    };
  }, []);

  return useMemo(() => {
    const legal = (d: ValidatableDeck) => validate(d, rulesetV1Loaded, cardIndex).ok;
    const starterLegal = starterDecks.filter(legal);
    const ownLegalDecks = own.filter(legal);
    const liveDecks = dedupeDecks([...starterLegal, ...ownLegalDecks].map(toCorpusDeck));
    const live = buildCorpus(liveDecks);
    const corpus = ingested.corpus ? mergeCorpora(ingested.corpus, live) : live;
    return {
      corpus,
      n: corpus.n,
      ingested: ingested.count,
      ingestedSources: ingested.sources,
      trios: sumCounts(ingested.trios, countTrios([...starterLegal, ...ownLegalDecks])),
      ownTotal: own.length,
      ownLegal: ownLegalDecks.length,
    };
  }, [own, ingested]);
}
