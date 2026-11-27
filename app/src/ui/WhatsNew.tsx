import { useEffect, useState } from 'react';
import { noteLines } from '../domain/releaseNotes';
import { t } from '../i18n';
import { useBackClose } from './backButton';
import { Icon } from './Icon';
import { markWhatsNewSeen, pendingWhatsNew, type WhatsNew as WhatsNewData } from './updates';

/**
 * „Was ist neu" (Muster aus ScryGlass): nach einem Update einmal die Release-Notes der neuen
 * Version als Fenster. Schließen (Knopf, außerhalb tippen, Zurück-Taste) merkt die Version.
 * Die Notes stehen so im Release, wie sie geschrieben wurden (meist Deutsch).
 */
export function WhatsNew() {
  const [data, setData] = useState<WhatsNewData | null>(null);

  useEffect(() => {
    void pendingWhatsNew().then(setData);
  }, []);

  const close = () => {
    setData(null);
    void markWhatsNewSeen();
  };
  useBackClose(!!data, close);
  if (!data) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 sm:items-center" onClick={close}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('Was ist neu in v{v}', { v: data.version })}
        onClick={(e) => e.stopPropagation()}
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-lg border border-accent/40 bg-surface p-4 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="font-mono text-lg text-accent">{t('Was ist neu in v{v}', { v: data.version })}</h2>
          <button onClick={close} aria-label={t('Schließen')} className="shrink-0 rounded px-1 text-muted hover:text-text">
            <Icon name="close" className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-1.5 text-sm">
          {noteLines(data.notes).map((l, i) =>
            l.kind === 'heading' ? (
              <h3 key={i} className="pt-2 font-mono text-sm text-accent">
                {l.text}
              </h3>
            ) : l.kind === 'bullet' ? (
              <p key={i} className="flex gap-2 pl-1">
                <span className="text-accent">·</span>
                <span>{l.text}</span>
              </p>
            ) : (
              <p key={i} className="text-muted">
                {l.text}
              </p>
            ),
          )}
        </div>
        <button onClick={close} className="mt-4 w-full rounded-md bg-accent px-3 py-2 font-mono text-sm text-on-accent">
          {t('Weiter')}
        </button>
      </div>
    </div>
  );
}
