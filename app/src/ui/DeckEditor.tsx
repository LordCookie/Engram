import { useEffect, useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalog, cardIndex, printingIndex } from '../data/catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { searchCards } from '../domain/search';
import { computeDeckStats } from '../domain/deckStats';
import { swapAnalysis } from '../domain/swap';
import { validate, computeRamCaps } from '../rules/validate';
import { collectionToOwnedCounts } from '../domain/collection';
import {
  db,
  saveDeck,
  listDecks,
  getCurrentDeckId,
  setCurrentDeckId,
  ensureCurrentDeck,
  createDeck,
  deleteDeck,
} from '../db/db';
import {
  emptyDraft,
  addLegend,
  removeLegend,
  incCard,
  setCard,
  type DeckDraft,
} from '../domain/deckDraft';
import { DeckTextPanel } from './DeckTextPanel';
import { CardImage } from './CardImage';
import { CardDetail } from './CardDetail';
import { SynergyInfo } from './SynergyInfo';
import { useCardImages } from '../data/cardImages';
import { featureDB, hasFeatures } from '../data/features';
import { suggestAdditions, deckSynergyStats } from '../domain/deckSynergy';
import type { ParsedDeck } from '../domain/deckText';
import type { Card, CardType, Color } from '../domain/types';

/**
 * Deckeditor mit Live-Anzeige + Sammlungsmodus (PLAN.md § 5, Aufgabe 2/3).
 * Arbeitsdeck wird in Dexie persistiert (überlebt Reloads).
 */
const ruleset = rulesetV1Loaded;

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};
const colorText: Record<Color, string> = {
  RED: 'text-card-red',
  GREEN: 'text-card-green',
  BLUE: 'text-card-blue',
  YELLOW: 'text-card-yellow',
};
const typeOrder: CardType[] = ['UNIT', 'GEAR', 'PROGRAM', 'BRAINDANCE'];

const RATING = (avg: number): { label: string; cls: string } => {
  if (avg <= 0) return { label: 'keine', cls: 'text-muted' };
  if (avg < 1.5) return { label: 'gering', cls: 'text-card-red' };
  if (avg < 3.5) return { label: 'solide', cls: 'text-accent' };
  return { label: 'stark', cls: 'text-card-green' };
};

