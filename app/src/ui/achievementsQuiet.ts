/**
 * Stille Phase für Erfolgs-Einblendungen: nach einem Wiederherstellen tauchen auf
 * einen Schlag viele „freigeschaltete" Erfolge auf — die sind nicht neu. Für ein paar
 * Sekunden werden sie still als gemeldet übernommen statt eingeblendet.
 */
let quietUntil = 0;

export function quietAchievements(ms = 3000): void {
  quietUntil = Date.now() + ms;
}

export function achievementsQuiet(): boolean {
  return Date.now() < quietUntil;
}
