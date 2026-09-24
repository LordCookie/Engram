import { describe, it, expect } from 'vitest';
import {
  P_IMG,
  phashFromGray,
  packBitsMsb,
  bytesToHex,
  hexToBytes,
  hammingHex,
  buildHashIndex,
  nearestByHash,
  nearestByHashMulti,
  searchRects,
} from './imageHash';

// Paritäts-Vektor: dieselben Graustufen + erwarteten Hashes stehen in
// pipeline/test_hash_images.py. Weicht einer ab, matcht in der App kein Scan mehr.
const N = P_IMG;
const grid = (f: (x: number, y: number) => number) => {
  const out = new Float64Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) out[y * N + x] = f(x, y);
  return out;
};
const PARITY_A = grid((x, y) => (x * 7 + y * 13 + ((x * y) % 17)) % 256);
const PARITY_B = grid((x, y) => ((x - 16) ** 2 + (y - 10) ** 2) % 200);
const EXPECT_A = '8803b23584d8375d6c87e16a2d775b3ef8424bdc56fa7c1152a755ba7b245c0a';
const EXPECT_B = 'e15f65779fa89fa8d7ea28819a81d7a02855de8765f59a006787a80197ea605f';

/** 256-Bit-Hash mit den ersten `k` Bits gesetzt → Hamming-Distanz k zur Null-Query. */
const hashWithBits = (k: number) => packBitsMsb(Array.from({ length: 256 }, (_, i) => (i < k ? 1 : 0)));
const ZERO = hashWithBits(0);

describe('pHash (bit-identisch zur Pipeline)', () => {
  it('Paritäts-Vektoren', () => {
    expect(phashFromGray(PARITY_A)).toBe(EXPECT_A);
    expect(phashFromGray(PARITY_B)).toBe(EXPECT_B);
  });

  it('robust gegen Helligkeit', () => {
    const brighter = PARITY_A.map((v) => Math.min(255, v * 1.1 + 12));
    expect(hammingHex(EXPECT_A, phashFromGray(brighter))).toBeLessThanOrEqual(16);
  });

  it('packBitsMsb packt MSB zuerst', () => {
    expect(packBitsMsb([1, 0, 0, 0, 0, 0, 0, 0])).toBe('80');
    expect(packBitsMsb([1, 0, 1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1])).toBe('aa01');
  });

  it('Hex-Round-Trip und Hamming', () => {
    expect(bytesToHex(hexToBytes(EXPECT_A))).toBe(EXPECT_A);
    expect(hammingHex('00ff', 'ffff')).toBe(8);
  });
});

describe('Ausschnitt-Suche (gegen Versatz)', () => {
  it('27 verschobene/skalierte Ausschnitte + 9 gedrehte, wenn alles ins Bild passt', () => {
    const rects = searchRects(100, 100, 200, 280, 1000, 1000);
    expect(rects).toHaveLength(36);
    expect(rects.filter((r) => r.rot)).toHaveLength(9);
    expect(rects.filter((r) => r.rot).every((r) => r.w === 200)).toBe(true);
    // der unverschobene Basis-Ausschnitt ist dabei
    expect(rects).toContainEqual({ x: 100, y: 100, w: 200, h: 280, rot: false });
  });

  it('lässt Ausschnitte weg, die über den Bildrand ragen', () => {
    const rects = searchRects(0, 0, 200, 280, 200, 280); // Rahmen = ganzes Bild
    expect(rects.every((r) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= 200.5 && r.y + r.h <= 280.5)).toBe(true);
    // nur verkleinerte (0.95) bleiben komplett drin — plus der exakte Basis-Ausschnitt
    expect(rects.some((r) => r.w === 200 && r.x === 0 && r.y === 0)).toBe(true);
    expect(rects.some((r) => r.w > 200)).toBe(false);
  });
});

describe('Hash-Index', () => {
  const index = buildHashIndex([
    { id: 'a1', card: 'a', alt: false, h: hashWithBits(10) },
    { id: 'a2', card: 'a', alt: false, h: hashWithBits(11) }, // Nachdruck derselben Karte
    { id: 'a3', card: 'a', alt: true, h: hashWithBits(60) }, // Full-Art derselben Karte
    { id: 'b1', card: 'b', alt: false, h: hashWithBits(40) },
    { id: 'kaputt', card: 'c', alt: false, h: 'xyz' }, // falsche Länge → ignoriert
  ]);

  it('ignoriert kaputte Zeilen', () => {
    expect(index.count).toBe(4);
  });

  it('Margin zählt nur FREMDE Karten (Nachdrucke/Alt-Art derselben Karte sind keine Konkurrenz)', () => {
    expect(nearestByHash(index, ZERO)).toMatchObject({ cardId: 'a', alt: false, distance: 10, margin: 30, altMargin: 50 });
  });

  it('erkennt den Alt-Art-Druck', () => {
    expect(nearestByHash(index, hashWithBits(62))).toMatchObject({ cardId: 'a', alt: true, distance: 2 });
  });

  it('mehrere Varianten: die nächste gewinnt', () => {
    expect(nearestByHashMulti(index, [ZERO, hashWithBits(39)])).toMatchObject({ cardId: 'b', distance: 1 });
  });

  it('leerer Index / ungültige Query → null', () => {
    expect(nearestByHash(buildHashIndex([]), ZERO)).toBeNull();
    expect(nearestByHash(index, 'abc')).toBeNull();
    expect(nearestByHashMulti(index, [''])).toBeNull();
  });
});
