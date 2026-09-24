/**
 * Auto-Korb mit Kartenwechsel-Erkennung (Stapel-Scan: Karte für Karte hinlegen).
 * Übernommen aus ScryGlass (scanner-v2-plan.md). Framework-frei & rein testbar.
 *
 * Regel:
 *   • Eine ANDERE Karte als die zuletzt übernommene darf sofort übernommen werden
 *     (Stabilität prüft der Konsens im Scanner).
 *   • DIESELBE Karte nochmal nur nach einem echten Wechsel: ein paar Bilder lang
 *     unscharf (Hand in Bewegung) oder gar keine Karte erkannt — so sieht das
 *     Hinlegen der nächsten Kopie aus. Ein einzelnes unscharfes Bild (Fokus-
 *     Nachstellen) reicht bewusst nicht, sonst käme dieselbe Karte doppelt.
 */

export interface AutoBasketState {
  /** zuletzt automatisch übernommene Karte (Korb-Schlüssel) */
  lastKey?: string;
  /** Zähler aufeinanderfolgender „Wechsel"-Bilder seit der letzten Übernahme */
  changeFrames: number;
  /** Wechsel erkannt → dieselbe Karte darf wieder */
  changed: boolean;
}

/**
 * Wie viele Wechsel-Bilder am Stück. Nativ (~4 Bilder/s) → ~0,75 s Hand/Leere.
 * Der Web-Pfad liest nur bei Bildwechsel und viel langsamer → dort genügt 1.
 */
export const AUTO_BASKET_CHANGE_FRAMES = 3;

export const AUTO_BASKET_START: AutoBasketState = { changeFrames: 0, changed: true };

export interface FrameObservation {
  blurry: boolean;
  /** irgendeine Karte plausibel erkannt */
  hasCard: boolean;
}

/** Ein ausgewertetes Bild verbuchen. */
export function observeFrame(
  s: AutoBasketState,
  f: FrameObservation,
  need = AUTO_BASKET_CHANGE_FRAMES,
): AutoBasketState {
  if (s.changed) return s;
  const n = f.blurry || !f.hasCard ? s.changeFrames + 1 : 0;
  return { ...s, changeFrames: n, changed: n >= need };
}

/** Darf diese Karte jetzt automatisch in den Korb? */
export function mayAutoAdd(s: AutoBasketState, key: string): boolean {
  return key !== s.lastKey || s.changed;
}

/** Zustand direkt nach einer (automatischen oder manuellen) Übernahme. */
export function afterAutoAdd(key: string): AutoBasketState {
  return { lastKey: key, changeFrames: 0, changed: false };
}
