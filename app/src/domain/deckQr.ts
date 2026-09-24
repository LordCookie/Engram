/**
 * Deck per QR-Code teilen: kompaktes, eindeutiges Textformat (Karten-Slugs statt Namen,
 * damit gleichnamige Karten nicht verwechselt werden). Reines ASCII — der Deckname wird
 * URI-kodiert, damit Umlaute jeden QR-Leser überleben. Framework-frei & rein testbar.
 *
 *   EGD1
 *   Mein%20Deck
 *   v-streetkid,jackie-welles-mama-s-favorite,…      (Legends)
 *   3*delamain-cab,2*corpo-security,…               (Anzahl*Slug)
 */
import type { ParsedDeck } from './deckText';
import type { CardIndex } from './types';

export const DECK_QR_PREFIX = 'EGD1';

export interface QrDeck {
  name: string;
  legendIds: readonly string[];
  cards: readonly { cardId: string; count: number }[];
}

export function encodeDeckQr(deck: QrDeck): string {
  const cards = deck.cards
    .filter((c) => c.count > 0)
    .map((c) => `${c.count}*${c.cardId}`)
    .join(',');
  return [DECK_QR_PREFIX, encodeURIComponent(deck.name.trim() || 'Deck'), deck.legendIds.join(','), cards].join('\n');
}

/** Sieht der Text nach einem engram-Deck-QR aus? */
export function isDeckQr(text: string): boolean {
  return text.startsWith(`${DECK_QR_PREFIX}\n`);
}

/**
 * QR-Text → importierbares Deck (gleiche Form wie der Text-Import). Unbekannte Karten
 * landen in `unresolved` (z. B. Karten aus einem neueren Set). `null`, wenn es kein
 * engram-Deck-QR ist.
 */
export function decodeDeckQr(text: string, cardIndex: CardIndex): ParsedDeck | null {
  if (!isDeckQr(text)) return null;
  const [, rawName = '', rawLegends = '', rawCards = ''] = text.replace(/\r/g, '').split('\n');
  let name = rawName;
  try {
    name = decodeURIComponent(rawName);
  } catch {
    /* kaputt kodiert → roh übernehmen */
  }
  const unresolved: string[] = [];
  const legendIds: string[] = [];
  for (const id of rawLegends.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (cardIndex.has(id)) legendIds.push(id);
    else unresolved.push(id);
  }
  const counts = new Map<string, number>();
  for (const part of rawCards.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = /^(\d{1,2})\*(.+)$/.exec(part);
    if (!m || !cardIndex.has(m[2])) {
      unresolved.push(part);
      continue;
    }
    counts.set(m[2], (counts.get(m[2]) ?? 0) + parseInt(m[1], 10));
  }
  return {
    name: name.trim() || 'Deck',
    legendIds,
    cards: [...counts].map(([cardId, count]) => ({ cardId, count })),
    unresolved,
  };
}
