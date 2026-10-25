import type { ReactNode } from 'react';
import { Icon } from './Icon';

/**
 * Eigene Häkchen-Box statt der Browser-Checkbox: Kästchen im Theme (Akzent, wenn an) mit
 * dem Häkchen-Icon. Barrierefrei als `role="checkbox"` mit `aria-checked`.
 */
export function Checkbox({
  checked,
  onChange,
  children,
  className = '',
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-1.5 text-left ${className}`}
    >
      <span
        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-[5px] border transition-colors ${
          checked ? 'border-accent bg-accent text-on-accent' : 'border-white/25 bg-bg text-transparent'
        }`}
      >
        <Icon name="check" className="h-3 w-3" />
      </span>
      {children}
    </button>
  );
}
