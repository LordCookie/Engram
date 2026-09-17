import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { db, replaceCollection, replaceWants } from '../db/db';
import { cardIndex, printingIndex } from '../data/catalog';
import {
  serializeCollection,
  parseCollection,
  CollectionImportError,
} from '../domain/collectionIo';
import { collectionToCsv } from '../domain/collectionCsv';
import type { CollectionEntry, WantEntry } from '../domain/types';

/**
 * Backup: Export/Import als JSON (Sammlung + Want-Liste) gegen Datenverlust in
 * IndexedDB (PLAN.md § 5, Aufgabe 7). **Mobil-robust:** Export bevorzugt den
 * nativen Share (Android/iOS öffnen das Share-Sheet → nach Files/Drive sichern),
 * fällt auf Blob-Download zurück und bietet zusätzlich „Kopieren"/„Einfügen" über
 * die Zwischenablage — der Blob-Download alleine ist im nativen WebView unzuverlässig.
 * Import ersetzt (Restore) und fragt vorher nach.
 */
export function CollectionIoPanel() {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const wants = useLiveQuery(() => db.wants.toArray(), [], [] as WantEntry[]);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const empty = entries.length === 0 && wants.length === 0;
  const fileName = () => `engram-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
  const summary = (e: number, w: number) => `${e} Einträge + ${w} Wünsche`;

  /**
   * Teilt eine Datei (native Share-Sheet bzw. Web-Share) oder lädt sie herunter.
   * Liefert, was passiert ist — für die Rückmeldung. Der Blob-Download alleine ist
   * im nativen WebView unzuverlässig, daher nativ die Capacitor-Plugins.
   */
  async function shareOrDownload(
    content: string,
    name: string,
    mime: string,
  ): Promise<'shared' | 'downloaded' | 'canceled'> {
    if (Capacitor.isNativePlatform()) {
      const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
        import('@capacitor/filesystem'),
        import('@capacitor/share'),
      ]);
      await Filesystem.writeFile({
        path: name,
        data: content,
        directory: Directory.Cache,
        encoding: Encoding.UTF8,
      });
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

  async function doExport() {
    try {
      const r = await shareOrDownload(serializeCollection(entries, wants), fileName(), 'application/json');
      if (r !== 'canceled') {
        setMsg(`${summary(entries.length, wants.length)} ${r === 'shared' ? 'gesichert (geteilt)' : 'exportiert'}.`);
      }
    } catch {
      setMsg('Export fehlgeschlagen — „Kopieren" geht immer.');
    }
  }

  async function doExportCsv() {
    const name = `engram-sammlung-${new Date().toISOString().slice(0, 10)}.csv`;
    try {
      const r = await shareOrDownload(collectionToCsv(entries, printingIndex, cardIndex), name, 'text/csv');
      if (r !== 'canceled') {
        setMsg(`Sammlung als CSV ${r === 'shared' ? 'geteilt' : 'exportiert'} (${entries.length} Zeilen).`);
      }
    } catch {
      setMsg('CSV-Export fehlgeschlagen.');
    }
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(serializeCollection(entries, wants));
      setMsg(`Backup kopiert (${summary(entries.length, wants.length)}).`);
    } catch {
      setMsg('Kopieren nicht möglich — nutze „Sichern / Teilen".');
    }
  }

  async function restore(json: string, how: string) {
    if (
      !empty &&
      !window.confirm('Wiederherstellen ersetzt deine aktuelle Sammlung + Want-Liste. Fortfahren?')
    ) {
      return;
    }
    const parsed = parseCollection(json);
    await replaceCollection(parsed.entries);
    await replaceWants(parsed.wants);
    setMsg(`${summary(parsed.entries.length, parsed.wants.length)} ${how} (ersetzt).`);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await restore(await file.text(), 'aus Datei wiederhergestellt');
    } catch (err) {
      setMsg(
        err instanceof CollectionImportError
          ? `Import fehlgeschlagen: ${err.message}`
          : 'Import fehlgeschlagen.',
      );
    } finally {
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function pasteRestore() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        setMsg('Zwischenablage ist leer.');
        return;
      }
      await restore(text, 'aus Zwischenablage eingefügt');
    } catch (err) {
      setMsg(
        err instanceof CollectionImportError
          ? `Import fehlgeschlagen: ${err.message}`
          : 'Einfügen fehlgeschlagen (Zwischenablage/Format).',
      );
    }
  }

  const btn = 'rounded-md border border-white/10 px-3 py-2 font-mono text-sm hover:border-accent disabled:opacity-40';

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-lg">Backup</h2>
        <span className="font-mono text-xs text-muted">{summary(entries.length, wants.length)}</span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Sichert Sammlung + Want-Liste als JSON (zum Wiederherstellen). Am Handy: „Sichern / Teilen"
        legt die Datei über das Share-Menü ab (Files/Drive). „CSV" exportiert die Sammlung als
        Tabelle (Excel/Sheets, zum Tauschen). „Kopieren"/„Einfügen" gehen über die Zwischenablage.
      </p>

      <div className="space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 font-mono text-xs text-muted">Sichern</span>
          <button onClick={() => void doExport()} disabled={empty} className={btn}>
            Sichern / Teilen
          </button>
          <button onClick={() => void copyJson()} disabled={empty} className={btn}>
            Kopieren
          </button>
          <button onClick={() => void doExportCsv()} disabled={entries.length === 0} className={btn}>
            CSV
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-24 shrink-0 font-mono text-xs text-muted">Wiederherstellen</span>
          <button onClick={() => fileRef.current?.click()} className={btn}>
            Aus Datei
          </button>
          <button onClick={() => void pasteRestore()} className={btn}>
            Aus Zwischenablage
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={onFile}
            className="hidden"
          />
        </div>
      </div>

      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </section>
  );
}
