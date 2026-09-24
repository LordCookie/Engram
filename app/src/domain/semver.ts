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

/** Ausschnitt eines GitHub-Release-Objekts (`GET /repos/{repo}/releases`). */
export interface ReleaseInfo {
  tag_name?: string;
  html_url?: string;
  draft?: boolean;
}

/**
 * Höchste veröffentlichte Version aus der Release-Liste. Pre-Releases zählen mit —
 * engram veröffentlicht seine APKs als Pre-Release, und GitHubs `releases/latest`
 * überspringt die (daher erschien der Update-Hinweis nie). Entwürfe zählen nicht.
 */
export function pickLatestRelease(releases: readonly ReleaseInfo[]): { tag: string; url: string } | null {
  let best: { tag: string; url: string } | null = null;
  for (const r of releases) {
    if (r.draft || !r.tag_name || !r.html_url) continue;
    if (!best || compareVersions(r.tag_name, best.tag) > 0) best = { tag: r.tag_name, url: r.html_url };
  }
  return best;
}
