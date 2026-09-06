import { useEffect, useState } from 'react';

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
          <h2 className="font-mono text-lg">How to play</h2>
          <p className="text-xs text-muted">Kurze Spielhilfe fürs Cyberpunk TCG.</p>
        </div>
        <button
          onClick={() => setOpen(true)}
          className="rounded bg-accent px-3 py-1.5 font-mono text-sm text-bg"
        >
          Öffnen
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
              <h2 className="font-mono text-lg">How to play</h2>
              <button
                onClick={() => setOpen(false)}
                aria-label="Schließen"
                className="rounded px-2 py-1 text-muted hover:text-text"
              >
                ✕
              </button>
            </div>

            <Section title="Ziel">
              <p>
                Du gewinnst, indem deine <b>Units</b> die <b>Gigs</b> des Gegners stehlen
                (sie greifen dessen Gig-Bereich an). Ohne Units, die angreifen, kein Sieg.
              </p>
            </Section>

            <Section title="Dein Deck (die 4 Regeln)">
              <ul className="list-inside list-disc space-y-0.5">
                <li>Genau <b>3 Legends</b> mit unterschiedlichen Namen.</li>
                <li><b>40–50 Karten</b> im Deck (Legends zählen nicht mit).</li>
                <li>Höchstens <b>3 Kopien</b> derselben Karte.</li>
                <li><b>RAM-Limit pro Farbe</b> (siehe unten).</li>
              </ul>
            </Section>

            <Section title="RAM & Farben — der Kern des Deckbaus">
              <p>
                Jede Legend hat eine Farbe (Rot/Grün/Blau/Gelb) und einen RAM-Wert. Das
                RAM-Limit einer Farbe ist die <b>Summe der RAM ihrer Legends dieser Farbe</b>.
                Eine Karte darfst du nur spielen, wenn ihr RAM das Limit <b>ihrer eigenen
                Farbe</b> nicht übersteigt — RAM wird pro Farbe getrennt gezählt. Deine
                3 Legends legen also fest, welche Farben und wie viel „Budget" du hast.
              </p>
              <p className="text-xs">
                Genau das nutzt der <b>Solver</b> (welche Legends schöpfen deinen Bestand aus)
                und die Deck-Statistik (Cap/Farbe).
              </p>
            </Section>

            <Section title="Kartentypen">
              <ul className="list-inside list-disc space-y-0.5">
                <li><b>Unit</b> — greift an, stehlt Gigs, kämpft.</li>
                <li><b>Gear</b> — wird an eine Unit/Legend ausgerüstet.</li>
                <li><b>Program</b> — Einmal-/Effektkarte.</li>
                <li><b>Legend</b> — deine 3 Anführer; geben Farbe/RAM und eigene Fähigkeiten.</li>
              </ul>
            </Section>

            <Section title="Gigs, Eddies & Keywords">
              <p>
                <b>Gigs</b> sind Würfel mit Werten; viele Karten interagieren mit ihnen
                (hohe/niedrige Werte, gerade/ungerade, gleiche Werte = „Value-Pairs").
                <b> Eddies (€$)</b> sind die Ressource zum Ausspielen — die „Eddie-Kurve"
                im Deckeditor zeigt, wie teuer dein Deck ist.
              </p>
              <p className="text-xs">
                Keywords wie {'{Go Solo}'}, {'{Blocker}'} oder {'{Adrenaline}'} stehen auf den
                Karten; die Synergie-Ansicht erklärt, welche zusammenpassen.
              </p>
            </Section>

            <a
              href={RULES_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-block font-mono text-sm text-accent hover:underline"
            >
              Vollständige Regeln auf cyberpunktcg.com ↗
            </a>
          </div>
        </div>
      )}
    </section>
  );
}
