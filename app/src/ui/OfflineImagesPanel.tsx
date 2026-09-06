import { useState } from 'react';
import { loadCardImages } from '../data/cardImages';

/**
 * Lädt einmalig alle Kartenbilder, damit der Service-Worker sie cacht und die
 * Karten danach OFFLINE ansehbar sind (PLAN.md § 8: nur lokaler Cache, nichts
 * gehostet/verteilt). Läuft über `<img>` — der Browser darf Cross-Origin-Bilder
 * anzeigen (kein CORS nötig), und der SW legt die Antwort in den Cache.
 */
function preloadImage(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(true);
    img.onerror = () => resolve(false);
    img.src = url;
  });
}

export function OfflineImagesPanel() {
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [failed, setFailed] = useState(0);
  const [finished, setFinished] = useState(false);

  async function preload() {
    setBusy(true);
    setFinished(false);
    setDone(0);
    setFailed(0);
    const urls = await loadCardImages();
    const list = [...urls.values()];
    setTotal(list.length);
    let d = 0;
    let f = 0;
    let idx = 0;
    const CONCURRENCY = 6;
    async function worker() {
      while (idx < list.length) {
        const url = list[idx++];
        const ok = await preloadImage(url);
        d++;
        if (!ok) f++;
        setDone(d);
        setFailed(f);
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setBusy(false);
    setFinished(true);
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-1 flex items-center justify-between gap-3">
        <h2 className="font-mono text-lg">Bilder offline</h2>
        <button
          onClick={() => void preload()}
          disabled={busy}
          className="rounded border border-white/10 px-2 py-1 font-mono text-xs hover:border-accent disabled:opacity-40"
        >
          {busy ? `Lädt… ${total ? Math.round((done / total) * 100) : 0}%` : 'Alle Bilder offline laden'}
        </button>
      </div>
      <p className="text-xs text-muted">
        Lädt einmalig alle Kartenbilder in den lokalen Cache — danach sind die
        Karten auch ohne Internet ansehbar. Nichts wird gehostet, nur lokal
        zwischengespeichert (§ 8).
      </p>
      {busy && (
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-accent"
            style={{ width: `${total ? (done / total) * 100 : 0}%` }}
          />
        </div>
      )}
      {finished && (
        <p className="mt-2 font-mono text-xs text-muted">
          {done - failed}/{total} Bilder im Cache
          {failed > 0 ? ` · ${failed} fehlgeschlagen (später „nochmal laden“)` : ' · fertig ✓'}
        </p>
      )}
    </section>
  );
}
