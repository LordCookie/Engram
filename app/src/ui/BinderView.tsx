import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { altPrintingId, catalog, cardIndex } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { ownedByCard } from '../data/owned';
import { addToCollection, addWant, db } from '../db/db';
import { binderPages, buildBinder, type BinderSlot } from '../domain/binder';
import { CardDetail } from './CardDetail';
import { CardImage } from './CardImage';
import type { Card, CollectionEntry, Color, WantEntry } from '../domain/types';

/**
 * Binder-Ansicht (virtuelle Sammelmappe): Knopf ganz unten in der Sammlung, öffnet die
 * Mappe als Vollbild. 3×3 Fächer pro Seite in Set-Reihenfolge, besessene Karten mit
 * Bild und Anzahl (+ „Alt"), fehlende als leere Fächer — ☆ legt sie auf die Want-Liste,
 * Antippen öffnet das Kartendetail. Blättern per Knopf, Wischen oder Pfeiltasten.
 */

const FILTERS: { id: Color | 'ALL'; label: string; dot?: string }[] = [
  { id: 'ALL', label: 'Alle' },
  { id: 'RED', label: 'Rot', dot: 'bg-card-red' },
  { id: 'GREEN', label: 'Grün', dot: 'bg-card-green' },
  { id: 'BLUE', label: 'Blau', dot: 'bg-card-blue' },
  { id: 'YELLOW', label: 'Gelb', dot: 'bg-card-yellow' },
];

export function BinderButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-full rounded-lg border border-white/10 bg-surface px-4 py-3 font-mono text-sm hover:border-accent"
      >
        Binder öffnen · Sammelmappe
      </button>
      {open && <BinderView onClose={() => setOpen(false)} />}
    </>
  );
}

