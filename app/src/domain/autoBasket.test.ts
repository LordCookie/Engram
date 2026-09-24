import { describe, it, expect } from 'vitest';
import {
  observeFrame,
  mayAutoAdd,
  afterAutoAdd,
  AUTO_BASKET_START,
  AUTO_BASKET_CHANGE_FRAMES,
  type AutoBasketState,
} from './autoBasket';

const card = { blurry: false, hasCard: true };
const blur = { blurry: true, hasCard: false };
const empty = { blurry: false, hasCard: false };
const feed = (s: AutoBasketState, frames: { blurry: boolean; hasCard: boolean }[], need?: number) =>
  frames.reduce((acc, f) => observeFrame(acc, f, need), s);

describe('Auto-Korb mit Kartenwechsel-Erkennung', () => {
  it('am Anfang darf jede Karte', () => {
    expect(mayAutoAdd(AUTO_BASKET_START, 'a')).toBe(true);
  });

  it('dieselbe liegende Karte kommt nicht doppelt', () => {
    expect(mayAutoAdd(feed(afterAutoAdd('a'), [card, card, card, card, card]), 'a')).toBe(false);
  });

  it('eine andere Karte darf sofort (auch Standard ↔ Alt-Art)', () => {
    expect(mayAutoAdd(afterAutoAdd('a'), 'b')).toBe(true);
    expect(mayAutoAdd(afterAutoAdd('a'), 'a#alt')).toBe(true);
  });

  it('Stapel mit gleichen Karten: nach Hand/Unschärfe darf dieselbe Karte wieder', () => {
    const s = feed(afterAutoAdd('a'), [card, blur, blur, empty, card]);
    expect(s.changed).toBe(true);
    expect(mayAutoAdd(s, 'a')).toBe(true);
  });

  it('ein kurzes Fokus-Nachstellen (1–2 unscharfe Bilder) reicht nicht', () => {
    expect(mayAutoAdd(feed(afterAutoAdd('a'), [card, blur, blur, card, card]), 'a')).toBe(false);
  });

  it('die Wechsel-Bilder müssen am Stück kommen', () => {
    const frames = Array.from({ length: AUTO_BASKET_CHANGE_FRAMES * 2 }, (_, i) => (i % 2 ? card : blur));
    expect(mayAutoAdd(feed(afterAutoAdd('a'), frames), 'a')).toBe(false);
  });

  it('ein erkannter Wechsel bleibt bestehen, bis wieder übernommen wird', () => {
    const s = feed(afterAutoAdd('a'), [empty, empty, empty, card, card, card]);
    expect(mayAutoAdd(s, 'a')).toBe(true);
    expect(mayAutoAdd(afterAutoAdd('a'), 'a')).toBe(false);
  });

  it('Web-Pfad (need = 1): ein einziges Wechsel-Bild genügt', () => {
    expect(mayAutoAdd(feed(afterAutoAdd('a'), [empty, card], 1), 'a')).toBe(true);
  });
});
