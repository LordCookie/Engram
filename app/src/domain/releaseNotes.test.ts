import { describe, expect, it } from 'vitest';
import { isUpgrade, noteLines } from './releaseNotes';

describe('releaseNotes', () => {
  it('noteLines: Überschriften, Aufzählungen, Absätze; Auszeichnung entfernt', () => {
    const md = [
      'Kleiner Fix fürs Wiederherstellen.',
      '',
      '**Backup wiederherstellen**',
      '- „Aus Zwischenablage" öffnet ein **Textfeld**.',
      '1. Datei `engram.apk` laden',
      '## Hinweis',
      '_Hinweis:_ Für privaten Gebrauch.',
    ].join('\r\n');
    expect(noteLines(md)).toEqual([
      { kind: 'text', text: 'Kleiner Fix fürs Wiederherstellen.' },
      { kind: 'heading', text: 'Backup wiederherstellen' },
      { kind: 'bullet', text: '„Aus Zwischenablage" öffnet ein Textfeld.' },
      { kind: 'bullet', text: 'Datei engram.apk laden' },
      { kind: 'heading', text: 'Hinweis' },
      { kind: 'text', text: 'Hinweis: Für privaten Gebrauch.' },
    ]);
  });

  it('noteLines: fett mitten in der Zeile bleibt Absatz', () => {
    expect(noteLines('**Mehr → Backup** öffnen')).toEqual([{ kind: 'text', text: 'Mehr → Backup öffnen' }]);
    expect(noteLines('')).toEqual([]);
  });

  it('isUpgrade: nur wenn die zuletzt gelaufene Version älter ist', () => {
    expect(isUpgrade('0.4.1', '0.5.0')).toBe(true);
    expect(isUpgrade('0.5.0', '0.5.0')).toBe(false);
    expect(isUpgrade('0.6.0', '0.5.0')).toBe(false);
    expect(isUpgrade(undefined, '0.5.0')).toBe(false);
  });
});
