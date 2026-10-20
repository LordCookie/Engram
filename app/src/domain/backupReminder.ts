/**
 * Backup-Erinnerung: Wann soll die App ans Sichern erinnern? Rein & testbar.
 *
 *  - Noch nie gesichert: sobald die ältesten Daten `firstAfterDays` alt sind
 *    (neue Nutzer werden nicht sofort genervt).
 *  - Schon gesichert: wenn das letzte Backup `everyDays` her ist UND sich seitdem
 *    etwas geändert hat (sonst gibt es nichts Neues zu sichern).
 *  - „Später" schiebt die Erinnerung bis `snoozeUntil` auf.
 */

export interface BackupReminderInput {
  now: number;
  /** Zeitpunkt des letzten Backups (ms) oder null. */
  lastBackupAt: number | null;
  /** Bis wann „Später" gilt (ms) oder null. */
  snoozeUntil: number | null;
  /** Ältester Zeitstempel in Sammlung/Want-Liste/Decks oder null (= keine Daten). */
  oldestDataAt: number | null;
  /** Jüngste Änderung (neuer Eintrag, bearbeitetes Deck) oder null. */
  newestChangeAt: number | null;
}

export interface BackupReminderConfig {
  firstAfterDays: number;
  everyDays: number;
}

export const BACKUP_REMINDER_DEFAULTS: BackupReminderConfig = { firstAfterDays: 3, everyDays: 14 };

export interface BackupReminder {
  show: boolean;
  /** Tage seit dem letzten Backup (null = noch nie gesichert). */
  daysSince: number | null;
}

const DAY = 24 * 60 * 60 * 1000;

export function backupReminder(
  inp: BackupReminderInput,
  cfg: BackupReminderConfig = BACKUP_REMINDER_DEFAULTS,
): BackupReminder {
  const daysSince = inp.lastBackupAt === null ? null : Math.floor((inp.now - inp.lastBackupAt) / DAY);
  const hidden = { show: false, daysSince };
  if (inp.oldestDataAt === null) return hidden; // nichts zu sichern
  if (inp.snoozeUntil !== null && inp.now < inp.snoozeUntil) return hidden;
  if (inp.lastBackupAt === null) {
    return { show: inp.now - inp.oldestDataAt >= cfg.firstAfterDays * DAY, daysSince };
  }
  const changed = inp.newestChangeAt !== null && inp.newestChangeAt > inp.lastBackupAt;
  return { show: changed && inp.now - inp.lastBackupAt >= cfg.everyDays * DAY, daysSince };
}
