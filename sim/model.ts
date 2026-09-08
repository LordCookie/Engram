import { catalog } from '../app/src/data/catalog';
import { featureDB } from '../app/src/data/features';
import type { Card } from '../app/src/domain/types';

/**
 * Kartenmodell für die Kampf-Engine (engine2). Leitet aus den ECHTEN Kartendaten
 * ab, was belegbar ist: Grundwerte (cost/power/type), Kampf-Keywords und die
 * IMPERATIVEN Ein-Karten-Effekte aus dem Kartentext — Removal, Spend (gegnerische
 * Einheit erschöpfen), Draw, Gig-Swing, Power-Buff. Bewusst NUR die klaren,
 * häufigen Muster.
 *
 * Ehrlichkeit (§ 12): laufende/getriggerte Fähigkeiten (Gear „When this Unit is
 * spent …", {Defeated}, {Spend}-Aktivierungen, {Quick}, Recursion, Würfel) bleiben
 * abstrahiert. Wir lesen NUR imperative Sätze (Programme/Events ganz; Einheiten die
 * {Play}-Klausel, plus {Attack} für Gig-Swing) — „When/At/If/Whenever …"-Sätze
 * werden verworfen, damit Gear-Trigger nicht fälschlich als Sofort-Effekt zählen.
 *
 * rules_text ist CDPR-IP → wird nur LOKAL gelesen (Dev-Werkzeug), nie verteilt.
 */

export interface Effect {
  draw?: number;
  /** Gegnerische Einheit(en) besiegen. */
  defeat?: { all?: boolean; maxCost?: number; spent?: boolean };
  /** Gegnerische Einheit(en) erschöpfen (spent) — Tempo/Blocker-Denial. */
  spendRival?: { all?: boolean; maxCost?: number; count?: number };
  /** Gig-Swing: self = selbst dazugewinnen (klaut vom Rival), rival = Rival verliert. */
  gig?: { self?: number; rival?: number };
  /** +Power auf eigene Einheit(en). */
  buff?: { power: number; allies?: boolean };
}

export interface CardModel {
  id: string;
  name: string;
  type: string;
  color: string;
  cost: number;
  power: number;
  ram: number;
  isUnit: boolean;
  blocker: boolean;
  adrenaline: boolean;
  goSolo: boolean;
  quick: boolean;
  /** Karte erzeugt laufend Eddies (aus features: provides EDDIE). */
  eddieSource: boolean;
  /** Effekt beim Spielen (Programme/Events sofort; Einheiten via {Play}). */
  onPlay: Effect;
  /** Effekt beim Angriff der Einheit (nur Gig-Swing modelliert). */
  onAttack: { gig?: number };
}

const stripReminders = (t: string) => t.replace(/\([^)]*\)/g, ' ');
/** Klausel hinter einem {Keyword} bis zum nächsten {…} oder Ende. */
function clause(text: string, kw: string): string {
  const m = new RegExp(`\\{${kw}\\}\\s*([^{]*)`, 'i').exec(text);
  return m ? m[1] : '';
}
const TRIGGER_START = /^\s*(when|whenever|at the|if |while |after |before |the first time|each time|then,?\s+if\b|this unit|this card)/i;
/** Nur imperative Sätze (verwirft laufende „When/At/If …"-Trigger). */
function imperativeSentences(text: string): string {
  return text
    .split(/(?<=[.!])\s+/)
    .filter((s) => s.trim() && !TRIGGER_START.test(s))
    .join(' ');
}

