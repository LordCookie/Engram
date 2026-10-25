import { describe, it, expect, afterEach } from 'vitest';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { EN } from './en';
import { collectKeys, placeholders } from './keys';
import { detectLang, setLangSync, t, tn } from './index';

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..');
const keys = collectKeys(SRC);

describe('Englisches Wörterbuch', () => {
  it('übersetzt jeden markierten Text', () => {
    const missing = [...keys.keys()].filter((k) => !(k in EN));
    expect(missing, `fehlende Übersetzungen:\n${missing.join('\n')}`).toEqual([]);
  });

  it('enthält keine verwaisten Einträge', () => {
    const unused = Object.keys(EN).filter((k) => !keys.has(k));
    expect(unused, `unbenutzt:\n${unused.join('\n')}`).toEqual([]);
  });

  it('behält alle Platzhalter und **Hervorhebungen**', () => {
    for (const [de, en] of Object.entries(EN)) {
      expect(placeholders(en), de).toEqual(placeholders(de));
      expect(en.split('**').length, de).toBe(de.split('**').length);
    }
  });
});

describe('t / tn / detectLang', () => {
  afterEach(() => setLangSync('de'));

  it('Deutsch ist Standard, Englisch kommt aus dem Wörterbuch', () => {
    expect(t('Sammlung')).toBe('Sammlung');
    setLangSync('en', EN);
    expect(t('Sammlung')).toBe('Collection');
    expect(t('gibt es nicht')).toBe('gibt es nicht'); // Rückfall auf Deutsch
  });

  it('ersetzt Platzhalter und wählt Singular/Plural', () => {
    setLangSync('en', EN);
    expect(t('{n} Karten', { n: 3 })).toBe('3 cards');
    expect(tn(1, '{n} Karte in die Sammlung übernommen', '{n} Karten in die Sammlung übernommen')).toBe(
      '1 card added to the collection',
    );
  });

  it('Gerätesprache: nur de* wird Deutsch', () => {
    expect(detectLang('de-DE')).toBe('de');
    expect(detectLang('de')).toBe('de');
    expect(detectLang('en-US')).toBe('en');
    expect(detectLang('fr-FR')).toBe('en');
    expect(detectLang(undefined)).toBe('en');
  });
});
