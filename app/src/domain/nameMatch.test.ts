import { describe, it, expect } from 'vitest';
import { normalizeName, foldOcr, fuzzySubstringDistance, matchCardName } from './nameMatch';

describe('normalizeName', () => {
  it('vereinheitlicht auf A–Z/0–9 in Großbuchstaben', () => {
    expect(normalizeName('Maxtac Heavy')).toBe('MAXTACHEAVY');
    expect(normalizeName("V — Corporate Exile")).toBe('VCORPORATEEXILE');
  });
});

describe('foldOcr', () => {
  it('faltet häufige OCR-Verwechsler (0/O, 1/I, 5/S, 8/B)', () => {
    expect(foldOcr('R0GUE')).toBe('ROGUE');
    expect(foldOcr('AMEND1ARE5')).toBe('AMENDIARES');
    expect(foldOcr('8LACK')).toBe('BLACK');
    expect(foldOcr('MAXTAC')).toBe('MAXTAC'); // ohne Verwechsler unverändert
  });
});

describe('fuzzySubstringDistance', () => {
  it('findet ein Muster als Teilstring (Distanz 0)', () => {
    expect(fuzzySubstringDistance('HEAVY', 'MAXTACHEAVYNCPD')).toBe(0);
  });
  it('verzeiht einzelne falsche Zeichen', () => {
    expect(fuzzySubstringDistance('MAXTACHEAVY', '07MAXTAGHEAVV08')).toBe(2);
  });
});

describe('matchCardName', () => {
  const cards = [
    { id: 'maxtac-heavy', name: 'Maxtac Heavy' },
    { id: 'maxtac-squadron', name: 'Maxtac Squadron' },
    { id: 'riding-nomad', name: 'Riding Nomad' },
    { id: 'alt-mother', name: 'Alt Cunningham', subtitle: 'Mother of Daemons' },
    { id: 'alt-soul', name: 'Alt Cunningham', subtitle: 'Soulkiller Architect' },
  ];

  it('erkennt Namen trotz Ziffer-für-Buchstabe-Verlesern (0/O, 1/I, 5/S)', () => {
    const rogue = [
      { id: 'rogue-amendiares', name: 'Rogue Amendiares' },
      { id: 'riding-nomad', name: 'Riding Nomad' },
    ];
    // OCR liest O→0, I→1, S→5 in der stilisierten Schrift.
    const top = matchCardName('R0GUE AMEND1ARE5', rogue, 2);
    expect(top[0].cardId).toBe('rogue-amendiares');
    expect(top[0].score).toBeGreaterThan(0.85);
  });

  it('erkennt den Namen trotz OCR-Rauschen als Top-Treffer', () => {
    const top = matchCardName('07 MAXTAG HEAVV NCPD Play this Unit 08', cards, 3);
    expect(top[0].cardId).toBe('maxtac-heavy');
    expect(top[0].score).toBeGreaterThan(0.7);
    // Der ähnliche Name „Maxtac Squadron" darf nicht davor liegen.
    expect(top[0].score).toBeGreaterThan(top[1].score);
  });

  it('nutzt den Untertitel zur Unterscheidung gleicher Namen', () => {
    const top = matchCardName('ALT CUNNINGHAM SOULKILLER ARCHITECT', cards, 2);
    expect(top[0].cardId).toBe('alt-soul');
  });

  it('gibt bei leerem Text nichts zurück', () => {
    expect(matchCardName('', cards)).toEqual([]);
  });

  it('nutzt die Sammlernummer als Entscheider bei gleichem Namen', () => {
    const vs = [
      { id: 'v-streetkid', name: 'V', subtitle: 'Streetkid', collectorNumber: '005a' },
      { id: 'v-exile', name: 'V', subtitle: 'Corporate Exile', collectorNumber: '012' },
      { id: 'v-roamer', name: 'V', subtitle: 'Roamer of the Badlands', collectorNumber: '020' },
    ];
    const top = matchCardName('V 012', vs, 3); // nur „V" + Nummer lesbar
    expect(top[0].cardId).toBe('v-exile');
    expect(top[0].numberHit).toBe(true);
  });

  it('lässt eine verlesene Nummer keinen klaren Namens-Volltreffer überschreiben', () => {
    const fam = [
      { id: 'maxtac-heavy', name: 'Maxtac Heavy', collectorNumber: '081' },
      { id: 'maxtac-av', name: 'Maxtac AV', collectorNumber: '080' },
    ];
    // Name eindeutig „MAXTAC HEAVY", aber Nummer als „080" (AV) verlesen.
    const top = matchCardName('MAXTAC HEAVY 080', fam, 2);
    expect(top[0].cardId).toBe('maxtac-heavy');
  });

  it('lässt einbuchstabige Namen („V") nicht durch das „V" in HEAVY gewinnen', () => {
    const withShort = [
      ...cards,
      { id: 'v-streetkid', name: 'V', subtitle: 'Streetkid' },
      { id: 'v-exile', name: 'V', subtitle: 'Corporate Exile' },
    ];
    // Echtes OCR-Ergebnis vom Handy-Test.
    const top = matchCardName('07 MAXTAC HEAVY 1 S 2 R 1 6S 08', withShort, 5);
    expect(top[0].cardId).toBe('maxtac-heavy');
    expect(top[0].score).toBeGreaterThan(0.85);
    // Die „V"-Karten dürfen nicht als sichere Treffer erscheinen.
    const vScore = top.find((t) => t.cardId.startsWith('v-'))?.score ?? 0;
    expect(vScore).toBeLessThan(0.5);
  });
});
