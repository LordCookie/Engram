/**
 * OCR-Qualität für den Scanner v2 (übernommen aus ScryGlass). Framework-frei & rein
 * testbar. Die Sicherheit der Namenslesung (ML Kit bzw. Tesseract, 0..100) fließt in
 * die Fusion: Bei unsicherer Lesung darf OCR allein keine Karte mehr automatisch
 * übernehmen — ein Bild bestätigen (Kreuz-Bestätigung) aber schon.
 */

export interface OcrRead {
  text: string;
  /** Lese-Sicherheit 0..100. */
  confidence: number;
}

/** Unter dieser Sicherheit gilt eine Lesung als unsicher (per Protokoll tunen). */
export const OCR_CONF_MIN = 55;
/** Deckel für den Match-Score unsicherer Lesungen: unter `ocrConfident` (0.85), über `ocrConfirm` (0.6). */
export const OCR_LOW_CONF_CAP = 0.8;

/** Beste Lesung = höchste Sicherheit; leere Lesungen zählen nicht. */
export function pickBestRead(reads: readonly OcrRead[]): OcrRead {
  let best: OcrRead = { text: '', confidence: 0 };
  for (const r of reads) {
    if (!r.text.trim()) continue;
    if (!best.text || r.confidence > best.confidence) best = r;
  }
  return best;
}

/** Effektiver OCR-Score für die Fusion (unsichere Lesung → gedeckelt, nie angehoben). */
export function ocrEffectiveScore(
  matchScore: number,
  confidence: number,
  confMin = OCR_CONF_MIN,
  cap = OCR_LOW_CONF_CAP,
): number {
  return confidence >= confMin ? matchScore : Math.min(matchScore, cap);
}
