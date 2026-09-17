import { describe, it, expect } from 'vitest';
import { hypergeomAtLeast } from './hypergeom';

const near = (a: number, b: number, eps = 1e-4) => Math.abs(a - b) < eps;

describe('hypergeomAtLeast', () => {
  it('1 Kopie in 40, 6 gezogen → 6/40 = 0.15', () => {
    expect(near(hypergeomAtLeast(40, 1, 6, 1), 0.15)).toBe(true);
  });

  it('3 Kopien in 40, 6 gezogen, ≥1 → ~0.3944 (1 − C(37,6)/C(40,6))', () => {
    expect(near(hypergeomAtLeast(40, 3, 6, 1), 0.394331)).toBe(true);
  });

  it('monoton: mehr Kopien → höhere Chance', () => {
    const p1 = hypergeomAtLeast(40, 1, 6, 1);
    const p2 = hypergeomAtLeast(40, 2, 6, 1);
    const p3 = hypergeomAtLeast(40, 3, 6, 1);
    expect(p1 < p2 && p2 < p3).toBe(true);
  });

  it('≥2 ist seltener als ≥1', () => {
    expect(hypergeomAtLeast(40, 3, 6, 2) < hypergeomAtLeast(40, 3, 6, 1)).toBe(true);
  });

  it('Randfälle: 0 Treffer → 0, atLeast 0 → 1, alle gezogen → 1', () => {
    expect(hypergeomAtLeast(40, 0, 6, 1)).toBe(0);
    expect(hypergeomAtLeast(40, 3, 6, 0)).toBe(1);
    expect(near(hypergeomAtLeast(40, 3, 40, 1), 1)).toBe(true);
    expect(hypergeomAtLeast(40, 3, 6, 4)).toBe(0); // mehr als vorhanden
  });
});
