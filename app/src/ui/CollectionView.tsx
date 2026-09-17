import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import {
  catalog,
  cardIndex,
  printingIndex,
  altPrintingId,
  isAltPrintingId,
} from '../data/catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { collectionProgress, totalCards } from '../domain/collection';
import { useCardImages } from '../data/cardImages';
import { db, addToCollection } from '../db/db';
import { CardImage } from './CardImage';
import { CardDetail } from './CardDetail';
import type { Card, CardType, CollectionEntry, Color } from '../domain/types';

/**
 * Sammlungsansicht (PLAN.md § 5, Aufgabe 6): Fortschritt „x von y" je Farbe plus
 * die besessenen Karten — jetzt mit Suche, Filter, Sortierung und Kartendetail.
 */
const colorBar: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};
const typeOrder: CardType[] = ['LEGEND', 'UNIT', 'GEAR', 'PROGRAM', 'BRAINDANCE'];
type Sort = 'farbe' | 'name' | 'anzahl';

interface Owned {
  card: Card;
  /** Standard-Exemplare. */
  std: number;
  /** Alt-Art-Exemplare (separates Printing, siehe catalog). */
  alt: number;
}

/**
 * `collapsed`/`onToggleCollapsed` (optional, von App gehalten → bleibt beim
 * Tab-Wechsel): eingeklappt zeigt nur den Kopf mit den Zahlen, damit man schnell
 * zum Legend-Solver darunter kommt. Ohne die Props bleibt alles ausgeklappt.
 */
