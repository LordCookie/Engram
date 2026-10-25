import type { CardIndex } from './types';

/**
 * Meta-Decks (Tab „Synergie" → „Meta-Decks"): starke, öffentlich besprochene Decklisten
 * mit eigener Einordnung (warum stark, Spielplan, Schwäche, Quelle). Die Daten erzeugt
 * das Dev-Werkzeug `sim/build_meta_decks.ts` (prüft jede Liste mit `validate`) nach
 * `data/metaDecks.json` — gitignored, weil es fremde Decklisten sind (§ 8: nur Slugs und
 * Stückzahlen). Hier nur das Einlesen und die Bestandsrechnung, rein und framework-frei.
 */

export interface Localized {
  de: string;
  en: string;
}

export interface LocalizedList {
  de: string[];
  en: string[];
}

export interface MetaDeck {
  id: string;
  name: Localized;
  /** Kurz-Einordnung („Gilt als stärkstes Deck"). */
  tag: Localized;
  /** Belege, warum das Deck als stark gilt. */
  evidence: LocalizedList;
  plan: LocalizedList;
  weak: Localized;
  side: Localized;
  /** Quelle (Deck-Guide). */
  source: string;
  legendIds: string[];
  cards: { cardId: string; count: number }[];
}

export interface MetaDeckSet {
  /** Stand der Recherche (ISO-Datum). */
  updated: string;
  decks: MetaDeck[];
}

export const EMPTY_META: MetaDeckSet = { updated: '', decks: [] };

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;
const str = (x: unknown): string => (typeof x === 'string' ? x : '');

function localized(x: unknown): Localized {
  if (!isObj(x)) return { de: str(x), en: str(x) };
  const de = str(x.de);
  return { de, en: str(x.en) || de };
}

function localizedList(x: unknown): LocalizedList {
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []);
  if (!isObj(x)) return { de: [], en: [] };
  const de = list(x.de);
  const en = list(x.en);
  return { de, en: en.length ? en : de };
}

/**
 * Liest `metaDecks.json`. Ein Deck mit unbekannter Karte (Katalog geändert) oder ohne
 * drei Legends fällt ganz weg — eine unvollständige Liste wäre irreführend.
 */
export function parseMetaDecks(raw: unknown, cardIndex: CardIndex): MetaDeckSet {
  if (!isObj(raw) || !Array.isArray(raw.decks)) return EMPTY_META;
  const decks: MetaDeck[] = [];
  for (const d of raw.decks) {
    if (!isObj(d) || typeof d.id !== 'string') continue;
    const legendIds = Array.isArray(d.legendIds) ? d.legendIds.filter((x): x is string => typeof x === 'string') : [];
    if (legendIds.length !== 3 || legendIds.some((id) => cardIndex.get(id)?.type !== 'LEGEND')) continue;
    const rawCards = Array.isArray(d.cards) ? d.cards : [];
    const cards: MetaDeck['cards'] = [];
    let broken = false;
    for (const c of rawCards) {
      const cardId = isObj(c) ? str(c.cardId) : '';
      const count = isObj(c) && typeof c.count === 'number' ? c.count : 0;
      const card = cardIndex.get(cardId);
      if (!card || card.type === 'LEGEND' || count < 1) {
        broken = true;
        break;
      }
      cards.push({ cardId, count });
    }
    if (broken || cards.length === 0) continue;
    decks.push({
      id: d.id,
      name: localized(d.name),
      tag: localized(d.tag),
      evidence: localizedList(d.evidence),
      plan: localizedList(d.plan),
      weak: localized(d.weak),
      side: localized(d.side),
      source: str(d.source),
      legendIds,
      cards,
    });
  }
  return { updated: str(raw.updated), decks };
}

export interface MetaDeckOwnership {
  /** Besessene Kopien, gedeckelt auf die Sollmenge (Legends je 1). */
  have: number;
  /** Kopien insgesamt (3 Legends + Deckkarten). */
  total: number;
  /** Fehlende Kopien je Karte (für die Want-Liste). */
  missing: { cardId: string; count: number }[];
}

export function metaDeckOwnership(deck: MetaDeck, owned: ReadonlyMap<string, number>): MetaDeckOwnership {
  const rows = [...deck.legendIds.map((cardId) => ({ cardId, count: 1 })), ...deck.cards];
  let have = 0;
  let total = 0;
  const missing: MetaDeckOwnership['missing'] = [];
  for (const { cardId, count } of rows) {
    const o = Math.min(owned.get(cardId) ?? 0, count);
    have += o;
    total += count;
    if (o < count) missing.push({ cardId, count });
  }
  return { have, total, missing };
}
