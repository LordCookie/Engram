import { describe, it, expect } from 'vitest';
import { CHECK_INTERVAL_MS, findDataAsset, isNewerStamp, parseDataBundle, pickNewer, shouldCheck } from './dataBundle';

describe('shouldCheck', () => {
  it('ohne letzte Prüfung sofort, sonst erst nach einer Stunde', () => {
    const now = 10 * CHECK_INTERVAL_MS;
    expect(shouldCheck(now, undefined)).toBe(true);
    expect(shouldCheck(now, now - 5 * 60 * 1000)).toBe(false);
    expect(shouldCheck(now, now - CHECK_INTERVAL_MS)).toBe(true);
  });
});

describe('parseDataBundle', () => {
  const coplay = { version: 'ingest-v2', n: 3, cards: [], df: [], pairs: [] };
  const metaDecks = { version: 1, updated: '2026-11-01', decks: [] };

  it('liest ein gültiges Paket', () => {
    const b = parseDataBundle({ format: 'engram-data-v1', created: '2026-11-01T10:00:00Z', coplay, metaDecks });
    expect(b?.created).toBe('2026-11-01T10:00:00Z');
    expect(b?.coplay).toBe(coplay);
    expect(b?.metaDecks).toBe(metaDecks);
  });

  it('falsches Format, kaputtes Datum oder ohne Inhalt → null', () => {
    expect(parseDataBundle({ format: 'x', created: '2026-11-01', coplay })).toBeNull();
    expect(parseDataBundle({ format: 'engram-data-v1', created: 'gestern', coplay })).toBeNull();
    expect(parseDataBundle({ format: 'engram-data-v1', created: '2026-11-01' })).toBeNull();
    expect(parseDataBundle(null)).toBeNull();
  });

  it('übernimmt nur Teile in bekanntem Format', () => {
    const b = parseDataBundle({ format: 'engram-data-v1', created: '2026-11-01', coplay: { version: 'v9' }, metaDecks });
    expect(b?.coplay).toBeUndefined();
    expect(b?.metaDecks).toBe(metaDecks);
  });
});

describe('pickNewer', () => {
  it('nimmt die neuere Fassung; fehlender Stempel gilt als alt', () => {
    expect(pickNewer('mit', '2026-10-25', 'geladen', '2026-11-01')).toBe('geladen');
    expect(pickNewer('mit', '2026-11-05', 'geladen', '2026-11-01')).toBe('mit');
    expect(pickNewer('mit', undefined, 'geladen', '2026-11-01')).toBe('geladen');
    expect(pickNewer('mit', '2026-10-25', undefined, undefined)).toBe('mit');
    expect(pickNewer(undefined, undefined, 'geladen', '2026-11-01')).toBe('geladen');
  });

  it('isNewerStamp vergleicht Datum und Uhrzeit', () => {
    expect(isNewerStamp('2026-11-01T12:00:00Z', '2026-11-01T11:00:00Z')).toBe(true);
    expect(isNewerStamp('2026-11-01', '2026-11-01')).toBe(false);
  });
});

describe('findDataAsset', () => {
  it('findet engram-data.json mit Hochladezeit', () => {
    const r = findDataAsset({
      assets: [
        { name: 'andere.json', browser_download_url: 'x', updated_at: '2026-11-01T00:00:00Z' },
        { name: 'engram-data.json', browser_download_url: 'https://x/engram-data.json', updated_at: '2026-11-01T10:00:00Z', size: 99 },
      ],
    });
    expect(r).toEqual({
      url: 'https://x/engram-data.json',
      updatedAt: '2026-11-01T10:00:00Z',
      created: '2026-11-01T10:00:00Z',
      size: 99,
    });
    expect(findDataAsset({ assets: [] })).toBeNull();
    // Stand aus dem Label (Erstellungszeit), nicht die spätere Hochladezeit
    const labeled = findDataAsset({
      assets: [{ name: 'engram-data.json', label: '2026-11-01T09:00:00Z', browser_download_url: 'u', updated_at: '2026-11-01T10:00:00Z' }],
    });
    expect(labeled?.created).toBe('2026-11-01T09:00:00Z');
    expect(findDataAsset(null)).toBeNull();
  });
});