function parseEffect(src: string): Effect {
  const e: Effect = {};
  if (!src.trim()) return e;
  // Removal
  if (/\bdefeat all (other |rival )?units?\b/i.test(src)) e.defeat = { all: true };
  else if (/\b(defeat|destroy)\b/i.test(src) && /\bunit/i.test(src)) {
    const cap = /cost\s+(\d+)\s+or\s+less/i.exec(src);
    e.defeat = { ...(cap ? { maxCost: Number(cap[1]) } : {}), ...(/\bspent unit/i.test(src) ? { spent: true } : {}) };
  }
  // Spend rival unit(s) — erschöpfen (nicht „spend N eddies/gigs")
  if (/\bspend\b[^.]*\bunit/i.test(src) && !/\bspend\s+\d+\s+(eddie|gig)/i.test(src)) {
    const all = /\bspend all\b/i.test(src);
    const cap = /unit[^.]*cost\s+(\d+)\s+or\s+less/i.exec(src);
    const cnt = /\bspend\s+(\d+)\b/i.exec(src);
    e.spendRival = { ...(all ? { all: true } : {}), ...(cap ? { maxCost: Number(cap[1]) } : {}), ...(cnt ? { count: Number(cnt[1]) } : {}) };
  }
  // Draw
  const drawN = /\bdraw\s+(\d+)/i.exec(src);
  if (drawN) e.draw = Number(drawN[1]);
  else if (/\bdraw\s+(a|one)\b/i.test(src)) e.draw = 1;
  // Gig-Swing
  const gain = /\b(gain|steal)\s+(\d+|a|an)\s+(?:rival\s+)?gig/i.exec(src);
  const dec = /\b(decrease|adjust)\s+a\s+gig\s+by\s+up\s+to\s+(\d+)/i.exec(src);
  if (gain || dec) {
    e.gig = {};
    if (gain) e.gig.self = gain[2] === 'a' || gain[2] === 'an' ? 1 : Number(gain[2]);
    if (dec) e.gig.rival = Number(dec[2]);
  }
  // Power-Buff (+N power)
  const buff = /\+\s*(\d+)\s*power|gets?\s+\+?(\d+)\s+power/i.exec(src);
  if (buff) e.buff = { power: Number(buff[1] ?? buff[2]), ...(/\b(your units|each[^.]*your[^.]*unit|all your)/i.test(src) ? { allies: true } : {}) };
  return e;
}

function build(c: Card): CardModel {
  const raw = c.rulesText ?? '';
  const clean = stripReminders(raw);
  const isUnit = c.type === 'UNIT';
  // Effekt-Quelle: Einheiten = {Play}-Klausel; PROGRAMME = imperative Sätze (Ein-Karten-
  // Spells). GEAR bleibt bewusst unmodelliert (anhängend/laufend getriggert → abstrahiert).
  const playText = isUnit ? clause(clean, 'Play') : c.type === 'PROGRAM' ? imperativeSentences(clean) : '';
  const attackText = isUnit ? clause(clean, 'Attack') : '';
  const feat = featureDB.get(c.id);
  const onAttack: { gig?: number } = {};
  const ae = parseEffect(attackText);
  if (ae.gig?.rival || ae.gig?.self) onAttack.gig = (ae.gig.rival ?? 0) + (ae.gig.self ?? 0);
  return {
    id: c.id, name: c.name, type: c.type, color: c.color,
    cost: c.cost ?? 0, power: c.power ?? 0, ram: c.ram ?? 0, isUnit,
    blocker: /\{Blocker\}/i.test(raw),
    adrenaline: /\{Adrenaline\}/i.test(raw),
    goSolo: /\{Go Solo\}/i.test(raw),
    quick: /\{Quick\}/i.test(raw),
    eddieSource: !!feat && (feat.provides?.includes('EDDIE') ?? false),
    onPlay: parseEffect(playText),
    onAttack,
  };
}

const MODELS = new Map<string, CardModel>(catalog.map((c) => [c.id, build(c)]));

export function model(id: string): CardModel {
  return (
    MODELS.get(id) ?? {
      id, name: id, type: 'UNIT', color: 'RED', cost: 3, power: 2, ram: 1,
      isUnit: true, blocker: false, adrenaline: false, goSolo: false, quick: false,
      eddieSource: false, onPlay: {}, onAttack: {},
    }
  );
}

export const allModels = (): CardModel[] => [...MODELS.values()];
