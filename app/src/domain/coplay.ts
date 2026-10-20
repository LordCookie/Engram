import type { Card, CardIndex } from './types';
import type { Ruleset } from '../rules/ruleset';
import { validate, type ValidatableDeck } from '../rules/validate';
import type { ScoreFn, ScoreContext } from './solver';

/**
 * Empirische Synergie aus Decklisten (PLAN.md § 12 C, Phase 4a).
 *
 * KEINE Vorhersage aus Kartentext (das macht `synergy.ts`), sondern die simple
 * Frage: *welche Karten tauchen tatsächlich zusammen in Decks auf?* Reine,
 * framework-freie Funktionen — voll testbar.
 *
 * Ehrlichkeit (§ 12): Das ist eine BEOBACHTUNG über ein konkretes Korpus. Die
 * Aussagekraft steht und fällt mit der Zahl der Decks (N). Deshalb liefern die
 * Ergebnisse immer die Stützzahlen mit (coCount, N), nie nur eine Rangzahl.
 *
 * Legalitätsfilter (Nutzer-Entscheidung 2026-09-04): nur Decks, die unser eigener
 * Validator akzeptiert, zählen. So verunreinigen illegale/kaputte Entwürfe die
 * Statistik nicht — der frühere „Community-Decks sind oft illegal"-Stolperstein
 * wird zum Filter.
 */

/** Ein Deck als Menge vorkommender Karten-IDs (Legends + Deckkarten), dedupliziert. */
export interface CorpusDeck {
  cards: readonly string[];
}

/** Karten-IDs eines Decks als deduplizierte Menge (Legends zählen mit). */
export function toCorpusDeck(deck: ValidatableDeck): CorpusDeck {
  const set = new Set<string>(deck.legendIds);
  for (const e of deck.cards) set.add(e.cardId);
  return { cards: [...set] };
}

/** Filtert eine Deckmenge auf die legalen und wandelt sie ins Korpus-Format. */
export function legalCorpusDecks(
  decks: readonly ValidatableDeck[],
  ruleset: Ruleset,
  cardIndex: CardIndex,
): CorpusDeck[] {
  return decks.filter((d) => validate(d, ruleset, cardIndex).ok).map(toCorpusDeck);
}

/**
 * Entfernt inhaltsgleiche Decks (gleiche Kartenmenge). Schützt die kleine
 * First-Party-Statistik davor, dass ein als eigenes Deck gespeicherter Starter
 * doppelt zählt und Korrelationen künstlich aufbläht.
 */
export function dedupeDecks(decks: readonly CorpusDeck[]): CorpusDeck[] {
  const seen = new Set<string>();
  const out: CorpusDeck[] = [];
  for (const d of decks) {
    const sig = [...new Set(d.cards)].sort().join('|');
    if (seen.has(sig)) continue;
    seen.add(sig);
    out.push(d);
  }
  return out;
}

export interface Corpus {
  /** Anzahl Decks im Korpus. */
  n: number;
  /** Karten-ID → in wie vielen Decks sie vorkommt (document frequency). */
  df: ReadonlyMap<string, number>;
  /** Karten-ID a → (b → Zahl der Decks mit BEIDEN). Symmetrisch gefüllt. */
  co: ReadonlyMap<string, ReadonlyMap<string, number>>;
}

/**
 * Zwei Korpora zu einem zusammenführen (Summen von n, df, Ko-Vorkommen). So kann
 * ein vorab aggregiertes Korpus (Ingest-Pipeline, § 12 C / Phase 4a) mit den live
 * aus Dexie gebauten eigenen Decks kombiniert werden.
 */
export function mergeCorpora(a: Corpus, b: Corpus): Corpus {
  const df = new Map<string, number>(a.df);
  for (const [k, v] of b.df) df.set(k, (df.get(k) ?? 0) + v);
  const co = new Map<string, Map<string, number>>();
  const add = (src: Corpus['co']) => {
    for (const [x, row] of src) {
      let out = co.get(x);
      if (!out) {
        out = new Map<string, number>();
        co.set(x, out);
      }
      for (const [y, v] of row) out.set(y, (out.get(y) ?? 0) + v);
    }
  };
  add(a.co);
  add(b.co);
  return { n: a.n + b.n, df, co };
}

