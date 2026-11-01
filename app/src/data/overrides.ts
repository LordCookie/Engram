import type { Card } from '../domain/types';
import type { CardPageLink } from '../domain/cardImport';
import type { DataBundle } from '../domain/dataBundle';

/**
 * Nachgeladene Daten (Knopf „Daten aktualisieren"), die die mitgelieferten ergänzen:
 * neue Karten von NetDeck und das Datenpaket (Korpus + Meta-Decks) aus dem GitHub-Release
 * „data". `initDataOverrides` (data/dataStore.ts) füllt sie aus Dexie, BEVOR die App
 * geladen wird (`main.tsx`) — Katalog, Korpus und Meta-Decks werden beim Laden einmal
 * gebaut und lesen dann von hier. Nach einem neuen Download lädt die App neu.
 *
 * Bewusst ohne Abhängigkeiten (auch nicht `catalog`), damit nichts zu früh ausgewertet wird.
 */
let extra: { cards: Card[]; links: CardPageLink[] } = { cards: [], links: [] };
let bundle: DataBundle | null = null;

export function setOverrides(next: { cards?: Card[]; links?: CardPageLink[]; bundle?: DataBundle | null }): void {
  extra = { cards: next.cards ?? [], links: next.links ?? [] };
  bundle = next.bundle ?? null;
}

export const extraCards = (): readonly Card[] => extra.cards;
export const extraLinks = (): readonly CardPageLink[] => extra.links;
export const loadedBundle = (): DataBundle | null => bundle;
