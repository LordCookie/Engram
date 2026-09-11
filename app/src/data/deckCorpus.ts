import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDecks } from '../db/db';
import { cardIndex } from './catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { starters } from '../domain/starters';
import {
  buildCorpus,
  dedupeDecks,
  legalCorpusDecks,
  mergeCorpora,
  type Corpus,
} from '../domain/coplay';
import { loadIngestedCorpus, type IngestedCorpus } from './coplayCorpus';
import type { ValidatableDeck } from '../rules/validate';
import type { DeckDraft } from '../domain/deckDraft';

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

export function useCorpus(): CorpusInfo {
  const own = useLiveQuery(() => listDecks(), [], [] as DeckDraft[]);
  // Das Ingest-Korpus (`coplay.json`, ~155 KB) wird lazy in einem eigenen Chunk
  // geladen — anfangs leer (Vorschläge laufen sofort aus Startern + eigenen Decks),
  // nach dem Laden fließt die Meta-Empirie dazu.
  const [ingested, setIngested] = useState<IngestedCorpus>({ corpus: null, count: 0 });
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
    const starterLegal = legalCorpusDecks(starterDecks, rulesetV1Loaded, cardIndex);
    const ownLegalDecks = legalCorpusDecks(own, rulesetV1Loaded, cardIndex);
    const liveDecks = dedupeDecks([...starterLegal, ...ownLegalDecks]);
    const live = buildCorpus(liveDecks);
    const corpus = ingested.corpus ? mergeCorpora(ingested.corpus, live) : live;
    return {
      corpus,
      n: corpus.n,
      ingested: ingested.count,
      ownTotal: own.length,
      ownLegal: ownLegalDecks.length,
    };
  }, [own, ingested]);
}
