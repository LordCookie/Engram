/**
 * engram-Logo „Platine 45°" (docs/logo/engram-logo.svg): Totenkopf, der nach unten in
 * Leiterbahnen mit Lötflächen übergeht. `currentColor` → folgt dem Akzent des Farbthemas;
 * Augen/Nase sind echte Löcher (evenodd), der Hintergrund scheint durch.
 */
export function Logo({ className = '' }: { className?: string }) {
  return (
    <svg viewBox="40 18 120 180" className={className} aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M70 24 H130 L154 48 V90 L138 106 V118 H62 V106 L46 90 V48 Z M66 62 H92 V80 L84 88 H66 Z M108 62 H134 V88 H116 L108 80 Z M100 90 L106 98 L100 106 L94 98 Z"
      />
      <path
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeLinejoin="miter"
        d="M70 117 V128 L52 146 V167 M85 117 V140 L76 149 V175 M100 117 V183 M115 117 V140 L124 149 V175 M130 117 V128 L148 146 V167"
      />
      <path
        fill="currentColor"
        d="M47 166 h10 v10 h-10 Z M71 174 h10 v10 h-10 Z M95 182 h10 v10 h-10 Z M119 174 h10 v10 h-10 Z M143 166 h10 v10 h-10 Z"
      />
    </svg>
  );
}
