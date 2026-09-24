/**
 * Geometrie des engram-Logos „Platine 45°" (docs/logo/engram-logo.svg) — eine Quelle
 * für Header-Logo, Favicon und Boot-Animation. Framework-frei & rein testbar.
 * (Die Raster-Icons erzeugt docs/logo/make_icons.py mit denselben Koordinaten.)
 */

/** viewBox, die den Inhalt eng umschließt. */
export const LOGO_VIEWBOX = '40 18 120 180';

/** Schädel mit Augen und Nase als Löchern (fill-rule evenodd). */
export const SKULL_PATH =
  'M70 24 H130 L154 48 V90 L138 106 V118 H62 V106 L46 90 V48 Z ' +
  'M66 62 H92 V80 L84 88 H66 Z M108 62 H134 V88 H116 L108 80 Z M100 90 L106 98 L100 106 L94 98 Z';

/** Nur die Augen (für das Aufleuchten in der Boot-Animation). */
export const EYES_PATH = 'M66 62 H92 V80 L84 88 H66 Z M108 62 H134 V88 H116 L108 80 Z';

/** Leiterbahnen, jeweils von der Lötfläche NACH OBEN in den Schädel (Stromrichtung). */
export const TRACE_PATHS: readonly string[] = [
  'M52 167 V146 L70 128 V117',
  'M76 175 V149 L85 140 V117',
  'M100 183 V117',
  'M124 175 V149 L115 140 V117',
  'M148 167 V146 L130 128 V117',
];

/** Lötflächen (10×10). */
export const PAD_PATH =
  'M47 166 h10 v10 h-10 Z M71 174 h10 v10 h-10 Z M95 182 h10 v10 h-10 Z M119 174 h10 v10 h-10 Z M143 166 h10 v10 h-10 Z';

export const TRACE_WIDTH = 6;

/**
 * App-Icon als SVG-Text (Logo auf abgerundeter Kachel) — für das Favicon, das der
 * Farbe des Themes folgt. `fg`/`bg` als CSS-Farbe (#RRGGBB).
 */
export function logoIconSvg(fg: string, bg: string): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">` +
    `<rect width="200" height="200" rx="44" fill="${bg}"/>` +
    `<g transform="translate(100 100) scale(0.82) translate(-100 -108)">` +
    `<path fill="${fg}" fill-rule="evenodd" d="${SKULL_PATH}"/>` +
    `<path fill="none" stroke="${fg}" stroke-width="${TRACE_WIDTH}" stroke-linejoin="miter" d="${TRACE_PATHS.join(' ')}"/>` +
    `<path fill="${fg}" d="${PAD_PATH}"/>` +
    `</g></svg>`
  );
}

/** Data-URL eines SVG-Texts (für <link rel="icon">). */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
