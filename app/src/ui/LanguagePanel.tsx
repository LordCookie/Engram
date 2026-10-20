import { LANGS, t, type Lang } from '../i18n';
import { changeLang, useLang } from './lang';

const NAMES: Record<Lang, string> = { de: 'Deutsch', en: 'English' };

/** Sprache der Oberfläche (unter „Mehr"). Ohne Wahl gilt die Gerätesprache. */
export function LanguagePanel() {
  const lang = useLang();
  return (
    <section className="rounded-lg bg-surface p-4">
      {/* Zweisprachig, damit man den Schalter in jeder Sprache findet. */}
      <h2 className="mb-1 font-mono text-lg">{lang === 'de' ? 'Sprache · Language' : 'Language · Sprache'}</h2>
      <p className="mb-3 text-xs text-muted">
        {t('Sprache der Oberfläche. Kartennamen und Regeltexte bleiben englisch (offizieller Druck).')}
      </p>
      <div className="flex gap-2">
        {LANGS.map((l) => (
          <button
            key={l}
            onClick={() => void changeLang(l)}
            aria-pressed={lang === l}
            className={`rounded-md border px-4 py-2 font-mono text-sm ${
              lang === l ? 'border-accent text-text' : 'border-white/10 text-muted hover:border-accent'
            }`}
          >
            {NAMES[l]}
            {lang === l && <span className="ml-2 text-accent">✓</span>}
          </button>
        ))}
      </div>
    </section>
  );
}
