import { Capacitor } from '@capacitor/core';
import {
  autoBackupName,
  backupsToPrune,
  isRepeatBackup,
  parseAutoBackupName,
  sortAutoBackups,
  type AutoBackupInfo,
} from '../domain/autoBackups';
import { buildBackupJson } from './backup';

/**
 * Automatische Sicherungen (Muster aus ScryGlass): vor jedem App-Update und vor jedem
 * Wiederherstellen still ein Komplett-Backup in den App-Speicher (übersteht Updates), die
 * letzten drei bleiben. Zusätzlich eine Kopie in „Dokumente/engram/Automatisch" — die übersteht
 * auch das Deinstallieren (ab Android 11 ohne Erlaubnis; älter: klappt still nicht).
 * Nur in der App (der Browser hat kein Dateisystem). Plugins per dynamischem Import.
 */

const DIR = 'sicherungen';
const DOCS_DIR = 'engram/Automatisch';

export const autoBackupsAvailable = (): boolean => Capacitor.isNativePlatform();

const fs = () => import('@capacitor/filesystem');

async function names(path: string, documents: boolean): Promise<string[]> {
  const { Filesystem, Directory } = await fs();
  try {
    const r = await Filesystem.readdir({ path, directory: documents ? Directory.Documents : Directory.Data });
    return r.files.map((f) => f.name);
  } catch {
    return []; // Ordner gibt es noch nicht
  }
}

async function writeAndPrune(path: string, documents: boolean, name: string, json: string): Promise<void> {
  const { Filesystem, Directory, Encoding } = await fs();
  const directory = documents ? Directory.Documents : Directory.Data;
  await Filesystem.writeFile({ path: `${path}/${name}`, data: json, directory, encoding: Encoding.UTF8, recursive: true });
  for (const old of backupsToPrune(await names(path, documents))) {
    await Filesystem.deleteFile({ path: `${path}/${old}`, directory }).catch(() => {});
  }
}

/** Sicherungen im App-Speicher, neueste zuerst. */
export async function listAutoBackups(): Promise<AutoBackupInfo[]> {
  if (!autoBackupsAvailable()) return [];
  return sortAutoBackups(await names(DIR, false));
}

/**
 * Jetzt sichern (`reason` z. B. „vor-v0.5.1"). Leere Sammlung → nichts zu sichern (null);
 * ein zweiter Anlauf mit demselben Grund innerhalb einer Stunde sichert nicht noch einmal.
 */
export async function autoBackup(reason: string): Promise<AutoBackupInfo | null> {
  if (!autoBackupsAvailable()) return null;
  const latest = (await listAutoBackups())[0];
  if (isRepeatBackup(latest, reason, Date.now())) return latest;
  const { json, empty } = await buildBackupJson();
  if (empty) return null;
  const name = autoBackupName(Date.now(), reason);
  await writeAndPrune(DIR, false, name, json);
  try {
    await writeAndPrune(DOCS_DIR, true, name, json);
  } catch {
    // Dokumente-Ordner nicht beschreibbar (Android ≤ 10 ohne Erlaubnis) — App-Speicher reicht
  }
  return parseAutoBackupName(name);
}

export async function readAutoBackup(name: string): Promise<string> {
  const { Filesystem, Directory, Encoding } = await fs();
  const r = await Filesystem.readFile({ path: `${DIR}/${name}`, directory: Directory.Data, encoding: Encoding.UTF8 });
  return typeof r.data === 'string' ? r.data : await r.data.text();
}

/** Über das Android-Share-Menü weitergeben (Drive, Dateien, Senden an …). */
export async function shareAutoBackup(name: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([fs(), import('@capacitor/share')]);
  const { uri } = await Filesystem.getUri({ path: `${DIR}/${name}`, directory: Directory.Data });
  await Share.share({ title: 'engram', url: uri, dialogTitle: name });
}
