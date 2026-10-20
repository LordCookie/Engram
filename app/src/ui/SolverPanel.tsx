import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cardIndex, printingIndex } from '../data/catalog';
import { rulesetV1Loaded } from '../rules/ruleset';
import { collectionToOwnedCounts } from '../domain/collection';
import { solveLegends, type ScoreFn } from '../domain/solver';
import { makeSynergyScore } from '../domain/synergy';
import { makeCoPlayScore } from '../domain/coplay';
import { makeCombinedScore } from '../domain/combinedScore';
import { featureDB, hasFeatures } from '../data/features';
import { useCorpus } from '../data/deckCorpus';
import { db } from '../db/db';
import type { CollectionEntry, Color } from '../domain/types';
import { t, tn } from '../i18n';

/**
 * Legend-Solver auf dem echten Bestand (PLAN.md § 5, Aufgabe 4). Bewertung
 * umschaltbar (§ 12 C, austauschbare ScoreFn): reine Kartenmenge, synergie-
 * gewichtet aus dem Kartentext (Vorhersage) ODER aus echten Decks (Empirisch).
 * Aktualisiert sich live beim Erfassen — der Kreis aus § 0.
 */

const colorClass: Record<Color, string> = {
  RED: 'text-card-red',
  GREEN: 'text-card-green',
  BLUE: 'text-card-blue',
  YELLOW: 'text-card-yellow',
};

type SynergySource = 'predicted' | 'empirical' | 'combined';

