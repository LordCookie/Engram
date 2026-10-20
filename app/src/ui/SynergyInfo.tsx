import { t } from '../i18n';
import { Rich } from './Rich';

/**
 * Kurze Erklärung „Was heißt Synergie?" (Nutzerwunsch). Wird in der Synergie-
 * Ansicht und im Deckeditor eingeblendet. Aufklappbar, damit es nicht stört.
 */
export function SynergyInfo() {
  return (
    <details className="rounded-md bg-bg/60 p-3 text-xs text-muted">
      <summary className="cursor-pointer select-none font-mono text-text">
        {t('Was heißt hohe / niedrige Synergie?')}
      </summary>
      <div className="mt-2 space-y-2 leading-relaxed">
        <p>
          <Rich
            text={t(
              '**Synergie** misst, wie gut zwei Karten zusammenspielen. Der Wert kommt aus zwei Quellen: der **Vorhersage** aus dem Kartentext und der **Empirie** aus echten Decks (im Solver umschaltbar).',
            )}
          />
        </p>
        <p>
          <b className="text-card-green">{t('Hohe Synergie')}</b>{' '}
          {t(
            'heißt: die eine Karte liefert, was die andere belohnt — z. B. eine Karte treibt Gig-Werte hoch, die andere belohnt „8+ Wert"; gleiche Themen (Braindance, Value-Pairs, Go Solo …); oder passende Tags (eine Karte belohnt ARASAKA, die andere ist ARASAKA).',
          )}
        </p>
        <p>
          <b className="text-card-red">{t('Niedrige / keine Synergie')}</b>{' '}
          {t('heißt nicht „schlechte Karte" — die beiden haben nur keine gemeinsamen Merkmale und arbeiten unabhängig.')}
        </p>
        <p>
          <Rich
            text={t('Die Zahl ist ein Signal, kein Urteil: **höher = stärker**. Seltene Merkmale zählen mehr als solche, die fast jede Karte hat.')}
          />
        </p>
      </div>
    </details>
  );
}
