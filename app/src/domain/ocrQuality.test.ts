import { describe, it, expect } from 'vitest';
import { pickBestRead, ocrEffectiveScore, OCR_CONF_MIN, OCR_LOW_CONF_CAP } from './ocrQuality';
import { FUSE_DEFAULTS } from './scanFuse';

describe('pickBestRead', () => {
  it('nimmt die Lesung mit der höchsten Sicherheit', () => {
    const r = pickBestRead([
      { text: 'DELAMAlN CAB', confidence: 61 },
      { text: 'DELAMAIN CAB', confidence: 88 },
    ]);
    expect(r.text).toBe('DELAMAIN CAB');
  });

  it('ignoriert leere Lesungen, auch wenn sie „sicher" sind', () => {
    expect(pickBestRead([{ text: '   ', confidence: 95 }, { text: 'V', confidence: 40 }]).text).toBe('V');
  });

  it('liefert eine leere Lesung, wenn nichts gelesen wurde', () => {
    expect(pickBestRead([{ text: '', confidence: 90 }])).toEqual({ text: '', confidence: 0 });
    expect(pickBestRead([])).toEqual({ text: '', confidence: 0 });
  });
});

describe('ocrEffectiveScore', () => {
  it('lässt sichere Lesungen unverändert', () => {
    expect(ocrEffectiveScore(0.95, OCR_CONF_MIN)).toBe(0.95);
  });

  it('deckelt unsichere Lesungen zwischen Bestätigungs- und Auto-Schwelle', () => {
    expect(ocrEffectiveScore(0.95, OCR_CONF_MIN - 1)).toBe(OCR_LOW_CONF_CAP);
    expect(OCR_LOW_CONF_CAP).toBeLessThan(FUSE_DEFAULTS.ocrConfident); // kein OCR-allein-Auto
    expect(OCR_LOW_CONF_CAP).toBeGreaterThanOrEqual(FUSE_DEFAULTS.ocrConfirm); // bestätigt weiter
  });

  it('hebt niedrige Scores nie an', () => {
    expect(ocrEffectiveScore(0.4, 10)).toBe(0.4);
  });
});
