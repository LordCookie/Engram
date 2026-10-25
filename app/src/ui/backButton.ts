import { useEffect, useRef } from 'react';
import { Capacitor } from '@capacitor/core';

/**
 * Android-Zurück-Taste: schließt zuerst das oberste offene Vollbild-Fenster (Scanner,
 * QR-Scanner, Binder, Kartendetail, Spielhilfe …); ist keins offen, geht die App wie
 * gewohnt in den Hintergrund. Ohne eigenen Listener würde Android die App sofort beenden.
 *
 * Fenster melden sich per `useBackClose(offen, schließen)` an; die zuletzt geöffneten
 * liegen oben auf dem Stapel (z. B. Kartendetail im Binder → erst das Detail).
 */
type Entry = { close: () => void };
const stack: Entry[] = [];

/** Oberstes Fenster schließen. `true`, wenn eines offen war. */
export function closeTopOverlay(): boolean {
  const top = stack[stack.length - 1];
  if (!top) return false;
  top.close();
  return true;
}

export function useBackClose(open: boolean, onClose: () => void): void {
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const entry: Entry = { close: () => closeRef.current() };
    stack.push(entry);
    return () => {
      const i = stack.lastIndexOf(entry);
      if (i >= 0) stack.splice(i, 1);
    };
  }, [open]);
}

/** Einmal beim Start: Zurück-Taste der App abfangen (nur nativ, Plugin per dynamischem Import). */
export async function initBackButton(): Promise<void> {
  if (!Capacitor.isNativePlatform()) return;
  const { App } = await import('@capacitor/app');
  await App.addListener('backButton', () => {
    if (!closeTopOverlay()) void App.minimizeApp();
  });
}
