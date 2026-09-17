/**
 * Minimaler Versionsvergleich für den Update-Hinweis (GitHub-Release-Tag vs.
 * gebaute App-Version). Akzeptiert „v0.1.8" wie „0.1.8". Rein/getestet.
 */
export function parseVersion(v: string): number[] {
  return v
    .trim()
    .replace(/^v/i, '')
    .split('.')
    .map((x) => parseInt(x, 10) || 0);
}

/** −1 wenn a < b, 0 wenn gleich, 1 wenn a > b (feldweise numerisch). */
export function compareVersions(a: string, b: string): number {
  const pa = parseVersion(a);
  const pb = parseVersion(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isNewer(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0;
}
