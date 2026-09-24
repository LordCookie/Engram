/**
 * Scanner v2: Fusion von OCR-, Bild- und Nummern-Signal (übernommen aus ScryGlass,
 * scanner-v2-plan.md). Framework-frei & rein testbar: entscheidet, welche Karte oben
 * steht, ob sie sicher genug für die Auto-Übernahme ist, und ob OCR und Bild sich
 * gegenseitig bestätigen (das stärkste Signal überhaupt).
 *
 * Prioritätsreihenfolge:
 *   0. druck  — Sammlernummer gelesen, bestätigt durch Name ODER Bild → sicher
 *   1. agree  — OCR-Bester == Bild-Bester (Bild im lockeren Confirm-Gate) → sicher
 *   2. bild   — Bildtreffer im Anzeige-Gate; sicher nur, wenn „stark"
 *   3. ocr    — OCR-Bester; sicher nur bei hohem Score und nicht mehrdeutig
 *   4. druck  — unbestätigte Nummer (Ziffern können falsch gelesen sein)
 *   5. none   — nichts Brauchbares
 */

export interface OcrSignal {
  cardId?: string;
  score: number; // 0..1
  ambiguous: boolean;
}

export interface HashSignal {
  cardId: string;
  distance: number; // 0..256 (klein = besser)
  margin: number; // Abstand zur nächsten FREMDEN Karte (groß = eindeutig)
}

export interface FuseConfig {
  hashMaxDist: number; // Bild als Kandidat zeigen
  hashMinMargin: number;
  hashAutoDist: number; // Bild allein stark genug für Auto-Übernahme
  hashAutoMargin: number;
  hashConfirmDist: number; // lockereres Gate, wenn OCR dieselbe Karte bestätigt
  hashConfirmMargin: number;
  ocrConfident: number; // OCR allein sicher (z. B. 0.85)
  ocrConfirm: number; // OCR zählt als Bestätigung (z. B. 0.6)
}

/** Karte, deren Sammlernummer im Bild gelesen wurde (nur pro Farbe eindeutig → an Name gekoppelt). */
export interface PrintSignal {
  cardId: string;
}

export type FuseMethod = 'druck' | 'bild+ocr' | 'bild' | 'ocr' | 'none';

export interface FuseResult {
  method: FuseMethod;
  cardId?: string;
  /** OCR und Bild zeigen dieselbe Karte. */
  agree: boolean;
  /** Reif für Auto-Übernahme (vor dem zeitlichen Konsens). */
  confident: boolean;
  /** Nur den Bildtreffer anzeigen (OCR-Rauschen unterdrücken). */
  showAlone: boolean;
  /** 0..1 Anzeige-Confidence. */
  score: number;
}

/**
 * Startwerte für engram (plan § 3.5), am echten Index gemessen (550 Printings):
 * fremde Karten liegen untereinander bei min 68 / 5 % 74 / Median 86 Bit — etwas
 * enger als bei MTG (~72). Echte Kamera-Treffer lagen in ScryGlass bei 26–52. Darum
 * zwischen ScryGlass-Voll- und -Set-Modus angesetzt; per Scan-Protokoll am Handy
 * nachziehen.
 */
export const FUSE_DEFAULTS: FuseConfig = {
  hashMaxDist: 64,
  hashMinMargin: 10,
  hashAutoDist: 58,
  hashAutoMargin: 16,
  hashConfirmDist: 70,
  hashConfirmMargin: 4,
  ocrConfident: 0.85,
  ocrConfirm: 0.6,
};

function imageScore(distance: number): number {
  return Math.max(0.5, 1 - distance / 128);
}

export function fuseScan(
  ocr: OcrSignal,
  hash: HashSignal | null,
  cfg: FuseConfig = FUSE_DEFAULTS,
  print: PrintSignal | null = null,
): FuseResult {
  // Nummer + Bestätigung: die Nummer ist präzise, aber einzelne Ziffern können falsch
  // gelesen sein — deshalb nur mit Name ODER Bild zusammen „sicher". Eine nur durch den
  // Namen bestätigte Nummer schlägt aber keinen STARKEN Bildtreffer auf eine andere Karte
  // (Name und Nummer stammen aus derselben, womöglich verrauschten Lesung).
  if (print) {
    const strongOtherImage =
      !!hash &&
      hash.cardId !== print.cardId &&
      hash.distance <= cfg.hashAutoDist &&
      hash.margin >= cfg.hashAutoMargin;
    const byName = ocr.cardId === print.cardId && ocr.score >= cfg.ocrConfirm && !strongOtherImage;
    const byImage = !!hash && hash.cardId === print.cardId && hash.distance <= cfg.hashConfirmDist;
    if (byName || byImage) {
      return { method: 'druck', cardId: print.cardId, agree: true, confident: true, showAlone: false, score: 0.99 };
    }
  }

  const hashShown =
    hash && hash.distance <= cfg.hashMaxDist && hash.margin >= cfg.hashMinMargin ? hash : null;
  const hashStrong =
    !!hashShown && hashShown.distance <= cfg.hashAutoDist && hashShown.margin >= cfg.hashAutoMargin;

  // Kreuz-Bestätigung: dieselbe Karte aus OCR UND Bild — das Bild darf hier lockerer
  // sein, weil OCR unabhängig dieselbe Karte liefert (Doppel-Fehler auf dieselbe Karte
  // ist praktisch ausgeschlossen).
  const agree =
    !!hash &&
    !!ocr.cardId &&
    hash.cardId === ocr.cardId &&
    hash.distance <= cfg.hashConfirmDist &&
    hash.margin >= cfg.hashConfirmMargin &&
    ocr.score >= cfg.ocrConfirm;

  if (agree) {
    return { method: 'bild+ocr', cardId: hash!.cardId, agree: true, confident: true, showAlone: false, score: 0.99 };
  }
  if (hashShown) {
    return {
      method: 'bild',
      cardId: hashShown.cardId,
      agree: false,
      confident: hashStrong,
      showAlone: hashStrong,
      score: imageScore(hashShown.distance),
    };
  }
  if (ocr.cardId) {
    const ocrConfident = ocr.score >= cfg.ocrConfident && !ocr.ambiguous;
    return { method: 'ocr', cardId: ocr.cardId, agree: false, confident: ocrConfident, showAlone: false, score: ocr.score };
  }
  if (print) {
    return { method: 'druck', cardId: print.cardId, agree: false, confident: false, showAlone: false, score: 0.7 };
  }
  return { method: 'none', agree: false, confident: false, showAlone: false, score: 0 };
}

/** Anzeige-Label der Methode (Scanner-UI). */
export function methodLabel(m: FuseMethod): string {
  switch (m) {
    case 'druck':
      return 'Nummer';
    case 'bild+ocr':
      return 'Bild + Name';
    case 'bild':
      return 'Bild';
    case 'ocr':
      return 'Name';
    default:
      return '—';
  }
}
