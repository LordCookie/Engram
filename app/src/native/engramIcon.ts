import { Capacitor, registerPlugin } from '@capacitor/core';
import type { ThemeName } from '../ui/theme';

/**
 * Brücke zum nativen Plugin `EngramIcon` (android/…/EngramIconPlugin.kt): App-Icon je
 * Farbthema über Launcher-Aliase. Das Umschalten greift, wenn die App in den Hintergrund
 * geht. Im Browser (und in alten APKs) nicht vorhanden.
 */
interface EngramIconPlugin {
  get(): Promise<{ icon: ThemeName; pending: boolean }>;
  set(options: { icon: ThemeName }): Promise<{ pending: boolean }>;
}

const EngramIcon = registerPlugin<EngramIconPlugin>('EngramIcon');

/** App-Icon-Wechsel möglich? (nur in der Android-App mit registriertem Plugin) */
export function hasIconSwitch(): boolean {
  return Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('EngramIcon');
}

/** Icon vormerken (best effort); `true` = wird beim Verlassen der App gewechselt. */
export async function setAppIcon(icon: ThemeName): Promise<boolean> {
  if (!hasIconSwitch()) return false;
  try {
    return (await EngramIcon.set({ icon })).pending;
  } catch {
    return false;
  }
}
