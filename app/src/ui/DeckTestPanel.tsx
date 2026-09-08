import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDecks } from '../db/db';
import { cardIndex, catalog } from '../data/catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { validate } from '../rules/validate';
import { starters } from '../domain/starters';
import type { DeckDraft } from '../domain/deckDraft';
import type { SimDeck } from '../domain/sim/rng';
import { testMatchup, sampleGame, type DeckTestResult, type SampleGame } from '../domain/sim/deckTest';

/**
 * „Deck testen" — spielt dein Deck im Kampf-Modell (engine2) seat-fair gegen einen
 * Gegner (anderes eigenes Deck oder Starter) und schätzt eine Siegquote (mit 95%-CI)
 * + zeigt ein Beispiel-Zugprotokoll. Spielbar NUR mit legalen eigenen Decks + Startern.
 *
 * Ehrlichkeit (§ 12): grobes MODELL, kein regeltreuer Simulator — Richtungssignal,
 * kein echtes Ergebnis. Legends fließen nur als Eddie-Basis ein; gewertet wird das
 * Zusammenspiel der 40 Deckkarten.
 */

interface Testable { key: string; label: string; sim: SimDeck; }
const isPlaceholder = catalog.length > 0 && catalog[0].setCode === 'SYN';

function expand(cards: { cardId: string; count: number }[]): string[] {
  const out: string[] = [];
  for (const { cardId, count } of cards) for (let i = 0; i < count; i++) out.push(cardId);
  return out;
}

function useTestables(): { list: Testable[]; hiddenOwn: number } {
  const own = useLiveQuery(() => listDecks(), [], [] as DeckDraft[]);
  return useMemo(() => {
    const list: Testable[] = [];
    for (const st of starters) {
      const cards = Object.entries(st.cards).map(([cardId, count]) => ({ cardId, count }));
      if (validate({ legendIds: st.legendIds, cards }, rulesetV1Loaded, cardIndex).ok)
        list.push({ key: `starter:${st.id}`, label: `${st.name} · Starter`, sim: { name: st.name, cardIds: expand(cards) } });
    }
    let hiddenOwn = 0;
    for (const d of own) {
      if (validate({ legendIds: d.legendIds, cards: d.cards }, rulesetV1Loaded, cardIndex).ok)
        list.push({ key: d.id, label: d.name, sim: { name: d.name, cardIds: expand(d.cards) } });
      else hiddenOwn++;
    }
    return { list, hiddenOwn };
  }, [own]);
}

const GAMES = 200; // je 2 Sitzpositionen → 400 Spiele

interface RunResult { result: DeckTestResult; sample: SampleGame; aLabel: string; bLabel: string; }

