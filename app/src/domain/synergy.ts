import type { Card, CardIndex, Color } from './types';
import type { ScoreFn, ScoreContext } from './solver';

/**
 * Deterministisches Synergie-Scoring (PLAN.md § 12, Variante A).
 *
 * Trennung Extraktion vs. Urteil: die Merkmale (features.json) kommen aus dem
 * Leseverständnis der Regeltexte; DIESER Code fällt nur das rechnerische Urteil.
 * Reine Funktionen, keine React-Abhängigkeit.
 *
 * WICHTIG (Ehrlichkeitsgebot § 12): Das ist eine VORHERSAGE aus Kartentext,
 * keine Statistik. Die UI muss das kennzeichnen.
 */

export interface CardFeatures {
  provides: string[];
  payoffFor: string[];
  themes: string[];
  tags: string[];
  tagPayoff: string[];
  evidence: string;
}

export type FeatureDB = ReadonlyMap<string, CardFeatures>;

/**
 * Gewicht je Merkmal über seine Seltenheit im Pool: ein Merkmal, das fast jede
 * Karte trägt, ist kaum ein Synergie-Signal (PLAN.md § 12).
 */
export function featureWeights(db: FeatureDB): Map<string, number> {
  const counts = new Map<string, number>();
  let n = 0;
  for (const f of db.values()) {
    n++;
    const toks = new Set<string>([
      ...f.provides,
      ...f.payoffFor,
      ...f.themes,
      ...f.tags,
      ...f.tagPayoff,
    ]);
    for (const t of toks) counts.set(t, (counts.get(t) ?? 0) + 1);
  }
  const weights = new Map<string, number>();
  for (const [t, c] of counts) weights.set(t, Math.log(1 + n / c));
  return weights;
}

export type SynergyKind =
  | 'provides→payoff'
  | 'payoff→provides'
  | 'theme'
  | 'tag→payoff'
  | 'payoff→tag';

export interface SynergyReason {
  token: string;
  kind: SynergyKind;
  weight: number;
}

function intersect(a: readonly string[], b: readonly string[]): string[] {
  const bs = new Set(b);
  return a.filter((x) => bs.has(x));
}

/** Synergie-Score zwischen zwei Karten plus die belegenden Kanten (für das „Warum"). */
export function synergyBetween(
  fa: CardFeatures,
  fb: CardFeatures,
  weights: ReadonlyMap<string, number>,
): { score: number; reasons: SynergyReason[] } {
  const reasons: SynergyReason[] = [];
  const push = (tokens: string[], kind: SynergyKind) => {
    for (const token of tokens) {
      reasons.push({ token, kind, weight: weights.get(token) ?? 1 });
    }
  };
  push(intersect(fa.provides, fb.payoffFor), 'provides→payoff');
  push(intersect(fa.payoffFor, fb.provides), 'payoff→provides');
  push(intersect(fa.themes, fb.themes), 'theme');
  push(intersect(fa.tags, fb.tagPayoff), 'tag→payoff');
  push(intersect(fa.tagPayoff, fb.tags), 'payoff→tag');
  const score = reasons.reduce((s, r) => s + r.weight, 0);
  return { score, reasons };
}

// --- RAM-Machbarkeitsfilter (PLAN.md § 12) -------------------------------

export type LegendRamByColor = Record<Color, number[]>;

/** Legend-RAM je Farbe, absteigend sortiert. */
export function legendRamByColor(cardIndex: CardIndex): LegendRamByColor {
  const by: LegendRamByColor = { RED: [], GREEN: [], BLUE: [], YELLOW: [] };
  for (const c of cardIndex.values()) {
    if (c.type === 'LEGEND') by[c.color].push(c.ram ?? 0);
  }
  for (const color of Object.keys(by) as Color[]) by[color].sort((a, b) => b - a);
  return by;
}

/** Kleinste Zahl Legend-Slots einer Farbe, um `ram` zu erreichen (∞ = unmöglich). */
export function minSlotsForRam(color: Color, ram: number, legendRam: LegendRamByColor): number {
  if (ram <= 0) return 0;
  let sum = 0;
  const list = legendRam[color];
  for (let i = 0; i < list.length && i < 3; i++) {
    sum += list[i];
    if (sum >= ram) return i + 1;
  }
  return Infinity;
}

/**
 * Sind zwei Karten in EINEM legalen Legend-Triple gemeinsam spielbar?
 * Statt C(n,3) zu enumerieren: die minimal nötigen Slots je Farbe addieren.
 * Ist eine der Karten eine Legend, entfällt der Filter (sie ist Triple-Mitglied).
 */
