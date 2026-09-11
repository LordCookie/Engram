import { useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalog, cardIndex } from '../data/catalog';
import { searchCards } from '../domain/search';
import { db, addToCollection, addWant } from '../db/db';
import type { Color } from '../domain/types';

/**
 * Schnellerfassung (PLAN.md § 5, Aufgabe 5) — die wichtigste UI des Projekts.
 * Feld fokussiert, tippen, Pfeiltasten, Enter setzt +1, Feld leert sich, Fokus
 * bleibt. Strg+Z macht rückgängig. Ziel: ein Booster in unter 30 Sekunden.
 */

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

export function QuickAdd() {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [wantNote, setWantNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => searchCards(catalog, query, { limit: 8 }), [query]);

  const total = useLiveQuery(
    () => db.collection.toArray().then((es) => es.reduce((s, e) => s + e.quantity, 0)),
    [],
    0,
  );
  const lastQty = useLiveQuery(
    () =>
      lastAdded
        ? db.collection.get(lastAdded).then((r) => r?.quantity ?? 0)
        : Promise.resolve(0),
    [lastAdded, total],
    0,
  );

  async function addByIndex(idx: number) {
    const card = results[idx];
    if (!card) return;
    await addToCollection(card.id, 1, 'schnellerfassung');
    setUndoStack((s) => [...s, card.id]);
    setLastAdded(card.id);
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
  }

  function addToWants(cardId: string, name: string) {
    void addWant(cardId, 1);
    setWantNote(name);
    setQuery('');
    setSelected(0);
    inputRef.current?.focus();
    window.setTimeout(() => setWantNote((n) => (n === name ? null : n)), 2000);
  }

  async function undo() {
    if (undoStack.length === 0) return;
    const id = undoStack[undoStack.length - 1];
    await addToCollection(id, -1);
    setLastAdded(id);
    setUndoStack((s) => s.slice(0, -1));
    inputRef.current?.focus();
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelected((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelected((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      void addByIndex(Math.min(selected, results.length - 1));
    } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      void undo();
    }
  }

  const lastCard = lastAdded ? cardIndex.get(lastAdded) : undefined;

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-1 flex items-baseline justify-between">
        <h2 className="font-mono text-lg">Schnellerfassung</h2>
        <span className="font-mono text-sm text-muted">
          Bestand: <span className="text-accent">{total}</span> Karten
        </span>
      </div>
      <p className="mb-3 text-xs text-muted">
        Tippen · <kbd>↑</kbd>/<kbd>↓</kbd> wählen · <kbd>Enter</kbd> +1 ·{' '}
        <kbd>Strg</kbd>+<kbd>Z</kbd> rückgängig ({undoStack.length})
      </p>

      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(0);
        }}
        onKeyDown={onKeyDown}
        placeholder="Kartenname…"
        className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
      />

      {lastCard && (
        <p className="mt-2 text-sm">
          <span className="text-muted">Zuletzt:</span>{' '}
          <span className={`inline-block h-2 w-2 rounded-full ${colorDot[lastCard.color]}`} />{' '}
          {lastCard.name}{' '}
          <span className="text-muted">
            {lastQty > 0 ? `— jetzt ${lastQty}× im Bestand` : '— entfernt'}
          </span>
        </p>
      )}
      {wantNote && <p className="mt-2 text-sm text-accent">☆ {wantNote} — auf der Want-Liste</p>}

      {results.length > 0 && (
        <ul className="mt-3 divide-y divide-white/5 overflow-hidden rounded-md border border-white/5">
          {results.map((card, i) => (
            <li
              key={card.id}
              onMouseEnter={() => setSelected(i)}
              onClick={() => void addByIndex(i)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                i === selected ? 'bg-white/10' : ''
              }`}
            >
              <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorDot[card.color]}`} />
              <span className="font-mono">{card.name}</span>
              {card.subtitle && <span className="text-sm text-muted">{card.subtitle}</span>}
              <span className="ml-auto font-mono text-xs text-muted">
                {card.type}
                {typeof card.ram === 'number' ? ` · RAM ${card.ram}` : ''}
              </span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  addToWants(card.id, card.name);
                }}
                title="Auf die Want-Liste (statt in die Sammlung)"
                aria-label={`${card.name} auf die Want-Liste`}
                className="shrink-0 rounded px-1 text-accent hover:bg-white/10"
              >
                ☆
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
