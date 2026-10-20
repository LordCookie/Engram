import { useLiveQuery } from 'dexie-react-hooks';
import { addCounts, db, dismissWelcome, getWelcomeDismissed } from '../db/db';
import { starterEntries, starters } from '../domain/starters';
import { t } from '../i18n';
import { Logo } from './Logo';

/**
 * Einstieg beim ersten Start: Solange Sammlung, Want-Liste und Decks leer sind (und die
 * Karte nicht ausgeblendet wurde), zeigt die Sammlung drei Wege zum Loslegen —
 * Starter-Deck eintragen, Karten scannen/erfassen, Backup wiederherstellen. Sobald etwas
 * in der Sammlung liegt, verschwindet die Karte von selbst.
 */
export type WelcomeTarget = 'scannen' | 'erfassen' | 'backup';

export function Welcome({ onGo }: { onGo: (target: WelcomeTarget) => void }) {
  const show = useLiveQuery(async () => {
    if (await getWelcomeDismissed()) return false;
    const [entries, wants, decks] = await Promise.all([db.collection.count(), db.wants.count(), db.decks.toArray()]);
    return entries === 0 && wants === 0 && !decks.some((d) => d.legendIds.length > 0 || d.cards.length > 0);
  }, []);
  if (!show) return null;

  const btn = 'rounded-md border border-white/10 px-3 py-2 text-left font-mono text-sm hover:border-accent';

  return (
    <section className="rounded-lg border border-accent/40 bg-surface p-4">
      <div className="mb-2 flex items-start gap-3">
        <Logo className="h-10 w-7 shrink-0 text-accent" />
        <div className="min-w-0 flex-1">
          <h2 className="font-mono text-lg text-accent">{t('Willkommen bei engram')}</h2>
          <p className="text-xs text-muted">
            {t('Deine Sammlung und Decks bleiben auf diesem Gerät — kein Konto, keine Cloud. So legst du los:')}
          </p>
        </div>
        <button
          onClick={() => void dismissWelcome()}
          aria-label={t('Willkommen ausblenden')}
          className="shrink-0 rounded px-2 py-1 text-muted hover:text-text"
        >
          ✕
        </button>
      </div>

      <div className="space-y-3">
        <div>
          <div className="mb-1 font-mono text-xs text-muted">{t('1 · Starter-Deck gekauft? Mit einem Tipp eintragen:')}</div>
          <div className="flex flex-wrap gap-2">
            {starters.map((s) => (
              <button
                key={s.id}
                onClick={() =>
                  void addCounts(
                    starterEntries(s).map((e) => ({ printingId: e.cardId, count: e.count })),
                    `starter:${s.id}`,
                  )
                }
                className={btn}
              >
                + {s.name}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-1 font-mono text-xs text-muted">{t('2 · Einzelkarten erfassen:')}</div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => onGo('scannen')} className={btn}>
              {t('Karten scannen')}
            </button>
            <button onClick={() => onGo('erfassen')} className={btn}>
              {t('Per Suche erfassen')}
            </button>
          </div>
        </div>
        <div>
          <div className="mb-1 font-mono text-xs text-muted">{t('3 · Schon ein Backup von engram?')}</div>
          <button onClick={() => onGo('backup')} className={btn}>
            {t('Backup wiederherstellen')}
          </button>
        </div>
        <p className="text-[11px] text-muted">{t('Sprache, Farbthema und Vibration findest du unter „Mehr".')}</p>
      </div>
    </section>
  );
}