export function DeckTestPanel() {
  const { list, hiddenOwn } = useTestables();
  const [aKey, setAKey] = useState('');
  const [bKey, setBKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [run, setRun] = useState<RunResult | null>(null);
  const [showLog, setShowLog] = useState(false);

  const a = list.find((d) => d.key === aKey) ?? list[0];
  const b = list.find((d) => d.key === bKey) ?? list.find((d) => d.key !== a?.key) ?? list[0];

  function go() {
    if (!a || !b) return;
    setBusy(true);
    setRun(null);
    // kurz warten, damit der „läuft…"-Zustand rendert (die Sim läuft synchron/schnell)
    setTimeout(() => {
      const result = testMatchup(a.sim, b.sim, GAMES);
      const sample = sampleGame(a.sim, b.sim, 7);
      setRun({ result, sample, aLabel: a.label, bLabel: b.label });
      setBusy(false);
    }, 20);
  }

  if (isPlaceholder) {
    return (
      <section className="rounded-lg border border-white/10 bg-surface p-4">
        <h2 className="font-mono text-lg text-accent">Deck testen</h2>
        <p className="mt-2 text-sm text-muted">Mit Testkarten nicht verfügbar — lade die echten Kartendaten.</p>
      </section>
    );
  }

  return (
    <section className="rounded-lg border border-white/10 bg-surface p-4">
      <h2 className="font-mono text-lg text-accent">Deck testen</h2>
      <p className="mt-1 text-xs text-muted">
        Spielt dein Deck im Kampf-Modell gegen einen Gegner (je 400 Spiele, beide Sitzpositionen)
        und schätzt die Siegquote. <span className="text-text">Grobes Modell, kein echtes Ergebnis</span> —
        ein Richtungssignal für Deckstärke.
      </p>

      {list.length < 1 ? (
        <p className="mt-3 text-sm text-muted">Keine spielbaren Decks. Baue ein legales Deck oder importiere einen Starter.</p>
      ) : (
        <>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-sm">
              <span className="text-muted">Dein Deck</span>
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-2 font-mono text-sm"
                value={a?.key ?? ''}
                onChange={(e) => setAKey(e.target.value)}
              >
                {list.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
            <label className="block text-sm">
              <span className="text-muted">Gegner</span>
              <select
                className="mt-1 w-full rounded-md border border-white/10 bg-bg px-2 py-2 font-mono text-sm"
                value={b?.key ?? ''}
                onChange={(e) => setBKey(e.target.value)}
              >
                {list.map((d) => <option key={d.key} value={d.key}>{d.label}</option>)}
              </select>
            </label>
          </div>

          <button
            onClick={go}
            disabled={busy || !a || !b}
            className="mt-3 rounded-md bg-accent px-4 py-2 font-mono text-sm text-bg disabled:opacity-50"
          >
            {busy ? 'läuft …' : 'Testen'}
          </button>
          {hiddenOwn > 0 && (
            <p className="mt-2 text-xs text-muted">{hiddenOwn} eigene(s) Deck(s) ausgeblendet (nicht regel-legal).</p>
          )}

          {run && <Result run={run} showLog={showLog} onToggleLog={() => setShowLog((s) => !s)} />}
        </>
      )}
    </section>
  );
}

function Result({ run, showLog, onToggleLog }: { run: RunResult; showLog: boolean; onToggleLog: () => void }) {
  const { result: r, sample, aLabel, bLabel } = run;
  const pct = r.winPct;
  const verdict = pct >= 55 ? 'begünstigt' : pct <= 45 ? 'benachteiligt' : 'ausgeglichen';
  return (
    <div className="mt-4 rounded-md border border-white/10 bg-bg p-3">
      <div className="flex items-baseline justify-between gap-2">
        <span className="font-mono text-sm text-text">{aLabel} <span className="text-muted">vs</span> {bLabel}</span>
        <span className="font-mono text-xs text-muted">{r.games} Spiele · Ø {r.avgTurns.toFixed(1)} Züge</span>
      </div>

      <div className="mt-2">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-2xl text-accent">{pct.toFixed(1)}%</span>
          <span className="text-xs text-muted">±{r.ci.toFixed(1)} · Matchup {verdict}</span>
        </div>
        {/* Siegquoten-Balken */}
        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-white/10">
          <div className="h-full bg-accent" style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
        </div>
        <p className="mt-1 font-mono text-xs text-muted">
          {r.winsA} Siege · {r.winsB} Niederlagen{r.draws ? ` · ${r.draws} Remis` : ''}
        </p>
      </div>

      <button onClick={onToggleLog} className="mt-3 rounded-md border border-white/10 px-3 py-1.5 font-mono text-xs text-muted hover:text-text">
        {showLog ? 'Beispielspiel ausblenden' : 'Beispielspiel zeigen'}
      </button>
      {showLog && (
        <div className="mt-2">
          <p className="font-mono text-xs text-text">
            Ausgang: {sample.winner ? (sample.winner === 'a' ? aLabel : bLabel) : 'Remis'} — {sample.reason} ·
            Gigs {sample.finalGigs.a}:{sample.finalGigs.b} · {sample.turns} Züge
          </p>
          <pre className="mt-1 max-h-56 overflow-auto rounded bg-black/30 p-2 font-mono text-[11px] leading-snug text-muted">
{sample.log.join('\n') || '(kein Log)'}
          </pre>
        </div>
      )}
      <p className="mt-2 text-[11px] text-muted">
        Modell-Grenzen: Gear, {'{Defeated}'}/Reaktionen und Würfel sind abstrahiert; Legends zählen nur als Eddie-Basis.
      </p>
    </div>
  );
}
