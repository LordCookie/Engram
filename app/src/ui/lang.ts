import { useSyncExternalStore } from 'react';
import { getLanguagePref, setLanguagePref } from '../db/db';
import { detectLang, getLang, isLang, onLangChange, setLang, type Lang } from '../i18n';

/**
 * Sprache beim Start: gespeicherte Wahl (Dexie `meta`), sonst die Gerätesprache.
 * Läuft vor dem ersten Rendern (`main.tsx`), damit nichts erst deutsch aufblitzt.
 */
export async function initLang(): Promise<void> {
  let lang: Lang = detectLang(typeof navigator === 'undefined' ? undefined : navigator.language);
  try {
    const stored = await getLanguagePref();
    if (isLang(stored)) lang = stored;
  } catch {
    // Dexie nicht verfügbar → Gerätesprache
  }
  try {
    await setLang(lang);
  } catch {
    // Wörterbuch-Chunk nicht ladbar → bleibt Deutsch
  }
  document.documentElement.lang = getLang();
}

/** Umschalten + merken. */
export async function changeLang(lang: Lang): Promise<void> {
  await setLang(lang);
  document.documentElement.lang = lang;
  await setLanguagePref(lang);
}

/** Aktuelle Sprache als React-Zustand (rendert bei Wechsel neu). */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang);
}
