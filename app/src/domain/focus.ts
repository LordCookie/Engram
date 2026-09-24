/**
 * Fokus-/Schärfe-Helfer für den Scanner v2 (übernommen aus ScryGlass). Framework-frei
 * & rein testbar. Die Kamera-API liefert kein „Fokus sitzt"-Signal, daher messen wir
 * die Schärfe selbst — dieselbe Formel rechnet das native Plugin (EngramCameraPlugin).
 */

/**
 * Schärfemaß: Varianz des 3×3-Laplace-Filters über ein Graustufenbild (Standard-
 * Blur-Metrik). Höher = schärfer. Ränder werden übersprungen; < 3px → 0.
 */
export function laplacianVariance(gray: ArrayLike<number>, w: number, h: number): number {
  if (w < 3 || h < 3) return 0;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const lap = 4 * gray[i] - gray[i - 1] - gray[i + 1] - gray[i - w] - gray[i + w];
      sum += lap;
      sumSq += lap * lap;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Tipp-Position → normierter Punkt (0..1, geclamped) relativ zum Rechteck. Bei 0-Größe → Mitte. */
export function normalizedPoint(clientX: number, clientY: number, rect: Rect): { x: number; y: number } {
  const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
  return {
    x: rect.width > 0 ? clamp((clientX - rect.left) / rect.width) : 0.5,
    y: rect.height > 0 ? clamp((clientY - rect.top) / rect.height) : 0.5,
  };
}
