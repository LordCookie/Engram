/**
 * Sammler-Erfolge: Abzeichen mit Fortschritt, rein aus Sammlung + Decks abgeleitet
 * (keine eigene Buchführung außer „schon gemeldet"). Framework-frei & rein testbar.
 */
import type { OwnedCount } from './binder';
import type { Card, Color } from './types';

export interface AchievementInput {
  cards: readonly Card[];
  owned: ReadonlyMap<string, OwnedCount>;
  /** Karten, die überhaupt eine Alt-Art haben. */
  altArtCards: ReadonlySet<string>;
  deckCount: number;
  legalDeckCount: number;
  /** Playset-Größe laut Ruleset (maxCopiesPerCard). */
  maxCopies: number;
}

export interface Achievement {
  id: string;
  title: string;
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
}

const COLOR_LABEL: Record<Color, string> = { RED: 'Rot', GREEN: 'Grün', BLUE: 'Blau', YELLOW: 'Gelb' };
const COLORS: Color[] = ['RED', 'GREEN', 'BLUE', 'YELLOW'];

function make(id: string, title: string, description: string, current: number, target: number): Achievement {
  const t = Math.max(1, target);
  return { id, title, description, current: Math.min(current, t), target: t, unlocked: current >= t };
}

/** Alle Erfolge mit aktuellem Fortschritt (Reihenfolge = Anzeige-Reihenfolge). */
export function computeAchievements(inp: AchievementInput): Achievement[] {
  const { cards, owned } = inp;
  const has = (c: Card) => {
    const o = owned.get(c.id);
    return !!o && o.std + o.alt > 0;
  };
  const ownedCards = cards.filter(has);
  const unique = ownedCards.length;
  const totalCopies = cards.reduce((s, c) => {
    const o = owned.get(c.id);
    return s + (o ? o.std + o.alt : 0);
  }, 0);
  const legends = cards.filter((c) => c.type === 'LEGEND');
  const ownedLegends = legends.filter(has).length;
  const altOwned = cards.filter((c) => (owned.get(c.id)?.alt ?? 0) > 0).length;
  const bothSides = cards.filter((c) => {
    const o = owned.get(c.id);
    return !!o && o.std > 0 && o.alt > 0;
  }).length;
  const playsets = cards.filter((c) => c.type !== 'LEGEND').filter((c) => {
    const o = owned.get(c.id);
    return !!o && o.std + o.alt >= inp.maxCopies;
  }).length;
  const rarityOwned = (r: string) => ownedCards.filter((c) => c.rarity === r).length;
  const rarityTotal = (r: string) => cards.filter((c) => c.rarity === r).length;

  const list: Achievement[] = [
    make('first-card', 'Erster Chip', 'Die erste Karte in der Sammlung.', unique, 1),
    make('unique-25', 'Streetkid', '25 verschiedene Karten.', unique, 25),
    make('unique-75', 'Söldner', '75 verschiedene Karten.', unique, 75),
    make('unique-all', 'Legende von Night City', 'Das komplette Set.', unique, cards.length),
    make('copies-100', 'Stapelweise', '100 Karten insgesamt (mit Kopien).', totalCopies, 100),
    make('legends-3', 'Drei Legenden', 'Drei Legends — genug für ein Deck.', ownedLegends, 3),
    make('legends-all', 'Legendensammler', 'Alle Legends.', ownedLegends, legends.length),
    ...COLORS.map((col) => {
      const ofColor = cards.filter((c) => c.color === col);
      return make(
        `color-${col.toLowerCase()}`,
        `${COLOR_LABEL[col]} komplett`,
        `Alle Karten der Farbe ${COLOR_LABEL[col]}.`,
        ofColor.filter(has).length,
        ofColor.length,
      );
    }),
    make('playset-1', 'Playset', `Eine Karte ${inp.maxCopies}× (volles Playset).`, playsets, 1),
    make('playset-10', 'Arsenal', `Zehn Karten als volles Playset.`, playsets, 10),
    make('alt-1', 'Andere Sicht', 'Die erste Alt-Art.', altOwned, 1),
    make('alt-10', 'Kunstkenner', '10 verschiedene Alt-Arts.', altOwned, 10),
    make('both-sides', 'Zwei Gesichter', 'Standard und Alt-Art derselben Karte.', bothSides, 1),
  ];
  if (inp.altArtCards.size > 0) {
    list.push(make('alt-all', 'Galerie', 'Jede Alt-Art des Sets.', altOwned, inp.altArtCards.size));
  }
  if (rarityTotal('Secret') > 0) {
    list.push(make('secret', 'Geheimnisträger', 'Eine Secret Rare.', rarityOwned('Secret'), 1));
  }
  if (rarityTotal('Nova Rare') > 0) {
    list.push(make('nova', 'Supernova', 'Eine Nova Rare.', rarityOwned('Nova Rare'), 1));
  }
  list.push(
    make('deck-legal', 'Deckbauer', 'Ein legales Deck gebaut.', inp.legalDeckCount, 1),
    make('deck-5', 'Flotte', 'Fünf Decks angelegt.', inp.deckCount, 5),
  );
  return list;
}

/** Neu freigeschaltete Erfolge gegenüber den schon gemeldeten IDs. */
export function newlyUnlocked(list: readonly Achievement[], seen: ReadonlySet<string>): Achievement[] {
  return list.filter((a) => a.unlocked && !seen.has(a.id));
}
