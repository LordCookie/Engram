import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalog, cardIndex } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { sourcesLabel, useCorpus } from '../data/deckCorpus';
import { ownedByCard } from '../data/owned';
import { createDeck, db, saveDeck } from '../db/db';
import { legendPartners, legendPopularity, legendTopCards, legendTrios } from '../domain/legendExplorer';
import type { Card, CollectionEntry, Color } from '../domain/types';
import { fmtNum, t, tn } from '../i18n';
import { rulesetV1Loaded } from '../rules/ruleset';
import { CardDetail } from './CardDetail';
import { CardImage } from './CardImage';
import { Icon } from './Icon';

/**
 * Legend-Explorer (Tab „Synergie"): Was spielen echte Decks mit einer Legend? Aus dem
 * Co-Play-Korpus (Meta + Community + Starter + eigene, `useCorpus`) — Verbreitung,
 * Partner-Legends, häufigste Trios (→ „Als Deck anlegen") und typische Karten mit
 * Einsatzquote. Reine Statistik (`domain/legendExplorer.ts`), keine Stärke-Bewertung.
 */

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

const LEGEND_IDS = catalog.filter((c) => c.type === 'LEGEND').map((c) => c.id);
const isDeckCard = (id: string) => cardIndex.get(id)?.type !== 'LEGEND';

// Legends mit gleichem Namen (z. B. zwei Viktor Vektor) brauchen den Untertitel zur Unterscheidung.
const nameCount = new Map<string, number>();
for (const id of LEGEND_IDS) {
  const n = cardIndex.get(id)?.name ?? id;
  nameCount.set(n, (nameCount.get(n) ?? 0) + 1);
}
function legendLabel(id: string): string {
  const c = cardIndex.get(id);
  if (!c) return id;
  return (nameCount.get(c.name) ?? 0) > 1 && c.subtitle ? `${c.name} (${c.subtitle})` : c.name;
}
const pct = (x: number) => `${fmtNum(x * 100)} %`;
const MIN_DECKS = 5;

