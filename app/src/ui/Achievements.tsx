import { useEffect, useMemo, useRef, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { catalog, cardIndex, hasAltArt } from '../data/catalog';
import { ownedByCard } from '../data/owned';
import { db, getSeenAchievements, setSeenAchievements } from '../db/db';
import { computeAchievements, newlyUnlocked, type Achievement } from '../domain/achievements';
import type { DeckDraft } from '../domain/deckDraft';
import type { CollectionEntry } from '../domain/types';
import { feedbackAdded } from '../native/feedback';
import { rulesetV1Loaded } from '../rules/ruleset';
import { validate } from '../rules/validate';
import { Collapsible } from './Collapsible';
import { Logo } from './Logo';

/**
 * Sammler-Erfolge: Liste mit Fortschritt (Sammlung, einklappbar) und eine kurze
 * Einblendung mit Vibration, sobald ein neuer Erfolg freigeschaltet wird. Alles wird
 * live aus Sammlung + Decks abgeleitet; gemerkt wird nur, was schon gemeldet wurde.
 */

const altArtCards = new Set(catalog.filter((c) => hasAltArt(c.id)).map((c) => c.id));

function useAchievements(): Achievement[] | null {
  const entries = useLiveQuery(() => db.collection.toArray(), [], null as CollectionEntry[] | null);
  const decks = useLiveQuery(() => db.decks.toArray(), [], null as DeckDraft[] | null);
  return useMemo(() => {
    if (!entries || !decks) return null; // noch nicht geladen → keine Fehl-Meldungen
    return computeAchievements({
      cards: catalog,
      owned: ownedByCard(entries),
      altArtCards,
      deckCount: decks.length,
      legalDeckCount: decks.filter((d) => validate(d, rulesetV1Loaded, cardIndex).ok).length,
      maxCopies: rulesetV1Loaded.maxCopiesPerCard,
    });
  }, [entries, decks]);
}

export function AchievementsPanel() {
  const list = useAchievements() ?? [];
  const done = list.filter((a) => a.unlocked).length;
  // Freigeschaltete zuerst, dann nach Fortschritt.
  const sorted = [...list].sort(
    (a, b) => Number(b.unlocked) - Number(a.unlocked) || b.current / b.target - a.current / a.target,
  );
  return (
    <Collapsible
      title="Erfolge"
      right={
        <>
          <span className="text-accent">{done}</span>/{list.length}
        </>
      }
    >
      <ul className="grid gap-2 sm:grid-cols-2">
        {sorted.map((a) => (
          <li
            key={a.id}
            className={`rounded-md border p-2.5 ${a.unlocked ? 'border-accent/50 bg-accent/10' : 'border-white/10 bg-bg/40'}`}
          >
            <div className="flex items-center gap-2">
              <Logo className={`h-6 w-4 shrink-0 ${a.unlocked ? 'text-accent' : 'text-muted/40'}`} />
              <div className="min-w-0 flex-1">
                <div className={`truncate font-mono text-sm ${a.unlocked ? 'text-accent' : 'text-text'}`}>{a.title}</div>
                <div className="truncate text-xs text-muted">{a.description}</div>
              </div>
              {a.unlocked && <span className="shrink-0 font-mono text-sm text-accent">✓</span>}
            </div>
            {!a.unlocked && a.target > 1 && (
              <div className="mt-2 flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <div className="h-full rounded-full bg-accent" style={{ width: `${(a.current / a.target) * 100}%` }} />
                </div>
                <span className="shrink-0 font-mono text-[11px] text-muted">
                  {a.current}/{a.target}
                </span>
              </div>
            )}
          </li>
        ))}
      </ul>
    </Collapsible>
  );
}

/** Globale Einblendung neuer Erfolge (einmal pro Erfolg, mit Vibration). */
export function AchievementToasts() {
  const list = useAchievements();
  const seenRef = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<{ key: number; a: Achievement }[]>([]);

  useEffect(() => {
    if (!list) return;
    void (async () => {
      if (!seenRef.current) {
        const stored = await getSeenAchievements();
        if (stored === null) {
          // Erster Start mit Erfolgen: Bestehendes still übernehmen (kein Toast-Regen).
          const ids = list.filter((a) => a.unlocked).map((a) => a.id);
          seenRef.current = new Set(ids);
          await setSeenAchievements(ids);
          return;
        }
        seenRef.current = new Set(stored);
      }
      const seen = seenRef.current;
      const fresh = newlyUnlocked(list, seen);
      if (fresh.length === 0) return;
      for (const a of fresh) seen.add(a.id);
      await setSeenAchievements([...seen]);
      feedbackAdded();
      const now = Date.now();
      setToasts((t) => [...t, ...fresh.map((a, i) => ({ key: now + i, a }))]);
      window.setTimeout(() => setToasts((t) => t.filter((x) => x.key < now)), 3800);
    })();
  }, [list]);

  if (toasts.length === 0) return null;
  const hidden = toasts.length - 3;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-40 flex flex-col items-center gap-2 px-4 sm:bottom-6">
      {hidden > 0 && (
        <div className="rounded-full bg-surface px-3 py-0.5 font-mono text-[11px] text-accent">
          +{hidden} weitere{hidden === 1 ? 'r Erfolg' : ' Erfolge'} — siehe Sammlung → Erfolge
        </div>
      )}
      {toasts.slice(-3).map(({ key, a }) => (
        <div
          key={key}
          className="animate-pop flex max-w-sm items-center gap-3 rounded-lg border border-accent/60 bg-surface px-3 py-2 shadow-lg"
        >
          <Logo className="h-8 w-5 shrink-0 text-accent" />
          <div className="min-w-0">
            <div className="font-mono text-[11px] uppercase tracking-wide text-muted">Erfolg freigeschaltet</div>
            <div className="truncate font-mono text-sm text-accent">{a.title}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
