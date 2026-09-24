"""Erzeugt alle Raster-Icons aus dem engram-Logo „Platine 45°" (docs/logo/engram-logo.svg).

Die Geometrie steht hier ein zweites Mal (Pillow kann kein SVG rendern) — beim Ändern
des Logos beide Stellen anpassen. Gerendert wird 8-fach überabgetastet und dann mit
LANCZOS verkleinert (saubere Kanten); Leiterbahnen mit echten 45°-Gehrungen.

Ausgaben:
  app/public/icons/…                      PWA-Icons (192/512, maskable) + Apple-Touch-Icon
  app/android/app/src/main/res/mipmap-*   Launcher-Icons (eckig, rund, adaptiver Vordergrund)
  app/android/app/src/main/res/drawable*  Splash-Screens (dunkel, Logo mittig)

Lauf:  python docs/logo/make_icons.py      (braucht Pillow)
"""

from __future__ import annotations

import math
from pathlib import Path
from typing import List, Optional, Sequence, Tuple

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent.parent
RES = ROOT / "app" / "android" / "app" / "src" / "main" / "res"
PUBLIC = ROOT / "app" / "public"

YELLOW = (247, 213, 29, 255)
DARK = (11, 15, 20, 255)
CLEAR = (0, 0, 0, 0)
SS = 8  # Überabtastung

Pt = Tuple[float, float]

# --- Geometrie (Einheiten wie im SVG, Inhalt ≈ x 46..154, y 24..192) ----------
CRANIUM: List[Pt] = [(70, 24), (130, 24), (154, 48), (154, 90), (138, 106), (138, 118),
                     (62, 118), (62, 106), (46, 90), (46, 48)]
HOLES: List[List[Pt]] = [
    [(66, 62), (92, 62), (92, 80), (84, 88), (66, 88)],  # Auge links
    [(108, 62), (134, 62), (134, 88), (116, 88), (108, 80)],  # Auge rechts
    [(100, 90), (106, 98), (100, 106), (94, 98)],  # Nase
]
TRACES: List[List[Pt]] = [
    [(70, 117), (70, 128), (52, 146), (52, 167)],
    [(85, 117), (85, 140), (76, 149), (76, 175)],
    [(100, 117), (100, 183)],
    [(115, 117), (115, 140), (124, 149), (124, 175)],
    [(130, 117), (130, 128), (148, 146), (148, 167)],
]
PADS = [(47, 166), (71, 174), (95, 182), (119, 174), (143, 166)]  # 10×10
CENTER = (100.0, 108.0)
HEIGHT = 168.0  # Inhaltshöhe in Einheiten


def stroke_polygon(pts: Sequence[Pt], w: float) -> List[Pt]:
    """Dicke Polylinie als Polygon: stumpfe Enden, Gehrung (miter) an den Knicken."""
    h = w / 2
    left: List[Pt] = []
    right: List[Pt] = []
    for i, (x, y) in enumerate(pts):
        dirs = []
        if i > 0:
            dirs.append((x - pts[i - 1][0], y - pts[i - 1][1]))
        if i < len(pts) - 1:
            dirs.append((pts[i + 1][0] - x, pts[i + 1][1] - y))
        normals = []
        for dx, dy in dirs:
            ln = math.hypot(dx, dy)
            normals.append((-dy / ln, dx / ln))
        nx = sum(n[0] for n in normals)
        ny = sum(n[1] for n in normals)
        ln = math.hypot(nx, ny)
        mx, my = nx / ln, ny / ln
        scale = h / (mx * normals[0][0] + my * normals[0][1])
        left.append((x + mx * scale, y + my * scale))
        right.append((x - mx * scale, y - my * scale))
    return left + right[::-1]


def draw_logo(img: Image.Image, cx: float, cy: float, height_px: float, hole: tuple,
              min_stroke_px: float = 0.0) -> None:
    """Logo mittig bei (cx, cy) mit Inhaltshöhe height_px in ein (überabgetastetes) Bild."""
    d = ImageDraw.Draw(img)
    k = height_px / HEIGHT

    def P(pts: Sequence[Pt]) -> List[Pt]:
        return [(cx + (x - CENTER[0]) * k, cy + (y - CENTER[1]) * k) for x, y in pts]

    stroke = max(5.0, (min_stroke_px / k) if k else 5.0)
    stroke = min(stroke, 8.0)  # nicht zu fett, sonst laufen die Bahnen zusammen
    d.polygon(P(CRANIUM), fill=YELLOW)
    for poly in HOLES:
        d.polygon(P(poly), fill=hole)
    for tr in TRACES:
        d.polygon(P(stroke_polygon(tr, stroke)), fill=YELLOW)
    for x, y in PADS:
        d.polygon(P([(x, y), (x + 10, y), (x + 10, y + 10), (x, y + 10)]), fill=YELLOW)


def render(w: int, h: int, bg: str, logo_frac: float, radius_frac: float = 0.0,
           min_stroke_px: float = 0.0) -> Image.Image:
    """bg: 'square' (voll dunkel), 'rounded', 'circle' oder 'clear' (transparent)."""
    W, H = w * SS, h * SS
    img = Image.new("RGBA", (W, H), CLEAR)
    d = ImageDraw.Draw(img)
    if bg == "square":
        d.rectangle([0, 0, W, H], fill=DARK)
    elif bg == "rounded":
        d.rounded_rectangle([0, 0, W - 1, H - 1], radius=int(min(W, H) * radius_frac), fill=DARK)
    elif bg == "circle":
        d.ellipse([0, 0, W - 1, H - 1], fill=DARK)
    hole = CLEAR if bg == "clear" else DARK
    draw_logo(img, W / 2, H / 2, min(W, H) * logo_frac, hole, min_stroke_px * SS)
    return img.resize((w, h), Image.LANCZOS)


def save(img: Image.Image, path: Path, opaque: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    (img.convert("RGB") if opaque else img).save(path, optimize=True)
    print("  ", path.relative_to(ROOT), img.size)


def main() -> None:
    print("Android Launcher:")
    for dpi, px in {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}.items():
        # Vor Android 8 (minSdk 22): fertige Icons, eckig-abgerundet und rund.
        save(render(px, px, "rounded", 0.66, 0.2, min_stroke_px=1.4), RES / f"mipmap-{dpi}" / "ic_launcher.png")
        save(render(px, px, "circle", 0.6, min_stroke_px=1.4), RES / f"mipmap-{dpi}" / "ic_launcher_round.png")
        # Adaptives Icon (Android 8+): Vordergrund 108 dp, Inhalt in der 66-dp-Schutzzone.
        fg = round(px * 108 / 48)
        save(render(fg, fg, "clear", 54 / 108, min_stroke_px=1.4), RES / f"mipmap-{dpi}" / "ic_launcher_foreground.png")

    print("Splash-Screens:")
    for f in sorted(RES.glob("drawable*/splash.png")):
        w, h = Image.open(f).size
        save(render(w, h, "square", 0.3), f, opaque=True)

    print("Web/PWA:")
    save(render(192, 192, "rounded", 0.66, 0.22), PUBLIC / "icons" / "icon-192.png")
    save(render(512, 512, "rounded", 0.66, 0.22), PUBLIC / "icons" / "icon-512.png")
    # maskable: vollflächig, Inhalt in der 80-%-Schutzzone
    save(render(512, 512, "square", 0.56), PUBLIC / "icons" / "icon-maskable-512.png", opaque=True)
    save(render(180, 180, "square", 0.62), PUBLIC / "icons" / "apple-touch-icon.png", opaque=True)


if __name__ == "__main__":
    main()
