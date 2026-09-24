import { useRef, useState } from 'react';
import { catalog, cardIndex } from '../data/catalog';
import { deckToText, parseDeckText, type ParsedDeck } from '../domain/deckText';
import { decodeDeckQr } from '../domain/deckQr';
import type { DeckDraft } from '../domain/deckDraft';
import { DeckQrDialog, QrScanOverlay } from './DeckQr';

/**
 * Deck teilen: per QR-Code (Gerät zu Gerät, offline) oder als Text-Export/Import
 * (PLAN.md § 5, Aufgabe 8; MTG-artiges .txt-Format für andere Tools).
 */
export function DeckTextPanel({
  draft,
  onImport,
}: {
  draft: DeckDraft;
  onImport: (parsed: ParsedDeck) => Promise<void> | void;
}) {
  const [paste, setPaste] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [scanQr, setScanQr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const text = deckToText(draft, cardIndex);

  function download() {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${(draft.name || 'deck').replace(/[^\w.-]+/g, '_')}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function importParsed(parsed: ParsedDeck) {
    await onImport(parsed);
    const n = parsed.cards.reduce((s, c) => s + c.count, 0);
    setMsg(
      `Importiert: ${parsed.legendIds.length} Legends, ${n} Karten${
        parsed.unresolved.length ? ` · ${parsed.unresolved.length} Zeilen nicht erkannt` : ''
      }.`,
    );
  }

  async function doImport(t: string) {
    if (!t.trim()) return;
    await importParsed(parseDeckText(t, catalog, cardIndex));
    setPaste('');
  }

  function onQr(text: string) {
    setScanQr(false);
    const parsed = decodeDeckQr(text, cardIndex);
    if (parsed) void importParsed(parsed);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    await doImport(await f.text());
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <h3 className="mb-2 font-mono text-sm">Deck teilen</h3>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setShowQr(true)}
          className="rounded bg-accent px-3 py-1.5 font-mono text-xs text-on-accent"
        >
          Als QR-Code zeigen
        </button>
        <button
          onClick={() => setScanQr(true)}
          className="rounded border border-white/10 px-3 py-1.5 font-mono text-xs hover:border-accent"
        >
          QR-Code scannen
        </button>
        <span className="text-xs text-muted">Deck von Handy zu Handy — ohne Internet.</span>
      </div>
      {showQr && <DeckQrDialog deck={draft} onClose={() => setShowQr(false)} />}
      {scanQr && <QrScanOverlay onResult={onQr} onClose={() => setScanQr(false)} />}

      <h4 className="mb-2 font-mono text-xs text-muted">Als Text (Export / Import)</h4>

      <div className="mb-4">
        <textarea
          readOnly
          value={text}
          rows={6}
          className="w-full resize-y rounded-md border border-white/10 bg-bg p-2 font-mono text-xs text-muted outline-none"
        />
        <div className="mt-2 flex items-center gap-3">
          <button
            onClick={download}
            className="rounded border border-white/10 px-2 py-1 font-mono text-xs hover:border-accent"
          >
            Als .txt herunterladen
          </button>
          <span className="text-xs text-muted">Format wie MTG (eine Zeile je Karte).</span>
        </div>
      </div>

      <div>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          rows={4}
          placeholder={'Deckliste einfügen, z. B.\n3 Delamain Cab\n1 V: Corporate Exile'}
          className="w-full resize-y rounded-md border border-white/10 bg-bg p-2 font-mono text-xs text-text outline-none focus:border-accent"
        />
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            onClick={() => void doImport(paste)}
            className="rounded border border-white/10 px-2 py-1 font-mono text-xs hover:border-accent"
          >
            In neues Deck importieren
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="rounded border border-white/10 px-2 py-1 font-mono text-xs hover:border-accent"
          >
            .txt-Datei laden
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".txt,text/plain"
            onChange={onFile}
            className="hidden"
          />
          {msg && <span className="text-xs text-muted">{msg}</span>}
        </div>
      </div>
    </section>
  );
}
