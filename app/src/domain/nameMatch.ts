/**
 * Unscharfer Namensabgleich für den Scanner (PLAN.md § 6, OCR-Ansatz).
 * Framework-frei, rein testbar.
 *
 * Der Scanner liest per OCR Text aus dem Kartenfoto (v. a. den NAMEN) und gleicht
 * ihn hier gegen die bekannten Kartennamen ab. Text ist robust gegen Licht,
 * Perspektive und Kamera-Eigenheiten — anders als ein Bild-Hash. OCR macht Fehler,
 * darum: Fuzzy-Substring-Distanz (findet den Namen IRGENDWO im OCR-Text und
 * verzeiht ein paar falsche Zeichen).
 */

/** Auf Vergleichsform bringen: Großbuchstaben, nur A–Z/0–9. */
export function normalizeName(s: string): string {
  return s.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/** Häufige OCR-Verwechsler Ziffer↔Buchstabe auf eine gemeinsame Form falten. */
const OCR_FOLD: Record<string, string> = { '0': 'O', '1': 'I', '5': 'S', '8': 'B' };
/**
 * Verwechsler falten (z. B. „R0GUE" → „ROGUE"). Wird BEIDSEITIG angewandt
 * (Kartenname + OCR-Text), damit die Faltung konsistent ist. Nur für den
 * NAMENS-Vergleich — die Sammlernummer wird aus dem ROH-Text gelesen und bleibt
 * unberührt, sonst würden echte Ziffern zu Buchstaben.
 */
export function foldOcr(norm: string): string {
  let out = '';
  for (const ch of norm) out += OCR_FOLD[ch] ?? ch;
  return out;
}

/**
 * Kleinste Editierdistanz, um `pattern` als Teilstring in `text` zu finden
 * (Auslassungen am Anfang/Ende von `text` sind gratis). Klassische „fuzzy search".
 */
export function fuzzySubstringDistance(pattern: string, text: string): number {
  const m = pattern.length;
  const n = text.length;
  if (m === 0) return 0;
  if (n === 0) return m;
  let prev = new Array<number>(n + 1).fill(0); // leeres Pattern-Präfix: überall Kosten 0
  for (let i = 1; i <= m; i++) {
    const cur = new Array<number>(n + 1);
    cur[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = pattern[i - 1] === text[j - 1] ? 0 : 1;
      cur[j] = Math.min(prev[j - 1] + cost, prev[j] + 1, cur[j - 1] + 1);
    }
    prev = cur;
  }
  let best = prev[0];
  for (let j = 1; j <= n; j++) if (prev[j] < best) best = prev[j];
  return best;
}

export interface NameCard {
  id: string;
  name: string;
  subtitle?: string;
  /** Sammlernummer (z. B. „081", „005a") — Entscheider bei gleichen/ähnlichen Namen. */
  collectorNumber?: string;
}

export interface NameCandidate {
  cardId: string;
  /** 0..1 — Konfidenz: Namens-Trefferanteil (+ Bonus, wenn die Nummer passt). */
  score: number;
  /** Zahl korrekt gematchter Namenszeichen (für die Rangfolge bei Gleichstand). */
  matched: number;
  /** Die Sammlernummer der Karte wurde im OCR-Text exakt gefunden. */
  numberHit: boolean;
}

/**
 * Volle Zahl-Token (≥ 3 Zeichen) aus dem OCR-Text — Sammlernummern sind 3-stellig
 * („081", „005a"). Kurze Zahlen wie Cost („07") oder Würfel („d12" → „12") werden
 * bewusst ignoriert, damit sie keine Nummer vortäuschen.
 */
function ocrNumberTokens(ocrText: string): Set<string> {
  const set = new Set<string>();
  for (const m of ocrText.toUpperCase().matchAll(/[0-9]{2,}[A-Z]?/g)) {
    if (m[0].length >= 3) set.add(m[0]);
  }
  return set;
}

/** Steht die Sammlernummer (mit oder ohne Buchstaben-Suffix) im OCR-Text? */
function collectorHit(collectorNumber: string | undefined, tokens: Set<string>): boolean {
  if (!collectorNumber) return false;
  const norm = collectorNumber.toUpperCase().replace(/[^0-9A-Z]/g, '');
  const digits = norm.replace(/[^0-9]/g, '');
  return (norm.length >= 3 && tokens.has(norm)) || (digits.length >= 3 && tokens.has(digits));
}

/**
 * Ab so vielen korrekt erkannten Zeichen zählt ein Treffer voll. Verhindert, dass
 * sehr kurze Namen (z. B. „V") trivial 100 % erreichen, weil ihr eines Zeichen
 * zufällig irgendwo im OCR-Text steht (das „V" in „HEAVY").
 */
const FULL_CONFIDENCE_CHARS = 6;

/** Längengewichtete Konfidenz + matched des besten Vorkommens von `pattern`. */
function fit(pattern: string, ocrNorm: string): { score: number; matched: number } {
  if (!pattern) return { score: 0, matched: 0 };
  const dist = fuzzySubstringDistance(pattern, ocrNorm);
  const matched = Math.max(0, pattern.length - dist);
  const ratio = matched / pattern.length;
  const lengthWeight = Math.min(1, matched / FULL_CONFIDENCE_CHARS);
  return { score: ratio * lengthWeight, matched };
}

/**
 * Beste Namens-Kandidaten für einen OCR-Text. Vergleicht gegen den Namen und
 * (falls vorhanden) Name+Untertitel; je Karte zählt der beste Treffer. Rangfolge:
 * höhere Konfidenz, bei Gleichstand mehr korrekt erkannter Text — so gewinnt bei
 * gleichem Namen die Karte, deren Untertitel ebenfalls im Bild steht.
 */
export function matchCardName(
  ocrText: string,
  cards: readonly NameCard[],
  topN = 5,
): NameCandidate[] {
  const ocrNorm = normalizeName(ocrText);
  if (!ocrNorm) return [];
  const ocrFold = foldOcr(ocrNorm); // Verwechsler-tolerant vergleichen
  const numberTokens = ocrNumberTokens(ocrText); // Nummer bleibt auf dem ROH-Text
  const out: NameCandidate[] = [];
  for (const c of cards) {
    const patterns = [normalizeName(c.name)];
    if (c.subtitle) patterns.push(normalizeName(c.name + c.subtitle));
    let best = { score: 0, matched: 0 };
    for (const p of patterns) {
      const f = fit(foldOcr(p), ocrFold);
      if (f.score > best.score || (f.score === best.score && f.matched > best.matched)) best = f;
    }
    // Die Sammlernummer ist nur PRO FARBE eindeutig (z. B. „012" tragen mehrere
    // Karten verschiedener Farben). Der Nummer-Bonus zählt daher nur, wenn der Name
    // zumindest plausibel mitmatcht — sonst würde eine gleiche Nummer eine völlig
    // andere Karte hochziehen. Bei Gleichstand entscheidet die Namens-Trefferlänge
    // (schützt gegen eine verlesene letzte Ziffer bei 080/081/082).
    const numberHit = collectorHit(c.collectorNumber, numberTokens) && best.score >= 0.1;
    const score = Math.min(1, best.score + (numberHit ? 0.5 : 0));
    if (score > 0) out.push({ cardId: c.id, score, matched: best.matched, numberHit });
  }
  out.sort(
    (a, b) =>
      b.score - a.score ||
      b.matched - a.matched ||
      Number(b.numberHit) - Number(a.numberHit) ||
      (a.cardId < b.cardId ? -1 : 1),
  );
  return out.slice(0, topN);
}
