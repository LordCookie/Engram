"""Datenpaket für „Daten aktualisieren" in der App bauen und (optional) veröffentlichen.

Das Paket `engram-data.json` enthält das Korpus (`app/src/data/coplay.json`, ingest-v2)
und die Meta-Decks (`app/src/data/metaDecks.json`). Die App lädt es auf Knopfdruck aus dem
GitHub-Release mit dem Tag `data` — so bleiben Korpus und Meta-Decks ohne neue APK frisch.
Kartendaten gehören NICHT hinein (die App holt neue Karten direkt von NetDeck, § 8).

    python pipeline/publish_data.py            # nur bauen -> pipeline/out/engram-data.json
    python pipeline/publish_data.py --publish  # bauen + Release „data" anlegen/aktualisieren

Das Release „data" bleibt EIN Eintrag: das alte Asset wird ersetzt. Das Asset-Label trägt
die Erstellungszeit, daran erkennt die App ohne Download, ob das Paket neuer ist.
Token aus dem Git-Credential-Helper (`git credential fill`), wird nie ausgegeben.
Nur Standardbibliothek.
"""

from __future__ import annotations

import json
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "app" / "src" / "data"
OUT = ROOT / "pipeline" / "out" / "engram-data.json"
REPO = "LordCookie/Engram"
TAG = "data"
ASSET = "engram-data.json"
FORMAT = "engram-data-v1"


def build() -> dict:
    """Paket aus den lokalen Daten; fehlt eine Quelle, bleibt sie draußen."""
    bundle: dict = {
        "format": FORMAT,
        "created": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    }
    coplay = DATA / "coplay.json"
    if coplay.exists():
        bundle["coplay"] = json.loads(coplay.read_text(encoding="utf-8"))
        if bundle["coplay"].get("version") != "ingest-v2":
            raise SystemExit("coplay.json ist kein ingest-v2 — erst pipeline/ingest_decks.py laufen lassen")
    meta = DATA / "metaDecks.json"
    if meta.exists():
        bundle["metaDecks"] = json.loads(meta.read_text(encoding="utf-8"))
    if "coplay" not in bundle and "metaDecks" not in bundle:
        raise SystemExit("Weder coplay.json noch metaDecks.json gefunden — nichts zu veröffentlichen")
    return bundle


def token() -> str:
    out = subprocess.run(
        ["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("kein GitHub-Token im Credential-Helper")


def api(method: str, url: str, tok: str, data: bytes | None = None, ctype: str = "application/json") -> dict | None:
    req = urllib.request.Request(url, data=data, method=method, headers={
        "Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json",
        "Content-Type": ctype, "User-Agent": "engram-publish-data",
    })
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            body = r.read()
            return json.loads(body.decode("utf-8")) if body else None
    except urllib.error.HTTPError as e:
        if e.code == 404 and method == "GET":
            return None
        raise


def publish(payload: bytes, created: str) -> None:
    tok = token()
    base = f"https://api.github.com/repos/{REPO}"
    rel = api("GET", f"{base}/releases/tags/{TAG}", tok)
    if rel is None:
        rel = api("POST", f"{base}/releases", tok, json.dumps({
            "tag_name": TAG, "target_commitish": "main", "prerelease": True,
            "name": "Daten-Update (Korpus + Meta-Decks)",
            "body": "Datenpaket für „Daten aktualisieren“ in der App (Mehr → Updates & Daten). "
                    "Wird laufend ersetzt, keine App-Version. Enthält nur Kartenkürzel und Stückzahlen.",
        }).encode("utf-8"))
    for a in rel.get("assets", []):
        if a.get("name") == ASSET:
            api("DELETE", f"{base}/releases/assets/{a['id']}", tok)
    upload = rel["upload_url"].split("{")[0] + "?" + urllib.parse.urlencode({"name": ASSET, "label": created})
    asset = api("POST", upload, tok, payload, "application/json")
    print(f"Veröffentlicht: {rel['html_url']} ({asset['size']} Bytes, Stand {created})")


def main() -> None:
    bundle = build()
    payload = json.dumps(bundle, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_bytes(payload)
    parts = [k for k in ("coplay", "metaDecks") if k in bundle]
    n = bundle.get("coplay", {}).get("n", "?")
    print(f"{OUT.relative_to(ROOT)}: {len(payload)} Bytes ({', '.join(parts)}; Korpus n={n})")
    if "--publish" in sys.argv:
        publish(payload, bundle["created"])


if __name__ == "__main__":
    main()
