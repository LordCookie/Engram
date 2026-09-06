import type { Card, CardIndex } from './types';
import type { ScoreFn, ScoreContext } from './solver';
import { featureWeights, synergyBetween, type FeatureDB } from './synergy';
import { coPlayLift, type Corpus } from './coplay';

/**
 * Kombinierter Solver-Score (PLAN.md § 12 C, Abschluss): mischt die VORHERSAGE
 * (Synergie aus Kartentext, `synergy.ts`) mit der EMPIRIE (Co-Play aus echten
 * Decks, `coplay.ts`) zu einem fairen Gesamturteil.
 *
 * Das Problem: die Rohskalen sind sehr verschieden — die vorhergesagte Synergie
 * ist merkmalsgewichtet (~0–8), der empirische Lift liegt um 1 (0–N). Direkt
 * summiert würde die Vorhersage dominieren. Deshalb wird JEDE Quelle zuerst über
 * den ganzen Pool auf ihren größten beobachteten Affinitätsbeitrag normalisiert
 * (→ pro Legend-Kante in [0,1]), erst dann gemischt.
 *
 * `blend`: 1 = nur Vorhersage, 0 = nur Empirie, 0.5 = gleichgewichtig. Fehlt eine
 * Quelle (keine Merkmale bzw. leeres Korpus), wird die Mischung auf die vorhandene
 * renormalisiert — die verbleibende Quelle wird nicht künstlich abgeschwächt.
 *
 * Form wie `makeSynergyScore`/`makeCoPlayScore`:
 *   Score = Σ_Karte nutzbar × (1 + gewicht × mischung).
 * Mit Gewicht 0 identisch zum reinen Mengen-Score.
 */
export interface CombinedOptions {
  /** Menge ↔ Synergie (wie bei den Einzel-Scores). Default 1. */
  weight?: number;
  /** Vorhersage ↔ Empirie: 1 nur Vorhersage, 0 nur Empirie, 0.5 gleich. Default 0.5. */
  blend?: number;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function makeCombinedScore(
  db: FeatureDB,
  corpus: Corpus,
  cardIndex: CardIndex,
  options: CombinedOptions = {},
): ScoreFn {
  const weight = options.weight ?? 1;
  const blend = clamp01(options.blend ?? 0.5);
  const weights = featureWeights(db);

  const legends: Card[] = [];
  const nonLegends: Card[] = [];
  for (const c of cardIndex.values()) (c.type === 'LEGEND' ? legends : nonLegends).push(c);

  // Normalisierungs-Skalen: der größte je (Karte, Legend) beobachtete Beitrag pro
  // Quelle. Einmal vorab über den ganzen Pool bestimmt (unabhängig vom Triple),
  // damit die Mischung fair und über Triples hinweg vergleichbar bleibt.
  let scaleP = 0;
  let scaleE = 0;
  for (const c of nonLegends) {
    const fc = db.get(c.id);
    for (const l of legends) {
      if (fc) {
        const fl = db.get(l.id);
        if (fl) {
          const s = synergyBetween(fc, fl, weights).score;
          if (s > scaleP) scaleP = s;
        }
      }
      const e = coPlayLift(c.id, l.id, corpus);
      if (e > scaleE) scaleE = e;
    }
  }

  // Verfügbare Quellen mischen und auf Summe 1 renormalisieren.
  let bp = blend * (scaleP > 0 ? 1 : 0);
  let be = (1 - blend) * (scaleE > 0 ? 1 : 0);
  const sum = bp + be;
  if (sum > 0) {
    bp /= sum;
    be /= sum;
  }

  return ({ legends: triple, playable }: ScoreContext): number => {
    let total = 0;
    for (const p of playable) {
      const fc = db.get(p.card.id);
      let predAff = 0;
      let empAff = 0;
      for (const l of triple) {
        if (fc && scaleP > 0) {
          const fl = db.get(l.id);
          if (fl) predAff += synergyBetween(fc, fl, weights).score / scaleP;
        }
        if (scaleE > 0) empAff += coPlayLift(p.card.id, l.id, corpus) / scaleE;
      }
      const mixed = bp * predAff + be * empAff;
      total += p.usable * (1 + weight * mixed);
    }
    return total;
  };
}