export function LegendExplorer({ onOpenDeck }: { onOpenDeck: () => void }) {
  const { corpus, n, ingestedSources, trios } = useCorpus();
  const images = useCardImages();
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = useMemo(() => ownedByCard(entries), [entries]);
  const [selected, setSelected] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [detail, setDetail] = useState<Card | null>(null);

  const popularity = useMemo(() => legendPopularity(corpus, LEGEND_IDS), [corpus]);
  const max = popularity[0]?.decks || 1;
  const has = (id: string) => {
    const o = owned.get(id);
    return !!o && o.std + o.alt > 0;
  };
  const source = sourcesLabel(ingestedSources);

  async function createTrioDeck(ids: string[]) {
    const name = ids.map(legendLabel).join(' · ');
    const draft = await createDeck(rulesetV1Loaded.version, name); // wird zum aktuellen Deck
    await saveDeck({ ...draft, legendIds: ids });
    onOpenDeck(); // Deckeditor öffnet das neue (aktuelle) Deck
  }

  const legend = selected ? cardIndex.get(selected) : undefined;

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">{t('Legend-Explorer')}</h2>
      <p className="mb-3 text-xs text-muted">
        {t('Was echte Decks mit einer Legend spielen — aus {n} Decks ({sources}). Beliebt heißt nicht automatisch stark.', {
          n: fmtNum(n),
          sources: source ? t('{sources} + Starter + deine', { sources: source }) : t('Starter + deine'),
        })}
      </p>

      {!legend ? (
        <>
          <ul className="space-y-1">
            {(showAll ? popularity : popularity.slice(0, 8)).map((s) => {
              const c = cardIndex.get(s.id);
              if (!c) return null;
              return (
                <li key={s.id}>
                  <button
                    onClick={() => setSelected(s.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-white/5"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.color]}`} />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">
                      {c.name}
                      {c.subtitle && <span className="ml-1.5 text-xs text-muted">{c.subtitle}</span>}
                    </span>
                    <span className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-white/10 sm:block">
                      <span className="block h-full bg-accent" style={{ width: `${(s.decks / max) * 100}%` }} />
                    </span>
                    <span className="w-14 shrink-0 text-right font-mono text-xs text-muted">{pct(s.share)}</span>
                    {has(s.id) && (
                      <span title={t('In deiner Sammlung')} className="text-card-green">
                        <Icon name="check" className="h-4 w-4" />
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          {popularity.length > 8 && (
            <button
              onClick={() => setShowAll((v) => !v)}
              className="mt-2 font-mono text-xs text-muted hover:text-accent"
            >
              <Icon name={showAll ? 'chevronUp' : 'chevronDown'} className="h-3.5 w-3.5" />{' '}
              {showAll ? t('weniger') : t('alle {n} Legends', { n: popularity.length })}
            </button>
          )}
        </>
      ) : (
        <LegendProfile
          legend={legend}
          image={images.get(legend.id)}
          images={images}
          has={has}
          onBack={() => setSelected(null)}
          onSelect={setSelected}
          onCreate={(ids) => void createTrioDeck(ids)}
          onDetail={setDetail}
          stats={{
            decks: corpus.df.get(legend.id) ?? 0,
            share: n > 0 ? (corpus.df.get(legend.id) ?? 0) / n : 0,
            partners: legendPartners(legend.id, corpus, LEGEND_IDS),
            trios: legendTrios(legend.id, trios, corpus),
            cards: legendTopCards(legend.id, corpus, isDeckCard, 15, MIN_DECKS),
            ownedQty: (id) => {
              const o = owned.get(id);
              return o ? o.std + o.alt : 0;
            },
          }}
        />
      )}

      <CardDetail
        card={detail}
        owned={detail ? (owned.get(detail.id)?.std ?? 0) + (owned.get(detail.id)?.alt ?? 0) : undefined}
        onClose={() => setDetail(null)}
        onPick={(c) => setDetail(cardIndex.get(c.id) ?? null)}
      />
    </section>
  );
}

function LegendProfile({
  legend,
  image,
  images,
  has,
  stats,
  onBack,
  onSelect,
  onCreate,
  onDetail,
}: {
  legend: Card;
  image?: string;
  images: ReadonlyMap<string, string>;
  has: (id: string) => boolean;
  stats: {
    decks: number;
    share: number;
    partners: ReturnType<typeof legendPartners>;
    trios: ReturnType<typeof legendTrios>;
    cards: ReturnType<typeof legendTopCards>;
    ownedQty: (id: string) => number;
  };
  onBack: () => void;
  onSelect: (id: string) => void;
  onCreate: (ids: string[]) => void;
  onDetail: (c: Card) => void;
}) {
  const h3 = 'mb-2 mt-4 font-mono text-sm';

  return (
    <div>
      <button
        onClick={onBack}
        className="mb-3 rounded-md border border-white/10 px-2.5 py-1.5 font-mono text-xs text-muted hover:border-accent hover:text-accent"
      >
        <Icon name="back" className="h-3.5 w-3.5" /> {t('Alle Legends')}
      </button>
      <div className="flex gap-3">
        <button onClick={() => onDetail(legend)} className="shrink-0">
          <CardImage card={legend} src={image} className="h-28 w-20" />
        </button>
        <div className="min-w-0">
          <div className="font-mono text-lg">{legend.name}</div>
          {legend.subtitle && <div className="text-sm text-muted">{legend.subtitle}</div>}
          <div className="mt-1 font-mono text-xs text-muted">
            {tn(stats.decks, 'in {n} Deck ({p})', 'in {n} Decks ({p})', { p: pct(stats.share) })}
          </div>
          <div className={`mt-1 font-mono text-xs ${has(legend.id) ? 'text-card-green' : 'text-muted'}`}>
            {has(legend.id) ? (
              <span className="inline-flex items-center gap-1"><Icon name="check" className="h-3.5 w-3.5" />{t('in deiner Sammlung')}</span>
            ) : (
              t('fehlt dir noch')
            )}
          </div>
        </div>
      </div>

      {stats.decks < MIN_DECKS ? (
        <p className="mt-4 text-sm text-muted">{t('Zu wenig Decks mit dieser Legend für eine Aussage.')}</p>
      ) : (
        <>
          <h3 className={h3}>{t('Häufigste Partner')}</h3>
          <ul className="space-y-1">
            {stats.partners.map((p) => {
              const c = cardIndex.get(p.id);
              if (!c) return null;
              return (
                <li key={p.id}>
                  <button
                    onClick={() => onSelect(p.id)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5"
                  >
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.color]}`} />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{legendLabel(c.id)}</span>
                    <span className="shrink-0 font-mono text-xs text-muted">{pct(p.share)}</span>
                    {has(p.id) && <Icon name="check" className="h-4 w-4 text-card-green" />}
                  </button>
                </li>
              );
            })}
          </ul>

          {stats.trios.length > 0 && (
            <>
              <h3 className={h3}>{t('Beliebteste Trios')}</h3>
              <ul className="space-y-2">
                {stats.trios.map((tr) => {
                  const ownedCount = tr.ids.filter(has).length;
                  return (
                    <li key={tr.ids.join('|')} className="rounded-md bg-bg/60 p-2">
                      <div className="font-mono text-sm">
                        {tr.ids.map((id, i) => (
                          <span key={id}>
                            {i > 0 && <span className="text-muted"> · </span>}
                            <span className={id === legend.id ? 'text-accent' : ''}>{legendLabel(id)}</span>
                          </span>
                        ))}
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
                        <span>{tn(tr.decks, '{n} Deck · {p}', '{n} Decks · {p}', { p: pct(tr.share) })}</span>
                        <span className={ownedCount === 3 ? 'text-card-green' : ''}>
                          {t('{n}/3 Legends im Besitz', { n: ownedCount })}
                        </span>
                        <button
                          onClick={() => onCreate(tr.ids)}
                          className="ml-auto rounded border border-accent/40 px-2 py-1 text-accent hover:bg-accent/10"
                        >
                          {t('Als Deck anlegen')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          <h3 className={h3}>{t('Typische Karten')}</h3>
          <p className="mb-2 text-[11px] text-muted">
            {t('Anteil der Decks mit dieser Legend, die die Karte spielen. ×N = so viel häufiger als im Schnitt.')}
          </p>
          <ul className="space-y-1">
            {stats.cards.map((c) => {
              const card = cardIndex.get(c.id);
              if (!card) return null;
              const qty = stats.ownedQty(c.id);
              return (
                <li key={c.id}>
                  <button
                    onClick={() => onDetail(card)}
                    className="flex w-full items-center gap-2 rounded px-1 py-1 text-left hover:bg-white/5"
                  >
                    <CardImage card={card} src={images.get(card.id)} className="h-9 w-6" />
                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                    <span className="min-w-0 flex-1 truncate font-mono text-sm">{card.name}</span>
                    <span className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-white/10 sm:block">
                      <span className="block h-full bg-accent" style={{ width: `${c.rate * 100}%` }} />
                    </span>
                    <span className="w-12 shrink-0 text-right font-mono text-xs">{pct(c.rate)}</span>
                    <span className="w-10 shrink-0 text-right font-mono text-[11px] text-muted">
                      ×{fmtNum(c.lift, 1)}
                    </span>
                    <span className={`w-8 shrink-0 text-right font-mono text-[11px] ${qty > 0 ? 'text-card-green' : 'text-muted/60'}`}>
                      {qty > 0 ? `${qty}×` : '—'}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
