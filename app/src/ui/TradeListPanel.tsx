import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cardIndex, printingIndex } from '../data/catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { collectionToOwnedCounts } from '../domain/collection';
import { tradeSurplus, tradeSurplusTotal } from '../domain/tradeList';
import { db } from '../db/db';
import { useCardImages } from '../data/cardImages';
import { CardImage } from './CardImage';
import { Collapsible } from './Collapsible';
import type { Card, CollectionEntry, Color } from '../domain/types';

/**
 * Tausch-/Dubletten-Liste: Karten über einem vollen Playset (Legends 1, sonst
 * `maxCopiesPerCard`) — die kannst du tauschen. Rein abgeleitet aus dem Bestand
 * (`domain/tradeList.ts`), keine eigene Persistenz.
 */
const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

const maxCopies = rulesetV1Loaded.maxCopiesPerCard;
const playsetFor = (c: Card) => (c.type === 'LEGEND' ? 1 : maxCopies);

export function TradeListPanel() {
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = useMemo(() => collectionToOwnedCounts(entries, printingIndex), [entries]);
  const rows = useMemo(() => tradeSurplus(owned, cardIndex, playsetFor), [owned]);
  const total = tradeSurplusTotal(rows);
  const images = useCardImages();

  return (
    <Collapsible
      title="Tausch-Liste"
      right={rows.length > 0 ? `${total} zu viel · ${rows.length} Karten` : 'keine'}
    >
      <p className="mb-2 text-xs text-muted">
        Karten über einem vollen Playset (Legends 1, sonst {maxCopies}) — die kannst du tauschen.
      </p>
      {rows.length === 0 ? (
        <p className="text-xs text-muted">Keine Dubletten — nichts über dem Playset.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map(({ card, owned: qty, surplus }) => (
            <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
              <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
              <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
              <span className="truncate">{card.name}</span>
              <span className="ml-auto shrink-0 text-xs text-muted">
                {qty}× · <span className="text-card-green">+{surplus} übrig</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}
