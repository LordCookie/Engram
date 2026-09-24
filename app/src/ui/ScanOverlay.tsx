import { useEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { CardImage } from './CardImage';
import { hapticTap } from '../native/feedback';
import type { Card } from '../domain/types';

/**
 * Vollbild-Scanner (Aufbau aus ScryGlass). Hängt per Portal direkt an <body>, der Rest
 * der App ist solange ausgeblendet (html.scan-open, index.css).
 *   • nativ: das Kamerabild (EngramCamera-Plugin) liegt HINTER der transparenten WebView.
 *   • web:   das <video> der Browser-Kamera liegt als Vollbild (object-fit: cover) hinter
 *            der Oberfläche; der Scanner rechnet den Rahmen in Videokoordinaten um.
 *
 * Feste Leistenhöhen (oben/unten) → der Scan-Rahmen bleibt stehen, auch wenn unten ein
 * Treffer erscheint; sonst stimmte der Ausschnitt nicht mehr. Querformat: die Leisten
 * wandern in eine Seitenleiste rechts, das Kamerafenster bekommt die volle Höhe.
 * Rahmenecken zeigen den Zustand: suchen (pulsiert), sicher (grün), unsicher/unscharf (Akzent).
 */

export interface OverlayMatch {
  card: Card;
  imageSrc?: string;
  alt: boolean;
  score: number;
  method: string;
  /** sicher genug für den Auto-Korb (grüne Ecken) */
  confident: boolean;
}

interface Props {
  mode: 'native' | 'web';
  /** nur web: Video der Browser-Kamera */
  videoRef?: RefObject<HTMLVideoElement>;
  onVideoMeta?: (w: number, h: number) => void;
  reticleRef: RefObject<HTMLDivElement>;
  /** Tipp-zum-Fokussieren; Punkt normiert aufs Fenster (0..1). */
  onTap: (x: number, y: number) => void;
  onClose: () => void;
  blurry: boolean;
  scanning: boolean;
  /** Hinweis statt Treffer (z. B. „Texterkennung lädt…") */
  status?: string | null;
  best?: OverlayMatch;
  onAdd: () => void;
  autoAdd: boolean;
  onToggleAuto: () => void;
  torchAvailable: boolean;
  torchOn: boolean;
  onToggleTorch: () => void;
  zoom: { min: number; max: number; value: number } | null;
  onZoom: (ratio: number) => void;
  basketCount: number;
  toast: string | null;
  /** zählt bei jeder Übernahme hoch → Rahmen blitzt auf */
  flashKey: number;
  /** Rohdaten des letzten Frames (Kalibrier-Protokoll, klein angezeigt) */
  debug: string;
}

const SIDE_W_CSS = '16rem';

/** Querformat = breiter als hoch; folgt Drehung/Größenänderung live. */
function useLandscape(): boolean {
  const get = () => window.innerWidth > window.innerHeight;
  const [landscape, setLandscape] = useState(get);
  useEffect(() => {
    const h = () => setLandscape(get());
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return landscape;
}

function Corners({ color, pulse }: { color: string; pulse: boolean }) {
  const base = `absolute h-6 w-6 ${pulse ? 'reticle-corner' : ''}`;
  const b = `3px solid ${color}`;
  return (
    <>
      <span className={`${base} left-0 top-0 rounded-tl-lg`} style={{ borderLeft: b, borderTop: b }} />
      <span className={`${base} right-0 top-0 rounded-tr-lg`} style={{ borderRight: b, borderTop: b }} />
      <span className={`${base} bottom-0 left-0 rounded-bl-lg`} style={{ borderLeft: b, borderBottom: b }} />
      <span className={`${base} bottom-0 right-0 rounded-br-lg`} style={{ borderRight: b, borderBottom: b }} />
    </>
  );
}

export function ScanOverlay(p: Props) {
  const [fx, setFx] = useState<{ x: number; y: number; k: number } | null>(null);
  const landscape = useLandscape();

  // Browser: Esc schließt den Scanner (Ref, damit der Listener nur einmal hängt).
  const closeRef = useRef(p.onClose);
  closeRef.current = p.onClose;
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeRef.current();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const withTick = (fn: () => void) => () => {
    hapticTap();
    fn();
  };

  function tap(e: React.MouseEvent) {
    hapticTap();
    p.onTap(e.clientX / (window.innerWidth || 1), e.clientY / (window.innerHeight || 1));
    const k = Date.now();
    setFx({ x: e.clientX, y: e.clientY, k });
    window.setTimeout(() => setFx((f) => (f?.k === k ? null : f)), 900);
  }

  const state = p.blurry ? 'unsure' : p.best ? (p.best.confident ? 'sure' : 'unsure') : 'search';
  const cornerColor =
    state === 'sure' ? 'rgb(var(--c-green))' : state === 'unsure' ? 'rgb(var(--c-accent))' : 'rgb(255 255 255 / 0.85)';

  const status = p.blurry
    ? 'Unscharf — ruhig halten, Abstand ändern · Tippen stellt scharf'
    : p.status
      ? p.status
      : p.best
        ? null
        : p.scanning
          ? 'Lese…'
          : 'Karte formatfüllend in den Rahmen · Tippen stellt scharf';

  // Kamerafenster: Hochformat = Höhe minus Leisten (3.5rem + 12rem), Querformat = volle
  // Höhe, Breite minus Seitenleiste. Rahmen im Kartenformat (733 × 1024).
  const availW = landscape ? `(100vw - ${SIDE_W_CSS})` : '100vw';
  const availH = landscape ? '100vh' : '(100vh - 15.5rem)';
  const reticleStyle: React.CSSProperties = {
    width: `min(calc(${availW} * 0.82), calc(${availH} * 0.7158 * 0.9))`,
    aspectRatio: '733 / 1024',
    boxShadow: '0 0 0 9999px rgb(var(--c-bg) / 0.55)',
  };

  const closeBtn = (
    <button onClick={withTick(p.onClose)} aria-label="Scanner schließen" className="rounded px-2 py-1 text-lg text-text">
      ✕
    </button>
  );
  const title = (
    <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted">
      Scanner · {p.mode === 'native' ? 'nativ' : 'Browser'}
    </span>
  );
  const torchBtn = p.torchAvailable && (
    <button
      onClick={withTick(p.onToggleTorch)}
      aria-pressed={p.torchOn}
      aria-label="Licht"
      className={`shrink-0 rounded px-2 py-1.5 text-sm ${p.torchOn ? 'bg-accent text-on-accent' : 'bg-surface text-muted'}`}
    >
      🔦
    </button>
  );
  const autoBtn = (
    <button
      onClick={withTick(p.onToggleAuto)}
      aria-pressed={p.autoAdd}
      className={`shrink-0 rounded px-2 py-1.5 font-mono text-xs ${p.autoAdd ? 'bg-accent text-on-accent' : 'bg-surface text-muted'}`}
    >
      Auto-Korb {p.autoAdd ? 'an' : 'aus'}
    </button>
  );
  const zoomCtl = p.zoom && p.zoom.max > p.zoom.min && (
    <label className="flex items-center gap-2 font-mono text-[11px] text-muted">
      <span className="shrink-0">Zoom</span>
      <input
        type="range"
        min={p.zoom.min}
        max={Math.min(p.zoom.max, 4)}
        step={0.1}
        value={p.zoom.value}
        onChange={(e) => p.onZoom(Number(e.target.value))}
        className="min-w-0 flex-1 accent-accent"
        aria-label="Kamera-Zoom"
      />
      <span className="w-9 shrink-0 text-right">{p.zoom.value.toFixed(1)}×</span>
    </label>
  );
  const toast = p.toast && (
    <div className="truncate rounded bg-card-green/15 px-2 py-0.5 font-mono text-xs text-card-green">
      ✓ {p.toast} in den Korb
    </div>
  );
  const matchInfo = p.best && (
    <>
      <CardImage card={p.best.card} src={p.best.imageSrc} className="h-16 w-[2.9rem]" />
      <div className="min-w-0 flex-1 font-mono">
        <div className="truncate text-text">
          {p.best.card.name}
          {p.best.alt && (
            <span className="ml-1 rounded bg-accent/20 px-1 align-middle text-[10px] text-accent">Alt</span>
          )}
        </div>
        {p.best.card.subtitle && <div className="truncate text-[11px] text-muted">{p.best.card.subtitle}</div>}
        <div className="text-[11px] text-muted">
          {p.best.method} ·{' '}
          {p.best.confident ? (
            <span className="text-card-green">sicher</span>
          ) : (
            <span className="text-accent">unsicher</span>
          )}
        </div>
      </div>
    </>
  );
  const addBtn = (
    <button onClick={p.onAdd} className="shrink-0 rounded bg-accent px-3 py-2 font-mono text-sm text-on-accent">
      ＋ Korb
    </button>
  );
  const noMatch = <p className="pt-3 text-center font-mono text-xs text-muted">Noch kein Treffer.</p>;
  const debugLine = p.debug && <p className="truncate font-mono text-[9px] text-muted/70">{p.debug}</p>;
  const doneBtn = (
    <button onClick={withTick(p.onClose)} className="shrink-0 rounded bg-surface px-3 py-1.5 font-mono text-xs text-text">
      Korb ({p.basketCount}) · Fertig
    </button>
  );

  return createPortal(
    <div className={`fixed inset-0 z-50 text-sm text-text ${p.mode === 'web' ? 'bg-black' : ''}`}>
      {p.mode === 'web' && (
        <video
          ref={p.videoRef}
          playsInline
          muted
          onLoadedMetadata={(e) => p.onVideoMeta?.(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
          className="absolute inset-0 h-full w-full object-cover"
        />
      )}

      {/* Kamerafenster mit Rahmen; außen abgedunkelt (box-shadow-Aussparung). */}
      <div
        className={landscape ? 'absolute inset-y-0 left-0' : 'absolute inset-x-0 bottom-48 top-14'}
        style={landscape ? { right: SIDE_W_CSS } : undefined}
        onClick={tap}
      >
        <div
          ref={p.reticleRef}
          className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg"
          style={reticleStyle}
        >
          <div className="absolute inset-0 rounded-lg border border-white/30" />
          <Corners color={cornerColor} pulse={state === 'search'} />
          {p.flashKey > 0 && <div key={p.flashKey} className="frame-flash" />}
        </div>
        {status && (
          <p className="pointer-events-none absolute inset-x-0 bottom-2 px-4 text-center font-mono text-xs text-white drop-shadow">
            {status}
          </p>
        )}
      </div>

      {fx && (
        <span
          className="pointer-events-none fixed z-10 h-12 w-12 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-accent"
          style={{ left: fx.x, top: fx.y, animation: 'focusPulse 0.7s ease-out forwards' }}
        />
      )}

      {landscape ? (
        <div
          className="absolute inset-y-0 right-0 flex w-64 flex-col gap-2 bg-bg/95 py-2 pl-3"
          style={{ paddingRight: 'max(0.75rem, env(safe-area-inset-right))' }}
        >
          <div className="flex items-center gap-2">
            {closeBtn}
            {title}
            {torchBtn}
          </div>
          <div className="flex">{autoBtn}</div>
          {zoomCtl}
          <div className="min-h-0 flex-1 space-y-1 overflow-y-auto">
            {toast}
            {p.best ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2">{matchInfo}</div>
                <div className="flex">{addBtn}</div>
              </div>
            ) : (
              noMatch
            )}
          </div>
          {debugLine}
          <div className="flex">{doneBtn}</div>
        </div>
      ) : (
        <>
          <div className="absolute inset-x-0 top-0 flex h-14 items-center gap-2 bg-bg/90 px-3">
            {closeBtn}
            {title}
            {torchBtn}
            {autoBtn}
          </div>
          <div className="absolute inset-x-0 bottom-0 flex h-48 flex-col gap-1 bg-bg/95 px-3 py-2">
            {toast}
            <div className="min-h-0 flex-1">
              {p.best ? (
                <div className="flex items-center gap-2">
                  {matchInfo}
                  {addBtn}
                </div>
              ) : (
                noMatch
              )}
            </div>
            {zoomCtl}
            {debugLine}
            <div className="flex items-center justify-end">{doneBtn}</div>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
