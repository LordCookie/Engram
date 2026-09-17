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
 * Karten mit **Alt-Art** (alternative Illustration) — Slugs aus
 * `pipeline/fetch_altarts.py` (gitignored, optional). Fehlt die Datei
 * (frischer Clone/CI), ist die Menge leer und das Alt-Art-Feature bleibt aus.
 */
const altMods = import.meta.glob<{ default: string[] }>('./altArts.json', { eager: true });
const altSet = new Set<string>(Object.values(altMods)[0]?.default ?? []);

/** Suffix, das eine Alt-Art-Printing-ID von der Standard-ID (== cardId) trennt. */
export const ALT_SUFFIX = '#alt';
export const altPrintingId = (cardId: string): string => cardId + ALT_SUFFIX;
export const isAltPrintingId = (printingId: string): boolean => printingId.endsWith(ALT_SUFFIX);
export const baseCardId = (printingId: string): string =>
  isAltPrintingId(printingId) ? printingId.slice(0, -ALT_SUFFIX.length) : printingId;
/** Hat die Karte eine alternative Illustration (→ Alt-Art-Zähler im Detail)? */
export const hasAltArt = (cardId: string): boolean => altSet.has(cardId);

/**
 * Printings: STANDARD pro Karte (printingId === cardId) + je eine aggregierte
 * ALT_ART-Printing (`<cardId>#alt`) für Karten mit Alt-Art. Der Bestand wird pro
 * Printing gezählt; die Auflösung Printing→Karte läuft über `printingIndex`, sodass
 * Alt-Art-Exemplare korrekt zur jeweiligen Karte zählen (Set-Fortschritt etc.).
 */
export const printings: Printing[] = [
  ...catalog.map((c) => ({ id: c.id, cardId: c.id, variant: 'STANDARD' as const })),
  ...catalog
    .filter((c) => altSet.has(c.id))
    .map((c) => ({ id: altPrintingId(c.id), cardId: c.id, variant: 'ALT_ART' as const })),
];

export const printingIndex: ReadonlyMap<string, Printing> = new Map(
  printings.map((p) => [p.id, p]),
);
