import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getBackupTimes } from '../db/db';
import { cardIndex, printingIndex } from '../data/catalog';
import { CollectionImportError } from '../domain/collectionIo';
import { collectionToCsv } from '../domain/collectionCsv';
import type { CollectionEntry, WantEntry } from '../domain/types';
import type { DeckDraft } from '../domain/deckDraft';
import { t, tn } from '../i18n';
import { backupSummary, copyBackup, exportBackup, restoreFromJson, restoreMessage, shareOrDownload, today } from './backup';

/**
 * Komplett-Backup (Format v3): Sammlung, Want-Liste, Decks und Einstellungen als
 * JSON gegen Datenverlust (Browser-Reset, Neuinstallation der App). **Mobil-robust:**
 * Export über das native Share-Sheet (Android/iOS → Files/Drive), sonst Web-Share
 * bzw. Download, dazu „Kopieren"/„Einfügen" über die Zwischenablage. Wiederherstellen
 * ersetzt und fragt vorher nach; ältere Backups (v1/v2) lassen Decks und
 * Einstellungen stehen. CSV exportiert nur die Sammlung als Tabelle.
 */
export function CollectionIoPanel() {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const wants = useLiveQuery(() => db.wants.toArray(), [], [] as WantEntry[]);
  const decks = useLiveQuery(() => db.decks.toArray(), [], [] as DeckDraft[]);
  const times = useLiveQuery(() => getBackupTimes(), [], null);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const deckCount = decks.filter((d) => d.legendIds.length > 0 || d.cards.length > 0).length;
  const empty = entries.length === 0 && wants.length === 0 && deckCount === 0;
  const last = times?.lastBackupAt ?? null;
  const daysAgo = last === null ? null : Math.floor((Date.now() - last) / 86_400_000);

  async function doExport() {
    try {
      const { result, summary } = await exportBackup();
      if (result !== 'canceled') {
        setMsg(result === 'shared' ? t('{what} gesichert (geteilt).', { what: summary }) : t('{what} exportiert.', { what: summary }));
      }
    } catch {
      setMsg(t('Export fehlgeschlagen — „Kopieren" geht immer.'));
    }
  }

  async function doExportCsv() {
    try {
      const r = await shareOrDownload(
        collectionToCsv(entries, printingIndex, cardIndex),
        `engram-sammlung-${today()}.csv`,
        'text/csv',
      );
      if (r !== 'canceled') {
        setMsg(
          r === 'shared'
            ? t('Sammlung als CSV geteilt ({n} Zeilen).', { n: entries.length })
            : t('Sammlung als CSV exportiert ({n} Zeilen).', { n: entries.length }),
        );
      }
    } catch {
      setMsg(t('CSV-Export fehlgeschlagen.'));
    }
  }

  async function copyJson() {
    try {
      setMsg(t('Backup kopiert ({what}).', { what: await copyBackup() }));
    } catch {
      setMsg(t('Kopieren nicht möglich — nutze „Sichern / Teilen".'));
    }
  }

  async function restore(json: string, how: string) {
    if (!empty && !window.confirm(t('Wiederherstellen ersetzt deine Sammlung, Want-Liste und Decks. Fortfahren?'))) {
      return;
    }
    setMsg(restoreMessage(await restoreFromJson(json), how));
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await restore(await file.text(), t('aus Datei wiederhergestellt'));
    } catch (err) {
      setMsg(
        err instanceof CollectionImportError
          ? t('Import fehlgeschlagen: {err}', { err: err.message })
          : t('Import fehlgeschlagen.'),
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function pasteRestore() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setMsg(t('Zwischenablage ist leer.'));
        return;
      }
      await restore(text, t('aus Zwischenablage eingefügt'));
    } catch (err) {
      setMsg(
        err instanceof CollectionImportError
          ? t('Import fehlgeschlagen: {err}', { err: err.message })
          : t('Einfügen fehlgeschlagen (Zwischenablage/Format).'),
      );
    }
  }

  const btn = 'rounded-md border border-white/10 px-3 py-2 font-mono text-sm hover:border-accent disabled:opacity-40';

  return (
    <section id="backup" className="scroll-mt-4 rounded-lg bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-lg">{t('Backup')}</h2>
        <span className="font-mono text-xs text-muted">{backupSummary({ entries, wants, decks })}</span>
      </div>
      <p className="mb-2 text-xs text-muted">
        {t(
          'Sichert alles als JSON: Sammlung, Want-Liste, Decks und Einstellungen (Farbthema, Sprache, Vibration, Erfolge). Am Handy legt „Sichern / Teilen" die Datei über das Share-Menü ab (Files/Drive). „CSV" exportiert nur die Sammlung als Tabelle (Excel/Sheets, zum Tauschen).',
        )}
      </p>
      <p className={`mb-3 font-mono text-xs ${daysAgo === null || daysAgo >= 14 ? 'text-accent' : 'text-muted'}`}>
        {daysAgo === null
          ? t('Noch kein Backup auf diesem Gerät.')
          : daysAgo === 0
            ? t('Letztes Backup: heute.')
            : tn(daysAgo, 'Letztes Backup: vor {n} Tag.', 'Letztes Backup: vor {n} Tagen.')}
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 font-mono text-xs text-muted">{t('Sichern')}</span>
          <button onClick={() => void doExport()} disabled={empty} className={btn}>
            {t('Sichern / Teilen')}
          </button>
          <button onClick={() => void copyJson()} disabled={empty} className={btn}>
            {t('Kopieren')}
          </button>
          <button onClick={() => void doExportCsv()} disabled={entries.length === 0} className={btn}>
            CSV
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 font-mono text-xs text-muted">{t('Wiederherstellen')}</span>
          <button onClick={() => fileRef.current?.click()} className={btn}>
            {t('Aus Datei')}
          </button>
          <button onClick={() => void pasteRestore()} className={btn}>
            {t('Aus Zwischenablage')}
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" onChange={onFile} className="hidden" />
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </section>
  );
}