export function buildCorpus(decks: readonly CorpusDeck[]): Corpus {
  const df = new Map<string, number>();
  const co = new Map<string, Map<string, number>>();

  for (const deck of decks) {
    const ids = [...new Set(deck.cards)];
    for (const id of ids) df.set(id, (df.get(id) ?? 0) + 1);
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        bump(co, ids[i], ids[j]);
        bump(co, ids[j], ids[i]);
      }
    }
  }
  return { n: decks.length, df, co };
}

/** Ingest-Korpus (`coplay.json`) samt Herkunft der Decks (meta/community/eigene). */
export interface IngestCorpus {
  corpus: Corpus | null;
  /** Decks je Quelle; bei alten Dateien (v1) nur `{ unbekannt: n }`. */
  sources: Record<string, number>;
  /** Legend-Trios → Zahl der Decks (Schlüssel `trioKey`); leer, wenn die Datei keine hat. */
  trios: Map<string, number>;
}

/** Schlüssel eines Legend-Trios: sortierte IDs, mit „|" verbunden. */
export function trioKey(ids: readonly string[]): string {
  return [...ids].sort().join('|');
}

/** Legend-Trios einer Deckmenge zählen (nur Decks mit genau 3 verschiedenen Legends). */
export function countTrios(decks: readonly { legendIds: readonly string[] }[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const d of decks) {
    const ids = [...new Set(d.legendIds)];
    if (ids.length !== 3) continue;
    const k = trioKey(ids);
    out.set(k, (out.get(k) ?? 0) + 1);
  }
  return out;
}

/** Zwei Zähltabellen addieren. */
export function sumCounts(a: ReadonlyMap<string, number>, b: ReadonlyMap<string, number>): Map<string, number> {
  const out = new Map(a);
  for (const [k, v] of b) out.set(k, (out.get(k) ?? 0) + v);
  return out;
}

/**
 * Liest `coplay.json` aus der Ingest-Pipeline: `ingest-v2` (kompakt: `cards`,
 * `df` als Liste, `pairs` [i, j, anzahl] mit i < j, optional `trios` [i, j, k, anzahl]
 * = Legend-Trios) oder das alte `ingest-v1`
 * (df/co als Objekte). Unbrauchbares → leeres Korpus.
 */
export function corpusFromIngest(raw: unknown): IngestCorpus {
  const empty: IngestCorpus = { corpus: null, sources: {}, trios: new Map() };
  if (!raw || typeof raw !== 'object') return empty;
  const r = raw as Record<string, unknown>;
  const n = typeof r.n === 'number' ? r.n : 0;
  if (n <= 0) return empty;
  const df = new Map<string, number>();
  const co = new Map<string, Map<string, number>>();
  const trios = new Map<string, number>();

  if (Array.isArray(r.cards) && Array.isArray(r.df) && Array.isArray(r.pairs)) {
    const cards = r.cards as unknown[];
    cards.forEach((c, i) => {
      const v = (r.df as unknown[])[i];
      if (typeof c === 'string' && typeof v === 'number') df.set(c, v);
    });
    for (const p of r.pairs as unknown[]) {
      if (!Array.isArray(p) || p.length !== 3) continue;
      const [i, j, v] = p as unknown[];
      const a = cards[i as number];
      const b = cards[j as number];
      if (typeof a !== 'string' || typeof b !== 'string' || typeof v !== 'number') continue;
      // symmetrisch füllen wie buildCorpus
      bump(co, a, b, v);
      bump(co, b, a, v);
    }
    for (const t of Array.isArray(r.trios) ? (r.trios as unknown[]) : []) {
      if (!Array.isArray(t) || t.length !== 4) continue;
      const ids = (t as unknown[]).slice(0, 3).map((i) => cards[i as number]);
      const v = (t as unknown[])[3];
      if (ids.every((x): x is string => typeof x === 'string') && typeof v === 'number') trios.set(trioKey(ids), v);
    }
  } else {
    for (const [k, v] of Object.entries((r.df as Record<string, unknown>) ?? {})) {
      if (typeof v === 'number') df.set(k, v);
    }
    for (const [a, row] of Object.entries((r.co as Record<string, unknown>) ?? {})) {
      if (!row || typeof row !== 'object') continue;
      const m = new Map<string, number>();
      for (const [b, v] of Object.entries(row as Record<string, unknown>)) if (typeof v === 'number') m.set(b, v);
      co.set(a, m);
    }
  }

  const sources: Record<string, number> = {};
  if (r.sources && typeof r.sources === 'object') {
    for (const [k, v] of Object.entries(r.sources as Record<string, unknown>)) if (typeof v === 'number') sources[k] = v;
  } else {
    sources.unbekannt = n;
  }
  return { corpus: { n, df, co }, sources, trios };
}

