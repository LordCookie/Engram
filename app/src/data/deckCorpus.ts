import { useMemo } from 'react';
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
import { ingestedCorpus, ingestedDeckCount } from './coplayCorpus';
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

  return useMemo(() => {
    const starterLegal = legalCorpusDecks(starterDecks, rulesetV1Loaded, cardIndex);
    const ownLegalDecks = legalCorpusDecks(own, rulesetV1Loaded, cardIndex);
    const liveDecks = dedupeDecks([...starterLegal, ...ownLegalDecks]);
    const live = buildCorpus(liveDecks);
    const corpus = ingestedCorpus ? mergeCorpora(ingestedCorpus, live) : live;
    return {
      corpus,
      n: corpus.n,
      ingested: ingestedDeckCount,
      ownTotal: own.length,
      ownLegal: ownLegalDecks.length,
    };
  }, [own]);
}
