import printingsJson from './printings.json';

/**
 * Karten-ID → offizielle DB-Seite (PLAN.md § 8: auf die offizielle Datenbank
 * verlinken). Aus `printings.json` (von der Pipeline erzeugt).
 */
const rows = printingsJson as { cardId: string; pageUrl?: string }[];

export const pageUrlById = new Map<string, string>();
for (const r of rows) if (r.pageUrl) pageUrlById.set(r.cardId, r.pageUrl);
