import { describe, it, expect } from 'vitest';
import { logoIconSvg, svgDataUrl, TRACE_PATHS, SKULL_PATH } from './logoShape';

describe('logoShape', () => {
  it('Icon-SVG trägt die Themefarben', () => {
    const svg = logoIconSvg('#FF4696', '#1E1033');
    expect(svg).toContain('fill="#1E1033"'); // Kachel
    expect(svg.match(/#FF4696/g)?.length).toBe(3); // Schädel, Leiterbahnen, Lötflächen
    expect(svg).toContain(SKULL_PATH);
  });

  it('fünf Leiterbahnen, alle laufen von unten (Lötfläche) nach oben in den Schädel', () => {
    expect(TRACE_PATHS).toHaveLength(5);
    for (const d of TRACE_PATHS) {
      const nums = d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      const startY = nums[1];
      expect(d.trim().endsWith('V117')).toBe(true); // endet am Schädel-Unterrand
      expect(startY).toBeGreaterThan(117);
    }
  });

  it('Data-URL ist korrekt kodiert', () => {
    const url = svgDataUrl('<svg a="#1"/>');
    expect(url.startsWith('data:image/svg+xml,')).toBe(true);
    expect(url).toContain('%231'); // # muss kodiert sein
  });
});
