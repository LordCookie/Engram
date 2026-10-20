import type { Card, CardIndex, CollectionEntry, Printing } from './types';
import { t, tk } from '../i18n';

/**
 * Sammlung als CSV (für Tabellen/Sheets und zum Weitergeben beim Tauschen).
 * Reine Funktion, RFC-4180-konform (Felder mit , " oder Zeilenumbruch werden
 * gequotet, " verdoppelt). Sortiert nach Farbe, dann Name — deterministisch.
 */
function csvCell(s: string): string {
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** Spaltenköpfe (in der Oberflächensprache ausgegeben). */
export const CSV_HEADER = [
  tk('Anzahl'),
  tk('Name'),
  tk('Untertitel'),
  tk('Farbe'),
  tk('Nummer'),
  tk('Typ'),
  tk('Rarität'),
];

export function collectionToCsv(
  entries: readonly CollectionEntry[],
  printingIndex: ReadonlyMap<string, Printing>,
  cardIndex: CardIndex,
): string {
  const rows = entries
    .map((e) => {
      const cardId = printingIndex.get(e.printingId)?.cardId ?? e.printingId;
      const c = cardIndex.get(cardId);
      return c && e.quantity > 0 ? { c, qty: e.quantity } : undefined;
    })
    .filter((x): x is { c: Card; qty: number } => x !== undefined)
    .sort((a, b) => a.c.color.localeCompare(b.c.color) || a.c.name.localeCompare(b.c.name));

  const lines = [CSV_HEADER.map((h) => t(h)).join(',')];
  for (const { c, qty } of rows) {
    lines.push(
      [
        String(qty),
        c.name,
        c.subtitle ?? '',
        c.color,
        c.collectorNumber ?? '',
        c.type,
        c.rarity,
      ]
        .map(csvCell)
        .join(','),
    );
  }
  return lines.join('\r\n') + '\r\n';
}
