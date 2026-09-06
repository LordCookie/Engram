import { buildCardIndex, type Card, type Printing } from '../domain/types';
import cardsJson from './cards.json';
import fixtureJson from '../../tests/fixtures/synthetic-set.json';

/**
 * Kartenkatalog — die einzige Stelle, die entscheidet, woher die Kartendaten
 * kommen. Solange keine echten Daten vorliegen (`cards.json` leer, Spike 0.2
 * offen), dient das synthetische Fixture als Katalog. Sobald `pipeline/fetch_cards.py`
 * echte Daten schreibt, greift automatisch `cards.json`.
 */
const real = cardsJson as Card[];
export const catalog: Card[] = real.length > 0 ? real : (fixtureJson as Card[]);

export const cardIndex = buildCardIndex(catalog);

/**
 * Platzhalter-Printing pro Karte (STANDARD, printingId === cardId), bis echte
 * Printing-UUIDs aus der offiziellen DB vorliegen (PLAN.md § 2, § 11.2).
 * Der Bestand wird pro Printing gezählt; die Auflösung Printing→Karte läuft
 * über `printingIndex`.
 */
export const printings: Printing[] = catalog.map((c) => ({
  id: c.id,
  cardId: c.id,
  variant: 'STANDARD',
}));

export const printingIndex: ReadonlyMap<string, Printing> = new Map(
  printings.map((p) => [p.id, p]),
);
