import { useEffect, useState } from 'react';
import { bundledCardCount, catalog } from '../data/catalog';
import { loadIngestedCorpus, type IngestedCorpus } from '../data/coplayCorpus';
import { clearLoadedData } from '../data/dataStore';
import { metaDecks } from '../data/metaDecks';
import { extraCards, loadedBundle } from '../data/overrides';
import { fmtNum, getLang, t } from '../i18n';
import { APP_VERSION } from '../version';
import { AppUpdateAction, DataUpdateAction } from './UpdateBanner';
import { dailyCheckAvailable, dailyCheckEnabled, setDailyCheck } from './dailyCheck';
import { checkForUpdates, msgText, useUpdates } from './updates';

/**
 * „Updates & Daten" (Tab „Mehr"): App-Version, letzte Prüfung, Knopf „Jetzt prüfen";
 * Stand der Daten (Karten, Korpus, Meta-Decks) und „Daten aktualisieren".
 */
function fmtDate(iso: string | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' });
}

function ago(ts: number | undefined): string {
  if (!ts) return t('noch nie');
  const min = Math.round((Date.now() - ts) / 60000);
  if (min < 1) return t('gerade eben');
  if (min < 60) return t('vor {n} Min.', { n: min });
  return t('vor {n} Std.', { n: Math.round(min / 60) });
}

export function UpdatesPanel() {
  const u = useUpdates();
  const [corpus, setCorpus] = useState<IngestedCorpus | null>(null);
  const [, tick] = useState(0);

  useEffect(() => {
    void loadIngestedCorpus().then(setCorpus);
    const id = window.setInterval(() => tick((x) => x + 1), 60_000); // „vor N Min." frisch halten
    return () => window.clearInterval(id);
  }, []);

  const loaded = extraCards().length > 0 || loadedBundle() !== null;
  const row = 'flex justify-between gap-3';

  return (
    <section id="updates" className="scroll-mt-4 rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">{t('Updates & Daten')}</h2>
      <p className="mb-3 text-xs text-muted">
        {t('engram schaut beim Start und dann stündlich auf GitHub nach einer neuen Version. Neue Karten kommen direkt von NetDeck.')}
      </p>

      <div className="space-y-1 font-mono text-sm">
        <div className={row}>
          <span className="text-muted">{t('Installiert')}</span>
          <span>v{APP_VERSION}</span>
        </div>
        <div className={row}>
          <span className="text-muted">{t('Zuletzt geprüft')}</span>
          <span>{u.checking ? t('prüfe …') : ago(u.checkedAt)}</span>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => void checkForUpdates(true)}
          disabled={u.checking}
          className="rounded-md border border-white/10 px-3 py-1.5 font-mono text-sm hover:border-accent disabled:opacity-60"
        >
          {t('Jetzt prüfen')}
        </button>
        {!u.appUpdate && u.checkedAt && !u.checking && (
          <span className="text-xs text-card-green">{t('Du hast die neueste Version.')}</span>
        )}
      </div>
      {u.checkError && <p className="mt-1 text-xs text-card-red">{msgText(u.checkError)}</p>}
      {u.appUpdate && (
        <div className="mt-3 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-sm">
          <AppUpdateAction />
        </div>
      )}
      {dailyCheckAvailable() && <DailyCheckToggle />}

      <h3 className="mb-1 mt-5 font-mono text-sm">{t('Daten')}</h3>
      <div className="space-y-1 font-mono text-xs">
        <div className={row}>
          <span className="text-muted">{t('Karten')}</span>
          <span>
            {fmtNum(catalog.length)}
            {catalog.length > bundledCardCount && (
              <span className="text-accent"> {t('(+{n} nachgeladen)', { n: catalog.length - bundledCardCount })}</span>
            )}
          </span>
        </div>
        <div className={row}>
          <span className="text-muted">{t('Korpus')}</span>
          <span>
            {corpus ? t('{n} Decks · Stand {date}', { n: fmtNum(corpus.count), date: fmtDate(corpus.generated) }) : '…'}
          </span>
        </div>
        <div className={row}>
          <span className="text-muted">{t('Meta-Decks')}</span>
          <span>{t('{n} Decks · Stand {date}', { n: metaDecks.decks.length, date: fmtDate(metaDecks.updated) })}</span>
        </div>
      </div>
      <div className="mt-3 font-mono text-sm">
        <DataUpdateAction showAlways />
      </div>
      <p className="mt-2 text-[11px] text-muted">
        {t('Neue Karten erkennt der Scanner bis zur nächsten App-Version nur am Namen, Synergie-Merkmale bekommen sie erst mit der App.')}
      </p>
      {loaded && (
        <button
          onClick={() => void clearLoadedData().then(() => window.location.reload())}
          className="mt-2 font-mono text-xs text-muted underline hover:text-accent"
        >
          {t('Nachgeladene Daten verwerfen')}
        </button>
      )}
    </section>
  );
}

/** Täglich gegen 12 Uhr im Hintergrund nachsehen und per Benachrichtigung melden (nur App). */
function DailyCheckToggle() {
  const [on, setOn] = useState<boolean | null>(null);
  const [denied, setDenied] = useState(false);

  useEffect(() => {
    void dailyCheckEnabled().then(setOn);
  }, []);

  async function toggle() {
    const next = !on;
    setOn(next);
    setDenied(!(await setDailyCheck(next)));
  }

  if (on === null) return null;
  return (
    <div className="mt-3 flex items-center gap-3">
      <div className="min-w-0 flex-1">
        <p className="font-mono text-sm">{t('Benachrichtigung bei Updates')}</p>
        <p className="text-xs text-muted">
          {t('Schaut täglich gegen 12 Uhr nach, auch wenn engram zu ist, und meldet neue Versionen und Daten.')}
        </p>
        {on && denied && (
          <p className="text-xs text-card-red">
            {t('Android erlaubt engram gerade keine Benachrichtigungen — in den App-Einstellungen freigeben.')}
          </p>
        )}
      </div>
      <button
        onClick={() => void toggle()}
        role="switch"
        aria-checked={on}
        className={`shrink-0 rounded-md px-4 py-2 font-mono text-sm ${
          on ? 'bg-accent text-on-accent' : 'border border-white/10 text-muted hover:border-accent'
        }`}
      >
        {on ? t('An') : t('Aus')}
      </button>
    </div>
  );
}
