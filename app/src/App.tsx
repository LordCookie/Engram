import { Fragment, useCallback, useEffect, useState } from 'react';
import { catalog } from './data/catalog';
import { getThemePref } from './db/db';
import { applyTheme, isThemeName } from './ui/theme';
import { ThemePanel } from './ui/ThemePanel';
import { LanguagePanel } from './ui/LanguagePanel';
import { useLang } from './ui/lang';
import { FeedbackPanel } from './ui/FeedbackPanel';
import { Logo } from './ui/Logo';
import { BootSplash } from './ui/BootSplash';
import { BinderButton } from './ui/BinderView';
import { AchievementsPanel, AchievementToasts } from './ui/Achievements';
import { QuickAdd } from './ui/QuickAdd';
import { StarterQuickadd } from './ui/StarterQuickadd';
import { SolverPanel } from './ui/SolverPanel';
import { CollectionView } from './ui/CollectionView';
import { SetProgressPanel } from './ui/SetProgressPanel';
import { WantListPanel } from './ui/WantListPanel';
import { TradeListPanel } from './ui/TradeListPanel';
import { CollectionIoPanel } from './ui/CollectionIoPanel';
import { OfflineImagesPanel } from './ui/OfflineImagesPanel';
import { HowToPlay } from './ui/HowToPlay';
import { PlaytestPanel } from './ui/PlaytestPanel';
import { DeckTestPanel } from './ui/DeckTestPanel';
import { SynergyPanel } from './ui/SynergyPanel';
import { MechanicSearchPanel } from './ui/MechanicSearchPanel';
import { LegendExplorer } from './ui/LegendExplorer';
import { MetaDecksPanel } from './ui/MetaDecksPanel';
import { Welcome, type WelcomeTarget } from './ui/Welcome';
import { UpdateBanner } from './ui/UpdateBanner';
import { BackupReminder } from './ui/BackupReminder';
import { DeckEditor } from './ui/DeckEditor';
import { ScannerPanel } from './ui/ScannerPanel';
import { NavIcon } from './ui/NavIcon';
import { t, tk } from './i18n';

/**
 * App-Rahmen mit mobiltauglicher Navigation. Aufgeräumt in klare Bereiche:
 * Sammlung (inkl. Solver) · Deck · Erfassen (Scanner + Schnellerfassung) · Synergie · Mehr.
 */
const isPlaceholderData = catalog.length > 0 && catalog[0].setCode === 'SYN';

type Tab = 'erfassen' | 'sammlung' | 'deck' | 'synergie' | 'mehr';

const tabs: { id: Tab; label: string }[] = [
  { id: 'sammlung', label: tk('Sammlung') },
  { id: 'deck', label: tk('Deck') },
  { id: 'erfassen', label: tk('Erfassen') },
  { id: 'synergie', label: tk('Synergie') },
  { id: 'mehr', label: tk('Mehr') },
];

