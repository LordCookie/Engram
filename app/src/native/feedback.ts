import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { getVibrationPref, setVibrationPref } from '../db/db';

/**
 * Spürbare Rückmeldung beim Scannen (Muster aus ScryGlass). In der App über Capacitor
 * Haptics — `navigator.vibrate` verpufft in der Android-WebView ohne VIBRATE-
 * Berechtigung, darum vibrierte es dort bisher nie. Im Browser `navigator.vibrate`.
 * Abschaltbar unter „Mehr" (Dexie `meta`, Default an). Alles best effort: Feedback darf
 * den Scanner nie stören.
 */

const native = Capacitor.isNativePlatform();
let vibrationOn = true;
let loaded: Promise<void> | null = null;
let userChanged = false;

/** Gespeicherte Einstellung laden — nur einmal; eine schnellere Nutzerwahl gewinnt. */
export function initFeedbackPrefs(): Promise<void> {
  loaded ??= getVibrationPref()
    .then((on) => {
      if (!userChanged) vibrationOn = on;
    })
    .catch(() => {});
  return loaded;
}

export function getVibration(): boolean {
  return vibrationOn;
}

/** Vibration an/aus schalten und merken. */
export function setVibration(on: boolean): void {
  userChanged = true;
  vibrationOn = on;
  void setVibrationPref(on);
}

function vibrate(style: ImpactStyle, ms: number): void {
  if (!vibrationOn) return;
  try {
    if (native) void Haptics.impact({ style }).catch(() => {});
    else navigator.vibrate?.(ms);
  } catch {
    /* kein Vibrationsmotor — egal */
  }
}

/** Leichtes Antippen-Feedback für Knöpfe im Scanner. */
export function hapticTap(): void {
  vibrate(ImpactStyle.Light, 10);
}

/** Karte ist im Korb: spürbare Vibration. */
export function feedbackAdded(): void {
  vibrate(ImpactStyle.Medium, 30);
}
