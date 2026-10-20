import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Nur für Tests/Werkzeuge (Node): sammelt alle Übersetzungsschlüssel aus dem
 * Quelltext — String-Literale in `t('…')`, `tk('…')` und beiden Formen von
 * `tn(n, '…', '…')`. Dynamische Aufrufe wie `t(label)` zählen nicht; deren Texte
 * müssen mit `tk('…')` markiert sein.
 */

const LIT = String.raw`'((?:[^'\\\n]|\\.)*)'`;
const CALL = new RegExp(String.raw`\b(?:t|tk)\(\s*${LIT}`, 'g');
const PLURAL = new RegExp(String.raw`\btn\(\s*[^,]+,\s*${LIT}\s*,\s*${LIT}`, 'g');

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) => (c === 'n' ? '\n' : c));
}

function walk(dir: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) && !/[\\/]i18n[\\/]/.test(p)) out.push(p);
  }
}

export function collectKeys(srcDir: string): Map<string, string> {
  const files: string[] = [];
  walk(srcDir, files);
  const keys = new Map<string, string>(); // Schlüssel → erste Fundstelle
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    for (const m of src.matchAll(CALL)) if (!keys.has(unescape(m[1]))) keys.set(unescape(m[1]), f);
    for (const m of src.matchAll(PLURAL)) {
      for (const k of [m[1], m[2]]) if (!keys.has(unescape(k))) keys.set(unescape(k), f);
    }
  }
  return keys;
}

/** Platzhalter `{name}` eines Textes (sortiert, eindeutig). */
export function placeholders(s: string): string[] {
  return [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
}