function BinderView({ onClose }: { onClose: () => void }) {
  const images = useCardImages();
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const wants = useLiveQuery(() => db.wants.toArray(), [], [] as WantEntry[]);
  const [color, setColor] = useState<Color | 'ALL'>('ALL');
  const [page, setPage] = useState(0);
  const [detail, setDetail] = useState<Card | null>(null);
  const touchX = useRef<number | null>(null);

  const owned = useMemo(() => ownedByCard(entries), [entries]);
  const wanted = useMemo(() => new Set(wants.map((w) => w.cardId)), [wants]);

  const slots = useMemo(() => buildBinder(catalog, owned, color), [owned, color]);
  const pages = useMemo(() => binderPages(slots), [slots]);
  const ownedCount = slots.filter((s) => s.owned).length;
  const pageCount = Math.max(1, pages.length);
  const current = pages[Math.min(page, pageCount - 1)] ?? [];

  // Filterwechsel → zurück auf Seite 1.
  useEffect(() => setPage(0), [color]);

  const go = (d: number) => setPage((p) => Math.min(pageCount - 1, Math.max(0, p + d)));

  // Seite hinter der Mappe nicht mitscrollen; Pfeiltasten/Esc im Browser.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (detail) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener('keydown', onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail, pageCount]);

  const detailOwned = detail ? owned.get(detail.id) : undefined;

  return createPortal(
    <div className="fixed inset-0 z-50 flex flex-col bg-bg text-text">
      {/* Kopf: Titel, Fortschritt, Filter, Schließen */}
      <div className="border-b border-white/10 px-3 pb-2 pt-3" style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <h2 className="font-mono text-lg">Binder</h2>
          <span className="font-mono text-xs text-muted">
            <span className="text-accent">{ownedCount}</span>/{slots.length} Karten
          </span>
          <button onClick={onClose} aria-label="Binder schließen" className="ml-auto rounded px-2 py-1 text-lg text-muted hover:text-text">
            ✕
          </button>
        </div>
        <div className="mx-auto mt-2 flex max-w-xl flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setColor(f.id)}
              aria-pressed={color === f.id}
              className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-xs ${
                color === f.id ? 'border-accent text-text' : 'border-white/10 text-muted hover:border-accent'
              }`}
            >
              {f.dot && <span className={`h-2 w-2 rounded-full ${f.dot}`} />}
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Seite: 3×3 Fächer; Wischen blättert */}
      <div
        className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-3"
        onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
        onTouchEnd={(e) => {
          if (touchX.current === null) return;
          const dx = e.changedTouches[0].clientX - touchX.current;
          touchX.current = null;
          if (Math.abs(dx) > 50) go(dx < 0 ? 1 : -1);
        }}
      >
        <div
          key={`${color}-${page}`}
          className="grid grid-cols-3 gap-2 rounded-xl border border-white/10 bg-surface p-2"
          // Breite so, dass 3×3 Karten (733:1024) in die verfügbare Höhe passen.
          style={{ width: 'min(100%, 36rem, calc((100vh - 12.5rem) * 0.716))', animation: 'pop 0.2s ease-out' }}
        >
          {current.map((s) => (
            <Pocket
              key={s.card.id}
              slot={s}
              src={images.get(s.card.id)}
              wanted={wanted.has(s.card.id)}
              onOpen={() => setDetail(s.card)}
              onWant={() => void addWant(s.card.id, 1)}
            />
          ))}
        </div>
      </div>

      {/* Fuß: Blättern */}
      <div
        className="flex items-center justify-center gap-4 border-t border-white/10 px-3 py-2"
        style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
      >
        <button
          onClick={() => go(-1)}
          disabled={page === 0}
          aria-label="Vorige Seite"
          className="rounded-md border border-white/10 px-4 py-2 font-mono text-sm disabled:opacity-30"
        >
          ‹
        </button>
        <span className="min-w-[7rem] text-center font-mono text-sm text-muted">
          Seite {Math.min(page, pageCount - 1) + 1} / {pageCount}
        </span>
        <button
          onClick={() => go(1)}
          disabled={page >= pageCount - 1}
          aria-label="Nächste Seite"
          className="rounded-md border border-white/10 px-4 py-2 font-mono text-sm disabled:opacity-30"
        >
          ›
        </button>
      </div>

      <CardDetail
        card={detail}
        owned={detail ? (detailOwned ? detailOwned.std + detailOwned.alt : 0) : undefined}
        altOwned={detailOwned?.alt ?? 0}
        onAltChange={detail ? (delta) => void addToCollection(altPrintingId(detail.id), delta) : undefined}
        onClose={() => setDetail(null)}
        onPick={(c) => setDetail(cardIndex.get(c.id) ?? null)}
      />
    </div>,
    document.body,
  );
}

/** Ein Fach der Mappe: Karte (besessen) oder leeres Fach mit Nummer + Name. */
function Pocket({
  slot,
  src,
  wanted,
  onOpen,
  onWant,
}: {
  slot: BinderSlot;
  src?: string;
  wanted: boolean;
  onOpen: () => void;
  onWant: () => void;
}) {
  const { card } = slot;
  if (slot.owned) {
    return (
      <button onClick={onOpen} className="relative aspect-[733/1024] w-full" title={card.name}>
        <CardImage card={card} src={src} className="h-full w-full" />
        <span className="absolute bottom-1 right-1 rounded bg-bg/85 px-1.5 font-mono text-[11px] text-accent">
          {slot.std + slot.alt}×
        </span>
        {slot.alt > 0 && (
          <span className="absolute left-1 top-1 rounded bg-accent px-1 font-mono text-[10px] text-on-accent">Alt</span>
        )}
      </button>
    );
  }
  return (
    <div className="relative aspect-[733/1024] w-full">
      <button
        onClick={onOpen}
        title={card.name}
        className="flex h-full w-full flex-col items-center justify-center gap-1 rounded border border-dashed border-white/15 bg-bg/40 p-1 text-center"
      >
        <span className="font-mono text-[11px] text-muted">#{card.collectorNumber}</span>
        <span className="line-clamp-3 font-mono text-[10px] leading-tight text-muted/70">{card.name}</span>
      </button>
      <button
        onClick={onWant}
        aria-label={`${card.name} auf die Want-Liste`}
        title={wanted ? 'Auf der Want-Liste (antippen: +1)' : 'Auf die Want-Liste'}
        className={`absolute right-0.5 top-0.5 rounded px-1.5 py-0.5 text-sm ${wanted ? 'text-accent' : 'text-muted/60 hover:text-accent'}`}
      >
        {wanted ? '★' : '☆'}
      </button>
    </div>
  );
}
