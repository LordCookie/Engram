import { describe, it, expect } from 'vitest';
import { buildCardIndex, type Card } from './types';
import {
  featureWeights,
  synergyBetween,
  minSlotsForRam,
  coPlayable,
  legendRamByColor,
  topSynergies,
  topCombos,
  makeSynergyScore,
  type CardFeatures,
  type FeatureDB,
} from './synergy';
import { rulesetV1Loaded } from '../rules/ruleset';
import { catalog, cardIndex } from '../data/catalog';
import { featureDB } from '../data/features';
import vocab from '../data/feature-vocab.json';

// --- Testhilfen -----------------------------------------------------------

function card(over: Partial<Card> & Pick<Card, 'id' | 'type' | 'color'>): Card {
  return { setCode: 'T', name: over.id, tags: [], rarity: 'common', rulesText: '', ...over };
}

function feat(over: Partial<CardFeatures>): CardFeatures {
  return { provides: [], payoffFor: [], themes: [], tags: [], tagPayoff: [], evidence: '', ...over };
}

// --- Gewichtung -----------------------------------------------------------

describe('featureWeights', () => {
  it('gewichtet seltene Merkmale höher als häufige', () => {
    const db: FeatureDB = new Map([
      ['a', feat({ themes: ['COMMON', 'RARE'] })],
      ['b', feat({ themes: ['COMMON'] })],
      ['c', feat({ themes: ['COMMON'] })],
    ]);
    const w = featureWeights(db);
    expect(w.get('RARE')!).toBeGreaterThan(w.get('COMMON')!);
  });
});

// --- Paar-Synergie --------------------------------------------------------

describe('synergyBetween', () => {
  const weights = new Map([
    ['PROGRAM', 2],
    ['BRAINDANCE', 3],
    ['ARASAKA', 1],
  ]);

  it('matcht provides gegen payoffFor', () => {
    const a = feat({ provides: ['PROGRAM'] });
    const b = feat({ payoffFor: ['PROGRAM'] });
    const { score, reasons } = synergyBetween(a, b, weights);
    expect(score).toBe(2);
    expect(reasons[0]).toMatchObject({ token: 'PROGRAM', kind: 'provides→payoff' });
  });

  it('matcht Themen symmetrisch und Tags gegen tagPayoff', () => {
    const a = feat({ themes: ['BRAINDANCE'], tags: ['ARASAKA'] });
    const b = feat({ themes: ['BRAINDANCE'], tagPayoff: ['ARASAKA'] });
    const { score } = synergyBetween(a, b, weights);
    expect(score).toBe(3 + 1); // Theme + tag→payoff
  });

  it('gibt 0 ohne gemeinsame Merkmale', () => {
    expect(synergyBetween(feat({ provides: ['PROGRAM'] }), feat({ themes: ['GO_SOLO'] }), weights).score).toBe(0);
  });
});

// --- RAM-Machbarkeit ------------------------------------------------------

