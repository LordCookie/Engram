import { catalog } from '../app/src/data/catalog';
import { featureDB } from '../app/src/data/features';
import type { Card } from '../app/src/domain/types';

/**
 * Kartenmodell für die Kampf-Engine (engine2). Leitet aus den ECHTEN Kartendaten
 * ab, was belegbar ist: Grundwerte (cost/power/type) + Kampf-Keywords und einfache
 * {Play}-Effekte aus dem Kartentext. Bewusst nur die strukturellen, häufigen
 * Mechaniken — kein Anspruch, jeden Einzeltext exakt umzusetzen (Ehrlichkeit).
 *
 * rules_text ist CDPR-IP → wird nur LOKAL gelesen (Dev-Werkzeug), nie verteilt.
 */

export interface OnPlay {
  draw?: number;
  /** Auf-Spielen eine gegnerische Einheit besiegen (Removal). */
  defeat?: { all?: boolean; maxCost?: number };
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
  onPlay: OnPlay;
}

function parseOnPlay(text: string): OnPlay {
  const op: OnPlay = {};
  // Nur die {Play}-Klausel betrachten (bis zum nächsten {…} oder Satzende-Block).
  const m = /\{Play\}\s*([^{]*)/i.exec(text);
  const clause = m ? m[1] : '';
  if (!clause) return op;
  if (/defeat all other units/i.test(clause)) op.defeat = { all: true };
  else {
    const dm = /defeat[^.]*?unit[^.]*?cost\s+(\d+)\s+or\s+less/i.exec(clause);
    if (dm) op.defeat = { maxCost: Number(dm[1]) };
    else if (/defeat[^.]*?\bunit/i.test(clause)) op.defeat = {}; // beste gegnerische Einheit
  }
  const drawN = /\bdraw\s+(\d+)/i.exec(clause);
  if (drawN) op.draw = Number(drawN[1]);
  else if (/\bdraw\s+a\b/i.test(clause)) op.draw = 1;
  return op;
}

function build(c: Card): CardModel {
  const t = c.rulesText ?? '';
  const feat = featureDB.get(c.id);
  const eddieSource = !!feat && (feat.provides?.includes('EDDIE') ?? false);
  return {
    id: c.id,
    name: c.name,
    type: c.type,
    color: c.color,
    cost: c.cost ?? 0,
    power: c.power ?? 0,
    ram: c.ram ?? 0,
    isUnit: c.type === 'UNIT',
    blocker: /\{Blocker\}/i.test(t),
    adrenaline: /\{Adrenaline\}/i.test(t),
    goSolo: /\{Go Solo\}/i.test(t),
    quick: /\{Quick\}/i.test(t),
    eddieSource,
    onPlay: parseOnPlay(t),
  };
}

const MODELS = new Map<string, CardModel>(catalog.map((c) => [c.id, build(c)]));

export function model(id: string): CardModel {
  return (
    MODELS.get(id) ?? {
      id, name: id, type: 'UNIT', color: 'RED', cost: 3, power: 2, ram: 1,
      isUnit: true, blocker: false, adrenaline: false, goSolo: false, quick: false,
      eddieSource: false, onPlay: {},
    }
  );
}

export const allModels = (): CardModel[] => [...MODELS.values()];
