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
  /** Release-Text (Markdown) — wird nach dem Update als „Was ist neu" gezeigt. */
  body?: string | null;
  assets?: { name?: string; browser_download_url?: string; size?: number; updated_at?: string }[];
}

export interface LatestRelease {
  tag: string;
  url: string;
  /** Release-Text (Markdown), falls vorhanden. */
  notes?: string;
  /** Die APK des Releases (für das Update in der App), falls angehängt. */
  apk?: { url: string; size: number; name?: string };
  /** `<apk>.sha256` im selben Release (Format von sha256sum) — ohne sie installiert die App nicht. */
  sha256Url?: string;
}

/** Nur App-Versionen („v0.4.0"), nicht etwa das laufend aktualisierte Daten-Release „data". */
const VERSION_TAG = /^v?\d+\.\d+(\.\d+)?$/i;

/**
 * Höchste veröffentlichte Version aus der Release-Liste. Pre-Releases zählen mit —
 * engram veröffentlicht seine APKs als Pre-Release, und GitHubs `releases/latest`
 * überspringt die (daher erschien der Update-Hinweis nie). Entwürfe zählen nicht.
 */
export function pickLatestRelease(releases: readonly ReleaseInfo[]): LatestRelease | null {
  let best: { r: ReleaseInfo; tag: string; url: string } | null = null;
  for (const r of releases) {
    if (r.draft || !r.tag_name || !r.html_url || !VERSION_TAG.test(r.tag_name)) continue;
    if (!best || compareVersions(r.tag_name, best.tag) > 0) best = { r, tag: r.tag_name, url: r.html_url };
  }
  if (!best) return null;
  // Seit v0.5 heißt die APK `engram-X.Y.Z.apk` (daneben `.sha256`); ältere Releases: irgendeine `.apk`.
  const assets = (best.r.assets ?? []).filter((x) => x.browser_download_url);
  const version = best.tag.replace(/^v/i, '');
  const a =
    assets.find((x) => x.name === `engram-${version}.apk`) ??
    assets.find((x) => x.name?.toLowerCase().endsWith('.apk'));
  const sha = a?.name ? assets.find((x) => x.name === `${a.name}.sha256`) : undefined;
  return {
    tag: best.tag,
    url: best.url,
    notes: (best.r.body ?? '').trim() || undefined,
    apk: a?.browser_download_url ? { url: a.browser_download_url, size: a.size ?? 0, name: a.name } : undefined,
    sha256Url: sha?.browser_download_url,
  };
}

/** Inhalt einer `.sha256`-Datei (Format von sha256sum) → 64 Hex-Zeichen, klein; sonst null. */
export function parseSha256(text: string): string | null {
  const m = /\b([0-9a-fA-F]{64})\b/.exec(text);
  return m ? m[1].toLowerCase() : null;
}
