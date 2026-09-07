import playtestV1 from './playtest.v1.json';

/**
 * Spielparameter für den Simulationsmodus (Proberunden, PLAN.md § 5 / Roadmap).
 * Wie die Deckbau-Regeln kommen sie aus JSON, werden NIE hardcodiert.
 *
 * Quelle: offizieller „Printable Gameplay Guide" + How-to-Play (Beta):
 * - Startaufstellung: 3 Legends verdeckt, Gig-Würfel in den Fixer-Bereich,
 *   Deck mischen, **6 Karten** ziehen, **einmal** Mulligan (ohne Nachteil).
 * - Zug = Start-Phase (alles bereitstellen → 1 ziehen → 1 Würfel in den Gig-
 *   Bereich) und Main-Phase (Karten spielen, angreifen).
 * - Sieg: Zug mit genug Gigs im eigenen Bereich beginnen, oder Gegner deckt aus.
 *
 * Hinweis zur Gig-Schwelle: der transkribierte Guide nennt **7+**, ein Beta-
 * How-to nennt **6**. Da die Werte je Beta schwanken, steht die Schwelle hier
 * als Parameter (leicht änderbar) und wird im UI als „Ziel" angezeigt, nicht
 * hart erzwungen — der Gig-Zähler bleibt manuell (würfelgetrieben).
 */
export interface PlaytestRules {
  version: string;
  /** Starthandgröße. */
  openingHand: number;
  /** Karten pro Start-Phase. */
  drawPerTurn: number;
  /** Gigs (Würfel) pro Start-Phase automatisch dazu. */
  gigPerTurn: number;
  /** Gig-Zahl, ab der ein Zugbeginn das Spiel gewinnt. */
  gigWinThreshold: number;
  /** Erlaubte Mulligans. */
  mulligansAllowed: number;
}

export const playtestRulesLoaded: PlaytestRules = playtestV1 as PlaytestRules;