export function CollectionView({
  collapsed = false,
  onToggleCollapsed,
}: {
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
} = {}) {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const images = useCardImages();

  const [query, setQuery] = useState('');
  const [filterColor, setFilterColor] = useState<Color | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<CardType | 'ALL'>('ALL');
  const [sort, setSort] = useState<Sort>('farbe');
  const [view, setView] = useState<'list' | 'grid'>('list');
  const [detail, setDetail] = useState<Card | null>(null);

  const progress = collectionProgress(entries, printingIndex, catalog, cardIndex, rulesetV1Loaded.colors);
  const total = totalCards(entries);

  // Je Karte gruppiert: Standard- und Alt-Art-Exemplare getrennt (Alt-Art ist ein
  // eigenes Printing `<cardId>#alt`, zählt aber zur selben Karte).
  const owned: Owned[] = useMemo(() => {
    const byCard = new Map<string, Owned>();
    for (const e of entries) {
      if (e.quantity <= 0) continue;
      const cardId = printingIndex.get(e.printingId)?.cardId ?? e.printingId;
      const card = cardIndex.get(cardId);
      if (!card) continue;
      const g = byCard.get(cardId) ?? { card, std: 0, alt: 0 };
      if (isAltPrintingId(e.printingId)) g.alt += e.quantity;
      else g.std += e.quantity;
      byCard.set(cardId, g);
    }
    return [...byCard.values()];
  }, [entries]);

  const qtyOf = (o: Owned) => o.std + o.alt;
  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    const cmp: Record<Sort, (a: Owned, b: Owned) => number> = {
      farbe: (a, b) =>
        a.card.color.localeCompare(b.card.color) || a.card.name.localeCompare(b.card.name),
      name: (a, b) => a.card.name.localeCompare(b.card.name),
      anzahl: (a, b) => qtyOf(b) - qtyOf(a) || a.card.name.localeCompare(b.card.name),
    };
    return owned
      .filter(
        (o) =>
          !q ||
          o.card.name.toLowerCase().includes(q) ||
          (o.card.collectorNumber ?? '').toLowerCase().includes(q),
      )
      .filter((o) => filterColor === 'ALL' || o.card.color === filterColor)
      .filter((o) => filterType === 'ALL' || o.card.type === filterType)
      .sort(cmp[sort]);
  }, [owned, q, filterColor, filterType, sort]);

  const shownTotal = shown.reduce((s, o) => s + qtyOf(o), 0);
  const detailGroup = detail ? owned.find((o) => o.card.id === detail.id) : undefined;

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <div className="flex items-baseline gap-2">
          <h2 className="font-mono text-lg">Sammlung</h2>
          {onToggleCollapsed && (
            <button
              onClick={onToggleCollapsed}
              aria-expanded={!collapsed}
              className="rounded px-1.5 font-mono text-xs text-muted hover:text-accent"
              title={collapsed ? 'Sammlung ausklappen' : 'Sammlung einklappen (schneller zum Solver)'}
            >
              {collapsed ? '▸ ausklappen' : '▾ einklappen'}
            </button>
          )}
        </div>
        <span className="font-mono text-sm text-muted">
          {total} Karten · {owned.length} verschiedene
        </span>
      </div>

      {collapsed ? null : (
        <>
      <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {progress.map((p) => (
          <div key={p.color}>
            <div className="mb-1 flex justify-between font-mono text-xs text-muted">
              <span>{p.color}</span>
              <span>
                {p.owned}/{p.total}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className={`h-full ${colorBar[p.color]}`}
                style={{ width: p.total > 0 ? `${(p.owned / p.total) * 100}%` : '0%' }}
              />
            </div>
          </div>
        ))}
      </div>

      {owned.length === 0 ? (
        <p className="text-sm text-muted">
          Noch nichts erfasst. Nutze „Scannen" oder „Erfassen".
        </p>
      ) : (
        <>
          {/* Suche · Filter · Sortierung */}
          <div className="mb-3 space-y-2">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="In der Sammlung suchen (Name oder Nummer)…"
              className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-sm text-text outline-none focus:border-accent"
            />
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
              <select
                value={filterColor}
                onChange={(e) => setFilterColor(e.target.value as Color | 'ALL')}
                className="rounded border border-white/10 bg-bg px-2 py-1 outline-none focus:border-accent"
                aria-label="Farbe filtern"
              >
                <option value="ALL">Farbe: alle</option>
                {rulesetV1Loaded.colors.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={filterType}
                onChange={(e) => setFilterType(e.target.value as CardType | 'ALL')}
                className="rounded border border-white/10 bg-bg px-2 py-1 outline-none focus:border-accent"
                aria-label="Typ filtern"
              >
                <option value="ALL">Typ: alle</option>
                {typeOrder.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as Sort)}
                className="rounded border border-white/10 bg-bg px-2 py-1 outline-none focus:border-accent"
                aria-label="Sortierung"
              >
                <option value="farbe">Sortierung: Farbe</option>
                <option value="name">Sortierung: Name</option>
                <option value="anzahl">Sortierung: Anzahl</option>
              </select>
              <div className="flex overflow-hidden rounded border border-white/10" role="group" aria-label="Ansicht">
                <button
                  onClick={() => setView('list')}
                  aria-pressed={view === 'list'}
                  className={`px-2 py-1 ${view === 'list' ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'}`}
                >
                  Liste
                </button>
                <button
                  onClick={() => setView('grid')}
                  aria-pressed={view === 'grid'}
                  className={`px-2 py-1 ${view === 'grid' ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'}`}
                >
                  Raster
                </button>
              </div>
              <span className="ml-auto text-muted">
                {shown.length} Karten{shownTotal !== total ? ` · ${shownTotal} Stück` : ''}
              </span>
            </div>
          </div>

          {shown.length === 0 ? (
            <p className="text-sm text-muted">Kein Treffer für die Filter.</p>
          ) : view === 'grid' ? (
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {shown.map(({ card, std, alt }) => (
                <li key={card.id}>
                  <button onClick={() => setDetail(card)} className="block w-full text-left">
                    <div className="relative overflow-hidden rounded-md border border-white/10 hover:border-accent">
                      <CardImage
                        card={card}
                        src={images.get(card.id)}
                        className="aspect-[733/1024] w-full"
                      />
                      <span className="absolute right-1 top-1 rounded bg-bg/85 px-1.5 py-0.5 font-mono text-xs text-accent">
                        {std + alt}×
                      </span>
                      {alt > 0 && (
                        <span className="absolute left-1 top-1 rounded bg-accent/85 px-1 py-0.5 font-mono text-[10px] text-on-accent">
                          {alt} Alt
                        </span>
                      )}
                    </div>
                    <span className="mt-0.5 block truncate font-mono text-[11px] text-muted">
                      {card.name}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
              {shown.map(({ card, std, alt }) => (
                <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
                  <button
                    onClick={() => setDetail(card)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left hover:bg-white/5"
                  >
                    <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorBar[card.color]}`} />
                    <span className="text-accent">{std}×</span>
                    <span className="truncate">{card.name}</span>
                    {alt > 0 && (
                      <span className="shrink-0 rounded bg-accent/15 px-1 text-[10px] text-accent">
                        · {alt} Alt
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => void addToCollection(card.id, -1)}
                    disabled={std <= 0}
                    aria-label={`Ein Exemplar ${card.name} entfernen`}
                    title="Ein Standard-Exemplar entfernen"
                    className="rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-text disabled:opacity-30"
                  >
                    −
                  </button>
                  <button
                    onClick={() => void addToCollection(card.id, 1)}
                    aria-label={`Ein Exemplar ${card.name} hinzufügen`}
                    title="Ein Standard-Exemplar hinzufügen"
                    className="rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-accent"
                  >
                    +
                  </button>
                  <button
                    onClick={() => {
                      if (std > 0) void addToCollection(card.id, -std);
                      if (alt > 0) void addToCollection(altPrintingId(card.id), -alt);
                    }}
                    aria-label={`${card.name} ganz entfernen`}
                    title="Ganz entfernen (inkl. Alt-Art)"
                    className="rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-card-red"
                  >
                    ✕
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
        </>
      )}

      <CardDetail
        card={detail}
        owned={detail ? (detailGroup ? detailGroup.std + detailGroup.alt : 0) : undefined}
        altOwned={detailGroup?.alt ?? 0}
        onAltChange={
          detail ? (delta) => void addToCollection(altPrintingId(detail.id), delta) : undefined
        }
        onClose={() => setDetail(null)}
        onPick={(c) => setDetail(c)}
      />
    </section>
  );
}
