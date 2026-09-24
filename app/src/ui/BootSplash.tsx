import { useEffect, useMemo, useState } from 'react';
import { EYES_PATH, LOGO_VIEWBOX, PAD_PATH, SKULL_PATH, TRACE_PATHS, TRACE_WIDTH } from '../domain/logoShape';

/**
 * Boot-Animation beim App-Start: die Lötflächen erscheinen, „Strom" fließt die
 * Leiterbahnen hinauf in den Schädel, der baut sich auf, die Augen blitzen — dann
 * blendet alles aus. ~1,8 s, Antippen überspringt. In Akzentfarbe (folgt dem Theme).
 * Bei „Bewegung reduzieren" (Systemeinstellung) entfällt sie ganz.
 */

// Mitte zuerst, dann nach außen — sieht aus wie ein Stromstoß von unten.
const TRACE_DELAYS = [0.34, 0.24, 0.14, 0.24, 0.34];
const LEAVE_AT_MS = 1450;
const DONE_AT_MS = 1800;

export function BootSplash({ onDone }: { onDone: () => void }) {
  const reduce = useMemo(
    () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches,
    [],
  );
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (reduce) {
      onDone();
      return;
    }
    const t1 = window.setTimeout(() => setLeaving(true), LEAVE_AT_MS);
    const t2 = window.setTimeout(onDone, DONE_AT_MS);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [onDone, reduce]);

  if (reduce) return null;

  return (
    <div
      onClick={onDone}
      role="presentation"
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-bg"
      style={leaving ? { animation: 'bootOut 0.35s ease-in forwards' } : undefined}
    >
      <svg viewBox={LOGO_VIEWBOX} className="h-40 w-28 text-accent" aria-hidden="true">
        <path
          d={PAD_PATH}
          fill="currentColor"
          style={{ opacity: 0, animation: 'bootFade 0.25s ease-out 0.05s forwards' }}
        />
        {TRACE_PATHS.map((d, i) => (
          <path
            key={d}
            d={d}
            pathLength={1}
            fill="none"
            stroke="currentColor"
            strokeWidth={TRACE_WIDTH}
            strokeLinejoin="miter"
            strokeDasharray={1}
            strokeDashoffset={1}
            style={{ animation: `bootDraw 0.5s ease-in ${TRACE_DELAYS[i]}s forwards` }}
          />
        ))}
        <path
          d={SKULL_PATH}
          fill="currentColor"
          fillRule="evenodd"
          style={{
            opacity: 0,
            transformBox: 'fill-box',
            transformOrigin: 'center bottom',
            animation: 'bootSkull 0.35s ease-out 0.8s forwards',
          }}
        />
        <path
          d={EYES_PATH}
          fill="rgb(var(--c-text))"
          style={{
            opacity: 0,
            filter: 'drop-shadow(0 0 6px rgb(var(--c-accent)))',
            animation: 'bootFlash 0.55s ease-out 1.08s forwards',
          }}
        />
      </svg>
      <div
        className="mt-5 font-mono text-2xl tracking-tight text-accent"
        style={{ opacity: 0, animation: 'bootFade 0.4s ease-out 0.95s forwards' }}
      >
        engram
      </div>
    </div>
  );
}
