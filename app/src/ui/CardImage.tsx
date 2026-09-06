import { useEffect, useState } from 'react';
import type { Card, Color } from '../domain/types';

/**
 * Zeigt ein Kartenbild (via externem Link, § 8) oder einen farbigen Platzhalter,
 * solange kein Bild vorliegt (offline / noch nicht geladen) oder das Laden
 * fehlschlägt (abgelaufene Signatur o. Ä.). Größe kommt vom Aufrufer über
 * `className` (z. B. "h-40 w-28" oder "h-10 w-7").
 */
const colorBg: Record<Color, string> = {
  RED: 'bg-card-red/20',
  GREEN: 'bg-card-green/20',
  BLUE: 'bg-card-blue/20',
  YELLOW: 'bg-card-yellow/20',
};

export function CardImage({
  card,
  src,
  className = '',
}: {
  card: Card;
  src?: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  // Neue Quelle → Fehlerzustand zurücksetzen (sonst bliebe der Platzhalter kleben).
  useEffect(() => setFailed(false), [src]);

  const base = `shrink-0 overflow-hidden rounded ${className}`;
  if (src && !failed) {
    return (
      <img
        src={src}
        alt={card.name}
        loading="lazy"
        onError={() => setFailed(true)}
        className={`${base} object-cover`}
      />
    );
  }
  return (
    <div className={`${base} flex items-center justify-center ${colorBg[card.color]}`}>
      <span className="px-0.5 text-center font-mono text-[8px] leading-tight text-muted">
        {card.name}
      </span>
    </div>
  );
}
