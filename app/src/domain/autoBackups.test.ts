import { describe, expect, it } from 'vitest';
import {
  autoBackupName,
  backupsToPrune,
  cleanReason,
  isRepeatBackup,
  parseAutoBackupName,
  sortAutoBackups,
} from './autoBackups';

const AT = Date.UTC(2026, 10, 27, 14, 5, 33);

describe('autoBackups', () => {
  it('Dateiname ist UTC-zeitlich und lässt sich zurücklesen', () => {
    const name = autoBackupName(AT, 'vor-v0.5.1');
    expect(name).toBe('engram-auto-20261127T140533Z-vor-v0.5.1.json');
    expect(parseAutoBackupName(name)).toEqual({ name, at: AT, reason: 'vor-v0.5.1' });
  });

  it('cleanReason: nur sichere Zeichen', () => {
    expect(cleanReason('Vor Wiederherstellen!')).toBe('vor-wiederherstellen');
    expect(cleanReason('***')).toBe('sicherung');
  });

  it('fremde Dateien werden ignoriert, neueste zuerst', () => {
    const a = autoBackupName(AT, 'a');
    const b = autoBackupName(AT + 1000, 'b');
    const sorted = sortAutoBackups([a, 'notiz.txt', b, 'engram-backup-2026-11-01.json']);
    expect(sorted.map((x) => x.reason)).toEqual(['b', 'a']);
  });

  it('backupsToPrune: die neuesten drei bleiben', () => {
    const names = [0, 1, 2, 3, 4].map((i) => autoBackupName(AT + i * 60_000, `r${i}`));
    expect(backupsToPrune(names)).toEqual([names[1], names[0]]);
    expect(backupsToPrune(names.slice(0, 3))).toEqual([]);
  });

  it('isRepeatBackup: gleicher Grund innerhalb einer Stunde', () => {
    const latest = { name: 'x', at: AT, reason: 'vor-v0.5.1' };
    expect(isRepeatBackup(latest, 'vor-v0.5.1', AT + 10 * 60_000)).toBe(true);
    expect(isRepeatBackup(latest, 'vor-v0.5.1', AT + 2 * 3_600_000)).toBe(false);
    expect(isRepeatBackup(latest, 'vor-v0.5.2', AT + 60_000)).toBe(false);
    expect(isRepeatBackup(undefined, 'vor-v0.5.1', AT)).toBe(false);
  });
});
