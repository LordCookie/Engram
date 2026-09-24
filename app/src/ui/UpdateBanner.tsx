import { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';
import { isNewer, pickLatestRelease, type ReleaseInfo } from '../domain/semver';

/**
 * Prüft beim Start das neueste GitHub-Release und zeigt einen dezenten Hinweis,
 * wenn eine höhere Version verfügbar ist (APK-Nutzer erfahren sonst nie davon).
 * Nur ein öffentlicher GET auf die GitHub-API — keine Nutzerdaten. Offline/
 * Rate-Limit → still kein Hinweis. Schließbar (kommt beim nächsten Start ggf. wieder).
 */
const REPO = 'LordCookie/Engram';

export function UpdateBanner() {
  const [info, setInfo] = useState<{ tag: string; url: string } | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        // Liste statt `releases/latest`: die APKs erscheinen als Pre-Release, und
        // `latest` überspringt Pre-Releases (→ 404, der Hinweis kam nie).
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases?per_page=10`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const latest = pickLatestRelease((await res.json()) as ReleaseInfo[]);
        if (alive && latest && isNewer(latest.tag, APP_VERSION)) setInfo(latest);
      } catch {
        /* offline / rate-limited — kein Hinweis */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!info || dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-md border border-accent/40 bg-accent/10 px-3 py-2 font-mono text-sm">
      <span className="text-accent">Neue Version {info.tag} verfügbar</span>
      <a
        href={info.url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-accent"
      >
        Zum Download
      </a>
      <button
        onClick={() => setDismissed(true)}
        aria-label="Hinweis schließen"
        className="ml-auto rounded px-2 text-muted hover:text-text"
      >
        ✕
      </button>
    </div>
  );
}