function bump(co: Map<string, Map<string, number>>, a: string, b: string, by = 1): void {
  let row = co.get(a);
  if (!row) {
    row = new Map<string, number>();
    co.set(a, row);
  }
  row.set(b, (row.get(b) ?? 0) + by);
}

export interface CoPlayPartner {
  card: Card;
  /** Lift = P(a,b) / (P(a)·P(b)). >1 = häufiger zusammen als der Zufall erwarten ließe. */
  lift: number;
  /** Decks, die a UND b enthalten. */
  coCount: number;
  /** Decks, die b insgesamt enthalten. */
  dfOther: number;
}

export interface CoPlayOptions {
  limit?: number;
  /** Mindestzahl gemeinsamer Decks, sonst zu wenig Signal (Default 2). */
  minCoCount?: number;
}

/**
 * Die am stärksten mit `cardId` zusammengespielten Karten, nach Lift sortiert.
 * Gibt Karten UND Legends zurück — die Kopplung an ein Legend-Triple ist gerade
 * bei diesem Spiel das aussagekräftigste Signal (3 Legends legen viel fest).
 */
export function coPlayPartners(
  cardId: string,
  corpus: Corpus,
  cardIndex: CardIndex,
  opts: CoPlayOptions = {},
): CoPlayPartner[] {
  const limit = opts.limit ?? 8;
  const minCoCount = opts.minCoCount ?? 2;
  const dfA = corpus.df.get(cardId) ?? 0;
  const row = corpus.co.get(cardId);
  if (dfA === 0 || !row) return [];

  const partners: CoPlayPartner[] = [];
  for (const [otherId, coCount] of row) {
    if (otherId === cardId) continue;
    if (coCount < minCoCount) continue;
    const card = cardIndex.get(otherId);
    if (!card) continue;
    const dfOther = corpus.df.get(otherId) ?? 0;
    if (dfOther === 0) continue;
    const lift = (coCount * corpus.n) / (dfA * dfOther);
    partners.push({ card, lift, coCount, dfOther });
  }

  partners.sort(
    (a, b) =>
      b.lift - a.lift ||
      b.coCount - a.coCount ||
      a.card.name.localeCompare(b.card.name),
  );
  return partners.slice(0, limit);
}

// --- Empirisch gewichteter Solver-Score (PLAN.md § 12 C) -------------------

/**
 * Lift zwischen zwei Karten (0, wenn eine fehlt oder sie nie zusammen auftauchen).
 * Symmetrisch. Gleiche Metrik wie in `coPlayPartners`.
 */
export function coPlayLift(a: string, b: string, corpus: Corpus): number {
  const dfA = corpus.df.get(a) ?? 0;
  const dfB = corpus.df.get(b) ?? 0;
  if (dfA === 0 || dfB === 0) return 0;
  const coCount = corpus.co.get(a)?.get(b) ?? 0;
  if (coCount === 0) return 0;
  return (coCount * corpus.n) / (dfA * dfB);
}

/**
 * Baut eine `ScoreFn` für den Legend-Solver aus dem Deck-Korpus. Bevorzugt
 * Triples, deren Legends laut echten Decks mit dem freigeschalteten Bestand
 * zusammengespielt werden. Austauschbar mit `defaultScore`/`makeSynergyScore`.
 *
 * Score = Σ_Karte  nutzbar × (1 + gewicht × Σ_Legend Lift(Karte ↔ Legend)).
 * Ohne Gewicht (0) und ohne Korpusdaten identisch zum reinen Mengen-Score —
 * genau dieselbe Form wie `makeSynergyScore`, nur die Quelle des Signals ist
 * Beobachtung statt Vorhersage.
 */
export function makeCoPlayScore(corpus: Corpus, weight = 1): ScoreFn {
  return ({ legends, playable }: ScoreContext): number => {
    let total = 0;
    for (const p of playable) {
      let aff = 0;
      for (const legend of legends) aff += coPlayLift(p.card.id, legend.id, corpus);
      total += p.usable * (1 + weight * aff);
    }
    return total;
  };
}
