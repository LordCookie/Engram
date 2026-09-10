import type { Card, CardIndex } from './types';
import type { DeckDraft } from './deckDraft';

/**
 * Deck-Textformat (PLAN.md § 5, Aufgabe 8) — MTG-artig, damit es mit anderen
 * Tools synergiert: eine Zeile pro Karte, `N Kartenname`. Legends werden beim
 * Import am Kartentyp erkannt (keine Sektions-Pflicht). Reine Funktionen.
 *
 * Beispiel:
 *   // engram deck: Mein Deck
 *   // Legends
 *   1 V: Corporate Exile
 *   1 Viktor Vektor: Sit Down and Relax
 *   1 Jackie Welles: Pour One Out For Me
 *   // Deck (40)
 *   3 Delamain Cab
 *   3 Evelyn Parker: Scheming Siren
 */

export interface ParsedDeck {
  name?: string;
  legendIds: string[];
  cards: { cardId: string; count: number }[];
  /** Zeilen, die keiner Karte zugeordnet werden konnten. */
  unresolved: string[];
}

function displayName(c: Card): string {
  return c.subtitle ? `${c.name}: ${c.subtitle}` : c.name;
}

function normalize(s: string): string {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Baut die Namens-Suchtabelle: mehrere Schreibvarianten je Karte → cardId. */
function buildNameIndex(catalog: readonly Card[]): Map<string, string> {
  const nameCounts = new Map<string, number>();
  for (const c of catalog) {
    const n = normalize(c.name);
    nameCounts.set(n, (nameCounts.get(n) ?? 0) + 1);
  }
  const map = new Map<string, string>();
  const put = (key: string, id: string) => {
    const k = normalize(key);
    if (!map.has(k)) map.set(k, id);
  };
  for (const c of catalog) {
    if (c.subtitle) {
      put(`${c.name}: ${c.subtitle}`, c.id);
      put(`${c.name} - ${c.subtitle}`, c.id);
      put(`${c.name} — ${c.subtitle}`, c.id);
      put(`${c.name} (${c.subtitle})`, c.id);
      put(`${c.name} ${c.subtitle}`, c.id);
    }
    // Blanker Name nur, wenn er eindeutig ist (viele Karten teilen sich Namen).
    if ((nameCounts.get(normalize(c.name)) ?? 0) === 1) put(c.name, c.id);
  }
  return map;
}

export function deckToText(deck: DeckDraft, cardIndex: CardIndex): string {
  const lines: string[] = [`// engram deck: ${deck.name}`, '// Legends'];
  for (const id of deck.legendIds) {
    const c = cardIndex.get(id);
    if (c) lines.push(`1 ${displayName(c)}`);
  }

  const rows = deck.cards
    .map((e) => ({ card: cardIndex.get(e.cardId), count: e.count }))
    .filter((x): x is { card: Card; count: number } => x.card !== undefined)
    .sort(
      (a, b) =>
        a.card.color.localeCompare(b.card.color) ||
        (a.card.cost ?? 0) - (b.card.cost ?? 0) ||
        a.card.name.localeCompare(b.card.name),
    );
  const deckSize = rows.reduce((s, r) => s + r.count, 0);
  lines.push('', `// Deck (${deckSize})`);
  for (const { card, count } of rows) lines.push(`${count} ${displayName(card)}`);

  return lines.join('\n') + '\n';
}

export function parseDeckText(
  text: string,
  catalog: readonly Card[],
  cardIndex: CardIndex,
): ParsedDeck {
  const nameMap = buildNameIndex(catalog);
  const legendIds: string[] = [];
  const counts = new Map<string, number>();
  const unresolved: string[] = [];
  let name: string | undefined;

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('//') || line.startsWith('#')) {
      const m = line.match(/deck:\s*(.+)/i);
      if (m) name = m[1].trim();
      continue;
    }
    // `N Name`, `Nx Name`, `N x Name` — oder ohne Anzahl (= 1).
    let count = 1;
    let nameStr = line;
    const cm = line.match(/^(\d+)\s*[xX]?\s+(.+)$/);
    if (cm) {
      count = parseInt(cm[1], 10);
      nameStr = cm[2].trim();
      // „0 Karte" ist kaputt, nicht 0 Kopien — lieber melden als still schlucken.
      if (!Number.isFinite(count) || count < 1) {
        unresolved.push(line);
        continue;
      }
    }
    const id = nameMap.get(normalize(nameStr));
    if (!id) {
      unresolved.push(line);
      continue;
    }
    const card = cardIndex.get(id);
    if (card && card.type === 'LEGEND') {
      if (!legendIds.includes(id) && legendIds.length < 3) legendIds.push(id);
    } else {
      counts.set(id, (counts.get(id) ?? 0) + count);
    }
  }

  return {
    name,
    legendIds,
    cards: [...counts].map(([cardId, c]) => ({ cardId, count: c })),
    unresolved,
  };
}
