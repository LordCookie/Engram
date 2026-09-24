import { describe, it, expect } from 'vitest';
import { fuseScan, methodLabel, FUSE_DEFAULTS, type FuseConfig, type OcrSignal, type HashSignal } from './scanFuse';

// Feste Test-Schwellen (unabhängig vom Tuning der Defaults).
const CFG: FuseConfig = {
  hashMaxDist: 60,
  hashMinMargin: 12,
  hashAutoDist: 56,
  hashAutoMargin: 18,
  hashConfirmDist: 70,
  hashConfirmMargin: 4,
  ocrConfident: 0.85,
  ocrConfirm: 0.6,
};

const noOcr: OcrSignal = { cardId: undefined, score: 0, ambiguous: false };

describe('fuseScan', () => {
  it('Kreuz-Bestätigung: gleiche Karte aus OCR+Bild → sicher, auch wenn das Bild allein schwach ist', () => {
    const ocr: OcrSignal = { cardId: 'a', score: 0.65, ambiguous: false };
    const hash: HashSignal = { cardId: 'a', distance: 66, margin: 6 }; // > MaxDist, aber im Confirm-Gate
    const r = fuseScan(ocr, hash, CFG);
    expect(r).toMatchObject({ method: 'bild+ocr', cardId: 'a', agree: true, confident: true, showAlone: false });
  });

  it('starker Bildtreffer allein → sicher, nur Bild zeigen', () => {
    const r = fuseScan(noOcr, { cardId: 'a', distance: 40, margin: 30 }, CFG);
    expect(r).toMatchObject({ method: 'bild', confident: true, showAlone: true });
  });

  it('Bild als Kandidat, aber nicht stark → anzeigen, nicht auto', () => {
    const r = fuseScan(noOcr, { cardId: 'a', distance: 58, margin: 14 }, CFG);
    expect(r).toMatchObject({ method: 'bild', confident: false, showAlone: false });
  });

  it('OCR allein sehr sicher → auto; mehrdeutig → nicht', () => {
    expect(fuseScan({ cardId: 'b', score: 0.92, ambiguous: false }, null, CFG)).toMatchObject({
      method: 'ocr',
      confident: true,
    });
    expect(fuseScan({ cardId: 'b', score: 0.92, ambiguous: true }, null, CFG).confident).toBe(false);
  });

  it('Bild schlägt OCR bei Uneinigkeit', () => {
    const r = fuseScan({ cardId: 'b', score: 0.9, ambiguous: false }, { cardId: 'a', distance: 50, margin: 20 }, CFG);
    expect(r).toMatchObject({ method: 'bild', cardId: 'a', confident: true });
  });

  it('keine Bestätigung, wenn das Bild zu weit weg ist → fällt auf OCR', () => {
    const r = fuseScan({ cardId: 'a', score: 0.7, ambiguous: false }, { cardId: 'a', distance: 90, margin: 5 }, CFG);
    expect(r).toMatchObject({ agree: false, method: 'ocr', confident: false });
  });

  it('Nummer + passender Name → sicher, auch wenn der Name allein zu schwach wäre', () => {
    const r = fuseScan({ cardId: 'a', score: 0.65, ambiguous: false }, null, CFG, { cardId: 'a' });
    expect(r).toMatchObject({ method: 'druck', cardId: 'a', confident: true });
  });

  it('Nummer + passendes Bild → sicher', () => {
    const r = fuseScan(noOcr, { cardId: 'a', distance: 68, margin: 2 }, CFG, { cardId: 'a' });
    expect(r).toMatchObject({ method: 'druck', confident: true });
  });

  it('Nummer allein ist nicht auto-sicher', () => {
    expect(fuseScan(noOcr, null, CFG, { cardId: 'a' })).toMatchObject({ method: 'druck', confident: false });
  });

  it('widersprüchliche Nummer verdrängt keinen starken Bildtreffer', () => {
    const r = fuseScan(noOcr, { cardId: 'b', distance: 40, margin: 30 }, CFG, { cardId: 'a' });
    expect(r).toMatchObject({ method: 'bild', cardId: 'b', confident: true });
  });

  it('Nummer + Name (gleiche, verrauschte Lesung) schlagen keinen starken Bildtreffer auf eine andere Karte', () => {
    // Echter Fall: OCR-Rauschen traf die Nummer von „B", der Name war schwach plausibel;
    // das Bild zeigte klar „A" (Delamain Cab, d50/m38).
    const r = fuseScan({ cardId: 'b', score: 0.62, ambiguous: false }, { cardId: 'a', distance: 50, margin: 38 }, CFG, {
      cardId: 'b',
    });
    expect(r).toMatchObject({ method: 'bild', cardId: 'a', confident: true });
  });

  it('nichts Brauchbares → none', () => {
    const r = fuseScan(noOcr, null, CFG);
    expect(r.method).toBe('none');
    expect(r.cardId).toBeUndefined();
  });

  it('Defaults: Auto-Gate liegt innerhalb des Anzeige-Gates, Confirm ist am lockersten', () => {
    expect(FUSE_DEFAULTS.hashAutoDist).toBeLessThanOrEqual(FUSE_DEFAULTS.hashMaxDist);
    expect(FUSE_DEFAULTS.hashAutoMargin).toBeGreaterThanOrEqual(FUSE_DEFAULTS.hashMinMargin);
    expect(FUSE_DEFAULTS.hashConfirmMargin).toBeLessThanOrEqual(FUSE_DEFAULTS.hashMinMargin);
    expect(FUSE_DEFAULTS.ocrConfirm).toBeLessThan(FUSE_DEFAULTS.ocrConfident);
  });

  it('methodLabel', () => {
    expect(methodLabel('bild+ocr')).toBe('Bild + Name');
    expect(methodLabel('none')).toBe('—');
  });
});