describe('RAM-Machbarkeitsfilter', () => {
  const index = buildCardIndex([
    card({ id: 'LG1', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LG2', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'LR', type: 'LEGEND', color: 'RED', ram: 3 }),
  ]);
  const legendRam = legendRamByColor(index);

  it('minSlotsForRam findet die kleinste Slotzahl', () => {
    expect(minSlotsForRam('GREEN', 0, legendRam)).toBe(0);
    expect(minSlotsForRam('GREEN', 2, legendRam)).toBe(1);
    expect(minSlotsForRam('GREEN', 4, legendRam)).toBe(2);
    expect(minSlotsForRam('GREEN', 5, legendRam)).toBe(Infinity); // nur 2 grüne Legends (max 4)
    expect(minSlotsForRam('RED', 4, legendRam)).toBe(Infinity); // nur 1 rote Legend (max 3)
  });

  it('coPlayable: gleiche Farbe am Cap machbar, darüber nicht', () => {
    const g4 = card({ id: 'g4', type: 'UNIT', color: 'GREEN', ram: 4 });
    const g1 = card({ id: 'g1', type: 'UNIT', color: 'GREEN', ram: 1 });
    const g5 = card({ id: 'g5', type: 'UNIT', color: 'GREEN', ram: 5 });
    expect(coPlayable(g4, g1, legendRam)).toBe(true);
    expect(coPlayable(g4, g5, legendRam)).toBe(false);
  });

  it('coPlayable: zwei Farben teilen sich die 3 Slots', () => {
    const g4 = card({ id: 'g4', type: 'UNIT', color: 'GREEN', ram: 4 }); // 2 Slots
    const r3 = card({ id: 'r3', type: 'UNIT', color: 'RED', ram: 3 }); // 1 Slot
    const r4 = card({ id: 'r4', type: 'UNIT', color: 'RED', ram: 4 }); // unmöglich
    expect(coPlayable(g4, r3, legendRam)).toBe(true); // 2+1 = 3
    expect(coPlayable(g4, r4, legendRam)).toBe(false);
  });

  it('coPlayable: mit einer Legend im Paar entfällt der Filter', () => {
    const leg = card({ id: 'LR', type: 'LEGEND', color: 'RED', ram: 3 });
    const g5 = card({ id: 'g5', type: 'UNIT', color: 'GREEN', ram: 5 });
    expect(coPlayable(leg, g5, legendRam)).toBe(true);
  });
});

// --- Top-Synergien --------------------------------------------------------

describe('topSynergies', () => {
  const index = buildCardIndex([
    card({ id: 'LG', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'a', type: 'PROGRAM', color: 'GREEN', ram: 1 }),
    card({ id: 'b', type: 'UNIT', color: 'GREEN', ram: 1 }),
    card({ id: 'c', type: 'UNIT', color: 'GREEN', ram: 1 }),
  ]);
  const db: FeatureDB = new Map([
    ['a', feat({ provides: ['PROGRAM'] })],
    ['b', feat({ payoffFor: ['PROGRAM'] })],
    ['c', feat({ themes: ['GO_SOLO'] })],
  ]);

  it('findet den passenden Partner, schließt sich selbst und Fremde aus', () => {
    const top = topSynergies('a', db, index);
    expect(top.map((p) => p.card.id)).toEqual(['b']);
  });
});

// --- Top-Combos im Set ----------------------------------------------------

describe('topCombos', () => {
  const index = buildCardIndex([
    card({ id: 'LG', type: 'LEGEND', color: 'GREEN', ram: 2 }),
    card({ id: 'a', type: 'PROGRAM', color: 'GREEN', ram: 1 }),
    card({ id: 'b', type: 'UNIT', color: 'GREEN', ram: 1 }),
    card({ id: 'c', type: 'UNIT', color: 'GREEN', ram: 1 }),
  ]);
  const db: FeatureDB = new Map([
    ['a', feat({ provides: ['PROGRAM'] })],
    ['b', feat({ payoffFor: ['PROGRAM'] })], // synergiert mit a
    ['c', feat({})], // mit niemandem
  ]);

  it('liefert die synergierenden Paare, RAM-machbar', () => {
    const combos = topCombos(db, index, 10);
    expect(combos).toHaveLength(1);
    expect(new Set([combos[0].a.id, combos[0].b.id])).toEqual(new Set(['a', 'b']));
    expect(combos[0].score).toBeGreaterThan(0);
  });
});

// --- Synergie-gewichteter Solver-Score ------------------------------------

describe('makeSynergyScore', () => {
  const L = card({ id: 'L', type: 'LEGEND', color: 'GREEN', ram: 2 });
  const A = card({ id: 'A', type: 'UNIT', color: 'GREEN', ram: 1 });
  const B = card({ id: 'B', type: 'UNIT', color: 'GREEN', ram: 1 });
  const sdb: FeatureDB = new Map([
    ['L', feat({ themes: ['T'] })],
    ['A', feat({ themes: ['T'] })], // synergiert mit L
    ['B', feat({})], // nicht
  ]);
  const noCaps = { RED: 0, GREEN: 0, BLUE: 0, YELLOW: 0 };
  const ctx = (pc: typeof A) => ({
    legends: [L],
    caps: noCaps,
    playable: [{ card: pc, owned: 1, usable: 1 }],
    ruleset: rulesetV1Loaded,
  });

  it('bewertet mit den Legends synergierende Karten höher', () => {
    const fn = makeSynergyScore(sdb, 1);
    expect(fn(ctx(A))).toBeGreaterThan(fn(ctx(B)));
    expect(fn(ctx(B))).toBe(1); // reiner Mengenwert
  });

  it('mit Gewicht 0 identisch zum Mengen-Score', () => {
    const fn = makeSynergyScore(sdb, 0);
    expect(fn(ctx(A))).toBe(1);
    expect(fn(ctx(B))).toBe(1);
  });
});

// --- Validierung der echten features.json (PLAN.md § 12 Pflicht) ----------

describe('features.json (echt)', () => {
  const stateTokens = new Set(Object.keys(vocab.state));
  const themeTokens = new Set(Object.keys(vocab.themes));
  const tagPayoffTokens = new Set(Object.keys(vocab.tagPayoff));

  it('deckt alle Katalogkarten ab', () => {
    expect(featureDB.size).toBe(catalog.length);
  });

  it('referenziert nur existierende Karten', () => {
    for (const id of featureDB.keys()) expect(cardIndex.has(id)).toBe(true);
  });

  it('nutzt nur Tokens aus dem kontrollierten Vokabular', () => {
    for (const f of featureDB.values()) {
      for (const t of [...f.provides, ...f.payoffFor]) expect(stateTokens.has(t)).toBe(true);
      for (const t of f.themes) expect(themeTokens.has(t)).toBe(true);
      for (const t of f.tagPayoff) expect(tagPayoffTokens.has(t)).toBe(true);
    }
  });

  it('jede evidence ist ein echter Teilstring des Regeltexts', () => {
    for (const [id, f] of featureDB) {
      if (!f.evidence) continue;
      const rules = cardIndex.get(id)!.rulesText;
      expect(rules.includes(f.evidence)).toBe(true);
    }
  });
});
