import { describe, it, expect } from 'vitest';
import { backupReminder } from './backupReminder';

const DAY = 24 * 60 * 60 * 1000;
const now = 100 * DAY;
const base = { now, lastBackupAt: null, snoozeUntil: null, oldestDataAt: null, newestChangeAt: null };

describe('backupReminder', () => {
  it('ohne Daten keine Erinnerung', () => {
    expect(backupReminder(base).show).toBe(false);
  });

  it('noch nie gesichert: erst ab 3 Tagen alten Daten', () => {
    expect(backupReminder({ ...base, oldestDataAt: now - 1 * DAY, newestChangeAt: now }).show).toBe(false);
    const r = backupReminder({ ...base, oldestDataAt: now - 3 * DAY, newestChangeAt: now });
    expect(r).toEqual({ show: true, daysSince: null });
  });

  it('gesichert: nach 14 Tagen nur, wenn sich seitdem etwas geändert hat', () => {
    const last = now - 20 * DAY;
    const inp = { ...base, lastBackupAt: last, oldestDataAt: now - 50 * DAY };
    expect(backupReminder({ ...inp, newestChangeAt: last - DAY }).show).toBe(false); // nichts Neues
    expect(backupReminder({ ...inp, newestChangeAt: last + DAY })).toEqual({ show: true, daysSince: 20 });
    expect(backupReminder({ ...inp, lastBackupAt: now - 5 * DAY, newestChangeAt: now }).show).toBe(false);
  });

  it('„Später" schiebt die Erinnerung auf', () => {
    const inp = { ...base, oldestDataAt: now - 10 * DAY, newestChangeAt: now };
    expect(backupReminder({ ...inp, snoozeUntil: now + DAY }).show).toBe(false);
    expect(backupReminder({ ...inp, snoozeUntil: now - 1 }).show).toBe(true);
  });
});
