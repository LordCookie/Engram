import { useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, replaceCollection, replaceWants } from '../db/db';
import {
  serializeCollection,
  parseCollection,
  CollectionImportError,
} from '../domain/collectionIo';
import type { CollectionEntry, WantEntry } from '../domain/types';

/**
 * Export/Import als JSON (PLAN.md § 5, Aufgabe 7). Backup gegen Datenverlust in
 * IndexedDB. Import ersetzt die Sammlung (Restore-Semantik).
 */
export function CollectionIoPanel() {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const wants = useLiveQuery(() => db.wants.toArray(), [], [] as WantEntry[]);
  const [msg, setMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  function exportJson() {
    const json = serializeCollection(entries, wants);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engram-sammlung-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    setMsg(`${entries.length} Einträge + ${wants.length} Wünsche exportiert.`);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = parseCollection(await file.text());
      await replaceCollection(parsed.entries);
      await replaceWants(parsed.wants);
      setMsg(
        `${parsed.entries.length} Einträge + ${parsed.wants.length} Wünsche importiert (ersetzt).`,
      );
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

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-3 font-mono text-lg">Backup</h2>
      <div className="flex flex-wrap items-center gap-3">
        <button
          onClick={exportJson}
          disabled={entries.length === 0}
          className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-sm hover:border-accent disabled:opacity-40"
        >
          Export JSON
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-sm hover:border-accent"
        >
          Import JSON
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          onChange={onFile}
          className="hidden"
        />
        {msg && <span className="text-sm text-muted">{msg}</span>}
      </div>
    </section>
  );
}
