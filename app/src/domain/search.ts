import type { Card, CardType, Color } from './types';

/**
 * Kartensuche (PLAN.md § 5, Aufgabe 4) — reine Funktion, damit die
 * Schnellerfassung sofort reagiert. Volltext über Name und Subtitle, optionale
 * Filter. Bei ein paar hundert Karten ist das trivial unter 50 ms.
 */

export interface CardFilters {
  colors?: readonly Color[];
  types?: readonly CardType[];
}

export interface SearchOptions {
  filters?: CardFilters;
  limit?: number;
}

function passesFilters(card: Card, filters?: CardFilters): boolean {
  if (filters?.colors && filters.colors.length > 0 && !filters.colors.includes(card.color)) {
    return false;
  }
  if (filters?.types && filters.types.length > 0 && !filters.types.includes(card.type)) {
    return false;
  }
  return true;
}

/** Führende Nullen für einen toleranten Nummernvergleich entfernen ("005" ~ "5"). */
function normalizeNumber(s: string): string {
  return s.replace(/^0+/, '') || '0';
}

/**
 * Treffer über die Sammlernummer (PLAN.md § 5 / Nutzerwunsch): exakt oder Präfix,
 * führende Nullen tolerant. Rang 0 = exakt, 1 = Präfix.
 */
function numberRank(card: Card, q: string): number {
  const cn = card.collectorNumber?.toLowerCase();
  if (!cn) return -1;
  if (cn === q || normalizeNumber(cn) === normalizeNumber(q)) return 0;
  if (cn.startsWith(q) || normalizeNumber(cn).startsWith(normalizeNumber(q))) return 1;
  return -1;
}

/**
 * Relevanz-Rang (kleiner = besser): Namens-Präfix und exakte Nummer ganz oben,
 * dann Nummern-Präfix, Namens-Teiltreffer, Subtitle. Nicht-Treffer = -1.
 */
function matchRank(card: Card, q: string): number {
  const name = card.name.toLowerCase();
  const subtitle = card.subtitle?.toLowerCase() ?? '';
  const num = numberRank(card, q);
  const ranks: number[] = [];
  if (name.startsWith(q)) ranks.push(0);
  if (num === 0) ranks.push(0);
  if (num === 1) ranks.push(1);
  if (name.includes(q)) ranks.push(2);
  if (subtitle.includes(q)) ranks.push(3);
  return ranks.length > 0 ? Math.min(...ranks) : -1;
}

export function searchCards(
  catalog: readonly Card[],
  query: string,
  options: SearchOptions = {},
): Card[] {
  const { filters, limit = 8 } = options;
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];

  const scored: { card: Card; rank: number }[] = [];
  for (const card of catalog) {
    if (!passesFilters(card, filters)) continue;
    const rank = matchRank(card, q);
    if (rank < 0) continue;
    scored.push({ card, rank });
  }

  scored.sort((a, b) => {
    if (a.rank !== b.rank) return a.rank - b.rank;
    return a.card.name.toLowerCase() < b.card.name.toLowerCase() ? -1 : 1;
  });

  return scored.slice(0, limit).map((s) => s.card);
}
