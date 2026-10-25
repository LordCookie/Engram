"""Platinen-Hintergrund der App als nahtlose 480er-Kachel (zwei Lagen, Bauteile, Beschriftung).

Schreibt die Regel `body::before` in `app/src/effects.css` neu (SVG als Data-URL-Maske, eingefärbt
in der Akzentfarbe). Lauf:  python docs/design/pcb_background.py   (nur Standardbibliothek)

Ausgabe: SVG-String (für die CSS-Maske). Oberseite volle Deckkraft, Unterseite blass
(stroke-opacity → Maske nutzt den Alphakanal). Busse, die eine Kante verlassen, kommen an der
gegenüberliegenden Kante an derselben Stelle wieder herein → wirkt wie eine durchgehende Platine.
"""
import math
import sys

W = H = 480
S = 8  # Bahnabstand


def offset_polyline(pts, d):
    """Parallele Bahn im Abstand d (Gehrungs-Schnittpunkte; nur 0/45/90°-Segmente)."""
    segs = []
    for (x1, y1), (x2, y2) in zip(pts, pts[1:]):
        L = math.hypot(x2 - x1, y2 - y1)
        ux, uy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = -uy, ux
        segs.append(((x1 + nx * d, y1 + ny * d), (ux, uy)))
    out = [segs[0][0]]
    for (p1, u1), (p2, u2) in zip(segs, segs[1:]):
        det = u1[0] * (-u2[1]) - u1[1] * (-u2[0])
        if abs(det) < 1e-9:
            out.append(p2)
            continue
        dx, dy = p2[0] - p1[0], p2[1] - p1[1]
        t = (dx * (-u2[1]) - dy * (-u2[0])) / det
        out.append((p1[0] + u1[0] * t, p1[1] + u1[1] * t))
    (x2, y2) = pts[-1]
    (x1, y1) = pts[-2]
    L = math.hypot(x2 - x1, y2 - y1)
    nx, ny = -(y2 - y1) / L, (x2 - x1) / L
    out.append((x2 + nx * d, y2 + ny * d))
    return out


def path(pts):
    f = lambda v: f'{v:.1f}'.rstrip('0').rstrip('.')
    return 'M' + ' L'.join(f'{f(x)} {f(y)}' for x, y in pts)


def bus(center, n, s=S):
    return [offset_polyline(center, (k - (n - 1) / 2) * s) for k in range(n)]


top, bottom, extra = [], [], []  # Pfade Oberseite, Unterseite, sonstige SVG-Elemente


def trace(pts, layer=top):
    layer.append(path(pts))


def via(x, y, r=2.6):
    extra.append(f"<circle cx='{x:.1f}' cy='{y:.1f}' r='{r}'/>")


def ic(x, y, w, h, pins_lr=0, pins_tb=0, label=None):
    extra.append(f"<rect x='{x}' y='{y}' width='{w}' height='{h}' rx='3'/>")
    extra.append(f"<circle cx='{x + 6}' cy='{y + 6}' r='1.6'/>")  # Pin-1-Markierung
    d = []
    for i in range(pins_lr):
        py = y + (h - (pins_lr - 1) * S) / 2 + i * S
        d.append(f'M{x - 6} {py:g}H{x}M{x + w} {py:g}H{x + w + 6}')
    for i in range(pins_tb):
        px = x + (w - (pins_tb - 1) * S) / 2 + i * S
        d.append(f'M{px:g} {y - 6}V{y}M{px:g} {y + h}V{y + h + 6}')
    top.append(''.join(d))
    if label:
        text(label, x + w / 2, y + h / 2 + 3.5, 10, 'middle')


def passive(x, y, vertical=False, label=None):
    """2-Pad-Bauteil (Widerstand/Kondensator): Pads + Körper-Umriss."""
    if vertical:
        extra.append(f"<rect x='{x - 3}' y='{y}' width='6' height='5' rx='1'/>"
                     f"<rect x='{x - 3}' y='{y + 13}' width='6' height='5' rx='1'/>"
                     f"<rect x='{x - 5}' y='{y - 2}' width='10' height='22' rx='2' stroke-opacity='0.5'/>")
        if label:
            text(label, x + 8, y + 12, 7)
    else:
        extra.append(f"<rect x='{x}' y='{y - 3}' width='5' height='6' rx='1'/>"
                     f"<rect x='{x + 13}' y='{y - 3}' width='5' height='6' rx='1'/>"
                     f"<rect x='{x - 2}' y='{y - 5}' width='22' height='10' rx='2' stroke-opacity='0.5'/>")
        if label:
            text(label, x + 9, y - 8, 7, 'middle')


def text(t, x, y, size, anchor='start'):
    extra.append(
        f"<text x='{x:g}' y='{y:g}' font-size='{size}' font-family='monospace' fill='#000' stroke='none' "
        f"text-anchor='{anchor}'>{t}</text>"
    )


# ---------------- Oberseite ----------------
# U1 (links oben) und U2 (Mitte), dazwischen und zum Rand Busse (nahtlos links/rechts).
ic(150, 36, 64, 80, pins_lr=9, label='U1')            # Pins y = 44 … 108
ic(262, 214, 88, 60, pins_tb=10, label='U2')           # Pins x = 270 … 342

# Bus H1: linke Kante → U1 links (5 Bahnen bei y 60…92), weiter von U1 rechts mit Ausweichbogen → rechte Kante
for b in bus([(0, 76), (144, 76)], 5):
    trace(b)
