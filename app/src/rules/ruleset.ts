import type { Color } from '../domain/types';
import rulesetV1 from './ruleset.v1.json';

/**
 * Fachliche Deckbau-Regeln (PLAN.md § 1). Kommt aus JSON, wird NIE hardcodiert.
 * Bei Regeländerungen: neue Datei anlegen, alte behalten, Decks referenzieren
 * ihre Ruleset-Version.
 */
export interface Ruleset {
  version: string;
  legendCount: number;
  legendNamesMustBeUnique: boolean;
  deckMin: number;
  deckMax: number;
  maxCopiesPerCard: number;
  colors: Color[];
  ramScope: 'perColor';
}

export const rulesetV1Loaded: Ruleset = rulesetV1 as Ruleset;

/** Registry aller bekannten Rulesets, per Version adressierbar. */
export const rulesets: Record<string, Ruleset> = {
  [rulesetV1Loaded.version]: rulesetV1Loaded,
};

export function getRuleset(version: string): Ruleset | undefined {
  return rulesets[version];
}
