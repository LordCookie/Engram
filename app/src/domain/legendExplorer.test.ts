import { describe, it, expect } from 'vitest';
import { buildCorpus, countTrios, corpusFromIngest, sumCounts, trioKey } from './coplay';
import { legendPartners, legendPopularity, legendTopCards, legendTrios } from './legendExplorer';

// Vier Decks: L1 in allen, L2 in drei, L3 in zwei, L4 in einem.
const decks = [
  { legendIds: ['L1', 'L2', 'L3'], cards: ['a', 'b'] },
  { legendIds: ['L1', 'L2', 'L3'], cards: ['a'] },
  { legendIds: ['L1', 'L2', 'L4'], cards: ['a', 'c'] },
  { legendIds: ['L1', 'L5', 'L6'], cards: ['c'] },
];
const corpus = buildCorpus(decks.map((d) => ({ cards: [...d.legendIds, ...d.cards] })));
const trios = countTrios(decks);
const LEGENDS = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7'];

describe('Legend-Explorer', () => {
  it('Verbreitung: meistgespielt zuerst, Anteil am Korpus', () => {
    const pop = legendPopularity(corpus, LEGENDS);
    expect(pop[0]).toEqual({ id: 'L1', decks: 4, share: 1 });
    expect(pop[1]).toEqual({ id: 'L2', decks: 3, share: 0.75 });
    expect(pop.at(-1)).toEqual({ id: 'L7', decks: 0, share: 0 });
  });

  it('Partner: nach gemeinsamen Decks, Anteil an den eigenen Decks', () => {
    const p = legendPartners('L2', corpus, LEGENDS);
    expect(p.map((x) => x.id)).toEqual(['L1', 'L3', 'L4']);
    expect(p[0]).toEqual({ id: 'L1', together: 3, share: 1 });
    expect(p[1].share).toBeCloseTo(2 / 3);
    expect(legendPartners('L7', corpus, LEGENDS)).toEqual([]);
  });

  it('Trios: zählen und nach Häufigkeit sortieren', () => {
    expect(trios.get(trioKey(['L3', 'L1', 'L2']))).toBe(2);
    const t = legendTrios('L1', trios, corpus);
    expect(t[0]).toEqual({ ids: ['L1', 'L2', 'L3'], decks: 2, share: 0.5 });
    expect(t).toHaveLength(3);
    expect(legendTrios('L4', trios, corpus).map((x) => x.ids)).toEqual([['L1', 'L2', 'L4']]);
  });

  it('Top-Karten: Einsatzquote + Lift, Filter und Mindestmenge', () => {
    const top = legendTopCards('L2', corpus, (id) => !id.startsWith('L'), 10, 2);
    expect(top.map((c) => c.id)).toEqual(['a', 'b', 'c']);
    expect(top[0].rate).toBe(1); // a in allen 3 L2-Decks
    expect(top[0].lift).toBeCloseTo(1 / 0.75);
    expect(legendTopCards('L4', corpus, () => true, 10, 2)).toEqual([]); // zu wenig Decks
  });

  it('Trios aus dem Ingest (v2) werden gelesen und lassen sich addieren', () => {
    const r = corpusFromIngest({
      n: 2,
      cards: ['L1', 'L2', 'L3', 'a'],
      df: [2, 2, 2, 1],
      pairs: [[0, 1, 2]],
      trios: [[0, 1, 2, 2]],
    });
    expect(r.trios.get('L1|L2|L3')).toBe(2);
    expect(sumCounts(r.trios, trios).get('L1|L2|L3')).toBe(4);
    expect(corpusFromIngest({ n: 1, cards: ['a'], df: [1], pairs: [] }).trios.size).toBe(0);
  });
});
