/**
 * Datenmodell — Single Source of Truth (PLAN.md § 2).
 * Framework-frei: keine React-/DOM-Abhängigkeiten in diesem Modul.
 *
 * WICHTIG: Optionale Felder sind bewusst nullable. Mehrere Legends haben
 * weder Cost noch Power, mindestens eine (Rebecca — Having a Moment) auch
 * kein RAM (PLAN.md § 11.2). Das Schema muss das ab Tag eins tragen.
 */

export type Color = 'RED' | 'GREEN' | 'BLUE' | 'YELLOW';

export type CardType = 'LEGEND' | 'UNIT' | 'GEAR' | 'PROGRAM' | 'BRAINDANCE';

export interface Card {
  /** = Slug der offiziellen DB, z. B. "v-streetkid". */
  id: string;
  setCode: string;
  collectorNumber?: string;
  name: string;
  /** z. B. "Streetkid", "Ender of Legends". */
  subtitle?: string;
  type: CardType;
  color: Color;
  /** Bei Legends: bereitgestelltes RAM. NULLABLE. */
  ram?: number;
  /** NULLABLE — mehrere Legends haben keinen Cost. */
  cost?: number;
  /** NULLABLE. */
  power?: number;
  eddies?: number;
  tags: string[];
  rarity: string;
  rulesText: string;
}

/**
 * Printings sind eigene Entitäten. Die offizielle DB trennt das bereits
 * (?printing=<uuid>), also übernehmen statt neu erfinden (PLAN.md § 2, § 11.2).
 */
export interface Printing {
  /** Die printing-UUID der offiziellen DB. */
  id: string;
  cardId: string;
  variant: 'STANDARD' | 'FOIL' | 'ALT_ART' | (string & {});
  /** NUR Link nach extern, nie lokal gespeichert (PLAN.md § 8). */
  imageUrl?: string;
}

export interface CollectionEntry {
  /** Bestand wird pro Printing gezählt, nicht pro Karte. */
  printingId: string;
  quantity: number;
  addedAt: number;
  /** z. B. "display-1", "starter-heist", "scan". */
  source?: string;
}

/** Eintrag der Want-Liste (Wunschliste). Persistiert in Dexie (`wants`-Tabelle). */
export interface WantEntry {
  cardId: string;
  count: number;
  addedAt: number;
}

export interface Deck {
  id: string;
  name: string;
  rulesetVersion: string;
  legendIds: [string, string, string];
  cards: { cardId: string; count: number }[];
  notes?: string;
  updatedAt: number;
}

export interface CardHash {
  cardId: string;
  /** 64-bit perceptual hash als Hex. */
  phash: string;
  /** Welcher Art-Ausschnitt zugrunde lag. */
  cropVersion: string;
}

/** Nachschlage-Index Karte-ID → Karte, den Validator und Solver erwarten. */
export type CardIndex = ReadonlyMap<string, Card>;

export function buildCardIndex(cards: readonly Card[]): CardIndex {
  return new Map(cards.map((c) => [c.id, c]));
}
