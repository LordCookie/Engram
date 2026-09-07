import { useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { listDecks } from '../db/db';
import { catalog, cardIndex } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { rulesetV1Loaded } from '../rules/ruleset';
import { playtestRulesLoaded as RULES } from '../rules/playtest';
import { validate } from '../rules/validate';
import { starters } from '../domain/starters';
import type { DeckDraft } from '../domain/deckDraft';
import type { Card } from '../domain/types';
import { CardImage } from './CardImage';
import {
  newGame,
  mulligan,
  draw,
  nextTurn,
  moveCard,
  toggleSpent,
  callLegend,
  toggleLegendSpent,
  adjustGigs,
  adjustEddies,
  gigWin,
  deckCardTotal,
  type PlayDeck,
  type PlayCard,
  type PlaytestState,
  type Zone,
} from '../domain/playtest';

/**
 * Simulationsmodus (Roadmap „Playtest / Proberunden"). Manuelles Playtest wie
 * ManaBox: echte Zonen, du bewegst Karten selbst per **Drag & Drop**, keine
 * erzwungene Regel-Engine. Spielbar NUR mit **legalen** eigenen Decks und den
 * **Startern** (Nutzerwunsch). Logik/Parameter kommen aus `domain/playtest.ts`
 * bzw. `rules/playtest.ts`.
 *
 * Drag & Drop bewusst über **Pointer-Events** (nicht HTML5-DnD): nur so
 * funktioniert es auch mit dem Finger auf dem Handy (der Hauptfall). `touch-action:
 * none` auf den Karten verhindert das Wegscrollen beim Ziehen; ein reiner Tipp auf
 * eine Feldkarte schaltet bereit/gespendet.
 */

interface Playable {
  key: string;
  label: string;
  deck: PlayDeck;
}

/** Zonen, auf die man ablegen kann. */
type DropZone = 'hand' | 'play' | 'trash' | 'deck';
const DROP_ZONES: DropZone[] = ['play', 'hand', 'trash', 'deck'];

const isPlaceholder = catalog.length > 0 && catalog[0].setCode === 'SYN';

function useOwnDecks(): DeckDraft[] {
  return useLiveQuery(() => listDecks(), [], [] as DeckDraft[]);
}

function usePlayables(own: DeckDraft[]): { list: Playable[]; hiddenOwn: number } {
  return useMemo(() => {
    const list: Playable[] = [];
    for (const st of starters) {
      const deck: PlayDeck = {
        name: st.name,
        legendIds: st.legendIds,
        cards: Object.entries(st.cards).map(([cardId, count]) => ({ cardId, count })),
      };
      if (validate(deck, rulesetV1Loaded, cardIndex).ok)
        list.push({ key: `starter:${st.id}`, label: `${st.name} · Starter`, deck });
    }
    let hiddenOwn = 0;
    for (const d of own) {
      const deck: PlayDeck = { name: d.name, legendIds: d.legendIds, cards: d.cards };
      if (validate(deck, rulesetV1Loaded, cardIndex).ok)
        list.push({ key: d.id, label: d.name, deck });
      else hiddenOwn++;
    }
    return { list, hiddenOwn };
  }, [own]);
}

export function PlaytestPanel() {
  const own = useOwnDecks();
  const { list: playables, hiddenOwn } = usePlayables(own);
  const images = useCardImages();
  const [state, setState] = useState<PlaytestState | null>(null);
  const [showTrash, setShowTrash] = useState(false);

  // --- Drag & Drop (Pointer-basiert, touch-fähig) ---
  const zoneRefs = useRef<Partial<Record<DropZone, HTMLElement | null>>>({});
  const pending = useRef<{ uid: string; from: Zone; cardId: string; sx: number; sy: number; started: boolean } | null>(null);
  const [drag, setDrag] = useState<{ uid: string; from: Zone; cardId: string; x: number; y: number } | null>(null);
  const [hover, setHover] = useState<DropZone | null>(null);

  const card = (id: string): Card | undefined => cardIndex.get(id);
  const patch = (fn: (s: PlaytestState) => PlaytestState) => setState((s) => (s ? fn(s) : s));
  const start = (deck: PlayDeck) => {
    setState(newGame(deck, RULES, Math.floor(Math.random() * 1e9)));
    setShowTrash(false);
  };

  function zoneAt(x: number, y: number): DropZone | null {
    for (const z of DROP_ZONES) {
      const el = zoneRefs.current[z];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return z;
    }
    return null;
  }

  // Fenster-Listener statt Pointer-Capture: `pointerup` am window feuert immer,
  // auch wenn die Karte durch das Re-Render neu gemountet würde (sonst bliebe der
  // Drag hängen). touch-action:none auf der Karte hält den Finger-Drag scrollfrei.
  function beginDrag(e: React.PointerEvent, c: PlayCard, from: Zone) {
    if (e.button && e.button !== 0) return;
    pending.current = { uid: c.uid, from, cardId: c.cardId, sx: e.clientX, sy: e.clientY, started: false };

    let teardown = () => {};
    const move = (ev: PointerEvent) => {
      const p = pending.current;
      if (!p) return;
      if (!p.started && Math.hypot(ev.clientX - p.sx, ev.clientY - p.sy) < 6) return;
      p.started = true;
      setDrag({ uid: p.uid, from: p.from, cardId: p.cardId, x: ev.clientX, y: ev.clientY });
      setHover(zoneAt(ev.clientX, ev.clientY));
    };
    const finish = (ev: PointerEvent) => {
      teardown();
      const p = pending.current;
      pending.current = null;
      if (p?.started) {
        const z = zoneAt(ev.clientX, ev.clientY);
        if (z && z !== p.from) patch((s) => moveCard(s, p.uid, z));
      } else if (from === 'play') {
        patch((s) => toggleSpent(s, c.uid)); // reiner Tipp = spenden/bereit
      }
      setDrag(null);
      setHover(null);
    };
    const cancel = () => {
      teardown();
      pending.current = null;
      setDrag(null);
      setHover(null);
    };
    teardown = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', finish);
      window.removeEventListener('pointercancel', cancel);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', finish);
    window.addEventListener('pointercancel', cancel);
  }

  // --- Deck-Auswahl -------------------------------------------------------
  if (!state) {
    return (
      <section className="rounded-lg bg-surface p-4">
        <h2 className="mb-1 font-mono text-lg">Simulation · Proberunden</h2>
        <p className="mb-3 text-xs text-muted">
          Deck vor dem Tisch testen: Starthand ziehen, mulliganen, Züge durchspielen,
          Karten per <b>Drag &amp; Drop</b> zwischen den Zonen bewegen (wie ManaBox — echte
          Zonen, keine erzwungenen Regeln). Nur <b>legale eigene Decks</b> und die <b>Starter</b>.
        </p>
        {isPlaceholder && (
          <p className="mb-3 rounded-md bg-bg/60 p-2 text-xs text-muted">
            Testkarten aktiv — echte Kartendaten fehlen (Pipeline nicht gelaufen).
          </p>
        )}
        {playables.length === 0 ? (
          <p className="text-sm text-muted">
            Noch kein spielbares Deck. Bau im Tab „Deck" ein legales Deck (3 Legends,
            40–50 Karten) oder trag im Tab „Erfassen" einen Starter ein.
          </p>
        ) : (
          <ul className="space-y-2">
            {playables.map((p) => (
              <li key={p.key}>
                <button
                  onClick={() => start(p.deck)}
                  className="flex w-full items-center justify-between rounded-md border border-white/10 px-3 py-2 text-left font-mono text-sm hover:border-accent"
                >
                  <span className="truncate">{p.label}</span>
                  <span className="ml-2 shrink-0 text-xs text-muted">
                    {deckCardTotal(p.deck)} Karten · ▶ spielen
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {hiddenOwn > 0 && (
          <p className="mt-3 text-xs text-muted">
            {hiddenOwn} unvollständige/illegale eigene Deck(s) ausgeblendet — nur legale
            Decks sind spielbar.
          </p>
        )}
      </section>
    );
  }

  // --- Spielbrett ---------------------------------------------------------
  const s = state;
  const won = gigWin(s, RULES);
  const canMulligan = s.mulligans < RULES.mulligansAllowed;

  /** Highlight-Klasse für eine Ablage-Zone (nur wenn ein gültiges Ziel). */
  const dz = (z: DropZone) =>
    hover === z && drag && drag.from !== z ? 'ring-2 ring-accent ring-offset-1 ring-offset-bg' : '';

  const CardTile = ({ c, zone }: { c: PlayCard; zone: Zone }) => {
    const cd = card(c.cardId);
    if (!cd) return null;
    return (
      <div
        role="button"
        tabIndex={0}
        onPointerDown={(e) => beginDrag(e, c, zone)}
        className={`shrink-0 cursor-grab touch-none select-none rounded active:cursor-grabbing ${
          drag?.uid === c.uid ? 'opacity-30' : ''
        }`}
        title={cd.name + (typeof cd.cost === 'number' ? ` · Cost ${cd.cost}` : '')}
      >
        <CardImage
          card={cd}
          src={images.get(cd.id)}
          className={`pointer-events-none h-20 w-14 ${c.spent ? 'rotate-90 opacity-70' : ''}`}
        />
      </div>
    );
  };

  return (
    <section className="space-y-3">
      {/* Kopf + Steuerung */}
      <div className="rounded-lg bg-surface p-3">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="min-w-0">
            <h2 className="truncate font-mono text-base">🎮 {s.deckName}</h2>
            <p className="text-xs text-muted">Manuelles Playtest · Zug {s.turn}</p>
          </div>
          <button
            onClick={() => setState(null)}
            className="shrink-0 rounded border border-white/10 px-2 py-1 font-mono text-xs text-muted hover:border-accent"
          >
            Deck wechseln
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() =>
              start(
                playables.find((p) => p.deck.name === s.deckName)?.deck ?? {
                  name: s.deckName,
                  legendIds: s.legends.map((l) => l.cardId),
                  cards: aggregateCards(s),
                },
              )
            }
            className="rounded border border-white/10 px-2.5 py-1.5 font-mono text-xs hover:border-accent"
          >
            ⟳ Neues Spiel
          </button>
          <button
            onClick={() => patch((x) => mulligan(x, RULES))}
            disabled={!canMulligan}
            className="rounded border border-white/10 px-2.5 py-1.5 font-mono text-xs hover:border-accent disabled:opacity-40"
          >
            Mulligan{canMulligan ? '' : ' ✓'}
          </button>
          <button
            onClick={() => patch((x) => draw(x, 1))}
            className="rounded border border-white/10 px-2.5 py-1.5 font-mono text-xs hover:border-accent"
          >
            Ziehen
          </button>
          <button
            onClick={() => patch((x) => nextTurn(x, RULES))}
            className="rounded border border-accent bg-accent/20 px-2.5 py-1.5 font-mono text-xs text-accent hover:bg-accent/30"
          >
            ▶ Nächster Zug
          </button>
        </div>
        <p className="mt-2 text-[11px] text-muted">
          Karten <b>ziehen</b>, um sie zwischen Hand · Feld · Trash · Deck zu bewegen. Feldkarte
          <b> tippen</b> = spenden/bereit.
        </p>
      </div>

      {/* Zähler (Deck-Kachel ist zugleich Ablage-Zone) */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Counter label="Zug" value={s.turn} />
        <div
          ref={(el) => (zoneRefs.current.deck = el)}
          className={`rounded-lg bg-surface p-3 font-mono ${dz('deck')}`}
        >
          <div className="text-xs text-muted">Deck {drag ? '· ablegen' : ''}</div>
          <div className="text-lg">
            {s.deck.length}
            {s.deck.length === 0 && <span className="ml-1 text-xs text-card-red">leer!</span>}
          </div>
        </div>
        <div className={`rounded-lg p-3 font-mono ${won ? 'bg-card-green/20' : 'bg-surface'}`}>
          <div className="text-xs text-muted">Gigs (Ziel {RULES.gigWinThreshold})</div>
          <div className="flex items-center gap-2">
            <button onClick={() => patch((x) => adjustGigs(x, -1))} className="rounded bg-bg/60 px-2 leading-6">−</button>
            <span className={`text-lg ${won ? 'text-card-green' : ''}`}>{s.gigs}</span>
            <button onClick={() => patch((x) => adjustGigs(x, 1))} className="rounded bg-bg/60 px-2 leading-6">+</button>
          </div>
        </div>
        <div className="rounded-lg bg-surface p-3 font-mono">
          <div className="text-xs text-muted">Eddies €$</div>
          <div className="flex items-center gap-2">
            <button onClick={() => patch((x) => adjustEddies(x, -1))} className="rounded bg-bg/60 px-2 leading-6">−</button>
            <span className="text-lg">{s.eddies}</span>
            <button onClick={() => patch((x) => adjustEddies(x, 1))} className="rounded bg-bg/60 px-2 leading-6">+</button>
          </div>
        </div>
      </div>

      {won && (
        <div className="rounded-lg bg-card-green/20 p-3 text-center font-mono text-sm text-card-green">
          🎉 {s.gigs} Gigs — mit so vielen Gigs würdest du deinen Zug als Sieg beginnen.
        </div>
      )}

      {/* Legends */}
      <div className="rounded-lg bg-surface p-3">
        <h3 className="mb-2 font-mono text-sm">Legends</h3>
        <div className="flex flex-wrap gap-3">
          {s.legends.map((l, i) => {
            const cd = card(l.cardId);
            if (!cd) return null;
            return (
              <div key={i} className="flex flex-col items-center gap-1">
                {l.revealed ? (
                  <CardImage card={cd} src={images.get(cd.id)} className={`h-20 w-14 ${l.spent ? 'rotate-90 opacity-70' : ''}`} />
                ) : (
                  <div className="flex h-20 w-14 items-center justify-center rounded border border-dashed border-white/20 bg-bg/60 text-center font-mono text-[9px] text-muted">
                    verdeckt
                  </div>
                )}
                {l.revealed ? (
                  <button
                    onClick={() => patch((x) => toggleLegendSpent(x, i))}
                    className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] text-muted hover:border-accent"
                  >
                    {l.spent ? 'bereit' : 'spenden'}
                  </button>
                ) : (
                  <button
                    onClick={() => patch((x) => callLegend(x, i))}
                    className="rounded border border-white/10 px-1.5 py-0.5 font-mono text-[10px] hover:border-accent"
                  >
                    Call
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Feld (Ablage-Zone) */}
      <div
        ref={(el) => (zoneRefs.current.play = el)}
        className={`rounded-lg bg-surface p-3 ${dz('play')}`}
      >
        <h3 className="mb-2 font-mono text-sm">
          Feld <span className="text-muted">({s.play.length})</span>
        </h3>
        {s.play.length === 0 ? (
          <p className="text-xs text-muted">Leer. Zieh eine Handkarte hierher, um sie auszuspielen.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.play.map((c) => (
              <CardTile key={c.uid} c={c} zone="play" />
            ))}
          </div>
        )}
      </div>

      {/* Hand (Ablage-Zone) */}
      <div
        ref={(el) => (zoneRefs.current.hand = el)}
        className={`rounded-lg bg-surface p-3 ${dz('hand')}`}
      >
        <h3 className="mb-2 font-mono text-sm">
          Hand <span className="text-muted">({s.hand.length})</span>
        </h3>
        {s.hand.length === 0 ? (
          <p className="text-xs text-muted">Hand leer.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {s.hand.map((c) => (
              <CardTile key={c.uid} c={c} zone="hand" />
            ))}
          </div>
        )}
      </div>

      {/* Trash (Ablage-Zone) */}
      <div
        ref={(el) => (zoneRefs.current.trash = el)}
        className={`rounded-lg bg-surface p-3 ${dz('trash')}`}
      >
        <button
          onClick={() => setShowTrash((v) => !v)}
          className="flex w-full items-center justify-between font-mono text-sm"
        >
          <span>
            Trash <span className="text-muted">({s.trash.length})</span>
            {drag && <span className="ml-2 text-[11px] text-muted">· hierher ziehen</span>}
          </span>
          <span className="text-muted">{showTrash ? '▾' : '▸'}</span>
        </button>
        {showTrash && s.trash.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-2">
            {s.trash.map((c) => (
              <CardTile key={c.uid} c={c} zone="trash" />
            ))}
          </div>
        )}
      </div>

      {/* Drag-Klon, folgt dem Zeiger */}
      {drag && card(drag.cardId) && (
        <div
          className="pointer-events-none fixed z-30"
          style={{ left: drag.x, top: drag.y, transform: 'translate(-50%, -50%) rotate(3deg)' }}
        >
          <CardImage
            card={card(drag.cardId)!}
            src={images.get(drag.cardId)}
            className="h-24 w-16 opacity-90 shadow-xl ring-2 ring-accent"
          />
        </div>
      )}
    </section>
  );
}

function Counter({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg bg-surface p-3 font-mono">
      <div className="text-xs text-muted">{label}</div>
      <div className="text-lg">{value}</div>
    </div>
  );
}

/** Aktuelle Deckliste aus dem Zustand rekonstruieren (Fallback fürs „Neues Spiel"). */
function aggregateCards(s: PlaytestState): { cardId: string; count: number }[] {
  const m = new Map<string, number>();
  for (const c of [...s.deck, ...s.hand, ...s.play, ...s.trash])
    m.set(c.cardId, (m.get(c.cardId) ?? 0) + 1);
  return [...m].map(([cardId, count]) => ({ cardId, count }));
}
