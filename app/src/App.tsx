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
import { Welcome, type WelcomeTarget } from './ui/Welcome';
import { UpdateBanner } from './ui/UpdateBanner';
import { BackupReminder } from './ui/BackupReminder';
import { DeckEditor } from './ui/DeckEditor';
import { ScannerPanel } from './ui/ScannerPanel';
import { t, tk } from './i18n';

/**
 * App-Rahmen mit mobiltauglicher Navigation. Aufgeräumt in klare Bereiche:
 * Scannen · Erfassen · Sammlung (inkl. Solver) · Deck · Synergie · Mehr.
 */
const isPlaceholderData = catalog.length > 0 && catalog[0].setCode === 'SYN';

type Tab = 'scannen' | 'erfassen' | 'sammlung' | 'deck' | 'synergie' | 'mehr';

const tabs: { id: Tab; label: string }[] = [
  { id: 'sammlung', label: tk('Sammlung') },
  { id: 'deck', label: tk('Deck') },
  { id: 'erfassen', label: tk('Erfassen') },
  { id: 'scannen', label: tk('Scannen') },
  { id: 'synergie', label: tk('Synergie') },
  { id: 'mehr', label: tk('Mehr') },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('sammlung');
  const [collectionCollapsed, setCollectionCollapsed] = useState(false);
  const [booting, setBooting] = useState(true); // Boot-Animation einmal pro App-Start
  const endBoot = useCallback(() => setBooting(false), []);
  const lang = useLang(); // Sprachwechsel → Inhalt neu aufbauen (alle Texte frisch)

  // Willkommenskarte: zum passenden Tab springen (Backup liegt unter „Mehr").
  const goWelcome = (target: WelcomeTarget) => {
    if (target !== 'backup') return setTab(target);
    setTab('mehr');
    window.setTimeout(() => document.getElementById('backup')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
  };

  // Gespeichertes Farbthema beim Start anwenden (Dexie-Präferenz).
  useEffect(() => {
    void getThemePref().then((t) => applyTheme(isThemeName(t) ? t : 'default'));
  }, []);

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
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
          className="fixed inset-x-0 bottom-0 z-10 flex justify-center gap-1 border-t border-white/10 bg-surface/95 px-2 py-1.5 backdrop-blur sm:static sm:justify-start sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
          style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
        >
          {tabs.map((tb) => (
            <button
              key={tb.id}
              onClick={() => setTab(tb.id)}
              className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-2 text-center font-mono text-[11px] sm:flex-none sm:px-3 sm:text-sm ${
                tab === tb.id ? 'bg-accent text-on-accent' : 'text-muted hover:text-text'
              }`}
            >
              {t(tb.label)}
            </button>
          ))}
        </nav>

        {tab === 'scannen' && <ScannerPanel />}
        {tab === 'erfassen' && (
          <>
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
            <LegendExplorer onOpenDeck={() => setTab('deck')} />
            <MechanicSearchPanel />
            <SynergyPanel />
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
