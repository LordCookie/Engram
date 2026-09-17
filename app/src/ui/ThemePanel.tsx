import { useLiveQuery } from 'dexie-react-hooks';
import { db, setThemePref } from '../db/db';
import { THEMES, applyTheme, isThemeName, type ThemeName } from './theme';

/**
 * Farbthema-Auswahl (unter „Mehr"). Wechselt sofort den Look und speichert die
 * Wahl in Dexie (`meta`); beim Start wendet `App` sie wieder an. Kartenfarben
 * (Fraktionen) bleiben unberührt.
 */
export function ThemePanel() {
  const pref = useLiveQuery(() => db.meta.get('theme').then((r) => r?.value), [], undefined);
  const current: ThemeName = isThemeName(pref) ? pref : 'default';

  function pick(id: ThemeName) {
    applyTheme(id); // sofort sichtbar
    void setThemePref(id); // persistiert
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">Farbthema</h2>
      <p className="mb-3 text-xs text-muted">
        Wechselt den Look. Kartenfarben (Fraktionen) bleiben gleich.
      </p>
      <div className="flex flex-wrap gap-2">
        {THEMES.map((t) => {
          const active = current === t.id;
          return (
            <button
              key={t.id}
              onClick={() => pick(t.id)}
              aria-pressed={active}
              className={`flex items-center gap-2 rounded-md border px-3 py-2 font-mono text-sm ${
                active ? 'border-accent text-text' : 'border-white/10 text-muted hover:border-accent'
              }`}
            >
              <span className="flex overflow-hidden rounded-full border border-white/20">
                <span className="h-4 w-4" style={{ background: t.swatch[0] }} />
                <span className="h-4 w-4" style={{ background: t.swatch[1] }} />
              </span>
              {t.label}
              {active && <span className="text-accent">✓</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