// Unterreiter im Bereich Synergie.
type SynTab = 'meta' | 'legends' | 'karten';
const synTabs: { id: SynTab; label: string }[] = [
  { id: 'meta', label: tk('Meta-Decks') },
  { id: 'legends', label: tk('Legends') },
  { id: 'karten', label: tk('Karten') },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('sammlung');
  const [synTab, setSynTab] = useState<SynTab>('meta'); // bleibt beim Tab-Wechsel erhalten
  const [collectionCollapsed, setCollectionCollapsed] = useState(false);
  const [booting, setBooting] = useState(true); // Boot-Animation einmal pro App-Start
  const endBoot = useCallback(() => setBooting(false), []);
  const lang = useLang(); // Sprachwechsel → Inhalt neu aufbauen (alle Texte frisch)

  // Willkommenskarte: zum passenden Tab springen (Backup liegt unter „Mehr").
  const goWelcome = (target: WelcomeTarget) => {
    if (target !== 'backup') return setTab('erfassen'); // Scannen + Suche liegen im selben Reiter
    setTab('mehr');
    window.setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // Gespeichertes Farbthema beim Start anwenden (Dexie-Präferenz).
  useEffect(() => {
    void getThemePref().then((t) => applyTheme(isThemeName(t) ? t : 'default'));
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-28 sm:p-6">
      {booting && <BootSplash onDone={endBoot} />}
      <Fragment key={lang}>
        <AchievementToasts />
        <header className="flex items-baseline justify-between gap-2">
          <div className="flex items-center gap-3">
            <Logo className="h-12 w-8 shrink-0 text-accent sm:h-14 sm:w-9" />
            <div>
              <h1 className="font-mono text-2xl tracking-tight text-accent sm:text-3xl">engram</h1>
              <p className="text-xs text-muted sm:text-sm">{t('Sammlung & Deckbau · Cyberpunk TCG')}</p>
            </div>
          </div>
          {isPlaceholderData && (
            <p className="text-xs text-muted">{t('Testkarten ({n})', { n: catalog.length })}</p>
          )}
        </header>

        <UpdateBanner />
        <BackupReminder />

        {/* Navigation: unten fixiert auf Mobil (Daumen-erreichbar), oben ab sm. */}
        <nav
          className="app-nav fixed inset-x-0 bottom-0 z-10 flex justify-center gap-1 border-t border-white/10 bg-surface/95 px-2 pt-2 backdrop-blur sm:static sm:justify-start sm:gap-2 sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
        >
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              aria-current={tab === tb.id ? 'page' : undefined}
              className={`flex min-h-[3.5rem] flex-1 flex-col items-center justify-center gap-1 whitespace-nowrap rounded-xl px-1 py-2 text-center font-mono text-[11px] transition-colors sm:min-h-0 sm:flex-none sm:flex-row sm:gap-2 sm:px-3 sm:text-sm ${
                tab === tb.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              <NavIcon name={tb.id} className="h-6 w-6 shrink-0 sm:h-5 sm:w-5" />
              {t(tb.label)}
            </button>
          ))}
        </nav>

        {tab === 'erfassen' && (
          <>
            <ScannerPanel />
            <QuickAdd />
            <StarterQuickadd />
          </>
        )}
        {tab === 'sammlung' && (
          <>
            <Welcome onGo={goWelcome} />
            <SetProgressPanel />
            <CollectionView
              collapsed={collectionCollapsed}
              onToggleCollapsed={() => setCollectionCollapsed((v) => !v)}
            />
            <WantListPanel />
            <TradeListPanel />
            <AchievementsPanel />
            <SolverPanel />
            <BinderButton />
          </>
        )}
        {tab === 'deck' && <DeckEditor />}
        {tab === 'synergie' && (
          <>
            <div role="tablist" className="flex gap-1 rounded-xl bg-surface p-1">
              {synTabs.map((st) => (
                <button
                  key={st.id}
                  role="tab"
                  aria-selected={synTab === st.id}
                  onClick={() => setSynTab(st.id)}
                  className={`flex-1 rounded-md px-2 py-2 font-mono text-sm capitalize transition-colors ${
                    synTab === st.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
                  }`}
                >
                  {t(st.label)}
                </button>
              ))}
            </div>
            {synTab === 'meta' && <MetaDecksPanel onOpenDeck={() => setTab('deck')} />}
            {synTab === 'legends' && <LegendExplorer onOpenDeck={() => setTab('deck')} />}
            {synTab === 'karten' && (
              <>
                <MechanicSearchPanel />
                <SynergyPanel />
              </>
            )}
          </>
        )}
        {tab === 'mehr' && (
          <>
            <DeckTestPanel />
            <PlaytestPanel />
            <HowToPlay />
            <LanguagePanel />
            <ThemePanel />
            <FeedbackPanel />
            <CollectionIoPanel />
            <OfflineImagesPanel />
          </>
        )}
      </Fragment>
    </main>
  );
}
