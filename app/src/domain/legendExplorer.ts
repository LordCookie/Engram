/**
 * Legend-Explorer (EDHREC-Gedanke, lokal): Was spielen echte Decks mit einer Legend?
 * Rein & testbar, rechnet nur auf dem Co-Play-Korpus (`domain/coplay.ts`) und den
 * gezählten Legend-Trios — Statistik, keine Bewertung („beliebt" ≠ „stark", § 12).
 *
 *  - `legendPopularity`  — wie viele Decks spielen die Legend (Anteil am Korpus)
 *  - `legendPartners`    — welche anderen Legends laufen mit ihr zusammen
 *  - `legendTrios`       — die häufigsten kompletten Trios mit ihr
 *  - `legendTopCards`    — Karten nach Einsatzquote in ihren Decks (+ Lift)
 */
import type { Corpus } from './coplay';

export interface LegendStat {
  id: string;
  /** Decks mit dieser Legend. */
  decks: number;
  /** Anteil am ganzen Korpus (0..1). */
  share: number;
}

export interface LegendPartner {
  id: string;
  /** Decks, die beide Legends spielen. */
  together: number;
  /** Anteil an den Decks der Ausgangs-Legend (0..1). */
  share: number;
}

export interface TrioStat {
  ids: string[];
  decks: number;
  /** Anteil an den Decks der Ausgangs-Legend (0..1). */
  share: number;
}

export interface CardRate {
  id: string;
  /** Decks der Legend, die die Karte spielen. */
  decks: number;
  /** Einsatzquote in den Decks der Legend (0..1). */
  rate: number;
  /** Lift gegenüber dem ganzen Korpus (>1 = typisch für diese Legend). */
  lift: number;
}

const decksWith = (id: string, corpus: Corpus) => corpus.df.get(id) ?? 0;
const together = (a: string, b: string, corpus: Corpus) => corpus.co.get(a)?.get(b) ?? 0;

/** Alle Legends nach Verbreitung (meistgespielt zuerst, bei Gleichstand nach ID). */
export function legendPopularity(corpus: Corpus, legendIds: readonly string[]): LegendStat[] {
  return legendIds
    .map((id) => ({ id, decks: decksWith(id, corpus), share: corpus.n > 0 ? decksWith(id, corpus) / corpus.n : 0 }))
    .sort((a, b) => b.decks - a.decks || a.id.localeCompare(b.id));
}

/** Partner-Legends, die am häufigsten mit `legendId` im selben Deck stehen. */
export function legendPartners(
  legendId: string,
  corpus: Corpus,
  legendIds: readonly string[],
  limit = 6,
): LegendPartner[] {
  const own = decksWith(legendId, corpus);
  if (own === 0) return [];
  return legendIds
    .filter((id) => id !== legendId)
    .map((id) => {
      const n = together(legendId, id, corpus);
      return { id, together: n, share: n / own };
    })
    .filter((p) => p.together > 0)
    .sort((a, b) => b.together - a.together || a.id.localeCompare(b.id))
    .slice(0, limit);
}

/** Häufigste komplette Trios mit `legendId` (Schlüssel wie `trioKey`). */
export function legendTrios(
  legendId: string,
  trios: ReadonlyMap<string, number>,
  corpus: Corpus,
  limit = 5,
): TrioStat[] {
  const own = decksWith(legendId, corpus);
  const out: TrioStat[] = [];
  for (const [key, n] of trios) {
    const ids = key.split('|');
    if (!ids.includes(legendId)) continue;
    out.push({ ids, decks: n, share: own > 0 ? n / own : 0 });
  }
  return out.sort((a, b) => b.decks - a.decks || a.ids.join().localeCompare(b.ids.join())).slice(0, limit);
}

/**
 * Karten nach Einsatzquote in den Decks der Legend. `isCandidate` filtert (z. B. keine
 * Legends, nur RAM-spielbare). Erst ab `minDecks` Decks der Legend aussagekräftig.
 */
export function legendTopCards(
  legendId: string,
  corpus: Corpus,
  isCandidate: (cardId: string) => boolean,
  limit = 15,
  minDecks = 5,
): CardRate[] {
  const own = decksWith(legendId, corpus);
  if (own < minDecks || corpus.n === 0) return [];
  const row = corpus.co.get(legendId);
  if (!row) return [];
  const out: CardRate[] = [];
  for (const [id, n] of row) {
    if (id === legendId || !isCandidate(id)) continue;
    const rate = n / own;
    const base = decksWith(id, corpus) / corpus.n;
    out.push({ id, decks: n, rate, lift: base > 0 ? rate / base : 0 });
  }
  return out.sort((a, b) => b.rate - a.rate || b.lift - a.lift || a.id.localeCompare(b.id)).slice(0, limit);
}
