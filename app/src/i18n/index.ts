/**
 * Oberflächensprache (Deutsch/Englisch), framework-frei — auch die Domäne nutzt es
 * (Validator-Meldungen, Erfolge, Synergie-Begründungen).
 *
 * Schlüssel ist der DEUTSCHE Text selbst (gettext-Stil): `t('Scanner starten')`.
 * Englisch kommt aus `en.ts` (erst bei Bedarf geladen, eigener Chunk); fehlt ein
 * Eintrag, bleibt der deutsche Text stehen. Platzhalter `{name}` werden ersetzt:
 * `t('{n} Karten', { n: 3 })`. `tk('…')` markiert Texte, die erst später (zur
 * Renderzeit) übersetzt werden — etwa Beschriftungen in Konstanten auf Modulebene.
 * Ein Test (`en.test.ts`) prüft, dass jeder markierte Text übersetzt ist.
 *
 * Standard ist Deutsch (auch in den Tests); `ui/lang.ts` setzt beim Start die
 * gespeicherte Wahl bzw. die Gerätesprache.
 */

export type Lang = 'de' | 'en';
export const LANGS: Lang[] = ['de', 'en'];

export type Vars = Record<string, string | number>;

let current: Lang = 'de';
let dict: Record<string, string> | null = null;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return current;
}

export function isLang(v: unknown): v is Lang {
  return v === 'de' || v === 'en';
}

/** Gerätesprache → Oberflächensprache (Deutsch nur bei `de*`, sonst Englisch). */
export function detectLang(navLang: string | undefined): Lang {
  return navLang?.toLowerCase().startsWith('de') ? 'de' : 'en';
}

/** Sprache umschalten; Englisch lädt sein Wörterbuch nach (eigener Chunk). */
export async function setLang(lang: Lang): Promise<void> {
  if (lang === 'en' && !dict) dict = (await import('./en')).EN;
  if (lang === current) return;
  current = lang;
  listeners.forEach((f) => f());
}

/** Direkt setzen (Tests / bereits geladenes Wörterbuch). */
export function setLangSync(lang: Lang, en?: Record<string, string>): void {
  if (en) dict = en;
  current = lang;
  listeners.forEach((f) => f());
}

export function onLangChange(f: () => void): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

function fill(s: string, vars?: Vars): string {
  if (!vars) return s;
  return s.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
}

/** Übersetzen (deutscher Text = Schlüssel). */
export function t(de: string, vars?: Vars): string {
  const s = current === 'en' && dict ? (dict[de] ?? de) : de;
  return fill(s, vars);
}

/** Nur Markierung für die Übersetzungsprüfung; übersetzt wird später mit `t(x)`. */
export function tk<T extends string>(de: T): T {
  return de;
}

/** Singular/Plural: `tn(n, '{n} Karte', '{n} Karten')`. */
export function tn(n: number, one: string, many: string, vars?: Vars): string {
  return t(n === 1 ? one : many, { n, ...vars });
}

/** Zahlen im Stil der Oberflächensprache (1.234 / 1,234). */
export function fmtNum(n: number, digits = 0): string {
  return n.toLocaleString(current === 'de' ? 'de-DE' : 'en-US', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}
