import { useState } from 'react';
import { catalog } from './data/catalog';
import { QuickAdd } from './ui/QuickAdd';
import { StarterQuickadd } from './ui/StarterQuickadd';
import { SolverPanel } from './ui/SolverPanel';
import { CollectionView } from './ui/CollectionView';
import { SetProgressPanel } from './ui/SetProgressPanel';
import { CollectionIoPanel } from './ui/CollectionIoPanel';
import { OfflineImagesPanel } from './ui/OfflineImagesPanel';
import { HowToPlay } from './ui/HowToPlay';
import { PlaytestPanel } from './ui/PlaytestPanel';
import { DeckTestPanel } from './ui/DeckTestPanel';
import { SynergyPanel } from './ui/SynergyPanel';
import { DeckEditor } from './ui/DeckEditor';
import { ScannerPanel } from './ui/ScannerPanel';

/**
 * App-Rahmen mit mobiltauglicher Navigation. Aufgeräumt in klare Bereiche:
 * Scannen · Erfassen · Sammlung (inkl. Solver) · Deck · Synergie · Mehr.
 */
const isPlaceholderData = catalog.length > 0 && catalog[0].setCode === 'SYN';

type Tab = 'scannen' | 'erfassen' | 'sammlung' | 'deck' | 'synergie' | 'mehr';

const tabs: { id: Tab; label: string }[] = [
  { id: 'sammlung', label: 'Sammlung' },
  { id: 'deck', label: 'Deck' },
  { id: 'erfassen', label: 'Erfassen' },
  { id: 'scannen', label: 'Scannen' },
  { id: 'synergie', label: 'Synergie' },
  { id: 'mehr', label: 'Mehr' },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('sammlung');

  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4 pb-24 sm:p-6">
      <header className="flex items-baseline justify-between gap-2">
        <div>
          <h1 className="font-mono text-2xl tracking-tight text-accent sm:text-3xl">engram</h1>
          <p className="text-xs text-muted sm:text-sm">Sammlung &amp; Deckbau · Cyberpunk TCG</p>
        </div>
        {isPlaceholderData && (
          <p className="text-xs text-muted">Testkarten ({catalog.length})</p>
        )}
      </header>

      {/* Navigation: unten fixiert auf Mobil (Daumen-erreichbar), oben ab sm. */}
      <nav
        className="fixed inset-x-0 bottom-0 z-10 flex justify-center gap-1 border-t border-white/10 bg-surface/95 px-2 py-1.5 backdrop-blur sm:static sm:justify-start sm:border-0 sm:bg-transparent sm:p-0 sm:backdrop-blur-none"
        style={{ paddingBottom: 'max(0.375rem, env(safe-area-inset-bottom))' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 whitespace-nowrap rounded-md px-1.5 py-2 text-center font-mono text-[11px] sm:flex-none sm:px-3 sm:text-sm ${
              tab === t.id ? 'bg-accent text-bg' : 'text-muted hover:text-text'
            }`}
          >
            {t.label}
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
          <SetProgressPanel />
          <CollectionView />
          <SolverPanel />
        </>
      )}
      {tab === 'deck' && <DeckEditor />}
      {tab === 'synergie' && <SynergyPanel />}
      {tab === 'mehr' && (
        <>
          <DeckTestPanel />
          <PlaytestPanel />
          <HowToPlay />
          <CollectionIoPanel />
          <OfflineImagesPanel />
        </>
      )}
    </main>
  );
}
