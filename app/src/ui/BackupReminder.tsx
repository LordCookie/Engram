import { useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getBackupTimes, snoozeBackupReminder } from '../db/db';
import { backupReminder } from '../domain/backupReminder';
import { t, tn } from '../i18n';
import { exportBackup } from './backup';
import { Icon } from './Icon';

/**
 * Dezente Erinnerung oben in der App, wenn länger nicht gesichert wurde und sich
 * seitdem etwas geändert hat (Regeln in `domain/backupReminder.ts`). „Jetzt sichern"
 * startet direkt das Komplett-Backup, „Später" schiebt die Erinnerung 7 Tage auf.
 */
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;

function minMax(values: number[]): { min: number | null; max: number | null } {
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}

export function BackupReminder() {
  const state = useLiveQuery(async () => {
    const [times, entries, wants, decks] = await Promise.all([
      getBackupTimes(),
      db.collection.toArray(),
      db.wants.toArray(),
      db.decks.toArray(),
    ]);
    const used = decks.filter((d) => d.legendIds.length > 0 || d.cards.length > 0);
    const stamps = [
      ...entries.map((e) => e.addedAt),
      ...wants.map((w) => w.addedAt),
      ...used.map((d) => d.updatedAt),
    ].filter((x) => Number.isFinite(x) && x > 0);
    const { min, max } = minMax(stamps);
    return backupReminder({ now: Date.now(), ...times, oldestDataAt: min, newestChangeAt: max });
  }, []);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  if (done) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-card-green/40 bg-card-green/10 px-3 py-2 font-mono text-sm text-card-green">
        <Icon name="check" />
        {done}
      </div>
    );
  }
  if (!state?.show) return null;

  async function backupNow() {
    setBusy(true);
    try {
      const { result, summary } = await exportBackup();
      if (result !== 'canceled') setDone(t('Gesichert: {what}', { what: summary }));
    } catch {
      /* Fehler zeigt das Backup-Panel unter „Mehr" ausführlicher */
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-sm">
      <span className="min-w-0 flex-1 text-accent">
        {state.daysSince === null
          ? t('Noch kein Backup — Sammlung & Decks sichern?')
          : tn(state.daysSince, 'Letztes Backup vor {n} Tag — jetzt sichern?', 'Letztes Backup vor {n} Tagen — jetzt sichern?')}
      </span>
      <button
        onClick={() => void backupNow()}
        disabled={busy}
        className="rounded bg-accent px-3 py-1 text-on-accent disabled:opacity-50"
      >
        {t('Jetzt sichern')}
      </button>
      <button
        onClick={() => void snoozeBackupReminder(Date.now() + SNOOZE_MS)}
        className="rounded px-2 py-1 text-muted hover:text-text"
      >
        {t('Später')}
      </button>
    </div>
  );
}
