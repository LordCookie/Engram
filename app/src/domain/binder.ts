/**
 * Binder-Ansicht (virtuelle Sammelmappe): alle Karten in Set-Reihenfolge, 3×3 pro Seite,
 * besessene Karten gefüllt, fehlende als leere Fächer. Framework-frei & rein testbar.
 */
import type { Card, Color } from './types';

export const SLOTS_PER_PAGE = 9;

/** Bestand je Karte: Standard- und Alt-Art-Exemplare. */
export interface OwnedCount {
  std: number;
  alt: number;
}

export interface BinderSlot {
  card: Card;
  std: number;
  alt: number;
  owned: boolean;
}

const COLOR_ORDER: Record<Color, number> = { RED: 0, GREEN: 1, BLUE: 2, YELLOW: 3 };

/** Sammlernummer → sortierbar: „005a" = (5, "a"), fehlende Nummer ans Ende. */
export function collectorKey(n: string | undefined): [number, string] {
  const m = /^(\d+)([a-z]*)$/i.exec((n ?? '').trim());
  return m ? [parseInt(m[1], 10), m[2].toLowerCase()] : [Number.MAX_SAFE_INTEGER, n ?? ''];
}

/** Set-Reihenfolge: Sammlernummer (inkl. Buchstaben-Suffix), dann Farbe, dann ID. */
export function binderOrder(cards: readonly Card[]): Card[] {
  return [...cards].sort((a, b) => {
    const [na, sa] = collectorKey(a.collectorNumber);
    const [nb, sb] = collectorKey(b.collectorNumber);
    return (
      na - nb ||
      (sa < sb ? -1 : sa > sb ? 1 : 0) ||
      COLOR_ORDER[a.color] - COLOR_ORDER[b.color] ||
      (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
    );
  });
}

/** Fächer in Set-Reihenfolge, optional nur eine Farbe. */
export function buildBinder(
  cards: readonly Card[],
  owned: ReadonlyMap<string, OwnedCount>,
  color: Color | 'ALL' = 'ALL',
): BinderSlot[] {
  return binderOrder(cards)
    .filter((c) => color === 'ALL' || c.color === color)
    .map((card) => {
      const o = owned.get(card.id) ?? { std: 0, alt: 0 };
      return { card, std: o.std, alt: o.alt, owned: o.std + o.alt > 0 };
    });
}

/** In Seiten zu je `perPage` Fächern teilen (letzte Seite ggf. kürzer). */
export function binderPages<T>(slots: readonly T[], perPage = SLOTS_PER_PAGE): T[][] {
  const pages: T[][] = [];
  for (let i = 0; i < slots.length; i += perPage) pages.push(slots.slice(i, i + perPage));
  return pages;
}

/** Seite, auf der eine Karte liegt (−1, wenn nicht enthalten). */
export function pageOfCard(slots: readonly BinderSlot[], cardId: string, perPage = SLOTS_PER_PAGE): number {
  const i = slots.findIndex((s) => s.card.id === cardId);
  return i < 0 ? -1 : Math.floor(i / perPage);
}
