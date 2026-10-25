import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalog, cardIndex, printingIndex } from '../data/catalog';
import { collectionToOwnedCounts } from '../domain/collection';
import { searchCards } from '../domain/search';
import { wantRows, wantsStillTotal } from '../domain/wants';
import { db, addWant, removeWant, type WantEntry } from '../db/db';
import { useCardImages } from '../data/cardImages';
import { CardImage } from './CardImage';
import { Collapsible } from './Collapsible';
import type { CollectionEntry, Color } from '../domain/types';
import { t } from '../i18n';
import { Icon } from './Icon';

/**
 * Want-Liste (Wunschliste): was du noch besorgen willst. Befüllbar hier per
 * Suche, beim Erfassen (☆) und aus dem Deck (fehlende Karten → Want-Liste).
 * Verrechnet mit dem Bestand (`domain/wants.ts`).
 */
const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

export function WantListPanel() {
  const wants = useLiveQuery(() => db.wants.toArray(), [], [] as WantEntry[]);
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = useMemo(() => collectionToOwnedCounts(entries, printingIndex), [entries]);
  const images = useCardImages();

  const rows = useMemo(() => wantRows(wants, owned, cardIndex), [wants, owned]);
  const still = wantsStillTotal(rows);

  const [query, setQuery] = useState('');
  const results = useMemo(
    () => (query.trim() ? searchCards(catalog, query, { limit: 6 }) : []),
    [query],
  );

  return (
    <Collapsible
      title={t('Want-Liste')}
      right={wants.length > 0 ? t('{n} zu holen · {m} Karten', { n: still, m: wants.length }) : t('leer')}
    >
      {/* Suche zum Hinzufügen */}
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={t('Karte suchen und auf die Want-Liste setzen…')}
        className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-sm text-text outline-none focus:border-accent"
      />
      {results.length > 0 && (
        <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-md border border-white/5">
          {results.map((card) => (
            <li
              key={card.id}
              onClick={() => {
                void addWant(card.id, 1);
                setQuery('');
              }}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 font-mono text-sm hover:bg-white/10"
            >
              <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
              <span className="truncate">{card.name}</span>
              {card.subtitle && <span className="truncate text-xs text-muted">{card.subtitle}</span>}
              <span className="ml-auto flex shrink-0 items-center gap-0.5 text-accent">
                <Icon name="star" className="h-4 w-4" />
                <Icon name="plus" className="h-3 w-3" />
              </span>
            </li>
          ))}
        </ul>
      )}

      {wants.length === 0 ? (
        <p className="mt-3 text-xs text-muted">
          {t('Noch nichts gewünscht. Karten hier suchen, beim Erfassen den Stern antippen oder im Deck „Fehlende Karten → Want-Liste".')}
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {rows.map(({ card, want, have, still: st }) => (
            <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
              <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
              <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
              <button
                onClick={() => void addWant(card.id, -1)}
                title={t('Wunschmenge −1')}
                className="text-muted hover:text-text"
              >
                −
              </button>
              <span className="w-8 text-center text-accent">{want}×</span>
              <button
                onClick={() => void addWant(card.id, 1)}
                title={t('Wunschmenge +1')}
                className="text-muted hover:text-text"
              >
                +
              </button>
              <span className="truncate">{card.name}</span>
              <span className="ml-auto flex items-center gap-2 shrink-0 text-xs">
                {st === 0 ? (
                  <span className="inline-flex items-center gap-1 text-card-green"><Icon name="check" className="h-3.5 w-3.5" />{t('im Bestand')}</span>
                ) : (
                  <span className="text-muted">
                    {have}/{want} · <span className="text-card-red">−{st}</span>
                  </span>
                )}
                <button
                  onClick={() => void removeWant(card.id)}
                  title={t('Von der Want-Liste entfernen')}
                  aria-label={t('{name} von der Want-Liste entfernen', { name: card.name })}
                  className="text-muted hover:text-card-red"
                >
                  <Icon name="close" className="h-4 w-4" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Collapsible>
  );
}