export function SolverPanel() {
  const [weight, setWeight] = useState(0.5);
  const [blend, setBlend] = useState(0.5);
  const [source, setSource] = useState<SynergySource>('predicted');
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const { corpus, n: corpusN } = useCorpus();

  // Ohne Merkmale ist die reine Vorhersage nicht verfügbar → empirisch als Quelle.
  const effectiveSource: SynergySource =
    !hasFeatures && source === 'predicted' ? 'empirical' : source;

  const solution = useMemo(() => {
    const owned = collectionToOwnedCounts(entries, printingIndex);
    let score: ScoreFn | undefined;
    if (effectiveSource === 'combined') {
      score = makeCombinedScore(featureDB, corpus, cardIndex, { weight, blend });
    } else if (effectiveSource === 'empirical') {
      score = makeCoPlayScore(corpus, weight);
    } else if (hasFeatures) {
      score = makeSynergyScore(featureDB, weight);
    }
    return solveLegends(owned, rulesetV1Loaded, cardIndex, { topN: 3, score });
  }, [entries, weight, blend, effectiveSource, corpus]);

  const sourceLabel =
    effectiveSource === 'empirical' ? 'Co-Play' : effectiveSource === 'combined' ? t('Kombi') : t('Synergie');
  const usesCorpus = effectiveSource === 'empirical' || effectiveSource === 'combined';

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-mono text-lg">{t('Legend-Solver')}</h2>
        <div className="flex flex-wrap items-center gap-4">
          {/* Synergie-Quelle: Vorhersage (Kartentext) ↔ Empirisch (echte Decks) */}
          <div className="flex overflow-hidden rounded-md border border-white/10 font-mono text-xs">
            <button
              onClick={() => setSource('predicted')}
              disabled={!hasFeatures}
              title={t('Vorhergesagt aus dem Kartentext')}
              className={`px-2 py-1 disabled:opacity-40 ${
                effectiveSource === 'predicted' ? 'bg-accent text-on-accent' : 'text-muted hover:bg-white/5'
              }`}
            >
              {t('Vorhersage')}
            </button>
            <button
              onClick={() => setSource('empirical')}
              title={t('Beobachtet aus echten Decks')}
              className={`border-l border-white/10 px-2 py-1 ${
                effectiveSource === 'empirical' ? 'bg-accent text-on-accent' : 'text-muted hover:bg-white/5'
              }`}
            >
              {t('Empirisch')}
            </button>
            <button
              onClick={() => setSource('combined')}
              title={t('Vorhersage + Empirisch, 50/50 normalisiert')}
              className={`border-l border-white/10 px-2 py-1 ${
                effectiveSource === 'combined' ? 'bg-accent text-on-accent' : 'text-muted hover:bg-white/5'
              }`}
            >
              {t('Kombiniert')}
            </button>
          </div>
          {/* Gewicht Menge ↔ Synergie/Co-Play */}
          <div className="flex items-center gap-2 font-mono text-xs text-muted">
            <span>{t('Menge')}</span>
            <input
              type="range"
              min={0}
              max={2}
              step={0.1}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              aria-label={t('Gewichtung Menge bis Synergie')}
              className="w-28 accent-accent"
            />
            <span>{sourceLabel}</span>
          </div>
        </div>
      </div>

      {/* Blend-Regler nur im Kombi-Modus: Vorhersage ↔ Empirisch */}
      {effectiveSource === 'combined' && (
        <div className="mb-2 flex items-center justify-end gap-2 font-mono text-xs text-muted">
          <span>{t('Vorhersage')}</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={1 - blend}
            onChange={(e) => setBlend(1 - Number(e.target.value))}
            aria-label={t('Mischung Vorhersage bis Empirisch')}
            className="w-32 accent-accent"
          />
          <span>{t('Empirisch')}</span>
          <span className="ml-1 text-accent">
            {Math.round(blend * 100)}/{Math.round((1 - blend) * 100)}
          </span>
        </div>
      )}

      {solution.legendCount < 3 ? (
        <p className="text-sm text-muted">
          {tn(
            solution.legendCount,
            'Du besitzt {n} Legend. Ab 3 verschiedenen Legends schlage ich dir hier die Triples vor, die deinen Bestand maximal ausschöpfen.',
            'Du besitzt {n} Legends. Ab 3 verschiedenen Legends schlage ich dir hier die Triples vor, die deinen Bestand maximal ausschöpfen.',
          )}
        </p>
      ) : (
        <>
          <p className="mb-3 text-sm text-muted">
            {t('Beste Triples aus deinem Bestand ({n} Kombinationen) — sortiert nach', { n: solution.combinationCount })}{' '}
            {weight === 0
              ? t('freigeschalteter Kartenmenge')
              : t('Menge + {source} (Gewicht {w})', { source: sourceLabel, w: weight.toFixed(1) })}
            {weight > 0 &&
              effectiveSource === 'combined' &&
              t(' — Vorhersage + Empirisch, {a}/{b} normalisiert', {
                a: Math.round(blend * 100),
                b: Math.round((1 - blend) * 100),
              })}
            .
            {usesCorpus && weight > 0 && (
              <>
                {' '}
                <span className="text-muted">
                  {tn(corpusN, 'Basis: {n} legales Deck', 'Basis: {n} legale Decks')}
                  {corpusN <= 2 ? t(' (nur Starter — wächst mit deinen Decks)') : ''}.
                </span>
              </>
            )}
          </p>
          <ol className="space-y-3">
            {solution.triples.map((tr, i) => (
              <li key={tr.legendIds.join(',')} className="rounded-md bg-bg/60 p-3">
                <div className="flex items-baseline justify-between">
                  <span className="font-mono">
                    <span className="text-muted">#{i + 1}</span>{' '}
                    {tr.legends.map((l) => l.name).join(' · ')}
                  </span>
                  <span className="font-mono text-accent">
                    {t('{n} Karten · Score {s}', { n: tr.distinctPlayable, s: Math.round(tr.score) })}
                  </span>
                </div>
                <div className="mt-2 flex gap-4 font-mono text-sm">
                  {(Object.keys(tr.caps) as Color[])
                    .filter((c) => tr.caps[c] > 0)
                    .map((c) => (
                      <span key={c} className={colorClass[c]}>
                        {c} {tr.caps[c]}
                      </span>
                    ))}
                </div>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