export function coPlayable(a: Card, b: Card, legendRam: LegendRamByColor): boolean {
  if (a.type === 'LEGEND' || b.type === 'LEGEND') return true;
  const ra = a.ram ?? 0;
  const rb = b.ram ?? 0;
  if (a.color === b.color) {
    return minSlotsForRam(a.color, Math.max(ra, rb), legendRam) <= 3;
  }
  return minSlotsForRam(a.color, ra, legendRam) + minSlotsForRam(b.color, rb, legendRam) <= 3;
}

// --- Top-Synergien einer Karte -------------------------------------------

export interface SynergyPartner {
  card: Card;
  score: number;
  reasons: SynergyReason[];
}

export function topSynergies(
  cardId: string,
  db: FeatureDB,
  cardIndex: CardIndex,
  limit = 8,
): SynergyPartner[] {
  const fa = db.get(cardId);
  const ca = cardIndex.get(cardId);
  if (!fa || !ca) return [];

  const weights = featureWeights(db);
  const legendRam = legendRamByColor(cardIndex);
  const partners: SynergyPartner[] = [];

  for (const [id, fb] of db) {
    if (id === cardId) continue;
    const cb = cardIndex.get(id);
    if (!cb) continue;
    const { score, reasons } = synergyBetween(fa, fb, weights);
    if (score <= 0) continue;
    if (!coPlayable(ca, cb, legendRam)) continue;
    partners.push({ card: cb, score, reasons });
  }

  partners.sort((a, b) => b.score - a.score || a.card.name.localeCompare(b.card.name));
  return partners.slice(0, limit);
}

// --- Top-Combos im ganzen Set ---------------------------------------------

export interface Combo {
  a: Card;
  b: Card;
  score: number;
  reasons: SynergyReason[];
}

/**
 * Die stärksten vorhergesagten Karten-Paare („Combos") über das ganze Set —
 * RAM-machbar (ein legales Legend-Triple spielt beide) und nach Synergie sortiert.
 * Bei kleinem Kartenpool das schnellste „was passt gut zusammen?" ohne erst eine
 * Karte wählen zu müssen. Vielfalt: jede Karte taucht höchstens `perCardCap`-mal auf.
 */
export function topCombos(
  db: FeatureDB,
  cardIndex: CardIndex,
  limit = 12,
  perCardCap = 3,
): Combo[] {
  const weights = featureWeights(db);
  const legendRam = legendRamByColor(cardIndex);
  const ids = [...db.keys()];
  const all: Combo[] = [];

  for (let i = 0; i < ids.length; i++) {
    const ca = cardIndex.get(ids[i]);
    const fa = db.get(ids[i]);
    if (!ca || !fa) continue;
    for (let j = i + 1; j < ids.length; j++) {
      const cb = cardIndex.get(ids[j]);
      const fb = db.get(ids[j]);
      if (!cb || !fb) continue;
      const { score, reasons } = synergyBetween(fa, fb, weights);
      if (score <= 0) continue;
      if (!coPlayable(ca, cb, legendRam)) continue;
      all.push({ a: ca, b: cb, score, reasons });
    }
  }

  all.sort((x, y) => y.score - x.score || x.a.name.localeCompare(y.a.name));

  const used = new Map<string, number>();
  const out: Combo[] = [];
  for (const c of all) {
    if (out.length >= limit) break;
    if ((used.get(c.a.id) ?? 0) >= perCardCap || (used.get(c.b.id) ?? 0) >= perCardCap) continue;
    out.push(c);
    used.set(c.a.id, (used.get(c.a.id) ?? 0) + 1);
    used.set(c.b.id, (used.get(c.b.id) ?? 0) + 1);
  }
  return out;
}

// --- Synergie-gewichteter Solver-Score (PLAN.md § 12 C) --------------------

/**
 * Baut eine `ScoreFn` für den Legend-Solver, die Triples bevorzugt, deren
 * Legends mit dem freigeschalteten Pool synergieren. Austauschbar mit dem
 * Mengen-Score (`defaultScore`) — der Andockpunkt aus § 5, Aufgabe 4.
 *
 * Score = Σ_Karte  nutzbar × (1 + synergyWeight × Synergie(Karte ↔ Legends)).
 * Ohne Synergie (Gewicht 0) identisch zum reinen Mengen-Score.
 */
export function makeSynergyScore(db: FeatureDB, synergyWeight = 1): ScoreFn {
  const weights = featureWeights(db);
  return ({ legends, playable }: ScoreContext): number => {
    let total = 0;
    for (const p of playable) {
      const fa = db.get(p.card.id);
      let syn = 0;
      if (fa) {
        for (const legend of legends) {
          const fl = db.get(legend.id);
          if (fl) syn += synergyBetween(fa, fl, weights).score;
        }
      }
      total += p.usable * (1 + synergyWeight * syn);
    }
    return total;
  };
}
