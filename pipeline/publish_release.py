"""App-Release bei GitHub anlegen: signierte APK + Prüfsumme (seit v0.5).

Die App aktualisiert sich nur, wenn neben der APK eine `.sha256` liegt (sha256sum-Format)
und die Prüfsumme exakt passt. Dieses Skript lädt beides hoch, damit das nie vergessen wird:

    python pipeline/publish_release.py --notes notes.md            # nur prüfen + Prüfsumme zeigen
    python pipeline/publish_release.py --notes notes.md --publish  # Pre-Release anlegen + hochladen

- Version aus `app/src/version.ts` (Tag `vX.Y.Z`), APK aus `releases/engram.apk`
  (vorher `assembleRelease` + kopieren, siehe CLAUDE.md).
- Assets: `engram-X.Y.Z.apk` + `engram-X.Y.Z.apk.sha256`.
- Release-Text aus `--notes` (Markdown, Deutsch) — die App zeigt ihn nach dem Update als
  „Was ist neu". Titel per `--title`, sonst „vX.Y.Z".
- Als Pre-Release (wie alle engram-Releases; die App sucht selbst das höchste `vX.Y.Z`).
- Token aus dem Git-Credential-Helper (`git credential fill`), wird nie ausgegeben.
Nur Standardbibliothek.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
REPO = "LordCookie/Engram"
APK = ROOT / "releases" / "engram.apk"
OUT = ROOT / "pipeline" / "out"


def app_version() -> str:
    m = re.search(r"APP_VERSION = '(\d+\.\d+\.\d+)'", (ROOT / "app" / "src" / "version.ts").read_text(encoding="utf-8"))
    if not m:
        raise SystemExit("APP_VERSION in app/src/version.ts nicht gefunden")
    return m.group(1)


def sha256_line(data: bytes, name: str) -> str:
    """Format von sha256sum: „<hex>  <datei>"."""
    return f"{hashlib.sha256(data).hexdigest()}  {name}\n"


def token() -> str:
    out = subprocess.run(
        ["git", "credential", "fill"], input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, check=True,
    ).stdout
    for line in out.splitlines():
        if line.startswith("password="):
            return line.split("=", 1)[1]
    raise SystemExit("kein GitHub-Token im Credential-Helper")


def post(url: str, data: bytes, tok: str, ctype: str) -> dict:
    req = urllib.request.Request(url, data=data, method="POST", headers={
        "Authorization": f"Bearer {tok}", "Accept": "application/vnd.github+json",
        "Content-Type": ctype, "User-Agent": "engram-publish-release",
    })
    with urllib.request.urlopen(req, timeout=300) as r:
        return json.loads(r.read().decode("utf-8"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--notes", required=True, help="Markdown-Datei mit dem Release-Text")
    ap.add_argument("--title", help="Release-Titel (Standard: vX.Y.Z)")
    ap.add_argument("--publish", action="store_true", help="wirklich anlegen und hochladen")
    args = ap.parse_args()

    version = app_version()
    tag = f"v{version}"
    name = f"engram-{version}.apk"
    apk = APK.read_bytes()
    sha = sha256_line(apk, name)
    body = Path(args.notes).read_text(encoding="utf-8").strip() + "\n"
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / f"{name}.sha256").write_bytes(sha.encode("utf-8"))  # LF, auch unter Windows
    print(f"{tag}: {name} ({len(apk)} Bytes), SHA-256 {sha.split()[0]}")
    if not args.publish:
        print("Nur geprüft — mit --publish anlegen und hochladen.")
        return

    tok = token()
    rel = post(f"https://api.github.com/repos/{REPO}/releases", json.dumps({
        "tag_name": tag, "target_commitish": "main", "name": args.title or tag,
        "body": body, "prerelease": True,
    }).encode("utf-8"), tok, "application/json")
    upload = rel["upload_url"].split("{")[0]
    a = post(f"{upload}?{urllib.parse.urlencode({'name': name})}", apk, tok, "application/vnd.android.package-archive")
    s = post(f"{upload}?{urllib.parse.urlencode({'name': name + '.sha256'})}", sha.encode("utf-8"), tok, "text/plain")
    print(f"Release: {rel['html_url']}")
    print(f"Assets: {a['name']} ({a['size']} Bytes), {s['name']}")


if __name__ == "__main__":
    main()
