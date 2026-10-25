import { useEffect, useState } from 'react';
import { t } from '../i18n';
import { Rich } from './Rich';
import { useBackClose } from './backButton';

/**
 * Kurze Spielhilfe („How to play"), aufklappbar als Overlay unter „Mehr".
 *
 * Bewusst in EIGENEN Worten zusammengefasst (§ 8: kein Abtippen des offiziellen
 * Regelwerks) — für die vollständigen Regeln wird auf die offizielle Seite verlinkt.
 */
const RULES_URL = 'https://cyberpunktcg.com';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-1 font-mono text-sm text-text">{title}</h3>
      <div className="space-y-1 text-sm text-muted">{children}</div>
    </div>
  );
}

export function HowToPlay() {
  const [open, setOpen] = useState(false);
  useBackClose(open, () => setOpen(false));

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <section className="rounded-lg bg-surface p-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="font-mono text-lg">{t('How to play')}</h2>
          <p className="text-xs text-muted">{t('Kurze Spielhilfe fürs Cyberpunk TCG.')}</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded bg-accent px-3 py-1.5 font-mono text-sm text-on-accent"
        >
          {t('Öffnen')}
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-30 flex items-end justify-center bg-black/70 p-0 sm:items-center sm:p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[90vh] w-full max-w-lg space-y-4 overflow-auto rounded-t-2xl bg-surface p-4 sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <h2 className="font-mono text-lg">{t('How to play')}</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label={t('Schließen')}
                className="rounded px-2 py-1 text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <Section title={t('Ziel')}>
              <p>
                <Rich text={t('Du gewinnst, indem deine **Units** die **Gigs** des Gegners stehlen (sie greifen dessen Gig-Bereich an). Ohne Units, die angreifen, kein Sieg.')} />
              </p>
            </Section>

            <Section title={t('Dein Deck (die 4 Regeln)')}>
              <ul className="list-inside list-disc space-y-0.5">
                <li><Rich text={t('Genau **3 Legends** mit unterschiedlichen Namen.')} /></li>
                <li><Rich text={t('**40–50 Karten** im Deck (Legends zählen nicht mit).')} /></li>
                <li><Rich text={t('Höchstens **3 Kopien** derselben Karte.')} /></li>
                <li><Rich text={t('**RAM-Limit pro Farbe** (siehe unten).')} /></li>
              </ul>
            </Section>

            <Section title={t('RAM & Farben — der Kern des Deckbaus')}>
              <p>
                <Rich
                  text={t(
                    'Jede Legend hat eine Farbe (Rot/Grün/Blau/Gelb) und einen RAM-Wert. Das RAM-Limit einer Farbe ist die **Summe der RAM ihrer Legends dieser Farbe**. Eine Karte darfst du nur spielen, wenn ihr RAM das Limit **ihrer eigenen Farbe** nicht übersteigt — RAM wird pro Farbe getrennt gezählt. Deine 3 Legends legen also fest, welche Farben und wie viel „Budget" du hast.',
                  )}
                />
              </p>
              <p className="text-xs">
                <Rich text={t('Genau das nutzt der **Solver** (welche Legends schöpfen deinen Bestand aus) und die Deck-Statistik (Cap/Farbe).')} />
              </p>
            </Section>

            <Section title={t('Kartentypen')}>
              <ul className="list-inside list-disc space-y-0.5">
                <li><Rich text={t('**Unit** — greift an, stiehlt Gigs, kämpft.')} /></li>
                <li><Rich text={t('**Gear** — wird an eine Unit/Legend ausgerüstet.')} /></li>
                <li><Rich text={t('**Program** — Einmal-/Effektkarte.')} /></li>
                <li><Rich text={t('**Legend** — deine 3 Anführer; geben Farbe/RAM und eigene Fähigkeiten.')} /></li>
              </ul>
            </Section>

            <Section title={t('Gigs, Eddies & Keywords')}>
              <p>
                <Rich
                  text={t(
                    '**Gigs** sind Würfel mit Werten; viele Karten interagieren mit ihnen (hohe/niedrige Werte, gerade/ungerade, gleiche Werte = „Value-Pairs"). **Eddies (€$)** sind die Ressource zum Ausspielen — die „Eddie-Kurve" im Deckeditor zeigt, wie teuer dein Deck ist.',
                  )}
                />
              </p>
              <p className="text-xs">
                {t('Keywords wie {a}, {b} oder {c} stehen auf den Karten; die Synergie-Ansicht erklärt, welche zusammenpassen.', {
                  a: '{Go Solo}',
                  b: '{Blocker}',
                  c: '{Adrenaline}',
                })}
              </p>
            </Section>

            <a
              href={RULES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-sm text-accent hover:underline"
            >
              {t('Vollständige Regeln auf cyberpunktcg.com ↗')}
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
