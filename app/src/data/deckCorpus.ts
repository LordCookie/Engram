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
  type Corpus,
} from '../domain/coplay';
import type { ValidatableDeck } from '../rules/validate';
import type { DeckDraft } from '../domain/deckDraft';

/**
 * Baut das Deck-Korpus für die empirische Synergie (PLAN.md § 12 C).
 *
 * First-Party (Nutzer-Entscheidung 2026-09-04): das Korpus sind die offiziellen
 * Starter PLUS die eigenen in Dexie gespeicherten Decks. Kein Netzwerk, kein
 * Scraping. Reaktiv über `useLiveQuery` — jedes gespeicherte oder importierte
 * Deck fließt automatisch ein und wächst die Statistik. Nur legale Decks zählen
 * (Filter über unseren Validator).
 */
export interface CorpusInfo {
  corpus: Corpus;
  /** Gesamtzahl der Decks im Korpus (Starter + eigene, dedupliziert). */
  n: number;
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
    const decks = dedupeDecks([...starterLegal, ...ownLegalDecks]);
    return {
      corpus: buildCorpus(decks),
      n: decks.length,
      ownTotal: own.length,
      ownLegal: ownLegalDecks.length,
    };
  }, [own]);
}
