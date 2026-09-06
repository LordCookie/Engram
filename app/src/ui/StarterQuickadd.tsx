import { useState } from 'react';
import { starters, starterEntries, starterSize } from '../domain/starters';
import { addCounts } from '../db/db';

/**
 * Starter-Quickadd (PLAN.md § 5, Aufgabe 7): ein Klick trägt ein komplettes
 * Starter-Deck (Legends + Karten mit Stückzahlen) in die Sammlung ein.
 */
export function StarterQuickadd() {
  const [msg, setMsg] = useState<string | null>(null);

  async function add(deckId: string) {
    const deck = starters.find((d) => d.id === deckId);
    if (!deck) return;
    await addCounts(
      starterEntries(deck).map((e) => ({ printingId: e.cardId, count: e.count })),
      `starter:${deck.id}`,
    );
    setMsg(`${starterSize(deck)} Karten von „${deck.name}" eingetragen.`);
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">Starter-Quickadd</h2>
      <p className="mb-3 text-xs text-muted">
        Ein Klick trägt ein komplettes Starter-Deck ein (Legends + Karten).
      </p>
      <div className="flex flex-wrap gap-3">
        {starters.map((deck) => (
          <button
            key={deck.id}
            onClick={() => void add(deck.id)}
            className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-sm hover:border-accent"
          >
            + {deck.name}{' '}
            <span className="text-muted">
              ({deck.faction} · {starterSize(deck)})
            </span>
          </button>
        ))}
      </div>
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
    </section>
  );
}
