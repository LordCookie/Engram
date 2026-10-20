import type { Card, CardIndex, Color } from '../domain/types';
import type { Ruleset } from './ruleset';
import { t } from '../i18n';

/**
 * Minimale Deck-Form, die der Validator braucht — so kann auch ein Deck-Entwurf
 * (mit weniger als 3 Legends während des Bauens) geprüft werden. Das volle
 * `Deck` (§ 2) ist strukturell zuweisbar.
 */
export interface ValidatableDeck {
  legendIds: readonly string[];
  cards: readonly { cardId: string; count: number }[];
}

/**
 * Deck-Validator (PLAN.md § 1, § 5 Phase 2 Aufgabe 1).
 *
 * Reine Funktion, KEINE React-/DOM-Abhängigkeit — voll testbar und in Phase 5
 * unverändert wiederverwendbar. Jede der vier Regeln aus § 1 ist ein eigener
 * Check mit eigener, verständlicher Fehlermeldung.
 */

export type ViolationCode =
  | 'LEGEND_COUNT'
  | 'LEGEND_NOT_FOUND'
  | 'LEGEND_WRONG_TYPE'
  | 'LEGEND_NAMES_NOT_UNIQUE'
  | 'LEGEND_IN_DECK'
  | 'DECK_SIZE'
  | 'CARD_NOT_FOUND'
  | 'INVALID_COUNT'
  | 'MAX_COPIES'
  | 'RAM_LIMIT';

export interface Violation {
  code: ViolationCode;
  message: string;
  /** Betroffene Karte, falls die Verletzung einer einzelnen Karte zuzuordnen ist. */
  cardId?: string;
  /** Betroffene Farbe bei RAM-Verletzungen. */
  color?: Color;
}

export interface ValidationResult {
  ok: boolean;
  violations: Violation[];
}

/**
 * RAM-Caps je Farbe (PLAN.md § 1, Regel 4):
 *   cap(Farbe C) = Summe der RAM-Werte aller Legends mit Farbe C.
 * Eine Legend trägt RAM ausschließlich zu ihrer eigenen Farbe bei.
 * Legends ohne RAM (nullable, z. B. Rebecca — Having a Moment) tragen 0 bei.
 */
export function computeRamCaps(
  legends: readonly Card[],
  ruleset: Ruleset,
): Record<Color, number> {
  const caps = Object.fromEntries(
    ruleset.colors.map((c) => [c, 0]),
  ) as Record<Color, number>;
  for (const legend of legends) {
    caps[legend.color] = (caps[legend.color] ?? 0) + (legend.ram ?? 0);
  }
  return caps;
}

export function validate(
  deck: ValidatableDeck,
  ruleset: Ruleset,
  cardIndex: CardIndex,
): ValidationResult {
  const violations: Violation[] = [];

  // --- Regel 1: genau N Legends mit unterschiedlichen Namen ---
  const legendCards: Card[] = [];
  for (const id of deck.legendIds) {
    const card = cardIndex.get(id);
    if (!card) {
      violations.push({
        code: 'LEGEND_NOT_FOUND',
        cardId: id,
        message: t('Legend „{id}“ ist nicht im Kartenindex.', { id }),
      });
      continue;
    }
    if (card.type !== 'LEGEND') {
      violations.push({
        code: 'LEGEND_WRONG_TYPE',
        cardId: id,
        message: t('„{name}“ ist keine Legend, kann also keinen Legend-Slot füllen.', { name: card.name }),
      });
      continue;
    }
    legendCards.push(card);
  }

  if (legendCards.length !== ruleset.legendCount) {
    violations.push({
      code: 'LEGEND_COUNT',
      message: t('Ein Deck braucht genau {n} gültige Legends, gefunden wurden {found}.', {
        n: ruleset.legendCount,
        found: legendCards.length,
      }),
    });
  }

  if (ruleset.legendNamesMustBeUnique) {
    const names = legendCards.map((l) => l.name);
    if (new Set(names).size !== names.length) {
      violations.push({
        code: 'LEGEND_NAMES_NOT_UNIQUE',
        message: t('Die {n} Legends müssen unterschiedliche Namen haben.', { n: ruleset.legendCount }),
      });
    }
  }

  // --- Deck-Karten aggregieren (Legends zählen NICHT mit, § 1 Regel 2) ---
  // Mehrfach gelistete cardIds werden zusammengezählt, damit 2+2 als 4 Kopien
  // erkannt wird und nicht durch die Regel schlüpft.
  const counts = new Map<string, number>();
  for (const entry of deck.cards) {
    if (!Number.isInteger(entry.count) || entry.count <= 0) {
      violations.push({
        code: 'INVALID_COUNT',
        cardId: entry.cardId,
        message: t('Ungültige Anzahl {n} für „{id}“.', { n: entry.count, id: entry.cardId }),
      });
      continue;
    }
    counts.set(entry.cardId, (counts.get(entry.cardId) ?? 0) + entry.count);
  }

  // --- Regel 2: Deckgröße 40..50 (ohne Legends) ---
  let deckSize = 0;
  for (const n of counts.values()) deckSize += n;
  if (deckSize < ruleset.deckMin || deckSize > ruleset.deckMax) {
    violations.push({
      code: 'DECK_SIZE',
      message: t('Deckgröße {n} liegt außerhalb von {min}–{max} (Legends zählen nicht mit).', {
        n: deckSize,
        min: ruleset.deckMin,
        max: ruleset.deckMax,
      }),
    });
  }

  // --- RAM-Caps für Regel 4 ---
  const caps = computeRamCaps(legendCards, ruleset);

  // --- Regel 3 (max. Kopien) & Regel 4 (RAM-Limit pro Farbe), je Karte ---
  for (const [cardId, count] of counts) {
    const card = cardIndex.get(cardId);
    if (!card) {
      violations.push({
        code: 'CARD_NOT_FOUND',
        cardId,
        message: t('Karte „{id}“ ist nicht im Kartenindex.', { id: cardId }),
      });
      continue;
    }

    if (card.type === 'LEGEND') {
      violations.push({
        code: 'LEGEND_IN_DECK',
        cardId,
        message: t('„{name}“ ist eine Legend und gehört in den Legend-Slot, nicht ins Deck.', { name: card.name }),
      });
      continue;
    }

    // Regel 3: maximal N Kopien derselben Karte.
    if (count > ruleset.maxCopiesPerCard) {
      violations.push({
        code: 'MAX_COPIES',
        cardId,
        message: t('„{name}“: {n} Kopien, erlaubt sind höchstens {max}.', {
          name: card.name,
          n: count,
          max: ruleset.maxCopiesPerCard,
        }),
      });
    }

    // Regel 4: RAM(K) <= cap(Farbe von K).
    const ram = card.ram ?? 0;
    const cap = caps[card.color] ?? 0;
    if (ram > cap) {
      violations.push({
        code: 'RAM_LIMIT',
        cardId,
        color: card.color,
        message: t('„{name}“ (RAM {ram}, {color}) übersteigt den {color}-Cap von {cap}.', {
          name: card.name,
          ram,
          color: card.color,
          cap,
        }),
      });
    }
  }

  return { ok: violations.length === 0, violations };
}
