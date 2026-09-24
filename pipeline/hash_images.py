"""Bild-Hash-Pipeline für den Scanner v2 (scanner-v2-plan.md § 3.4).

Für JEDES englische Printing jeder Karte (auch Beta-/Starter-/Full-Art-Drucke) wird das
Kartenbild über den NetDeck-Detail-Endpoint (frische, signierte URL) geladen und als
256-Bit-**pHash** (DCT über die tiefen Frequenzen) gespeichert. Die App hasht den
Kamera-Ausschnitt genauso und sucht den nächsten Hash (Hamming-Distanz) — das erkennt
die Karte am BILD, unabhängig von der stilisierten Schrift.

Alt-Art per Bild statt per Künstler: `fetch_altarts.py` wertet „> 1 Künstler" aus, aber
die Quelle trägt z. B. beim Beta-Druck von Delamain Cab einen anderen Künstler für
EXAKT dasselbe Bild. Hier entscheidet der Bildabstand zum Standard-Printing
(`ALT_MIN_DIST`): weit weg = echte alternative Darstellung (z. B. Full-Art), nah dran =
nur Nachdruck (Beta, Starter, andere Nummer). Mit `--write-altarts` wird
`altArts.json` aus diesem Bildbefund neu geschrieben.

§ 8: Bilder liegen nur kurz im Speicher und werden nie gespeichert. Ausgabe sind
ausschließlich Hashes: `app/src/data/hashes.json` (gitignored wie cards.json),
eine Zeile je Printing {"id","card","alt","h"} (h = 64 Hex-Zeichen).

Der Hash MUSS Bit für Bit zur App passen (`app/src/data/imageHash.ts`): gleiche
DCT-Matrix, gleiche Rechenreihenfolge, Median wie dort, MSB zuerst. Absichtlich ohne
numpy geschrieben — die Schleifen entsprechen 1:1 der TS-Seite.

Lauf:  python pipeline/hash_images.py                  (fortsetzbar, kennt fertige IDs)
       python pipeline/hash_images.py --limit 10       (Probelauf, nur 10 Karten)
       python pipeline/hash_images.py --write-altarts  (altArts.json aus dem Bildbefund)
Braucht Pillow (WebP-Dekodierung); sonst nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import io
import json
import math
import sys
import time
import urllib.request
from pathlib import Path
from typing import Dict, List, Optional, Sequence

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "src" / "data"
CARDS = DATA / "cards.json"
OUT = DATA / "hashes.json"
ALT_OUT = DATA / "altArts.json"

API = "https://api.netdeck.gg/api/cards/cyberpunk"
UA = "engram-tcg-tool/0.1 (local hobby project; github LordCookie/Engram)"
HEADERS = {
    "User-Agent": UA,
    "Accept": "application/json",
    "Origin": "https://cyberpunktcg.com",
    "Referer": "https://cyberpunktcg.com/",
}
DELAY = 0.3  # höflich bleiben

P_IMG = 32  # Graustufe auf P_IMG×P_IMG
P_HASH = 16  # obere P_HASH×P_HASH DCT-Koeffizienten → 256 Bit
TOTAL_BITS = P_HASH * P_HASH

# Ab diesem Hamming-Abstand zum Standard-Printing gilt ein Druck als ALTERNATIVE
# Darstellung. Gemessen (alle 151 Karten, 550 Printings, 2026-09-24): Nachdrucke
# desselben Bildes liegen bei 0–38 (auch mit Stempel wie „WTNC 2026"/„β"), Full-Art-
# Varianten derselben Illustration ab 42, andere Illustrationen ab ~64. Fremde Karten
# liegen untereinander bei min 68 / Median 86.
ALT_MIN_DIST = 40


# --- pHash (identisch zu app/src/data/imageHash.ts) --------------------------

def bits_to_hex(bits: Sequence[int]) -> str:
    """Bits (MSB zuerst je Byte) → Hex-String."""
    out = bytearray()
    for k in range(0, len(bits), 8):
        byte = 0
        for j in range(8):
            byte = (byte << 1) | (1 if bits[k + j] else 0)
        out.append(byte)
    return out.hex()


_DCT: Dict[int, List[float]] = {}


def dct_matrix(n: int) -> List[float]:
    """Orthonormale DCT-II-Basis, row-major: C[k][x] = a(k)·cos(pi·(2x+1)·k/(2n))."""
    if n not in _DCT:
        c = [0.0] * (n * n)
        for k in range(n):
            a = math.sqrt(1 / n) if k == 0 else math.sqrt(2 / n)
            for x in range(n):
                c[k * n + x] = a * math.cos((math.pi * (2 * x + 1) * k) / (2 * n))
        _DCT[n] = c
    return _DCT[n]


def phash_from_gray(x: Sequence[float], n: int = P_IMG, hash_size: int = P_HASH) -> str:
    """pHash aus einer n×n-Graustufe (row-major). Rechenreihenfolge wie in TS."""
    c = dct_matrix(n)
    # M = X · Cᵀ
    m = [0.0] * (n * n)
    for i in range(n):
        xi = i * n
        for j in range(n):
            cj = j * n
            s = 0.0
            for k in range(n):
                s += x[xi + k] * c[cj + k]
            m[xi + j] = s
    # D = C · M (nur die oberen hash_size×hash_size Koeffizienten)
    low = [0.0] * (hash_size * hash_size)
    for k in range(hash_size):
        ck = k * n
        for j in range(hash_size):
            s = 0.0
            for i in range(n):
                s += c[ck + i] * m[i * n + j]
            low[k * hash_size + j] = s
    srt = sorted(low)
    cnt = len(srt)
    med = srt[(cnt - 1) // 2] if cnt % 2 else (srt[cnt // 2 - 1] + srt[cnt // 2]) / 2
    return bits_to_hex([1 if v > med else 0 for v in low])


def phash_image_bytes(data: bytes) -> str:
    """Kartenbild → pHash. Transparente Ecken auf Schwarz (wie der dunkle Kartenrand)."""
    from PIL import Image  # lazy: Tests der reinen Funktionen brauchen kein Pillow

    with Image.open(io.BytesIO(data)) as im:
        rgba = im.convert("RGBA")
        bg = Image.new("RGBA", rgba.size, (0, 0, 0, 255))
        bg.alpha_composite(rgba)
        small = bg.convert("RGB").resize((P_IMG, P_IMG), Image.LANCZOS)
        px = list(small.getdata())
    gray = [0.299 * r + 0.587 * g + 0.114 * b for (r, g, b) in px]
    return phash_from_gray(gray)


def hamming_hex(a: str, b: str) -> int:
    return bin(int(a, 16) ^ int(b, 16)).count("1")


# --- Quelle -----------------------------------------------------------------

def get_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=30) as r:
        return json.loads(r.read().decode("utf-8"))


def get_bytes(url: str) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def english_printings(detail: dict) -> List[dict]:
    """Englische Printings mit Bild; das Standard-Printing (`printing_id`) zuerst."""
    std = detail.get("printing_id")
    out = [
        p
        for p in detail.get("printings") or []
        if (p.get("language") or "en") == "en" and p.get("image_url") and p.get("id")
    ]
    out.sort(key=lambda p: 0 if p["id"] == std else 1)
    return out


def classify_alts(entries: List[dict], std_id: Optional[str], min_dist: int = ALT_MIN_DIST) -> None:
    """Setzt `alt` je Eintrag einer Karte: weit weg vom Standard-Bild = Alt-Art."""
    std = next((e for e in entries if e["id"] == std_id), entries[0] if entries else None)
    for e in entries:
        e["alt"] = std is not None and e is not std and hamming_hex(e["h"], std["h"]) >= min_dist


# --- Lauf -------------------------------------------------------------------

def load_existing() -> Dict[str, dict]:
    if not OUT.exists():
        return {}
    try:
        return {e["id"]: e for e in json.loads(OUT.read_text(encoding="utf-8"))}
    except Exception:  # noqa: BLE001 — kaputte Datei → neu aufbauen
        return {}


def write_out(rows: List[dict]) -> None:
    rows = sorted(rows, key=lambda e: (e["card"], e["alt"], e["id"]))
    body = ",\n".join(
        json.dumps({"id": e["id"], "card": e["card"], "alt": e["alt"], "h": e["h"]}, separators=(",", ":"))
        for e in rows
    )
    OUT.write_text("[\n" + body + "\n]\n", encoding="utf-8")


def report(rows: List[dict], std_dist: List[int]) -> None:
    """Abstands-Statistik als Grundlage für die Schwellen (plan § 3.5)."""
    if len(rows) < 2:
        return
    nearest_other: List[int] = []
    for e in rows:
        best = 257
        for o in rows:
            if o["card"] != e["card"]:
                d = hamming_hex(e["h"], o["h"])
                if d < best:
                    best = d
        nearest_other.append(best)
    nearest_other.sort()
    q = lambda xs, f: xs[min(len(xs) - 1, int(len(xs) * f))]  # noqa: E731
    print(
        f"Nächste FREMDE Karte: min {nearest_other[0]}, 5% {q(nearest_other, 0.05)}, "
        f"Median {q(nearest_other, 0.5)} (Treffer müssen klar darunter liegen)"
    )
    if std_dist:
        s = sorted(std_dist)
        print(f"Abstand Nachdruck/Variante → Standard: {s}")


def main(argv: Optional[List[str]] = None) -> int:
    ap = argparse.ArgumentParser(description="engram Bild-Hash-Pipeline (pHash je Printing)")
    ap.add_argument("--limit", type=int, default=None, help="nur die ersten N Karten (Probelauf)")
    ap.add_argument("--force", action="store_true", help="alle Hashes neu berechnen")
    ap.add_argument("--write-altarts", action="store_true", help="altArts.json aus dem Bildbefund schreiben")
    args = ap.parse_args(argv)

    if not CARDS.exists():
        raise SystemExit("cards.json fehlt — erst `python pipeline/fetch_cards.py`.")
    slugs = [c["id"] for c in json.loads(CARDS.read_text(encoding="utf-8"))]
    if args.limit:
        slugs = slugs[: args.limit]

    known = {} if args.force else load_existing()
    rows: List[dict] = []
    std_dist: List[int] = []
    alt_cards: List[str] = []
    fails = 0
    print(f"Hashe {len(slugs)} Karten ({len(known)} Printings schon bekannt) …")
    for i, slug in enumerate(slugs):
        try:
            detail = get_json(f"{API}/{slug}")
        except Exception as e:  # noqa: BLE001
            fails += 1
            print(f"  ! {slug}: {e}")
            continue
        time.sleep(DELAY)
        entries: List[dict] = []
        for p in english_printings(detail):
            h = known.get(p["id"], {}).get("h")
            if not h:
                try:
                    h = phash_image_bytes(get_bytes(p["image_url"]))
                except Exception as e:  # noqa: BLE001
                    fails += 1
                    print(f"  ! {slug} / {p['id']}: {e}")
                    continue
                time.sleep(DELAY)
            entries.append({"id": p["id"], "card": slug, "h": h})
        classify_alts(entries, detail.get("printing_id"))
        if entries:
            std_h = entries[0]["h"]
            std_dist.extend(hamming_hex(std_h, e["h"]) for e in entries[1:])
        if any(e["alt"] for e in entries):
            alt_cards.append(slug)
        rows.extend(entries)
        if i and i % 25 == 0:
            print(f"  … {i}/{len(slugs)}")
            write_out(rows + [e for e in known.values() if e["card"] not in {r["card"] for r in rows}])

    # Karten außerhalb von --limit behalten (fortsetzbar, nichts geht verloren).
    done_cards = {r["card"] for r in rows}
    rows.extend(e for e in known.values() if e["card"] not in done_cards and "alt" in e)
    write_out(rows)
    print(f"Fertig: {len(rows)} Printings, {len(alt_cards)} Karten mit Alt-Art (Bild), {fails} Fehler -> {OUT}")
    report(rows, std_dist)

    if ALT_OUT.exists():
        old = set(json.loads(ALT_OUT.read_text(encoding="utf-8")))
        scope = set(slugs)
        by_img = set(alt_cards)
        only_artist = sorted((old & scope) - by_img)
        only_image = sorted(by_img - old)
        if only_artist:
            print(f"Laut Künstler Alt-Art, laut Bild NICHT ({len(only_artist)}): {', '.join(only_artist)}")
        if only_image:
            print(f"Laut Bild Alt-Art, bisher nicht gelistet ({len(only_image)}): {', '.join(only_image)}")
    if args.write_altarts:
        if args.limit:
            print("--write-altarts ignoriert: nur mit vollem Lauf (ohne --limit).")
        else:
            ALT_OUT.write_text(json.dumps(sorted(alt_cards), ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print(f"altArts.json neu geschrieben: {len(alt_cards)} Karten -> {ALT_OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
