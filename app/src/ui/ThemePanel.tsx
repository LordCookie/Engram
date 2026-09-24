import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getIconFollowsThemePref, setIconFollowsThemePref, setThemePref } from '../db/db';
import { hasIconSwitch, setAppIcon } from '../native/engramIcon';
import { Logo } from './Logo';
import { THEMES, applyTheme, isThemeName, type ThemeName } from './theme';

/**
 * Farbthema-Auswahl (unter „Mehr"). Wechselt sofort den Look (inkl. Logo, Favicon,
 * Statusleiste) und speichert die Wahl in Dexie (`meta`); beim Start wendet `App` sie
 * wieder an. Kartenfarben (Fraktionen) bleiben unberührt. In der Android-App kann auch
 * das App-Icon dem Theme folgen (Schalter, Standard aus — Launcher-Eigenheiten).
 */
export function ThemePanel() {
  const pref = useLiveQuery(() => db.meta.get('theme').then((r) => r?.value), [], undefined);
  const current: ThemeName = isThemeName(pref) ? pref : 'default';
  const canSwitchIcon = hasIconSwitch();
  const [iconFollows, setIconFollows] = useState(false);
  const [iconMsg, setIconMsg] = useState<string | null>(null);

  useEffect(() => {
    void getIconFollowsThemePref().then(setIconFollows);
  }, []);

  async function changeIcon(theme: ThemeName) {
    const pending = await setAppIcon(theme);
    setIconMsg(pending ? 'Das App-Icon wechselt, sobald du die App verlässt.' : null);
  }

  function pick(id: ThemeName) {
    applyTheme(id); // sofort sichtbar
    void setThemePref(id); // persistiert
    if (canSwitchIcon && iconFollows) void changeIcon(id);
  }

  function toggleIcon() {
    const next = !iconFollows;
    setIconFollows(next);
    void setIconFollowsThemePref(next);
    void changeIcon(next ? current : 'default');
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">Farbthema</h2>
      <p className="mb-3 text-xs text-muted">
        Wechselt den Look, auch das Logo. Kartenfarben (Fraktionen) bleiben gleich.
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
              <span
                className="flex h-6 w-6 items-center justify-center rounded"
                style={{ background: t.icon.bg, color: t.icon.fg }}
              >
                <Logo className="h-5 w-4" />
              </span>
              {t.label}
              {active && <span className="text-accent">✓</span>}
            </button>
          );
        })}
      </div>

      {canSwitchIcon && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="font-mono text-sm">App-Icon passt sich an</div>
              <p className="text-xs text-muted">
                Das Icon auf dem Startbildschirm bekommt die Farbe des Themes. Es wechselt beim
                Verlassen der App; je nach Launcher musst du es danach neu aus der App-Übersicht
                auf den Startbildschirm ziehen.
              </p>
            </div>
            <button
              onClick={toggleIcon}
              role="switch"
              aria-checked={iconFollows}
              className={`shrink-0 rounded-md px-4 py-2 font-mono text-sm ${
                iconFollows ? 'bg-accent text-on-accent' : 'border border-white/10 text-muted hover:border-accent'
              }`}
            >
              {iconFollows ? 'An' : 'Aus'}
            </button>
          </div>
          {iconMsg && <p className="mt-2 font-mono text-[11px] text-accent">{iconMsg}</p>}
        </div>
      )}
    </section>
  );
}
