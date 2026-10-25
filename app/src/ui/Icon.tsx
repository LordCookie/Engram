/**
 * Eigene Linien-Icons statt Unicode-Symbolen/Emojis (✕ ✓ ☆ ▸ ↗ 🔦 …): 24×24, Strich in
 * currentColor → folgen Farbthema und Textfarbe, sehen auf jedem Gerät gleich aus.
 * Gleiche Formsprache wie die Navigations-Icons (`NavIcon.tsx`).
 */
export type IconName =
  | 'close'
  | 'check'
  | 'star'
  | 'starFilled'
  | 'chevronLeft'
  | 'chevronRight'
  | 'chevronDown'
  | 'chevronUp'
  | 'external'
  | 'warning'
  | 'back'
  | 'play'
  | 'plus'
  | 'flashlight'
  | 'gamepad'
  | 'trophy'
  | 'restart';

const PATHS: Record<IconName, string> = {
  close: 'M6.5 6.5l11 11M17.5 6.5l-11 11',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  star: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8Z',
  starFilled: 'M12 3.8l2.5 5.2 5.7.8-4.1 4 1 5.6L12 16.7l-5.1 2.7 1-5.6-4.1-4 5.7-.8Z',
  chevronLeft: 'M14.5 6l-6 6 6 6',
  chevronRight: 'M9.5 6l6 6-6 6',
  chevronDown: 'M6 9.5l6 6 6-6',
  chevronUp: 'M6 14.5l6-6 6 6',
  external: 'M14 4h6v6M20 4l-8.5 8.5M18 14v4.5a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10',
  warning: 'M12 4.5l8.5 15h-17Z M12 10v4 M12 16.8v.4',
  back: 'M19 12H5.5M11 6l-6 6 6 6',
  play: 'M8 5.5v13l10.5-6.5Z',
  plus: 'M12 5.5v13M5.5 12h13',
  flashlight: 'M8 3.5h8v3.5l-2 3V20a1 1 0 0 1-1 1h-2a1 1 0 0 1-1-1V10L8 7Z M12 13.5v2',
  gamepad:
    'M7.5 8.5h9a4.5 4.5 0 0 1 4.5 4.5v.8a3 3 0 0 1-5.3 1.9l-1.2-1.4h-5l-1.2 1.4A3 3 0 0 1 3 13.8V13a4.5 4.5 0 0 1 4.5-4.5Z M8 11v3 M6.5 12.5h3 M15.5 12h.01 M17.5 13.5h.01',
  trophy: 'M8 4h8v5a4 4 0 0 1-8 0Z M8 6H5a3 3 0 0 0 3.2 3.9 M16 6h3a3 3 0 0 1-3.2 3.9 M12 13v4 M9 20h6 M10 17h4',
  restart: 'M4.5 12a7.5 7.5 0 1 0 2.2-5.3 M4.5 4.5V8H8',
};

const FILLED: ReadonlySet<IconName> = new Set(['starFilled', 'play']);

export function Icon({ name, className = 'h-4 w-4' }: { name: IconName; className?: string }) {
  const filled = FILLED.has(name);
  return (
    <svg
      viewBox="0 0 24 24"
      className={`inline-block shrink-0 align-[-0.15em] ${className}`}
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
