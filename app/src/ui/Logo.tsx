import { LOGO_VIEWBOX, PAD_PATH, SKULL_PATH, TRACE_PATHS, TRACE_WIDTH } from '../domain/logoShape';

/**
 * engram-Logo „Platine 45°" (docs/logo/engram-logo.svg): Totenkopf, der nach unten in
 * Leiterbahnen mit Lötflächen übergeht. `currentColor` → folgt dem Akzent des Farbthemas;
 * Augen/Nase sind echte Löcher (evenodd), der Hintergrund scheint durch.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox={LOGO_VIEWBOX} className={className} aria-hidden="true" focusable="false">
      <path fill="currentColor" fillRule="evenodd" d={SKULL_PATH} />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth={TRACE_WIDTH}
        strokeLinejoin="miter"
        d={TRACE_PATHS.join(' ')}
      />
      <path fill="currentColor" d={PAD_PATH} />
    </svg>
  );
}
