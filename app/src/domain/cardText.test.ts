import { describe, it, expect } from 'vitest';
import { matchTextLines, nameSegments, isAmbiguous, type TextLine } from './cardText';
import type { NameCard } from './nameMatch';

const CARDS: NameCard[] = [
  { id: 'delamain-cab', name: 'Delamain Cab', collectorNumber: '112' },
  { id: 'v-streetkid', name: 'V', subtitle: 'Streetkid', collectorNumber: '005a' },
  { id: 'v-corpo', name: 'V', subtitle: 'Corporate Exile', collectorNumber: '006' },
  { id: 'adam-smasher-ender', name: 'Adam Smasher', subtitle: 'Ender of Legends', collectorNumber: '001' },
  { id: 'adam-smasher-metal', name: 'Adam Smasher', subtitle: 'Metal over Meat', collectorNumber: '002' },
  { id: 'corpo-security', name: 'Corpo Security', collectorNumber: '040' },
];

const line = (text: string, t: number, extra: Partial<TextLine> = {}): TextLine => ({
  text,
  l: 0.1,
  t,
  r: 0.6,
  b: t + 0.04,
  conf: 0.9,
  ...extra,
});

describe('nameSegments', () => {
  it('nimmt nur Zeilen aus den Namenszonen und bildet Paare aus dicht untereinanderliegenden', () => {
    const segs = nameSegments([
      line('04', 0.05), // Kosten: keine Buchstaben → raus
      line('V', 0.09),
      line('STREETKID', 0.14),
      line('At the end of your turn', 0.84), // Regeltext unten → keine Namenszone
    ]);
    expect(segs.map((s) => s.text)).toEqual(['V', 'STREETKID', 'V STREETKID']);
  });
});

describe('matchTextLines (Cyberpunk-Layout)', () => {
  it('Unit: Name im unteren Bilddrittel', () => {
    const r = matchTextLines(
      [
        line('04', 0.05),
        line('UNIT', 0.05, { l: 0.8, r: 0.95 }),
        line('DELAMAIN CAB', 0.67),
        line('VEHICLE', 0.77),
        line('At the end of your turn, if this Unit stole a', 0.82),
        line('Gig this turn, ready 1 Eddie.', 0.86),
      ],
      CARDS,
    );
    expect(r.candidates[0]).toMatchObject({ cardId: 'delamain-cab', score: 1 });
    expect(r.ambiguous).toBe(false);
    expect(r.confidence).toBe(90);
    expect(r.titleText).toContain('DELAMAIN CAB');
  });

  it('Legend: Name + Untertitel oben (zwei Zeilen) entscheidet zwischen gleichnamigen Karten', () => {
    const r = matchTextLines([line('V', 0.09), line('STREETKID', 0.14), line('MERC', 0.65)], CARDS);
    expect(r.candidates[0].cardId).toBe('v-streetkid');
    expect(r.ambiguous).toBe(false);
  });

  it('gleicher Name ohne lesbaren Untertitel → mehrdeutig (Bild muss entscheiden)', () => {
    const r = matchTextLines([line('ADAM SMASHER', 0.1)], CARDS);
    expect(r.candidates.slice(0, 2).map((c) => c.cardId).sort()).toEqual([
      'adam-smasher-ender',
      'adam-smasher-metal',
    ]);
    expect(r.ambiguous).toBe(true);
  });

  it('OCR-Verwechsler werden verziehen (0/O, 1/I)', () => {
    const r = matchTextLines([line('C0RP0 SECUR1TY', 0.66)], CARDS);
    expect(r.candidates[0].cardId).toBe('corpo-security');
  });

  it('die Sicherheit stammt aus der Zeile, die den Treffer geliefert hat', () => {
    const r = matchTextLines([line('DELAMAIN CAB', 0.67, { conf: 0.4 }), line('VEHICLE', 0.77)], CARDS);
    expect(r.candidates[0].cardId).toBe('delamain-cab');
    expect(r.confidence).toBe(40);
  });

  it('fehlende Sicherheit (ML Kit liefert 0) deckelt nicht', () => {
    const r = matchTextLines([line('DELAMAIN CAB', 0.67, { conf: 0 })], CARDS);
    expect(r.confidence).toBe(100);
  });

  it('keine Zeilen → keine Kandidaten', () => {
    const r = matchTextLines([], CARDS);
    expect(r.candidates).toEqual([]);
    expect(r.confidence).toBe(0);
  });
});

describe('isAmbiguous', () => {
  it('gelesene Nummer löst Gleichstand auf', () => {
    expect(
      isAmbiguous([
        { cardId: 'a', score: 1, nameScore: 0.5, matched: 12, numberHit: true },
        { cardId: 'b', score: 1, nameScore: 1, matched: 12, numberHit: false },
      ]),
    ).toBe(false);
  });

  it('klar mehr getroffener Text (Untertitel) löst Gleichstand auf', () => {
    expect(
      isAmbiguous([
        { cardId: 'a', score: 1, nameScore: 1, matched: 25, numberHit: false },
        { cardId: 'b', score: 1, nameScore: 1, matched: 11, numberHit: false },
      ]),
    ).toBe(false);
  });
});
