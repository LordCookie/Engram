import { Capacitor } from '@capacitor/core';
import { readBackupData, restoreBackup, setLastBackupAt } from '../db/db';
import { parseCollection, serializeCollection, type ParsedBackup } from '../domain/collectionIo';
import { isLang, t, tn } from '../i18n';
import { hasIconSwitch, setAppIcon } from '../native/engramIcon';
import { setVibration } from '../native/feedback';
import { quietAchievements } from './achievementsQuiet';
import { changeLang } from './lang';
import { applyTheme, isThemeName } from './theme';

/**
 * Komplett-Backup (Format v3) für Backup-Panel und Erinnerungs-Banner: Datei bauen,
 * teilen/speichern, Zeitpunkt merken; Wiederherstellen inkl. sofortigem Anwenden
 * der Einstellungen (Theme, Sprache, Vibration, App-Icon).
 */

export type ShareResult = 'shared' | 'downloaded' | 'canceled';

/**
 * Teilt eine Datei (native Share-Sheet bzw. Web-Share) oder lädt sie herunter.
 * Der Blob-Download alleine ist im nativen WebView unzuverlässig, daher nativ die
 * Capacitor-Plugins (per dynamischem Import).
 */
export async function shareOrDownload(content: string, name: string, mime: string): Promise<ShareResult> {
  if (Capacitor.isNativePlatform()) {
    const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
      import('@capacitor/filesystem'),
      import('@capacitor/share'),
    ]);
    await Filesystem.writeFile({ path: name, data: content, directory: Directory.Cache, encoding: Encoding.UTF8 });
    const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
    try {
      await Share.share({ title: 'engram', url: uri, dialogTitle: name });
      return 'shared';
    } catch (e) {
      if (/cancel/i.test((e as Error)?.message ?? '')) return 'canceled';
      throw e;
    }
  }
  try {
    const file = new File([content], name, { type: mime });
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: 'engram' });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') return 'canceled';
    // sonst: unten weiter mit Download
  }
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return 'downloaded';
}

export const today = () => new Date().toISOString().slice(0, 10);

/** „12 Einträge · 3 Wünsche · 2 Decks" */
export function backupSummary(b: { entries: unknown[]; wants: unknown[]; decks: unknown[] }): string {
  return [
    tn(b.entries.length, '{n} Eintrag', '{n} Einträge'),
    tn(b.wants.length, '{n} Wunsch', '{n} Wünsche'),
    tn(b.decks.length, '{n} Deck', '{n} Decks'),
  ].join(' · ');
}

/** Komplett-Backup als JSON-Text (für Datei und Zwischenablage). */
export async function buildBackupJson(): Promise<{ json: string; summary: string }> {
  const data = await readBackupData();
  const json = serializeCollection(data.entries, data.wants, Date.now(), { decks: data.decks, settings: data.settings });
  return { json, summary: backupSummary(data) };
}

/** Sichern / Teilen: Datei erzeugen, teilen bzw. laden, Zeitpunkt merken. */
export async function exportBackup(): Promise<{ result: ShareResult; summary: string }> {
  const { json, summary } = await buildBackupJson();
  const result = await shareOrDownload(json, `engram-backup-${today()}.json`, 'application/json');
  if (result !== 'canceled') await setLastBackupAt(Date.now());
  return { result, summary };
}

/** Backup in die Zwischenablage (zählt ebenfalls als gesichert). */
export async function copyBackup(): Promise<string> {
  const { json, summary } = await buildBackupJson();
  await navigator.clipboard.writeText(json);
  await setLastBackupAt(Date.now());
  return summary;
}

/** Parst + stellt wieder her und wendet die Einstellungen gleich an. */
export async function restoreFromJson(json: string): Promise<ParsedBackup> {
  const parsed = parseCollection(json);
  quietAchievements(); // wiederhergestellte Erfolge nicht als „neu" melden
  await restoreBackup(parsed);
  if (parsed.hasSettings) {
    const s = parsed.settings;
    if (isThemeName(s.theme)) {
      applyTheme(s.theme);
      if (hasIconSwitch() && s.iconFollowsTheme === true) void setAppIcon(s.theme);
    }
    if (typeof s.scanVibration === 'boolean') setVibration(s.scanVibration);
    if (isLang(s.language)) await changeLang(s.language);
  }
  return parsed;
}

export function restoreMessage(p: ParsedBackup, how: string): string {
  const what = p.hasDecks ? backupSummary(p) : backupSummary({ ...p, decks: [] });
  return t('{what} {how} (ersetzt).', { what, how });
}
