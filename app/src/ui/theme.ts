/**
 * Farbthemen (Auswahl unter „Mehr"). Die Tokens leben in `index.css`
 * (`:root[data-theme='…']`); hier nur Liste + das Setzen des Attributs. Die
 * Präferenz wird über Dexie (`meta`) persistiert (kein LocalStorage, § 6).
 * Farben vom UI-Designer geprüft.
 */
export type ThemeName = 'default' | 'violet' | 'synth';

export interface ThemeInfo {
  id: ThemeName;
  label: string;
  /** [Akzent, zweite Farbe] — für die Vorschau-Swatch. */
  swatch: [string, string];
}

export const THEMES: readonly ThemeInfo[] = [
  { id: 'default', label: 'Standard', swatch: ['#F7D51D', '#0B0F14'] },
  { id: 'violet', label: 'Violett', swatch: ['#6A00F4', '#FFD6A5'] },
  { id: 'synth', label: 'Synthwave', swatch: ['#FF4696', '#1E1033'] },
];

export function isThemeName(v: unknown): v is ThemeName {
  return v === 'default' || v === 'violet' || v === 'synth';
}

/** Setzt/entfernt `data-theme` an <html> — die CSS-Variablen greifen dann. */
export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  if (theme === 'default') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);
}