export function DeckEditor() {
  const [query, setQuery] = useState('');
  const [collectionMode, setCollectionMode] = useState(false);
  const [filterColor, setFilterColor] = useState<Color | 'ALL'>('ALL');
  const [filterType, setFilterType] = useState<CardType | 'ALL'>('ALL');
  const [onlyLegal, setOnlyLegal] = useState(false);

  const [nameEdit, setNameEdit] = useState<string | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);

  const decks = useLiveQuery(() => listDecks(), [], undefined);
  const currentId = useLiveQuery(() => getCurrentDeckId(), [], undefined);
  useEffect(() => {
    if (decks !== undefined) void ensureCurrentDeck(ruleset.version);
  }, [decks, currentId]);
  useEffect(() => setNameEdit(null), [currentId]);

  const draft: DeckDraft =
    (currentId ? decks?.find((d) => d.id === currentId) : undefined) ??
    decks?.[0] ??
    emptyDraft(ruleset.version);

  const entries = useLiveQuery(() => db.collection.toArray(), [], []);
  const owned = useMemo(() => collectionToOwnedCounts(entries, printingIndex), [entries]);
  const images = useCardImages();

  const update = (fn: (d: DeckDraft) => DeckDraft) => void saveDeck(fn(draft));

  async function duplicateDeck() {
    const copy = await createDeck(ruleset.version, `${draft.name} (Kopie)`);
    await saveDeck({ ...draft, id: copy.id, name: copy.name });
  }

  async function importParsed(parsed: ParsedDeck) {
    const created = await createDeck(ruleset.version, parsed.name || 'Importiertes Deck');
    await saveDeck({ ...created, legendIds: parsed.legendIds, cards: parsed.cards });
  }

  const anyFilter =
    collectionMode || filterColor !== 'ALL' || filterType !== 'ALL' || onlyLegal;
  const results = useMemo(() => {
    // Ohne Suchbegriff, aber mit aktivem Filter: den Katalog durchblättern.
    let r: Card[] = query
      ? searchCards(catalog, query, { limit: 200 })
      : anyFilter
        ? [...catalog].sort((a, b) => a.name.localeCompare(b.name))
        : [];
    if (collectionMode) r = r.filter((c) => (owned.get(c.id) ?? 0) > 0);
    if (filterColor !== 'ALL') r = r.filter((c) => c.color === filterColor);
    if (filterType !== 'ALL') r = r.filter((c) => c.type === filterType);
    if (onlyLegal) {
      const legendCards = draft.legendIds
        .map((id) => cardIndex.get(id))
        .filter((c): c is Card => c !== undefined);
      const caps = computeRamCaps(legendCards, ruleset);
      r = r.filter((c) => c.type === 'LEGEND' || (c.ram ?? 0) <= (caps[c.color] ?? 0));
    }
    return r.slice(0, 24);
  }, [query, anyFilter, collectionMode, filterColor, filterType, onlyLegal, owned, draft.legendIds]);

  const stats = useMemo(() => computeDeckStats(draft, ruleset, cardIndex), [draft]);
  const validation = useMemo(() => validate(draft, ruleset, cardIndex), [draft]);
  const swaps = useMemo(
    () => swapAnalysis(draft.legendIds, owned, ruleset, cardIndex),
    [draft, owned],
  );

  const legends = draft.legendIds
    .map((id) => cardIndex.get(id))
    .filter((c): c is Card => c !== undefined);

  const deckCards = draft.cards
    .map((e) => ({ card: cardIndex.get(e.cardId), count: e.count }))
    .filter((x): x is { card: Card; count: number } => x.card !== undefined)
    .sort(
      (a, b) =>
        a.card.color.localeCompare(b.card.color) ||
        (a.card.cost ?? 0) - (b.card.cost ?? 0) ||
        a.card.name.localeCompare(b.card.name),
    );

  const deckCardIds = draft.cards.map((e) => e.cardId);
  const synStats = useMemo(
    () =>
      hasFeatures
        ? deckSynergyStats(draft.legendIds, deckCardIds, cardIndex, featureDB)
        : { synergyCount: 0, cardCount: 0, avg: 0 },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft],
  );
  const suggestions = useMemo(
    () =>
      hasFeatures && draft.legendIds.length > 0
        ? suggestAdditions(draft.legendIds, deckCardIds, cardIndex, featureDB, ruleset, {
            limit: 6,
            ownedOnly: collectionMode,
            owned,
          })
        : [],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft, collectionMode, owned],
  );

  // Fehlende Karten fürs Vervollständigen: brauchst mehr, als du besitzt.
  const missingCards = deckCards
    .map(({ card, count }) => ({ card, count, have: owned.get(card.id) ?? 0 }))
    .filter((x) => x.count > x.have)
    .sort((a, b) => b.count - b.have - (a.count - a.have) || a.card.name.localeCompare(b.card.name));
  const missingTotal = missingCards.reduce((s, m) => s + (m.count - m.have), 0);

  // Kompositions-Empfehlungen (über die reine Legalität hinaus).
  const advice: string[] = [];
  if (stats.deckSize > 0) {
    const units = stats.typeCounts.UNIT ?? 0;
    const gears = stats.typeCounts.GEAR ?? 0;
    if (units === 0) {
      advice.push(
        'Keine Units im Deck — Units greifen an und stehlen Gigs (die Siegbedingung). Ohne Units kannst du nicht gewinnen.',
      );
    } else if (units < 12) {
      advice.push(`Nur ${units} Units — die meisten Decks wollen deutlich mehr, um Druck zu machen.`);
    }
    if (gears > 0 && units === 0) {
      advice.push('Gear lässt sich nur an Units/Legends ausrüsten — ohne Units bleibt es liegen.');
    }
    const unusedColors = stats.byColor
      .filter((c) => c.cap > 0 && c.cardCount === 0)
      .map((c) => c.color);
    if (unusedColors.length > 0) {
      advice.push(`RAM in ${unusedColors.join('/')} ungenutzt — keine Karten dieser Farbe(n) im Deck.`);
    }
  }

  const sizeOk = stats.deckSize >= ruleset.deckMin && stats.deckSize <= ruleset.deckMax;
  const maxCurve = Math.max(1, ...stats.costCurve.map((b) => b.count));

  function addResult(card: Card) {
    if (card.type === 'LEGEND') update((d) => addLegend(d, card.id));
    else update((d) => incCard(d, card.id, 1));
    setQuery('');
  }

  return (
    <section className="space-y-4">
      {/* Kopf: Deck-Verwaltung */}
      <div className="rounded-lg bg-surface p-4">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-mono text-lg">Deckeditor</h2>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            <input
              type="checkbox"
              checked={collectionMode}
              onChange={(e) => setCollectionMode(e.target.checked)}
            />
            nur was ich besitze
          </label>
        </div>

        {/* Deck-Leiste: benannte Decks wählen/anlegen/umbenennen/löschen */}
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <select
            value={draft.id}
            onChange={(e) => void setCurrentDeckId(e.target.value)}
            className="rounded-md border border-white/10 bg-bg px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
          >
            {(decks ?? []).map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            value={nameEdit ?? draft.name}
            onChange={(e) => setNameEdit(e.target.value)}
            onBlur={() => {
              if (nameEdit !== null && nameEdit.trim() && nameEdit !== draft.name) {
                update((d) => ({ ...d, name: nameEdit.trim() }));
              }
              setNameEdit(null);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.currentTarget.blur();
            }}
            placeholder="Deckname"
            aria-label="Deckname"
            className="min-w-[10rem] flex-1 rounded-md border border-white/10 bg-bg px-2 py-1.5 font-mono text-sm outline-none focus:border-accent"
          />
          <button
            onClick={() => void createDeck(ruleset.version)}
            className="rounded border border-white/10 px-2 py-1.5 font-mono text-xs hover:border-accent"
          >
            + Neu
          </button>
          <button
            onClick={() => void duplicateDeck()}
            className="rounded border border-white/10 px-2 py-1.5 font-mono text-xs hover:border-accent"
          >
            Duplizieren
          </button>
          <button
            onClick={() => void deleteDeck(draft.id, ruleset.version)}
            className="rounded border border-white/10 px-2 py-1.5 font-mono text-xs text-muted hover:border-card-red hover:text-card-red"
          >
            Löschen
          </button>
          <button
            onClick={() => update((d) => emptyDraft(ruleset.version, d.id, d.name))}
            className="rounded border border-white/10 px-2 py-1.5 font-mono text-xs hover:border-accent"
          >
            Leeren
          </button>
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Karte hinzufügen (Name oder Nummer)…"
          className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
        />

        {/* Deckbau-Filter: Farbe · Typ · nur legal (unter den Legends) · nur Bestand */}
        <div className="mt-2 flex flex-wrap items-center gap-2 font-mono text-xs">
          <select
            value={filterColor}
            onChange={(e) => setFilterColor(e.target.value as Color | 'ALL')}
            className="rounded border border-white/10 bg-bg px-2 py-1 outline-none focus:border-accent"
            aria-label="Farbe filtern"
          >
            <option value="ALL">Farbe: alle</option>
            {ruleset.colors.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as CardType | 'ALL')}
            className="rounded border border-white/10 bg-bg px-2 py-1 outline-none focus:border-accent"
            aria-label="Typ filtern"
          >
            <option value="ALL">Typ: alle</option>
            {(['LEGEND', ...typeOrder] as CardType[]).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-muted">
            <input
              type="checkbox"
              checked={onlyLegal}
              onChange={(e) => setOnlyLegal(e.target.checked)}
            />
            nur legal spielbar
          </label>
          {anyFilter && (
            <button
              onClick={() => {
                setFilterColor('ALL');
                setFilterType('ALL');
                setOnlyLegal(false);
                setCollectionMode(false);
              }}
              className="text-muted underline decoration-dotted hover:text-accent"
            >
              Filter zurücksetzen
            </button>
          )}
        </div>

        {(query || anyFilter) && (
          <ul className="mt-2 max-h-64 divide-y divide-white/5 overflow-auto rounded-md border border-white/5">
            {results.length === 0 && (
              <li className="px-3 py-2 text-sm text-muted">Keine Treffer.</li>
            )}
            {results.map((card) => (
              <li
                key={card.id}
                onClick={() => addResult(card)}
                className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-white/10"
              >
                <CardImage card={card} src={images.get(card.id)} className="h-8 w-6" />
                <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                <span className="font-mono text-sm">{card.name}</span>
                {card.subtitle && <span className="text-xs text-muted">{card.subtitle}</span>}
                <span className="ml-auto font-mono text-xs text-muted">
                  {card.type === 'LEGEND' ? 'LEGEND' : card.type}
                  {typeof card.ram === 'number' ? ` · RAM ${card.ram}` : ''}
                  {(owned.get(card.id) ?? 0) > 0 ? ` · ${owned.get(card.id)}× im Besitz` : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Legends */}
      <div className="rounded-lg bg-surface p-4">
        <h3 className="mb-2 font-mono text-sm">
          Legends <span className="text-muted">({legends.length}/{ruleset.legendCount})</span>
        </h3>
        {legends.length === 0 ? (
          <p className="text-sm text-muted">Noch keine Legends gewählt.</p>
        ) : (
          <ul className="space-y-1">
            {legends.map((l) => (
              <li key={l.id} className="flex items-center gap-2 font-mono text-sm">
                <span className={`h-2 w-2 rounded-full ${colorDot[l.color]}`} />
                {l.name} <span className="text-muted">{l.subtitle}</span>
                <span className="text-xs text-muted">
                  {typeof l.ram === 'number' ? `RAM ${l.ram}` : 'kein RAM'}
                </span>
                <button
                  onClick={() => update((d) => removeLegend(d, l.id))}
                  className="ml-auto text-muted hover:text-card-red"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Synergie beim Bauen: Bewertung + Vorschläge (§ 12) */}
      <div className="rounded-lg bg-surface p-4">
        <div className="mb-2 flex items-baseline justify-between">
          <h3 className="font-mono text-sm">Synergie</h3>
          {hasFeatures && synStats.cardCount > 0 && (
            <span className="font-mono text-xs" title="Wie viele Deckkarten mit deinen Legends synergieren · Ø = Schnitt pro Karte">
              <span className={RATING(synStats.avg).cls}>
                {synStats.synergyCount}/{synStats.cardCount} Karten
              </span>
              <span className="text-muted"> · Ø {synStats.avg.toFixed(1)}</span>
            </span>
          )}
        </div>
        <div className="mb-3">
          <SynergyInfo />
        </div>
        {!hasFeatures ? (
          <p className="text-xs text-muted">Keine Synergie-Daten geladen.</p>
        ) : draft.legendIds.length === 0 ? (
          <p className="text-sm text-muted">
            Wähle Legends — dann schlage ich hier passende, RAM-legale Karten vor.
          </p>
        ) : suggestions.length === 0 ? (
          <p className="text-sm text-muted">
            Keine klaren Vorschläge{collectionMode ? ' aus deinem Bestand' : ''}.
          </p>
        ) : (
          <>
            <p className="mb-2 text-xs text-muted">
              Passt zu deinen Legends{collectionMode ? ' (nur Bestand)' : ''} — zum Einbauen tippen:
            </p>
            <ul className="space-y-1">
              {suggestions.map((s) => {
                const tokens = [...new Set(s.reasons.map((r) => r.token))];
                return (
                  <li key={s.card.id} className="flex items-center gap-2 font-mono text-sm">
                    <CardImage card={s.card} src={images.get(s.card.id)} className="h-9 w-6" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[s.card.color]}`} />
                    <button
                      onClick={() => update((d) => incCard(d, s.card.id, 1))}
                      title="Ins Deck aufnehmen (+1)"
                      className="rounded bg-accent/20 px-1.5 text-accent hover:bg-accent/40"
                    >
                      +
                    </button>
                    <span className="truncate">{s.card.name}</span>
                    <span className="hidden gap-1 sm:flex">
                      {tokens.slice(0, 3).map((t) => (
                        <span
                          key={t}
                          className="rounded bg-white/5 px-1 py-0.5 text-[10px] text-muted"
                        >
                          {t}
                        </span>
                      ))}
                    </span>
                    <span className="ml-auto text-xs text-accent">{s.score.toFixed(1)}</span>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </div>

      {/* Swap-Analyse */}
      {draft.legendIds.length === ruleset.legendCount && swaps.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-1 font-mono text-sm">Swap-Analyse</h3>
          <p className="mb-3 text-xs text-muted">
            Eine Legend tauschen ⇒ freigeschaltete / verlorene Karten aus deinem Bestand.
          </p>
          <ul className="space-y-2">
            {swaps.slice(0, 5).map((s, i) => (
              <li key={i} className="rounded-md bg-bg/60 p-2 font-mono text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted">{s.out.name}</span>
                  <span>→</span>
                  <span>{s.in.name}</span>
                  <span
                    className={`ml-auto ${
                      s.net > 0 ? 'text-card-green' : s.net < 0 ? 'text-card-red' : 'text-muted'
                    }`}
                  >
                    {s.net > 0 ? '+' : ''}
                    {s.net}
                  </span>
                </div>
                <div className="mt-1 text-xs">
                  <span className="text-card-green">+{s.unlocked.length}</span> frei
                  {' · '}
                  <span className="text-card-red">−{s.lost.length}</span> verloren
                  {s.unlocked.length > 0 && (
                    <span className="text-muted">
                      {' · '}
                      {s.unlocked.slice(0, 4).map((c) => c.name).join(', ')}
                      {s.unlocked.length > 4 ? ' …' : ''}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Live-Statistiken */}
      <div className="rounded-lg bg-surface p-4">
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-mono text-sm">Statistik</h3>
          <span className={`font-mono text-sm ${sizeOk ? 'text-card-green' : 'text-card-red'}`}>
            Deck {stats.deckSize} / {ruleset.deckMin}–{ruleset.deckMax}
          </span>
        </div>

        {/* RAM-Caps je Farbe */}
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {stats.byColor.map((c) => {
            const over = c.maxRam > c.cap;
            return (
              <div key={c.color} className="rounded bg-bg/60 p-2 font-mono text-xs">
                <span className={colorText[c.color]}>{c.color}</span>
                <div className="text-muted">
                  Cap {c.cap} · {c.cardCount} Karten
                </div>
                <div className={over ? 'text-card-red' : 'text-muted'}>
                  max RAM {c.maxRam}
                  {over ? ' ⚠' : ''}
                </div>
              </div>
            );
          })}
        </div>

        {/* Cost-Kurve: Balken als direkte Kinder einer fix hohen Zeile, damit die
            Prozent-Höhe auflöst; Achsenlabels in einer eigenen Zeile darunter. */}
        <div className="mb-3">
          <div className="mb-1 font-mono text-xs text-muted">Eddie-Kurve (Cost)</div>
          <div className="flex items-end gap-1" style={{ height: 60 }}>
            {stats.costCurve.map((b) => (
              <div
                key={b.cost}
                className="flex-1 rounded-t bg-accent/70"
                style={{ height: `${b.count > 0 ? Math.max((b.count / maxCurve) * 100, 6) : 0}%` }}
                title={`Cost ${b.cost}: ${b.count}`}
              />
            ))}
          </div>
          <div className="mt-0.5 flex gap-1">
            {stats.costCurve.map((b) => (
              <span key={b.cost} className="flex-1 text-center font-mono text-[10px] text-muted">
                {b.cost}
              </span>
            ))}
          </div>
        </div>

        {/* Typverteilung */}
        <div className="flex gap-4 font-mono text-xs text-muted">
          {typeOrder
            .filter((t) => (stats.typeCounts[t] ?? 0) > 0)
            .map((t) => (
              <span key={t}>
                {t}: <span className="text-text">{stats.typeCounts[t]}</span>
              </span>
            ))}
        </div>
      </div>

      {/* Validierung */}
      <div className="rounded-lg bg-surface p-4">
        <h3 className="mb-2 font-mono text-sm">
          Validierung{' '}
          {validation.ok ? (
            <span className="text-card-green">✓ legal</span>
          ) : (
            <span className="text-card-red">{validation.violations.length} Problem(e)</span>
          )}
        </h3>
        {!validation.ok && (
          <ul className="space-y-1 text-sm text-muted">
            {validation.violations.map((v, i) => (
              <li key={i}>• {v.message}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Empfehlungen zur Deck-Zusammenstellung (über die Legalität hinaus) */}
      {advice.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 font-mono text-sm">
            Empfehlungen <span className="text-card-red">{advice.length}</span>
          </h3>
          <ul className="space-y-1 text-sm text-muted">
            {advice.map((a, i) => (
              <li key={i}>⚠ {a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Deckliste */}
      <div className="rounded-lg bg-surface p-4">
        <h3 className="mb-2 font-mono text-sm">Deck</h3>
        {deckCards.length === 0 ? (
          <p className="text-sm text-muted">Leer. Suche oben Karten und füge sie hinzu.</p>
        ) : (
          <ul className="space-y-1">
            {deckCards.map(({ card, count }) => {
              const have = owned.get(card.id) ?? 0;
              const missing = count > have;
              const cap = stats.byColor.find((c) => c.color === card.color)?.cap ?? 0;
              const ramOver = (card.ram ?? 0) > cap;
              return (
                <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
                  <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
                  <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                  <button
                    onClick={() => update((d) => incCard(d, card.id, -1))}
                    className="text-muted hover:text-text"
                  >
                    −
                  </button>
                  <span className="w-8 text-center text-accent">{count}×</span>
                  <button
                    onClick={() => update((d) => incCard(d, card.id, 1))}
                    className="text-muted hover:text-text"
                  >
                    +
                  </button>
                  <button
                    onClick={() => setDetail(card)}
                    className={`truncate text-left hover:text-accent ${ramOver ? 'text-card-red' : ''}`}
                  >
                    {card.name}
                    {ramOver ? ' ⚠RAM' : ''}
                  </button>
                  <span className="ml-auto flex items-center gap-2">
                    {collectionMode && (
                      <span className={`text-xs ${missing ? 'text-card-red' : 'text-muted'}`}>
                        {count}/{have} im Besitz{missing ? ' — fehlt' : ''}
                      </span>
                    )}
                    <button
                      onClick={() => update((d) => setCard(d, card.id, 0))}
                      title="Karte ganz aus dem Deck entfernen"
                      aria-label={`${card.name} aus dem Deck entfernen`}
                      className="text-muted hover:text-card-red"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Fehlende Karten (Einkaufsliste zum Vervollständigen) */}
      {missingCards.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="font-mono text-sm">Fehlende Karten</h3>
            <span className="font-mono text-xs text-card-red">{missingTotal} fehlen</span>
          </div>
          <p className="mb-2 text-xs text-muted">
            Diese Karten brauchst du für das Deck noch — Anzahl im Deck vs. Bestand.
          </p>
          <ul className="space-y-1">
            {missingCards.map(({ card, count, have }) => (
              <li key={card.id} className="flex items-center gap-2 font-mono text-sm">
                <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
                <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                <button
                  onClick={() => setDetail(card)}
                  className="truncate text-left hover:text-accent"
                >
                  {card.name}
                </button>
                <span className="ml-auto shrink-0 text-xs text-muted">
                  {have}/{count} · <span className="text-card-red">−{count - have}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <DeckTextPanel draft={draft} onImport={importParsed} />

      <CardDetail
        card={detail}
        owned={detail ? (owned.get(detail.id) ?? 0) : undefined}
        onClose={() => setDetail(null)}
        onPick={(c) => setDetail(c)}
      />
    </section>
  );
}
