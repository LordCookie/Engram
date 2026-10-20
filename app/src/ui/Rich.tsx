import { Fragment } from 'react';

/**
 * Übersetzte Sätze mit Hervorhebung: `**fett**` im Text wird zu <b>. So bleibt ein
 * Satz beim Übersetzen am Stück (statt in Fragmente um die <b>-Tags zerlegt).
 */
export function Rich({ text }: { text: string }) {
  const parts = text.split('**');
  return (
    <>
      {parts.map((p, i) => (i % 2 === 1 ? <b key={i}>{p}</b> : <Fragment key={i}>{p}</Fragment>))}
    </>
  );
}
