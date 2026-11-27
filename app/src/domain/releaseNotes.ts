import { isNewer } from './semver';

/**
 * „Was ist neu" nach einem Update (Muster aus ScryGlass): der Release-Text (Markdown) als
 * schlichte Zeilen und die Entscheidung, ob er beim Start gezeigt wird. Rein/getestet.
 */

export type NoteLine = { kind: 'heading' | 'bullet' | 'text'; text: string };

/** Inline-Auszeichnung entfernen: **fett**, _kursiv_, `Code`. */
function plain(s: string): string {
  return s
    .replace(/\*\*/g, '')
    .replace(/`/g, '')
    .replace(/(^|\s)_([^_]+)_(?=\s|$|[.,:;!?])/g, '$1$2')
    .trim();
}

/**
 * Markdown-Zeilen → Überschrift („**Titel**" oder „# Titel" allein in der Zeile),
 * Aufzählung („- x", „* x", „1. x") oder Absatz. Leere Zeilen fallen weg.
 */
export function noteLines(md: string): NoteLine[] {
  const out: NoteLine[] = [];
  for (const raw of md.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = /^(?:#{1,6}\s+(.+)|\*\*([^*]+)\*\*)$/.exec(line);
    if (heading) {
      out.push({ kind: 'heading', text: plain(heading[1] ?? heading[2]) });
      continue;
    }
    const bullet = /^(?:[-*]|\d+\.)\s+(.+)$/.exec(line);
    out.push(bullet ? { kind: 'bullet', text: plain(bullet[1]) } : { kind: 'text', text: plain(line) });
  }
  return out;
}

/**
 * Nur nach einem Update zeigen: die zuletzt gelaufene Version ist älter als die jetzige.
 * Bei der Erstinstallation (`lastRun` fehlt) nicht.
 */
export function isUpgrade(lastRun: string | undefined, current: string): boolean {
  return !!lastRun && isNewer(current, lastRun);
}
