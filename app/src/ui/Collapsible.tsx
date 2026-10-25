import { useState, type ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Einklappbarer Abschnitt (Kopf mit Titel + optionaler Kurzinfo rechts).
 * Für die Sammlungs-Panels (Want-/Tausch-Liste), damit sie den Blick auf den
 * Solver nicht zustellen — Default eingeklappt.
 */
export function Collapsible({
  title,
  right,
  defaultOpen = false,
  open: openProp,
  onOpenChange,
  small = false,
  children,
}: {
  title: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  /** Optional von außen gesteuert (Zustand überlebt dann ein Aus-/Einblenden). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Kleiner Titel für Unterabschnitte (z. B. Combos in der Synergie). */
  small?: boolean;
  children: ReactNode;
}) {
  const [openState, setOpenState] = useState(defaultOpen);
  const open = openProp ?? openState;
  const toggle = () => {
    setOpenState(!open);
    onOpenChange?.(!open);
  };
  return (
    <section className="rounded-lg bg-surface p-4">
      <button
        onClick={toggle}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className={`font-mono ${small ? 'text-sm' : 'text-lg'}`}>{title}</span>
          <Icon name={open ? 'chevronDown' : 'chevronRight'} className="h-4 w-4 self-center text-muted" />
        </span>
        {right && <span className={`shrink-0 font-mono text-muted ${small ? 'text-xs' : 'text-sm'}`}>{right}</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
