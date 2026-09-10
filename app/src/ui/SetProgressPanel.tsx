import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/db';
import { catalog, printingIndex } from '../data/catalog';
import { computeSetProgress, ownedCardIdSet, type ProgressBucket } from '../domain/setProgress';
import type { CollectionEntry } from '../domain/types';

/**
 * Set-Fortschritt: „Wie viel des Sets besitze ich?" — der Kernnutzen eines
 * Sammlungstrackers. Zählt eindeutige Karten (nicht Stückzahlen), aufgeschlüsselt
 * nach Farbe und Rarität. Reaktiv über die Sammlung (`domain/setProgress.ts`).
 */

const COLOR_VAR: Record<string, string> = {
  RED: '--c-red',
  GREEN: '--c-green',
  BLUE: '--c-blue',
  YELLOW: '--c-yellow',
};
const COLOR_LABEL: Record<string, string> = {
  RED: 'Rot',
  GREEN: 'Grün',
  BLUE: 'Blau',
  YELLOW: 'Gelb',
};

function pct(owned: number, total: number): number {
  return total > 0 ? Math.round((owned / total) * 100) : 0;
}

function Row({ bucket, colorVar }: { bucket: ProgressBucket; colorVar: string }) {
  const label = COLOR_LABEL[bucket.key] ?? bucket.key;
  return (
    <div className="flex items-center gap-3">
      <span className="w-20 shrink-0 font-mono text-xs text-muted sm:w-24">{label}</span>
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct(bucket.owned, bucket.total)}%`, background: `rgb(var(${colorVar}))` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right font-mono text-xs tabular-nums text-muted">
        {bucket.owned}/{bucket.total}
      </span>
    </div>
  );
}

export function SetProgressPanel() {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = ownedCardIdSet(entries, printingIndex);
  const p = computeSetProgress(catalog, owned);
  const overall = pct(p.ownedCards, p.totalCards);

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <h2 className="font-mono text-lg">Set-Fortschritt</h2>
        <span className="font-mono text-sm text-muted tabular-nums">
          <span className="text-accent">{p.ownedCards}</span>/{p.totalCards} · {overall}%
        </span>
      </div>

      {/* Gesamtbalken */}
      <div className="mb-5 h-3 overflow-hidden rounded-full bg-white/10">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-500"
          style={{ width: `${overall}%` }}
        />
      </div>

      <div className="space-y-4">
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Nach Farbe</h3>
          {p.byColor.map((b) => (
            <Row key={b.key} bucket={b} colorVar={COLOR_VAR[b.key] ?? '--c-accent'} />
          ))}
        </div>
        <div className="space-y-2">
          <h3 className="font-mono text-xs uppercase tracking-wide text-muted">Nach Rarität</h3>
          {p.byRarity.map((b) => (
            <Row key={b.key} bucket={b} colorVar="--c-accent" />
          ))}
        </div>
      </div>

      {p.ownedCards === 0 && (
        <p className="mt-4 text-xs text-muted">
          Noch keine Karten in der Sammlung — erfasse oder scanne welche, dann füllt sich das hier.
        </p>
      )}
    </section>
  );
}