for b in bus([(220, 76), (262, 76), (302, 116), (378, 116), (418, 76), (480, 76)], 5):
    trace(b)

# U1 rechts unten (y 100/108) → U2 oben (x 286/294), parallel zum Ausweichbogen von H1
for b in bus([(220, 104), (250, 104), (290, 144), (290, 208)], 2):
    trace(b)
# U2 oben rechts (x 310…334) → hoch, 45° nach rechts, endet in Vias
for b in bus([(322, 208), (322, 192), (354, 160), (396, 160)], 4):
    trace(b)
    via(b[-1][0] + 3.6, b[-1][1])

# U2 unten → nach unten, 45° nach links, endet in Vias (Lagenwechsel)
for b in bus([(294, 280), (294, 318), (254, 358), (196, 358)], 5):
    trace(b)
    via(b[-1][0] - 3.6, b[-1][1])

# U2 rechts: Taktleitung zu einem Quarz
extra.append("<rect x='392' y='226' width='26' height='14' rx='7'/>")
text('Y1', 405, 252, 7, 'middle')
trace([(350, 233), (392, 233)])

# Widerstands-Netz links der Mitte
for i, yy in enumerate((168, 186, 204)):
    passive(60, yy, label=f'R{i + 1}')
    trace([(78, yy), (110, yy), (126, yy - 16), (126, yy - 40)] if i == 0 else [(78, yy), (118, yy)])
    via(122 if i else 126, yy if i else yy - 43)
passive(212, 300, vertical=True, label='C4')
trace([(212, 300), (212, 282), (230, 264), (256, 264)])

# Kupferfeld (schraffiert) unten rechts
extra.append("<rect x='352' y='330' width='104' height='96' rx='6'/>")
hatch = ''.join(f'M{352 + i * 8} 426L{max(352, 352 + i * 8 - 96)} {426 - min(96, i * 8)}' for i in range(1, 25))
extra.append(f"<path d='{hatch}' stroke-opacity='0.35' clip-path='url(#cp)'/>")
extra.append("<clipPath id='cp'><rect x='352' y='330' width='104' height='96' rx='6'/></clipPath>")
for k in range(4):
    via(364 + k * 26, 318)

# U3 links unten: links über Vias zur Unterseite (V1), rechts 3 Bahnen mit 45°-Knick
ic(112, 250, 40, 48, pins_lr=5, label='U3')          # Pins y = 258 … 290
for yy in (258, 266, 274, 282, 290):
    trace([(106, yy), (98, yy)])
    via(95, yy)
for b in bus([(158, 266), (176, 266), (196, 246), (196, 230)], 3):
    trace(b)
    via(b[-1][0], b[-1][1] - 3.6)

# Doppelbus ganz oben quer über die Kachel (nahtlos links/rechts)
for b in bus([(0, 14), (480, 14)], 2):
    trace(b)
text('GND', 404, 344, 8, 'middle')

# Bohrlöcher + Beschriftung
for x, y in ((24, 456), (458, 454)):
    extra.append(f"<circle cx='{x}' cy='{y}' r='9'/><circle cx='{x}' cy='{y}' r='4.5'/>")
text('ENGRAM-01 REV 0.3', 46, 470, 8)
text('+3V3', 6, 50, 7)

# ---------------- Unterseite (blass) ----------------
# V1: volle Höhe bei x 52…84 (nahtlos oben/unten), V2: volle Höhe bei x 428…444 mit Knick
for b in bus([(68, 0), (68, 480)], 5):
    trace(b, bottom)
for b in bus([(436, 0), (436, 150), (412, 174), (412, 290), (436, 314), (436, 480)], 3):
    trace(b, bottom)
# Querverbindung unten: von den U2-Vias nach links zu V1
for b in bus([(190, 358), (150, 398), (84, 398)], 5):
    trace(b, bottom)

svg = (
    f"<svg xmlns='http://www.w3.org/2000/svg' width='{W}' height='{H}' fill='none' stroke='#000' "
    "stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'>"
    f"<path stroke-opacity='0.38' d='{''.join(bottom)}'/>"
    f"<path d='{''.join(top)}'/>"
    + ''.join(extra)
    + '</svg>'
)

if __name__ == '__main__':
    import re
    import urllib.parse
    from pathlib import Path

    CSS = Path(__file__).resolve().parents[2] / 'app' / 'src' / 'effects.css'
    url = 'url("data:image/svg+xml,' + urllib.parse.quote(svg, safe="/:=' ").replace(' ', '%20') + '")'
    rule = '\n'.join([
        'body::before {',
        "  content: '';",
        '  position: fixed;',
        '  inset: 0;',
        '  z-index: -1;',
        '  pointer-events: none;',
        '  background: rgb(var(--c-accent) / 0.08);',
        f'  -webkit-mask: {url}',
        '    0 0 / 480px 480px repeat;',
        f'  mask: {url}',
        '    0 0 / 480px 480px repeat;',
        '}',
    ])
    css = CSS.read_text(encoding='utf-8')
    css, n = re.subn(r"body::before \{.*?\n\s*\}", lambda _m: rule, css, count=1, flags=re.S)
    assert n == 1, 'Regel body::before nicht gefunden'
    CSS.write_bytes(css.encode('utf-8'))
    print('effects.css aktualisiert,', len(svg), 'Zeichen SVG')
