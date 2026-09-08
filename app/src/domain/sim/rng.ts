/**
 * Deterministischer RNG + Mischen für die Kampf-Sim (engine2). Framework-frei und
 * rein: der einzige Zufall steckt im Mischen bei Spielbeginn (Seed), danach sind
 * die Züge deterministisch → reproduzierbar und testbar.
 */

export interface SimDeck {
  name: string;
  /** 40 Deckkarten-Slugs (ohne Legends); Legends sind im Modell nur „Eddie-Quelle". */
  cardIds: string[];
}

export function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
