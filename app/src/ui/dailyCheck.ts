import { activeDataStamp } from '../data/dataStamp';
import { db } from '../db/db';
import { getLang } from '../i18n';
import { EngramNotifier, nativeNotifier } from '../native/engramNotifier';

/**
 * Täglicher Update-Blick (Muster aus ScryGlass): Einstellung unter Mehr → Updates & Daten
 * (Standard: an). Das Nachsehen selbst macht Android im Hintergrund gegen 12 Uhr
 * (EngramNotifier.kt); hier nur an/aus, die Erlaubnis für Benachrichtigungen und was der Job
 * zum Vergleichen braucht (Datenstand, Sprache der Texte).
 */

const KEY = 'dailyUpdateCheck';
const ASKED = 'notifyPermissionAsked';

export const dailyCheckAvailable = nativeNotifier;

export async function dailyCheckEnabled(): Promise<boolean> {
  const v = (await db.meta.get(KEY))?.value;
  return typeof v === 'boolean' ? v : true;
}

/** Stand an Android weitergeben (beim Start, nach neuen Daten, bei Sprachwechsel). */
export async function syncDailyCheck(): Promise<void> {
  if (!dailyCheckAvailable()) return;
  const [enabled, dataStamp] = await Promise.all([dailyCheckEnabled(), activeDataStamp()]);
  await EngramNotifier.configure({ enabled, lang: getLang(), ...(dataStamp ? { dataStamp } : {}) });
}

/** Beim Start: einmal nach der Erlaubnis fragen (Android 13+), dann planen. */
export async function initDailyCheck(): Promise<void> {
  if (!dailyCheckAvailable()) return;
  if ((await dailyCheckEnabled()) && !(await db.meta.get(ASKED))) {
    await db.meta.put({ key: ASKED, value: true });
    await EngramNotifier.requestPermission().catch(() => null);
  }
  await syncDailyCheck();
}

/** Schalter: an → Erlaubnis holen. Gibt zurück, ob Benachrichtigungen erlaubt sind. */
export async function setDailyCheck(on: boolean): Promise<boolean> {
  await db.meta.put({ key: KEY, value: on });
  let granted = true;
  if (on && dailyCheckAvailable()) {
    granted = (await EngramNotifier.requestPermission().catch(() => ({ granted: false }))).granted;
  }
  await syncDailyCheck();
  return granted;
}

/** Über die Benachrichtigung geöffnet (beim Start oder während die App lief)? */
export async function watchUpdateLaunch(open: () => void): Promise<() => void> {
  if (!dailyCheckAvailable()) return () => {};
  const r = await EngramNotifier.consumeLaunch().catch(() => ({ openUpdates: false }));
  if (r.openUpdates) open();
  const h = await EngramNotifier.addListener('openUpdates', open);
  return () => void h.remove();
}
