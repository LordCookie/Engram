/**
 * Automatische Sicherungen (Muster aus ScryGlass): vor jedem App-Update und vor jedem
 * Wiederherstellen legt die App still ein Komplett-Backup im App-Speicher ab, die letzten
 * drei bleiben. Hier nur die reinen Regeln (Dateiname, Aufräumen, Wiederholung); das
 * Schreiben macht `ui/autoBackup.ts`. Rein/getestet.
 */

export const AUTO_BACKUP_KEEP = 3;
/** So lange gilt ein neuer Anlauf mit demselben Grund als „noch einmal versucht". */
export const RETRY_WINDOW_MS = 3_600_000;

export interface AutoBackupInfo {
  name: string;
  at: number;
  reason: string;
}

const PREFIX = 'engram-auto-';
const NAME_RE = /^engram-auto-(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z-([a-z0-9.-]+)\.json$/;

/** Grund als Dateinamen-Teil: klein, nur a–z, 0–9, Punkt und Bindestrich. */
export function cleanReason(reason: string): string {
  return (
    reason
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'sicherung'
  );
}

/** „engram-auto-20261127T140533Z-vor-v0.5.1.json" (UTC, sortiert zeitlich). */
export function autoBackupName(at: number, reason: string): string {
  const iso = new Date(at).toISOString(); // 2026-11-27T14:05:33.000Z
  const stamp = iso.slice(0, 19).replace(/[-:]/g, '') + 'Z';
  return `${PREFIX}${stamp}-${cleanReason(reason)}.json`;
}

export function parseAutoBackupName(name: string): AutoBackupInfo | null {
  const m = NAME_RE.exec(name);
  if (!m) return null;
  const [, y, mo, d, h, mi, s, reason] = m;
  const at = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
  return Number.isNaN(at) ? null : { name, at, reason };
}

/** Dateinamen → Sicherungen, neueste zuerst (fremde Dateien werden ignoriert). */
export function sortAutoBackups(names: readonly string[]): AutoBackupInfo[] {
  return names
    .map(parseAutoBackupName)
    .filter((b): b is AutoBackupInfo => b !== null)
    .sort((a, b) => b.at - a.at || (a.name < b.name ? 1 : -1));
}

/** Was weg kann: alles jenseits der neuesten `keep`. */
export function backupsToPrune(names: readonly string[], keep = AUTO_BACKUP_KEEP): string[] {
  return sortAutoBackups(names)
    .slice(keep)
    .map((b) => b.name);
}

/**
 * Zweiter Anlauf kurz danach (Installer abgebrochen …): nicht noch einmal sichern — sonst
 * verdrängen Kopien desselben Stands die älteren Sicherungen.
 */
export function isRepeatBackup(latest: AutoBackupInfo | undefined, reason: string, now: number): boolean {
  return !!latest && latest.reason === cleanReason(reason) && now - latest.at >= 0 && now - latest.at < RETRY_WINDOW_MS;
}
