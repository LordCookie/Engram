/**
 * Linien-Icons für die Hauptnavigation (24×24, Strich in currentColor → folgen dem
 * Farbthema). Bewusst schlicht, gleiche Strichstärke wie das Logo-Raster.
 */
export type NavIconName = 'sammlung' | 'deck' | 'erfassen' | 'synergie' | 'mehr';

const PATHS: Record<NavIconName, string> = {
  // Kartenstapel
  sammlung: 'M7 4h10a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2Z M9 2h8a2 2 0 0 1 2 2',
  // aufgefächerte Karten
  deck: 'M8.5 5.2 15.3 3.4a1.6 1.6 0 0 1 2 1.1l3 11.2a1.6 1.6 0 0 1-1.1 2l-6.8 1.8a1.6 1.6 0 0 1-2-1.1L7.4 7.2a1.6 1.6 0 0 1 1.1-2Z M5.6 8.4 4 9a1.6 1.6 0 0 0-1 2l2.9 8.3a1.6 1.6 0 0 0 2 1l2.2-.8',
  // Scan-Rahmen mit Plus (Scannen + Erfassen)
  erfassen: 'M4 8V5a1 1 0 0 1 1-1h3 M16 4h3a1 1 0 0 1 1 1v3 M20 16v3a1 1 0 0 1-1 1h-3 M8 20H5a1 1 0 0 1-1-1v-3 M12 8.5v7 M8.5 12h7',
  // drei verbundene Knoten (Kreise r 2,2; Kanten enden mit Abstand am Kreisrand)
  synergie:
    'M8.2 7a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0Z M20.2 6a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0Z M14.2 18a2.2 2.2 0 1 1-4.4 0a2.2 2.2 0 1 1 4.4 0Z M7.4 9.6l3.2 5.8 M16.7 8.7l-3.4 6.6 M9 6.8l6-.5',
  // Regler
  mehr: 'M4 6h9 M17 6h3 M15 4v4 M4 12h3 M11 12h9 M9 10v4 M4 18h11 M19 18h1 M17 16v4',
};

export function NavIcon({ name, className = '' }: { name: NavIconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
