import { describe, it, expect } from 'vitest';
import { compareVersions, isNewer, parseVersion } from './semver';

describe('semver', () => {
  it('parst mit/ohne v-Präfix', () => {
    expect(parseVersion('v0.1.8')).toEqual([0, 1, 8]);
    expect(parseVersion('0.1.8')).toEqual([0, 1, 8]);
  });

  it('vergleicht feldweise numerisch', () => {
    expect(compareVersions('0.1.8', '0.1.7')).toBe(1);
    expect(compareVersions('0.1.7', '0.1.8')).toBe(-1);
    expect(compareVersions('0.1.8', '0.1.8')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1); // nicht lexikografisch (9 > 2 wäre falsch)
    expect(compareVersions('v0.1.10', 'v0.1.9')).toBe(1); // 10 > 9 numerisch
  });

  it('isNewer nur bei echt höherer Version', () => {
    expect(isNewer('v0.1.9', '0.1.8')).toBe(true);
    expect(isNewer('v0.1.8', '0.1.8')).toBe(false);
    expect(isNewer('v0.1.7', '0.1.8')).toBe(false);
  });
});
