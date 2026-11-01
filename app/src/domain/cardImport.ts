import type { Card, CardType, Color } from './types';

/**
 * Neue Karten direkt von der NetDeck-API übernehmen (Knopf „Daten aktualisieren"), ohne
 * neue APK. Dieselbe Normalisierung wie `pipeline/fetch_cards.py` (`normalize_card`,
 * `normalize_printing`) — beide müssen gleich bleiben, die Tests prüfen dasselbe Beispiel.
 *
 * Bewusst **nur additiv**: bekannte Karten bleiben, wie sie mit der App kamen; neu sind
 * nur Karten, deren Slug der Katalog noch nicht kennt. Eine halbe oder kaputte
 * API-Antwort kann so nichts kaputtmachen, sie liefert höchstens weniger Neues.
 */

/** Rohes Item der Liste `api.netdeck.gg/api/cards/cyberpunk` (nur genutzte Felder). */
export interface NetdeckItem {
  slug?: string;
  name?: string;
  display_name?: string;
  subname?: string | null;
  set?: { code?: string } | null;
  rarity?: string | null;
  rules_text?: string | null;
  color?: string | null;
  card_type?: string | null;
  classifications?: string[] | null;
  keywords?: string[] | null;
  print_number?: string | null;
  ram?: number | null;
  cost?: number | null;
  power?: number | null;
  printing_id?: string | null;
}

/** Link zur offiziellen Kartendatenbank je Karte (wie `printings.json`). */
export interface CardPageLink {
  cardId: string;
  pageUrl: string;
}

const COLOR_MAP: Record<string, Color> = { red: 'RED', green: 'GREEN', blue: 'BLUE', yellow: 'YELLOW' };
const TYPE_MAP: Record<string, CardType> = { legend: 'LEGEND', unit: 'UNIT', gear: 'GEAR', program: 'PROGRAM' };

/** Rohes Item → Card. `null`, wenn Farbe oder Typ unbekannt sind (Validator braucht beides). */
export function normalizeNetdeckCard(item: NetdeckItem): Card | null {
  if (!item.slug) return null;
  const color = COLOR_MAP[(item.color ?? '').toLowerCase()];
  const type = TYPE_MAP[(item.card_type ?? '').toLowerCase()];
  if (!color || !type) return null;
  const card: Card = {
    id: item.slug,
    setCode: item.set?.code ?? '',
    name: item.name || item.display_name || item.slug,
    type,
    color,
    tags: [...(item.classifications ?? []), ...(item.keywords ?? [])],
    rarity: item.rarity ?? '',
    rulesText: item.rules_text ?? '',
  };
  if (item.subname) card.subtitle = item.subname;
  if (item.print_number) card.collectorNumber = item.print_number;
  if (item.ram != null) card.ram = item.ram;
  if (item.cost != null) card.cost = item.cost;
  if (item.power != null) card.power = item.power;
  return card;
}

export function netdeckPageLink(item: NetdeckItem): CardPageLink | null {
  if (!item.slug) return null;
  return {
    cardId: item.slug,
    pageUrl: `https://cyberpunktcg.com/cards/${item.slug}?printing=${item.printing_id ?? ''}`,
  };
}

export interface NewCards {
  cards: Card[];
  links: CardPageLink[];
  /** Neue Slugs, die wegen unbekannter Farbe/Typ nicht übernommen wurden. */
  skipped: string[];
}

/** Karten aus der API-Liste, die der Katalog noch nicht kennt (nach Slug sortiert). */
export function newCardsFromNetdeck(items: readonly NetdeckItem[], knownIds: ReadonlySet<string>): NewCards {
  const cards: Card[] = [];
  const links: CardPageLink[] = [];
  const skipped: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item.slug || knownIds.has(item.slug) || seen.has(item.slug)) continue;
    seen.add(item.slug);
    const card = normalizeNetdeckCard(item);
    if (!card) {
      skipped.push(item.slug);
      continue;
    }
    cards.push(card);
    const link = netdeckPageLink(item);
    if (link) links.push(link);
  }
  cards.sort((a, b) => a.id.localeCompare(b.id));
  return { cards, links, skipped };
}
