import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cardIndex, printingIndex } from '../data/catalog';
import { featureDB, hasFeatures } from '../data/features';
import { allMechanics, cardsWithMechanic, prettyMechanic } from '../domain/mechanics';
import { collectionToOwnedCounts } from '../domain/collection';
import { useCardImages } from '../data/cardImages';
import { db } from '../db/db';
import { CardImage } from './CardImage';
import { CardDetail } from './CardDetail';
import type { Card, CollectionEntry, Color } from '../domain/types';

/**
 * Mechanik-/Tag-Suche (Tab „Synergie"): Karten nach ihren Merkmalen finden
 * (Removal, Gig-Klau, ARASAKA, GO_SOLO …) — praktisch beim Deckbau. Über alle
 * 151 Karten, mit Bestand-Markierung. Quelle: `features.json` (`domain/mechanics.ts`).
 */
const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

export function MechanicSearchPanel() {
  const mechanics = useMemo(() => allMechanics(featureDB), []);
  const [token, setToken] = useState('');
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = useMemo(() => collectionToOwnedCounts(entries, printingIndex), [entries]);
  const images = useCardImages();
  const [detail, setDetail] = useState<Card | null>(null);

  const cards = useMemo(() => {
    if (!token) return [];
    return cardsWithMechanic(featureDB, token)
      .map((id) => cardIndex.get(id))
      .filter((c): c is Card => c !== undefined)
      .sort((a, b) => a.color.localeCompare(b.color) || a.name.localeCompare(b.name));
  }, [token]);

  if (!hasFeatures) return null;

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">Mechanik-Suche</h2>
      <p className="mb-3 text-xs text-muted">
        Karten nach Effekt/Tag finden (z. B. Gig-Klau, Removal, ARASAKA) — aus den
        Synergie-Merkmalen, über alle Karten mit Bestand-Markierung.
      </p>
      <select
        value={token}
        onChange={(e) => setToken(e.target.value)}
        className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-accent"
        aria-label="Mechanik wählen"
      >
        <option value="">Mechanik wählen…</option>
        {mechanics.map((m) => (
          <option key={m} value={m}>
            {prettyMechanic(m)}
          </option>
        ))}
      </select>

      {token && (
        <div className="mt-3">
          <div className="mb-1 font-mono text-xs text-muted">
            {cards.length} Karten · {prettyMechanic(token)}
          </div>
          <ul className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
            {cards.map((card) => {
              const have = owned.get(card.id) ?? 0;
              return (
                <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
                  <button
                    onClick={() => setDetail(card)}
                    className="flex min-w-0 flex-1 items-center gap-2 rounded py-0.5 text-left hover:bg-white/5"
                  >
                    <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                    <span className="truncate">{card.name}</span>
                    <span
                      className={`ml-auto shrink-0 text-xs ${have > 0 ? 'text-accent' : 'text-muted'}`}
                    >
                      {have > 0 ? `${have}×` : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <CardDetail
        card={detail}
        owned={detail ? (owned.get(detail.id) ?? 0) : undefined}
        onClose={() => setDetail(null)}
        onPick={(c) => setDetail(c)}
      />
    </section>
  );
}
