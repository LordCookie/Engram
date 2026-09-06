/**
 * Kurze Erklärung „Was heißt Synergie?" (Nutzerwunsch). Wird in der Synergie-
 * Ansicht und im Deckeditor eingeblendet. Aufklappbar, damit es nicht stört.
 */
export function SynergyInfo() {
  return (
    <details className="rounded-md bg-bg/60 p-3 text-xs text-muted">
      <summary className="cursor-pointer select-none font-mono text-text">
        Was heißt hohe / niedrige Synergie?
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p>
          <b>Synergie</b> misst, wie gut zwei Karten zusammenspielen. Der Wert kommt aus
          zwei Quellen: der <b>Vorhersage</b> aus dem Kartentext und der <b>Empirie</b>
          {' '}aus echten Decks (im Solver umschaltbar).
        </p>
        <p>
          <b className="text-card-green">Hohe Synergie</b> heißt: die eine Karte liefert,
          was die andere belohnt — z. B. eine Karte treibt Gig-Werte hoch, die andere
          belohnt „8+ Wert"; gleiche Themen (Braindance, Value-Pairs, Go&nbsp;Solo …);
          oder passende Tags (eine Karte belohnt ARASAKA, die andere ist ARASAKA).
        </p>
        <p>
          <b className="text-card-red">Niedrige / keine Synergie</b> heißt nicht „schlechte
          Karte" — die beiden haben nur keine gemeinsamen Merkmale und arbeiten unabhängig.
        </p>
        <p>
          Die Zahl ist ein Signal, kein Urteil: <b>höher = stärker</b>. Seltene Merkmale
          zählen mehr als solche, die fast jede Karte hat.
        </p>
      </div>
    </details>
  );
}
