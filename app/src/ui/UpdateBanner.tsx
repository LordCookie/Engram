import { useEffect, useState } from 'react';
import { APP_VERSION } from '../version';
import { isNewer } from '../domain/semver';

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
        const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
          headers: { Accept: 'application/vnd.github+json' },
        });
        if (!res.ok) return;
        const j = (await res.json()) as { tag_name?: string; html_url?: string };
        if (alive && j.tag_name && j.html_url && isNewer(j.tag_name, APP_VERSION)) {
          setInfo({ tag: j.tag_name, url: j.html_url });
        }
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
