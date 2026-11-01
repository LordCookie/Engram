import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { nativeUpdates } from '../native/engramUpdate';
import { Icon } from './Icon';
import {
  applyData,
  initUpdateChecks,
  openInstallSettings,
  startAppUpdate,
  msgText,
  updateData,
  useUpdates,
} from './updates';

/**
 * Hinweis oben in der App: neue App-Version (in der App: „Jetzt aktualisieren" lädt die APK
 * und öffnet den Android-Installer) oder neue Daten (neue Karten bei NetDeck, frisches
 * Korpus/Meta-Decks). Geprüft wird beim Start, beim Zurückholen und stündlich (`updates.ts`).
 * Schließbar; kommt beim nächsten Start ggf. wieder.
 */
export function UpdateBanner() {
  const u = useUpdates();
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => initUpdateChecks(), []);

  const busy = u.appPhase !== 'idle' && u.appPhase !== 'error';
  const hasData = u.newCards > 0 || u.dataNew || u.needsReload || u.dataPhase === 'loading';
  if ((!u.appUpdate && !hasData) || (dismissed && !busy)) return null;

  return (
    <div className="space-y-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-sm">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          {u.appUpdate && <AppUpdateAction />}
          {!u.appUpdate && hasData && <DataUpdateAction />}
        </div>
        {!busy && (
          <button
            onClick={() => setDismissed(true)}
            aria-label={t('Hinweis schließen')}
            className="shrink-0 rounded px-1 text-muted hover:text-text"
          >
            <Icon name="close" className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>
  );
}

/** Neue App-Version: Knopf + Fortschritt/Erlaubnis/Fehler (auch im Panel unter „Mehr"). */
export function AppUpdateAction() {
  const u = useUpdates();
  const up = u.appUpdate;
  if (!up) return null;
  const native = nativeUpdates() && !!up.apk;
  const pct = u.progress && u.progress.total > 0 ? Math.min(100, Math.round((u.progress.done / u.progress.total) * 100)) : 0;

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-accent">{t('Neue Version {tag} verfügbar', { tag: up.tag })}</span>
        {(u.appPhase === 'idle' || u.appPhase === 'error') &&
          (native ? (
            <button
              onClick={() => void startAppUpdate()}
              className="rounded-md bg-accent px-3 py-1 text-on-accent"
            >
              {u.appPhase === 'error' ? t('Noch einmal') : t('Jetzt aktualisieren')}
            </button>
          ) : (
            <a href={up.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 underline hover:text-accent">
              {t('Zum Download')} <Icon name="external" className="h-3.5 w-3.5" />
            </a>
          ))}
      </div>
      {u.appPhase === 'downloading' && (
        <div>
          <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-accent transition-[width]" style={{ width: `${pct}%` }} />
          </div>
          <p className="mt-1 text-xs text-muted">{t('Lade {tag} … {pct} %', { tag: up.tag, pct })}</p>
        </div>
      )}
      {u.appPhase === 'needsPermission' && (
        <div className="space-y-1.5 text-xs">
          <p className="text-text">
            {t('Android fragt einmalig: engram muss Apps installieren dürfen. Danach geht es von selbst weiter.')}
          </p>
          <button onClick={() => void openInstallSettings()} className="rounded-md bg-accent px-3 py-1 text-sm text-on-accent">
            {t('Erlauben')}
          </button>
        </div>
      )}
      {u.appPhase === 'installing' && (
        <p className="text-xs text-text">{t('Android-Installer geöffnet — dort „Installieren" tippen. Deine Sammlung bleibt erhalten.')}</p>
      )}
      {u.appPhase === 'error' && u.appMsg && <p className="text-xs text-card-red">{msgText(u.appMsg)}</p>}
    </div>
  );
}

/** Neue Daten: laden, danach anwenden (App lädt neu). */
export function DataUpdateAction({ showAlways = false }: { showAlways?: boolean }) {
  const u = useUpdates();
  const parts: string[] = [];
  if (u.newCards > 0) parts.push(t('{n} neue Karten', { n: u.newCards }));
  if (u.dataNew) parts.push(t('frisches Korpus & Meta-Decks'));

  return (
    <div className="space-y-2">
      {u.needsReload ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-accent">{t('Neue Daten geladen')}</span>
          <button onClick={applyData} className="rounded-md bg-accent px-3 py-1 text-on-accent">
            {t('Anwenden (App lädt neu)')}
          </button>
        </div>
      ) : (
        (parts.length > 0 || showAlways) && (
          <div className="flex flex-wrap items-center gap-2">
            {parts.length > 0 && <span className="text-accent">{t('Neue Daten: {what}', { what: parts.join(' · ') })}</span>}
            <button
              onClick={() => void updateData()}
              disabled={u.dataPhase === 'loading'}
              className="rounded-md bg-accent px-3 py-1 text-on-accent disabled:opacity-60"
            >
              {u.dataPhase === 'loading' ? t('Lade …') : t('Daten aktualisieren')}
            </button>
          </div>
        )
      )}
      {u.dataMsgs.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted">
          {u.dataMsgs.map((m, i) => (
            <li key={i}>{msgText(m)}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
