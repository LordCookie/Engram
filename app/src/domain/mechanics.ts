import type { CardFeatures, FeatureDB } from './synergy';

/**
 * Mechanik-/Tag-Suche: Karten nach ihren Synergie-Merkmalen finden (Removal,
 * Gig-Klau, ARASAKA, GO_SOLO …). Quelle sind die kuratierten `features.json`
 * (`provides`/`payoffFor`/`themes`/`tags`/`tagPayoff`). Rein/getestet.
 */
function tokensOf(f: CardFeatures): string[] {
  return [...f.provides, ...f.payoffFor, ...f.themes, ...f.tags, ...f.tagPayoff];
}

/** Alle vorkommenden Mechanik-Tokens, alphabetisch, eindeutig. */
export function allMechanics(db: FeatureDB): string[] {
  const s = new Set<string>();
  for (const f of db.values()) for (const t of tokensOf(f)) s.add(t);
  return [...s].sort();
}

/** Karten-IDs, deren Merkmale das Token enthalten (in irgendeinem Feld). */
export function cardsWithMechanic(db: FeatureDB, token: string): string[] {
  const out: string[] = [];
  for (const [id, f] of db) if (tokensOf(f).includes(token)) out.push(id);
  return out;
}

/** GO_SOLO → „Go Solo" (nur Anzeige; die Suche läuft über das Roh-Token). */
export function prettyMechanic(token: string): string {
  return token
    .split('_')
    .map((w) => (w ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ');
}
