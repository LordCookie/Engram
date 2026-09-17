import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { Capacitor } from '@capacitor/core';
import { db, replaceCollection, replaceWants } from '../db/db';
import {
  serializeCollection,
  parseCollection,
  CollectionImportError,
} from '../domain/collectionIo';
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

  async function doExport() {
    const json = serializeCollection(entries, wants);
    const name = fileName();
    const done = () => setMsg(`${summary(entries.length, wants.length)} gesichert (geteilt).`);
    // 1) Native App (Capacitor): Datei schreiben + über das echte Android/iOS-
    //    Share-Sheet teilen („Senden an …", Drive/Files, WhatsApp …) — der Web-
    //    `navigator.share` greift im nativen WebView nicht zuverlässig.
    if (Capacitor.isNativePlatform()) {
      try {
        const [{ Filesystem, Directory, Encoding }, { Share }] = await Promise.all([
          import('@capacitor/filesystem'),
          import('@capacitor/share'),
        ]);
        await Filesystem.writeFile({
          path: name,
          data: json,
          directory: Directory.Cache,
          encoding: Encoding.UTF8,
        });
        const { uri } = await Filesystem.getUri({ path: name, directory: Directory.Cache });
        await Share.share({
          title: 'engram Backup',
          text: 'engram Sammlungs-Backup',
          url: uri,
          dialogTitle: 'Backup sichern / teilen',
        });
        done();
      } catch (e) {
        // Abbruch im Share-Sheet ist kein Fehler; sonst Hinweis auf „Kopieren".
        const m = (e as Error)?.message ?? '';
        if (!/cancel/i.test(m)) setMsg('Teilen abgebrochen — „Kopieren" geht immer.');
      }
      return;
    }
    // 2) Web: Web-Share mit Datei (Handy-Browser) …
    try {
      const file = new File([json], name, { type: 'application/json' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: 'engram Backup' });
        done();
        return;
      }
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return; // Nutzer hat das Share-Sheet abgebrochen
      // sonst: unten weiter mit Download
    }
    // 3) Fallback: Blob-Download (Desktop / normaler Browser).
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(`${summary(entries.length, wants.length)} exportiert (${name}).`);
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
        Sichert Sammlung + Want-Liste als JSON. Am Handy: „Sichern / Teilen" legt die Datei über
        das Share-Menü ab (Files/Drive). „Kopieren"/„Einfügen" gehen über die Zwischenablage.
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
