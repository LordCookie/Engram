import { useMemo, useState } from 'react';
import { catalog, cardIndex } from '../data/catalog';
import { featureDB, hasFeatures } from '../data/features';
import { useCardImages } from '../data/cardImages';
import { curatedCombos } from '../data/combos';
import { useCorpus } from '../data/deckCorpus';
import { pageUrlById } from '../data/printingLinks';
import { searchCards } from '../domain/search';
import { topSynergies, topCombos } from '../domain/synergy';
import { coPlayPartners } from '../domain/coplay';
import { CardImage } from './CardImage';
import { SynergyInfo } from './SynergyInfo';
import type { Color } from '../domain/types';

/**
 * Synergie-Ansicht pro Karte (PLAN.md § 12, Variante A). Wähle eine Karte,
 * sieh die stärksten vorhergesagten Partner aus dem ganzen Set — mit Begründung.
 *
 * Ehrlichkeitsgebot (§ 12): VORHERSAGE aus Kartentext, keine Statistik.
 */

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

export function SynergyPanel() {
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const results = useMemo(() => searchCards(catalog, query, { limit: 8 }), [query]);
  const selected = selectedId ? cardIndex.get(selectedId) : undefined;
  const partners = useMemo(
    () => (selectedId ? topSynergies(selectedId, featureDB, cardIndex, 8) : []),
    [selectedId],
  );
  const images = useCardImages();
  const combos = useMemo(() => (hasFeatures ? topCombos(featureDB, cardIndex, 12) : []), []);

  // Empirische Synergie (§ 12 C): was tatsächlich zusammen gespielt wird.
  const { corpus, n, ownTotal, ownLegal } = useCorpus();
  const empirical = useMemo(
    () => (selectedId ? coPlayPartners(selectedId, corpus, cardIndex, { limit: 8 }) : []),
    [selectedId, corpus],
  );
  const empiricalIds = useMemo(() => new Set(empirical.map((e) => e.card.id)), [empirical]);

  if (!hasFeatures) {
    return (
      <section className="rounded-lg bg-surface p-4 text-sm text-muted">
        Keine Synergie-Daten geladen. Erzeuge sie mit
        <code className="mx-1 text-text">python pipeline/bootstrap_features.py</code>.
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="rounded-lg bg-surface p-4">
        <h2 className="mb-1 font-mono text-lg">Synergie</h2>
        <p className="mb-3 text-xs text-muted">
          Vorhergesagte Synergie — aus Kartentext abgeleitet, <b>keine Statistik</b>.
          Wähle eine Karte (Name oder Nummer).
        </p>

        <div className="mb-3">
          <SynergyInfo />
        </div>

        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Karte suchen…"
          className="w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-text outline-none focus:border-accent"
        />

        {query && results.length > 0 && (
          <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-md border border-white/5">
            {results.map((card) => (
              <li
                key={card.id}
                onClick={() => {
                  setSelectedId(card.id);
                  setQuery('');
                }}
                className="flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-white/10"
              >
                <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${colorDot[card.color]}`} />
                <span className="font-mono">{card.name}</span>
                {card.subtitle && <span className="text-sm text-muted">{card.subtitle}</span>}
                {card.collectorNumber && (
                  <span className="ml-auto font-mono text-xs text-muted">#{card.collectorNumber}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Kuratierte, benannte Combos (handverlesen, mit Erklärung). */}
      {!selected && curatedCombos.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-1 font-mono text-sm">Benannte Combos</h3>
          <p className="mb-3 text-xs text-muted">
            Handverlesene Kartenpakete mit Erklärung. Tippe eine Karte für ihre Partner.
          </p>
          <ol className="space-y-3">
            {curatedCombos.map((c) => (
              <li key={c.name} className="rounded-md bg-bg/60 p-2">
                <div className="mb-1 font-mono text-sm text-accent">{c.name}</div>
                <div className="mb-1 flex flex-wrap gap-2">
                  {c.cards.map((card) => (
                    <button
                      key={card.id}
                      onClick={() => setSelectedId(card.id)}
                      className="flex min-w-0 basis-[calc(50%-0.25rem)] items-center gap-1.5 sm:basis-[calc(33%-0.5rem)]"
                    >
                      <CardImage card={card} src={images.get(card.id)} className="h-11 w-8 shrink-0" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                      <span className="truncate font-mono text-xs hover:text-accent">{card.name}</span>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted">{c.why}</p>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Standardansicht: die stärksten Combos im Set (bis eine Karte gewählt wird). */}
      {!selected && combos.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-1 font-mono text-sm">Weitere Combos (automatisch)</h3>
          <p className="mb-3 text-xs text-muted">
            Stärkste vorhergesagte Karten-Paare aus dem ganzen Set (RAM-spielbar). Tippe
            eine Karte für ihre Partner.
          </p>
          <ol className="space-y-2">
            {combos.map((c) => {
              const tokens = [...new Set(c.reasons.map((r) => r.token))];
              return (
                <li key={`${c.a.id}+${c.b.id}`} className="rounded-md bg-bg/60 p-2">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedId(c.a.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                    >
                      <CardImage card={c.a} src={images.get(c.a.id)} className="h-11 w-8 shrink-0" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.a.color]}`} />
                      <span className="truncate font-mono text-sm hover:text-accent">{c.a.name}</span>
                    </button>
                    <span className="shrink-0 text-muted">+</span>
                    <button
                      onClick={() => setSelectedId(c.b.id)}
                      className="flex min-w-0 flex-1 items-center gap-1.5"
                    >
                      <CardImage card={c.b} src={images.get(c.b.id)} className="h-11 w-8 shrink-0" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.b.color]}`} />
                      <span className="truncate font-mono text-sm hover:text-accent">{c.b.name}</span>
                    </button>
                    <span className="shrink-0 font-mono text-xs text-accent">{c.score.toFixed(1)}</span>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {tokens.map((t) => (
                      <span key={t} className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted">
                        {t}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      )}

      {selected && (
        <div className="rounded-lg bg-surface p-4">
          <button
            onClick={() => setSelectedId(null)}
            className="mb-3 inline-flex items-center gap-1 rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-xs text-muted hover:border-accent hover:text-accent"
          >
            ← Zurück zu den Combos
          </button>
          <div className="mb-4 flex gap-4">
            <CardImage card={selected} src={images.get(selected.id)} className="h-44 w-32" />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className={`h-2.5 w-2.5 rounded-full ${colorDot[selected.color]}`} />
                <span className="font-mono text-lg">{selected.name}</span>
                {selected.subtitle && <span className="text-muted">{selected.subtitle}</span>}
                <span className="ml-auto font-mono text-xs text-muted">
                  {selected.type}
                  {typeof selected.ram === 'number' ? ` · RAM ${selected.ram}` : ''}
                </span>
              </div>
              {selected.rulesText && (
                <p className="mt-2 whitespace-pre-line text-sm text-muted">{selected.rulesText}</p>
              )}
              {pageUrlById.get(selected.id) && (
                <a
                  href={pageUrlById.get(selected.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block font-mono text-xs text-muted hover:text-accent"
                >
                  auf cyberpunktcg.com ansehen ↗
                </a>
              )}
            </div>
          </div>

          <h3 className="mt-4 mb-2 font-mono text-sm">Beste vorhergesagte Partner</h3>
          {partners.length === 0 ? (
            <p className="text-sm text-muted">Keine klaren Synergien im Kartentext erkannt.</p>
          ) : (
            <ol className="space-y-2">
              {partners.map((p) => {
                const tokens = [...new Set(p.reasons.map((r) => r.token))];
                return (
                  <li key={p.card.id} className="flex gap-2 rounded-md bg-bg/60 p-2">
                    <CardImage card={p.card} src={images.get(p.card.id)} className="h-14 w-10" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`h-2 w-2 rounded-full ${colorDot[p.card.color]}`} />
                        <button
                          onClick={() => setSelectedId(p.card.id)}
                          className="font-mono hover:text-accent"
                        >
                          {p.card.name}
                        </button>
                        {p.card.subtitle && (
                          <span className="text-xs text-muted">{p.card.subtitle}</span>
                        )}
                        {empiricalIds.has(p.card.id) && (
                          <span
                            className="rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[10px] text-emerald-300"
                            title="Wird laut deinen Decks auch tatsächlich zusammen gespielt"
                          >
                            ✓ empirisch
                          </span>
                        )}
                        <span className="ml-auto font-mono text-xs text-accent">
                          {p.score.toFixed(1)}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {tokens.map((t) => (
                          <span
                            key={t}
                            className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-muted"
                          >
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}

          {/* Empirische Synergie (§ 12 C): Beobachtung aus Decks, keine Vorhersage. */}
          <h3 className="mt-5 mb-1 font-mono text-sm">Zusammen gespielt</h3>
          <p className="mb-2 text-xs text-muted">
            Beobachtet in <b>{n}</b> legalen Deck{n === 1 ? '' : 's'} (Starter + deine) —
            reine Statistik, keine Vorhersage.
          </p>
          {empirical.length === 0 ? (
            <p className="rounded-md bg-bg/60 p-2 text-xs text-muted">
              Noch zu wenig Daten für diese Karte.{' '}
              {ownTotal > 0
                ? `Du hast ${ownLegal}/${ownTotal} eigene legale Decks. `
                : 'Bislang zählen nur die 2 Starter. '}
              Die Statistik wächst mit jedem gespeicherten oder importierten Deck (Tab „Deck").
            </p>
          ) : (
            <ol className="space-y-2">
              {empirical.map((e) => (
                <li key={e.card.id} className="flex gap-2 rounded-md bg-bg/60 p-2">
                  <CardImage card={e.card} src={images.get(e.card.id)} className="h-14 w-10" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`h-2 w-2 rounded-full ${colorDot[e.card.color]}`} />
                      <button
                        onClick={() => setSelectedId(e.card.id)}
                        className="font-mono hover:text-accent"
                      >
                        {e.card.name}
                      </button>
                      {e.card.type === 'LEGEND' && (
                        <span className="rounded bg-white/5 px-1 py-0.5 font-mono text-[10px] text-muted">
                          Legend
                        </span>
                      )}
                      <span
                        className="ml-auto font-mono text-xs text-accent"
                        title="Lift: wie viel häufiger als der Zufall zusammen gespielt"
                      >
                        ×{e.lift.toFixed(1)}
                      </span>
                    </div>
                    <div className="mt-1 font-mono text-[10px] text-muted">
                      in {e.coCount} von {n} Decks zusammen
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </section>
  );
}
