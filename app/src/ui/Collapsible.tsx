import { useState, type ReactNode } from 'react';

/**
 * Einklappbarer Abschnitt (Kopf mit Titel + optionaler Kurzinfo rechts).
 * Für die Sammlungs-Panels (Want-/Tausch-Liste), damit sie den Blick auf den
 * Solver nicht zustellen — Default eingeklappt.
 */
export function Collapsible({
  title,
  right,
  defaultOpen = false,
  children,
}: {
  title: string;
  right?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="rounded-lg bg-surface p-4">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-baseline justify-between gap-2 text-left"
      >
        <span className="flex items-baseline gap-2">
          <span className="font-mono text-lg">{title}</span>
          <span className="font-mono text-xs text-muted">{open ? '▾' : '▸'}</span>
        </span>
        {right && <span className="shrink-0 font-mono text-sm text-muted">{right}</span>}
      </button>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}
