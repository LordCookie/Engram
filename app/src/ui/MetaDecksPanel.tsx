import { useMemo, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { cardIndex } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { metaDecks } from '../data/metaDecks';
import { ownedByCard } from '../data/owned';
import { createDeck, db, saveDeck, wantAtLeast } from '../db/db';
import { metaDeckOwnership, type Localized, type MetaDeck } from '../domain/metaDecks';
import type { Card, CardType, CollectionEntry, Color } from '../domain/types';
import { getLang, t, tk, tn } from '../i18n';
import { rulesetV1Loaded } from '../rules/ruleset';
import { CardDetail } from './CardDetail';
import { CardImage } from './CardImage';
import { Icon } from './Icon';

/**
 * Meta-Decks (Tab „Synergie"): starke Decks aus öffentlichen Deck-Guides und Meta-Statistiken
 * mit eigener Einordnung — warum stark, Spielplan, Schwäche, Quelle. Je Deck: was dir fehlt,
 * „Als Deck übernehmen" (neues Deck → Deckeditor) und fehlende Karten auf die Want-Liste.
 * Daten: `data/metaDecks.ts` (gitignored, `sim/build_meta_decks.ts`).
 */

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

const TYPE_GROUPS: { type: CardType; label: string }[] = [
  { type: 'UNIT', label: tk('Units') },
  { type: 'GEAR', label: tk('Gear') },
  { type: 'PROGRAM', label: tk('Programs') },
  { type: 'BRAINDANCE', label: tk('Braindance') },
];

const loc = (x: Localized) => (getLang() === 'en' ? x.en : x.de);
const locList = (x: { de: string[]; en: string[] }) => (getLang() === 'en' ? x.en : x.de);

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(getLang() === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function MetaDecksPanel({ onOpenDeck }: { onOpenDeck: () => void }) {
  const images = useCardImages();
  const entries = useLiveQuery(() => db.collection.toArray(), [], [] as CollectionEntry[]);
  const owned = useMemo(() => {
    const m = new Map<string, number>();
    for (const [id, o] of ownedByCard(entries)) m.set(id, o.std + o.alt);
    return m;
  }, [entries]);
  const [open, setOpen] = useState<string | null>(null);
  const [detail, setDetail] = useState<Card | null>(null);

  async function adopt(deck: MetaDeck) {
    const draft = await createDeck(rulesetV1Loaded.version, loc(deck.name)); // wird zum aktuellen Deck
    await saveDeck({ ...draft, legendIds: deck.legendIds, cards: deck.cards.map((c) => ({ ...c })) });
    onOpenDeck();
  }

  return (
    <section className="rounded-lg bg-surface p-4">
      <h2 className="mb-1 font-mono text-lg">{t('Meta-Decks')}</h2>
      {metaDecks.decks.length === 0 ? (
        <p className="text-xs text-muted">{t('Keine Meta-Decks in diesem Build.')}</p>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">
            {t('Starke Decks aus öffentlichen Deck-Guides und Meta-Statistiken, in eigenen Worten eingeordnet (Stand {date}). Online-Siegquoten sind kein Turnierergebnis.', {
              date: fmtDate(metaDecks.updated),
            })}
          </p>
          <ol className="space-y-2">
            {metaDecks.decks.map((deck, i) => (
              <MetaDeckItem
                key={deck.id}
                rank={i + 1}
                deck={deck}
                open={open === deck.id}
                onToggle={() => setOpen((o) => (o === deck.id ? null : deck.id))}
                owned={owned}
                images={images}
                onAdopt={() => void adopt(deck)}
                onDetail={setDetail}
              />
            ))}
          </ol>
        </>
      )}
      <CardDetail card={detail} owned={detail ? (owned.get(detail.id) ?? 0) : undefined} onClose={() => setDetail(null)} />
    </section>
  );
}

function MetaDeckItem({
  rank,
  deck,
  open,
  onToggle,
  owned,
  images,
  onAdopt,
  onDetail,
}: {
  rank: number;
  deck: MetaDeck;
  open: boolean;
  onToggle: () => void;
  owned: ReadonlyMap<string, number>;
  images: ReadonlyMap<string, string>;
  onAdopt: () => void;
  onDetail: (card: Card) => void;
}) {
  const [wantMsg, setWantMsg] = useState<string | null>(null);
  const own = metaDeckOwnership(deck, owned);
  const legends = deck.legendIds.map((id) => cardIndex.get(id)).filter((c): c is Card => !!c);
  const missingCopies = own.total - own.have;

  async function toWants() {
    await wantAtLeast(own.missing);
    setWantMsg(tn(own.missing.length, '{n} Karte auf der Want-Liste', '{n} Karten auf der Want-Liste'));
  }

  return (
    <li className="rounded-md bg-bg/60">
      <button onClick={onToggle} aria-expanded={open} className="flex w-full items-center gap-3 p-2 text-left">
        <span className="w-4 shrink-0 text-center font-mono text-xs text-muted">{rank}</span>
        <span className="flex shrink-0 -space-x-3">
          {legends.map((c) => (
            <CardImage key={c.id} card={c} src={images.get(c.id)} className="h-12 w-[2.15rem] rounded ring-1 ring-black/40" />
          ))}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-mono text-sm text-accent">{loc(deck.name)}</span>
          <span className="block truncate text-xs text-muted">{loc(deck.tag)}</span>
          <span className="mt-1 flex items-center gap-1">
            {legends.map((c) => (
              <span key={c.id} className={`h-1.5 w-1.5 rounded-full ${colorDot[c.color]}`} />
            ))}
            <span className="ml-1 h-1 w-16 overflow-hidden rounded-full bg-white/10">
              <span className="block h-full bg-card-green" style={{ width: `${(own.have / own.total) * 100}%` }} />
            </span>
            <span className="font-mono text-[10px] text-muted">
              {own.have}/{own.total}
            </span>
          </span>
        </span>
        <Icon name={open ? 'chevronDown' : 'chevronRight'} className="h-4 w-4 text-muted" />
      </button>

      {open && (
        <div className="space-y-3 border-t border-white/5 p-3 pt-2">
          {/* Legends */}
          <div className="grid grid-cols-3 gap-2">
            {legends.map((c) => (
              <button key={c.id} onClick={() => onDetail(c)} className="min-w-0 text-left">
                <CardImage card={c} src={images.get(c.id)} className="aspect-[733/1024] w-full rounded-md" />
                <span className="mt-1 flex items-center gap-1">
                  <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.color]}`} />
                  <span className="truncate font-mono text-xs">{c.name}</span>
                  {(owned.get(c.id) ?? 0) > 0 && <Icon name="check" className="h-3.5 w-3.5 text-card-green" />}
                </span>
                {c.subtitle && <span className="block truncate text-[10px] text-muted">{c.subtitle}</span>}
              </button>
            ))}
          </div>

          <InfoList title={t('Warum stark')} items={locList(deck.evidence)} />
          <InfoList title={t('Spielplan')} items={locList(deck.plan)} ordered />
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h4 className="mb-0.5 font-mono text-xs text-muted">{t('Schwachstelle')}</h4>
              <p className="text-[13px] leading-snug">{loc(deck.weak)}</p>
            </div>
            <div>
              <h4 className="mb-0.5 font-mono text-xs text-muted">{t('Sideboard')}</h4>
              <p className="text-[13px] leading-snug">{loc(deck.side)}</p>
            </div>
          </div>

          {/* Deckliste nach Typ, mit Bestand */}
          <div>
            <h4 className="mb-1 font-mono text-xs text-muted">
              {t('Deckliste')} · {tn(own.total - deck.legendIds.length, '{n} Karte', '{n} Karten')}
            </h4>
            <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
              {TYPE_GROUPS.map(({ type, label }) => {
                const rows = deck.cards
                  .map((c) => ({ ...c, card: cardIndex.get(c.cardId) }))
                  .filter((r): r is typeof r & { card: Card } => r.card?.type === type);
                if (rows.length === 0) return null;
                return (
                  <div key={type}>
                    <div className="mb-0.5 font-mono text-[11px] uppercase tracking-wide text-muted">
                      {t(label)} <span className="text-text">{rows.reduce((s, r) => s + r.count, 0)}</span>
                    </div>
                    <ul>
                      {rows.map(({ card, count }) => {
                        const have = owned.get(card.id) ?? 0;
                        return (
                          <li key={card.id}>
                            <button
                              onClick={() => onDetail(card)}
                              className="flex w-full items-center gap-1.5 rounded px-1 py-0.5 text-left font-mono text-xs hover:bg-white/5"
                            >
                              <span className="w-3 text-right text-muted">{count}</span>
                              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${colorDot[card.color]}`} />
                              <span className="min-w-0 flex-1 truncate">{card.name}</span>
                              {have >= count ? (
                                <Icon name="check" className="h-3.5 w-3.5 text-card-green" />
                              ) : (
                                <span className="text-[10px] text-card-red">
                                  {have}/{count}
                                </span>
                              )}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Aktionen */}
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button onClick={onAdopt} className="rounded-md bg-accent px-3 py-2 font-mono text-sm text-on-accent">
              {t('Als Deck übernehmen')}
            </button>
            {missingCopies > 0 && (
              <button
                onClick={() => void toWants()}
                className="inline-flex items-center gap-1.5 rounded-md border border-white/10 px-3 py-2 font-mono text-sm hover:border-accent"
              >
                <Icon name="star" className="h-4 w-4 text-accent" />
                {t('{n} fehlende → Want-Liste', { n: missingCopies })}
              </button>
            )}
            {deck.source && (
              <a
                href={deck.source}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 font-mono text-xs text-muted hover:text-accent"
              >
                {t('Deck-Guide (Quelle)')} <Icon name="external" className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
          {wantMsg && (
            <p className="flex items-center gap-1 text-xs text-card-green">
              <Icon name="check" className="h-3.5 w-3.5" />
              {wantMsg}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

function InfoList({ title, items, ordered = false }: { title: string; items: string[]; ordered?: boolean }) {
  if (items.length === 0) return null;
  const List = ordered ? 'ol' : 'ul';
  return (
    <div>
      <h4 className="mb-1 font-mono text-xs text-muted">{title}</h4>
      <List className="space-y-1 text-[13px] leading-snug">
        {items.map((x, i) => (
          <li key={i} className="flex gap-2">
            <span className="shrink-0 font-mono text-xs leading-[18px] text-accent">{ordered ? `${i + 1}.` : '·'}</span>
            <span>{x}</span>
          </li>
        ))}
      </List>
    </div>
  );
}
