import { useEffect, useMemo } from 'react';
import { cardIndex } from '../data/catalog';
import { featureDB, hasFeatures } from '../data/features';
import { pageUrlById } from '../data/printingLinks';
import { useCardImages } from '../data/cardImages';
import { topSynergies } from '../domain/synergy';
import { CardImage } from './CardImage';
import type { Card, Color } from '../domain/types';

/**
 * Kartendetail als Overlay (wiederverwendbar): großes Bild, Regeltext, Werte,
 * Bestand und die stärksten vorhergesagten Synergie-Partner. Antippen einer Karte
 * in Sammlung/Deck/Synergie öffnet das hier.
 */
const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

export function CardDetail({
  card,
  owned,
  onClose,
  onPick,
}: {
  card: Card | null;
  owned?: number;
  onClose: () => void;
  /** Optional: einen Synergie-Partner anwählen (öffnet dessen Detail). */
  onPick?: (card: Card) => void;
}) {
  const images = useCardImages();
  const partners = useMemo(
    () => (card && hasFeatures ? topSynergies(card.id, featureDB, cardIndex, 6) : []),
    [card],
  );

  // ESC schließt; Body-Scroll sperren, solange offen.
  useEffect(() => {
    if (!card) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [card, onClose]);

  if (!card) return null;
  const url = pageUrlById.get(card.id);

  return (
    <div
      className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <div className="flex items-baseline gap-2">
            <span className={`h-2.5 w-2.5 rounded-full ${colorDot[card.color]}`} />
            <div>
              <div className="font-mono text-lg">{card.name}</div>
              {card.subtitle && <div className="text-sm text-muted">{card.subtitle}</div>}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Schließen"
            className="rounded px-2 py-1 text-muted hover:text-text"
          >
            ✕
          </button>
        </div>

        <div className="flex gap-4">
          <CardImage card={card} src={images.get(card.id)} className="h-56 w-40 shrink-0" />
          <div className="min-w-0 flex-1 space-y-2 font-mono text-sm">
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-muted">
              <span>{card.type}</span>
              <span className="text-text">{card.color}</span>
              {typeof card.ram === 'number' && <span>RAM {card.ram}</span>}
              {typeof card.cost === 'number' && <span>Cost {card.cost}</span>}
              {typeof card.power === 'number' && <span>Power {card.power}</span>}
              {card.collectorNumber && <span>#{card.collectorNumber}</span>}
            </div>
            {typeof owned === 'number' && (
              <div className={owned > 0 ? 'text-accent' : 'text-muted'}>
                {owned > 0 ? `${owned}× im Bestand` : 'nicht im Bestand'}
              </div>
            )}
            {card.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {card.tags.map((t) => (
                  <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-muted">
                    {t}
                  </span>
                ))}
              </div>
            )}
            {url && (
              <a
                href={url}
                target="_blank"
                rel="noreferrer"
                className="inline-block text-xs text-muted hover:text-accent"
              >
                auf cyberpunktcg.com ansehen ↗
              </a>
            )}
          </div>
        </div>

        {card.rulesText && (
          <p className="mt-3 whitespace-pre-line rounded-md bg-bg/60 p-3 text-sm text-muted">
            {card.rulesText}
          </p>
        )}

        {partners.length > 0 && (
          <div className="mt-4">
            <h3 className="mb-2 font-mono text-sm">Beste Synergie-Partner</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {partners.map((p) => (
                <button
                  key={p.card.id}
                  onClick={() => onPick?.(p.card)}
                  disabled={!onPick}
                  className="flex items-center gap-2 rounded-md bg-bg/60 p-1.5 text-left enabled:hover:bg-white/10"
                >
                  <CardImage card={p.card} src={images.get(p.card.id)} className="h-11 w-8" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{p.card.name}</span>
                    <span className="font-mono text-[10px] text-accent">{p.score.toFixed(1)}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
