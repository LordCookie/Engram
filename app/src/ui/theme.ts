import { Capacitor } from '@capacitor/core';
import { logoIconSvg, svgDataUrl } from '../domain/logoShape';

/**
 * Farbthemen (Auswahl unter „Mehr"). Die Tokens leben in `index.css`
 * (`:root[data-theme='…']`); hier Liste + Anwenden. Die Präferenz wird über Dexie
 * (`meta`) persistiert (kein LocalStorage, § 6). Farben vom UI-Designer geprüft.
 *
 * Das Logo folgt dem Theme: in der App über `currentColor`, außerdem Favicon,
 * Browser-`theme-color`, Android-Statusleiste — und optional das App-Icon
 * (native/engramIcon.ts, Schalter unter „Mehr").
 */
export type ThemeName = 'default' | 'violet' | 'synth' | 'lime';

export interface ThemeInfo {
  id: ThemeName;
  label: string;
  /** [Akzent, zweite Farbe] — für die Vorschau-Swatch. */
  swatch: [string, string];
  /** Logo-/App-Icon-Farben: Logo auf Kachel (geprüfte Designer-Paare). */
  icon: { fg: string; bg: string };
  /** Seiten-Hintergrund (= `--c-bg`) — für Statusleiste und `theme-color`. */
  bg: string;
}

export const THEMES: readonly ThemeInfo[] = [
  { id: 'default', label: 'Standard', swatch: ['#F7D51D', '#0B0F14'], icon: { fg: '#F7D51D', bg: '#0B0F14' }, bg: '#0B0F14' },
  // Violett-Akzent auf fast Schwarz wäre als Icon zu kontrastarm → Pfirsich auf Violett (Designer-Paar).
  { id: 'violet', label: 'Violett', swatch: ['#6A00F4', '#FFD6A5'], icon: { fg: '#FFD6A5', bg: '#6A00F4' }, bg: '#140A1F' },
  { id: 'synth', label: 'Synthwave', swatch: ['#FF4696', '#1E1033'], icon: { fg: '#FF4696', bg: '#1E1033' }, bg: '#1E1033' },
  { id: 'lime', label: 'Lime', swatch: ['#B6FF2E', '#23262F'], icon: { fg: '#B6FF2E', bg: '#23262F' }, bg: '#23262F' },
];

export function isThemeName(v: unknown): v is ThemeName {
  return v === 'default' || v === 'violet' || v === 'synth' || v === 'lime';
}

export function themeInfo(theme: ThemeName): ThemeInfo {
  return THEMES.find((t) => t.id === theme) ?? THEMES[0];
}

/**
 * Wendet das Theme an: `data-theme` an <html> (CSS-Variablen greifen), Favicon und
 * `theme-color` in Themefarbe, in der App zusätzlich die Statusleiste. Best effort —
 * ein fehlendes Detail darf das Umschalten nie verhindern.
 */
export function applyTheme(theme: ThemeName): void {
  const root = document.documentElement;
  if (theme === 'default') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  const info = themeInfo(theme);
  try {
    let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = svgDataUrl(logoIconSvg(info.icon.fg, info.icon.bg));
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', info.bg);
  } catch {
    /* ohne DOM-Details weiter */
  }

  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/status-bar')
      .then(({ StatusBar, Style }) =>
        Promise.all([
          StatusBar.setBackgroundColor({ color: info.bg }),
          StatusBar.setStyle({ style: Style.Dark }), // helle Symbole auf dunklem Grund
        ]),
      )
      .catch(() => {});
  }
}
