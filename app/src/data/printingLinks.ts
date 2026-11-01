import printingsJson from './printings.json';
import { extraLinks } from './overrides';

/**
 * Karten-ID → offizielle DB-Seite (PLAN.md § 8: auf die offizielle Datenbank
 * verlinken). Aus `printings.json` (von der Pipeline erzeugt).
 */
const rows = printingsJson as { cardId: string; pageUrl?: string }[];

export const pageUrlById = new Map<string, string>();
for (const r of [...rows, ...extraLinks()]) if (r.pageUrl && !pageUrlById.has(r.cardId)) pageUrlById.set(r.cardId, r.pageUrl);
