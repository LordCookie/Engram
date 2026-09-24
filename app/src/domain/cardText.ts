/**
 * Kartentext aus der nativen Texterkennung (ML Kit) auswerten — Cyberpunk-Layout
 * (scanner-v2-plan.md § 3.2). Framework-frei & rein testbar.
 *
 * Jede Zeile hat eine Position relativ zur Karte (0..1). Anders als bei MTG (Titel
 * immer oben) steht der Name bei Cyberpunk an zwei Stellen:
 *   • Legends: oben mittig, Untertitel in der Zeile darunter („V" / „STREETKID"),
 *   • Units/Gear/Programme: im unteren Bilddrittel über der Typzeile („DELAMAIN CAB").
 * Wir gleichen darum jede Zeile in diesen Zonen einzeln UND paarweise (Name +
 * Untertitel) gegen die Kartennamen ab, dazu den Volltext als Sicherheitsnetz (er
 * trägt auch die Sammlernummer, falls sie gelesen wurde).
 */
import { matchCardName, type NameCandidate, type NameCard } from './nameMatch';

export interface TextLine {
  text: string;
  /** Position relativ zur Karte, 0..1 (links, oben, rechts, unten). */
  l: number;
  t: number;
  r: number;
  b: number;
  /** Erkennungs-Sicherheit 0..1, falls vorhanden. */
  conf?: number;
}

/** Namenszonen als Anteil der Kartenhöhe [von, bis] (Zeilenmitte muss drin liegen). */
export const NAME_ZONES: readonly (readonly [number, number])[] = [
  [0.03, 0.26], // oben: Legends (Name + Untertitel)
  [0.4, 0.8], // unteres Bilddrittel: Units/Gear/Programme
];
/** Zwei Zeilen gelten als Name + Untertitel, wenn sie so dicht untereinander liegen. */
const PAIR_GAP = 0.06;
/** Score-Abstand, unter dem zwei Kandidaten als „mehrdeutig" gelten. */
const AMBIGUOUS_GAP = 0.05;

const LETTER = /[A-Za-z]/;

function inNameZone(l: TextLine): boolean {
  const mid = (l.t + l.b) / 2;
  return NAME_ZONES.some(([a, b]) => mid >= a && mid <= b);
}

function confOf(l: TextLine): number {
  return typeof l.conf === 'number' && l.conf > 0 ? l.conf : 1;
}

/** Zeilen von oben nach unten, links nach rechts; nur Zeilen mit Buchstaben. */
function readingOrder(lines: readonly TextLine[]): TextLine[] {
  return lines.filter((l) => LETTER.test(l.text)).sort((a, b) => a.t - b.t || a.l - b.l);
}

export interface Segment {
  text: string;
  /** schwächste Zeilen-Sicherheit im Segment (0..1) */
  conf: number;
}

/** Namens-Segmente: jede Zeile in einer Namenszone + je zwei dicht untereinander. */
export function nameSegments(lines: readonly TextLine[]): Segment[] {
  const zone = readingOrder(lines).filter(inNameZone);
  const out: Segment[] = zone.map((l) => ({ text: l.text, conf: confOf(l) }));
  for (let i = 0; i + 1 < zone.length; i++) {
    const a = zone[i];
    const b = zone[i + 1];
    if (b.t - a.b <= PAIR_GAP) {
      out.push({ text: `${a.text} ${b.text}`, conf: Math.min(confOf(a), confOf(b)) });
    }
  }
  return out;
}

/**
 * Mehrdeutig: der Zweite liegt praktisch gleichauf UND hat nicht klar weniger Text
 * getroffen (bei gleichem Namen entscheidet der mitgelesene Untertitel). Eine
 * gelesene Sammlernummer löst die Mehrdeutigkeit auf.
 */
export function isAmbiguous(cands: readonly NameCandidate[]): boolean {
  const [a, b] = cands;
  if (!a || !b || a.numberHit) return false;
  return a.score - b.score < AMBIGUOUS_GAP && b.matched >= a.matched - 3;
}

export interface LineMatch {
  candidates: NameCandidate[];
  ambiguous: boolean;
  /** Sicherheit der Lesung, aus der der beste Kandidat stammt (0..100). */
  confidence: number;
  /** Text der Namenszonen (Anzeige/Protokoll). */
  titleText: string;
  /** Alle Zeilen (Anzeige/Protokoll). */
  fullText: string;
}

/** Beste Namens-Kandidaten aus ML-Kit-Zeilen (Cyberpunk-Layout). */
export function matchTextLines(lines: readonly TextLine[], cards: readonly NameCard[], topN = 5): LineMatch {
  const ordered = readingOrder(lines);
  const fullText = ordered.map((l) => l.text).join(' ').replace(/\s+/g, ' ').trim();
  const titleText = ordered
    .filter(inNameZone)
    .map((l) => l.text)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();

  // Je Karte der beste Treffer über alle Segmente (+ Volltext).
  const best = new Map<string, { c: NameCandidate; conf: number }>();
  const take = (cands: NameCandidate[], conf: number) => {
    for (const c of cands) {
      const prev = best.get(c.cardId);
      if (
        !prev ||
        c.score > prev.c.score ||
        (c.score === prev.c.score && c.matched > prev.c.matched) ||
        (c.score === prev.c.score && c.matched === prev.c.matched && c.numberHit && !prev.c.numberHit)
      ) {
        best.set(c.cardId, { c, conf });
      }
    }
  };
  for (const s of nameSegments(lines)) take(matchCardName(s.text, cards, topN), s.conf);
  if (fullText) {
    const avg = ordered.reduce((s, l) => s + confOf(l), 0) / Math.max(1, ordered.length);
    take(matchCardName(fullText, cards, topN), avg);
  }

  const sorted = [...best.values()].sort(
    (x, y) =>
      y.c.score - x.c.score ||
      y.c.matched - x.c.matched ||
      Number(y.c.numberHit) - Number(x.c.numberHit) ||
      (x.c.cardId < y.c.cardId ? -1 : 1),
  );
  const candidates = sorted.slice(0, topN).map((x) => x.c);
  return {
    candidates,
    ambiguous: isAmbiguous(candidates),
    confidence: sorted[0] ? Math.round(sorted[0].conf * 100) : 0,
    titleText,
    fullText,
  };
}
