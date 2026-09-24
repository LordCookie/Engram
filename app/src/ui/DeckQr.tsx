import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { PluginListenerHandle } from '@capacitor/core';
import { encodeDeckQr, isDeckQr, type QrDeck } from '../domain/deckQr';
import { EngramCamera, hasNativeCamera, reticleOf } from '../native/engramCamera';
import { feedbackAdded } from '../native/feedback';

/**
 * Deck per QR-Code teilen (offline, Gerät zu Gerät):
 *   • DeckQrDialog  — zeigt das aktuelle Deck als QR-Code (schwarz auf weiß).
 *   • QrScanOverlay — liest einen Deck-QR mit der Kamera (App: native Kamera im
 *     QR-Modus, Browser: Webcam) und gibt den Text zurück; dekodiert wird mit jsQR.
 * Beide Bibliotheken werden erst beim Öffnen geladen (eigene Chunks).
 */

/** QR-Code eines Decks als Vollbild-Dialog. */
export function DeckQrDialog({ deck, onClose }: { deck: QrDeck; onClose: () => void }) {
  const [cells, setCells] = useState<{ n: number; path: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const { default: qrcode } = await import('qrcode-generator');
        // Größe automatisch; Fehlerkorrektur L (~7 %) hält den Code grob (Version ~14 statt
        // ~17 bei M) — Bildschirm → Kamera ist sauber genug, gröbere Module lesen sich besser.
        const qr = qrcode(0, 'L');
        qr.addData(encodeDeckQr(deck), 'Byte');
        qr.make();
        const n = qr.getModuleCount();
        let path = '';
        for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) path += `M${c} ${r}h1v1h-1z`;
        if (alive) setCells({ n, path });
      } catch {
        if (alive) setError('Deck ist zu groß für einen QR-Code.');
      }
    })();
    return () => {
      alive = false;
    };
  }, [deck]);

  const total = deck.cards.reduce((s, c) => s + c.count, 0);
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-2xl bg-surface p-4 text-center" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 font-mono text-lg">{deck.name || 'Deck'}</div>
        <div className="mb-3 font-mono text-xs text-muted">
          {deck.legendIds.length} Legends · {total} Karten
        </div>
        <div className="mx-auto aspect-square w-full max-w-[20rem] rounded-lg bg-white p-1">
          {cells ? (
            // Ruhezone: 4 Module weißer Rand (QR-Norm).
            <svg viewBox={`-4 -4 ${cells.n + 8} ${cells.n + 8}`} className="h-full w-full" shapeRendering="crispEdges">
              <rect x={-4} y={-4} width={cells.n + 8} height={cells.n + 8} fill="#fff" />
              <path d={cells.path} fill="#000" />
            </svg>
          ) : (
            <div className="flex h-full items-center justify-center font-mono text-xs text-black/60">
              {error ?? 'Erzeuge QR-Code…'}
            </div>
          )}
        </div>
        <p className="mt-3 text-xs text-muted">
          Auf dem anderen Gerät: engram → Deck → „QR-Code scannen". Funktioniert ohne Internet.
        </p>
        <button onClick={onClose} className="mt-3 rounded-md border border-white/10 px-4 py-1.5 font-mono text-sm hover:border-accent">
          Schließen
        </button>
      </div>
    </div>,
    document.body,
  );
}

type Decoder = (data: Uint8ClampedArray, w: number, h: number) => string | null;

async function loadDecoder(): Promise<Decoder> {
  const { default: jsQR } = await import('jsqr');
  // engram zeigt Deck-QRs immer schwarz auf weiß → keine Invertierung nötig (schneller).
  return (data, w, h) => jsQR(data, w, h, { inversionAttempts: 'dontInvert' })?.data ?? null;
}

function decodeImage(img: CanvasImageSource, w: number, h: number, decode: Decoder): string | null {
  return decodeRegion(img, 0, 0, w, h, w, h, decode);
}

/** Ausschnitt (sx, sy, sw, sh) des Bildes in Zielgröße (w × h) dekodieren. */
function decodeRegion(
  img: CanvasImageSource,
  sx: number,
  sy: number,
  sw: number,
  sh: number,
  w: number,
  h: number,
  decode: Decoder,
): string | null {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h);
  return decode(ctx.getImageData(0, 0, w, h).data, w, h);
}

/**
 * Browser: Scan-Rahmen (Bildschirm) → Ausschnitt im Videobild (object-fit: cover),
 * etwas großzügiger als der Rahmen, damit ein knapp gehaltener Code ganz drin ist.
 */
function reticleInVideo(video: HTMLVideoElement, el: HTMLElement): { sx: number; sy: number; s: number } | null {
  const vw = video.videoWidth;
  const vh = video.videoHeight;
  const vr = video.getBoundingClientRect();
  const rr = el.getBoundingClientRect();
  if (!vw || !vh || !vr.width || !vr.height) return null;
  const scale = Math.max(vr.width / vw, vr.height / vh);
  const offX = (vw * scale - vr.width) / 2;
  const offY = (vh * scale - vr.height) / 2;
  const pad = rr.width * 0.15;
  const s = Math.min(vw, vh, (rr.width + 2 * pad) / scale);
  const cx = (rr.left + rr.width / 2 - vr.left + offX) / scale;
  const cy = (rr.top + rr.height / 2 - vr.top + offY) / scale;
  return {
    sx: Math.min(Math.max(0, cx - s / 2), vw - s),
    sy: Math.min(Math.max(0, cy - s / 2), vh - s),
    s,
  };
}

/**
 * Vollbild-QR-Scanner. `onResult` bekommt jeden gelesenen engram-Deck-QR; andere
 * QR-Codes werden ignoriert (kurzer Hinweis).
 */
export function QrScanOverlay({ onResult, onClose }: { onResult: (text: string) => void; onClose: () => void }) {
  const native = hasNativeCamera();
  const reticleRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [hint, setHint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const accept = (text: string | null) => {
    if (!text || doneRef.current) return;
    if (!isDeckQr(text)) {
      setHint('Kein engram-Deck-QR — bitte einen Deck-Code aus engram scannen.');
      return;
    }
    doneRef.current = true;
    feedbackAdded();
    onResult(text);
  };
  const acceptRef = useRef(accept);
  acceptRef.current = accept;

  useEffect(() => {
    let alive = true;
    let listener: PluginListenerHandle | null = null;
    let stream: MediaStream | null = null;
    let timer = 0;
    let busy = false;
    document.documentElement.classList.add('scan-open');

    void (async () => {
      try {
        const decode = await loadDecoder();
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));
        if (!alive) return;
        if (native) {
          const el = reticleRef.current;
          const rect = el ? reticleOf(el) : { left: 0.15, top: 0.25, width: 0.7, height: 0.4 };
          listener = await EngramCamera.addListener('frame', (f) => {
            if (!f.qr || busy || doneRef.current) return;
            busy = true;
            const img = new Image();
            img.onload = () => {
              acceptRef.current(decodeImage(img, img.naturalWidth, img.naturalHeight, decode));
              busy = false;
            };
            img.onerror = () => (busy = false);
            img.src = `data:image/jpeg;base64,${f.qr}`;
          });
          await EngramCamera.start({ ...rect, mode: 'qr' });
        } else {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'environment', width: { ideal: 1280 }, height: { ideal: 720 } },
            audio: false,
          });
          if (!alive) return;
          const video = videoRef.current;
          if (!video) return;
          video.srcObject = stream;
          await video.play();
          let tick = 0;
          timer = window.setInterval(() => {
            if (busy || doneRef.current || !video.videoWidth) return;
            busy = true;
            tick++;
            const r = reticleRef.current && reticleInVideo(video, reticleRef.current);
            if (r && tick % 2 === 1) {
              // Rahmen-Ausschnitt in (fast) voller Auflösung — scharfe Module für jsQR.
              const size = Math.round(Math.min(r.s, 900));
              acceptRef.current(decodeRegion(video, r.sx, r.sy, r.s, r.s, size, size, decode));
            } else {
              // Abwechselnd das ganze Bild (max. 1280 px), falls der Code nicht im Rahmen liegt.
              const s = Math.min(1, 1280 / Math.max(video.videoWidth, video.videoHeight));
              acceptRef.current(
                decodeImage(video, Math.round(video.videoWidth * s), Math.round(video.videoHeight * s), decode),
              );
            }
            busy = false;
          }, 300);
        }
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Kamera nicht verfügbar');
      }
    })();

    return () => {
      alive = false;
      document.documentElement.classList.remove('scan-open');
      window.clearInterval(timer);
      stream?.getTracks().forEach((t) => t.stop());
      if (native) {
        void listener?.remove();
        void EngramCamera.stop().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return createPortal(
    <div className={`fixed inset-0 z-50 text-text ${native ? '' : 'bg-black'}`}>
      {!native && <video ref={videoRef} playsInline muted className="absolute inset-0 h-full w-full object-cover" />}
      <div className="absolute inset-x-0 top-0 flex h-14 items-center gap-2 bg-bg/90 px-3">
        <button onClick={onClose} aria-label="QR-Scanner schließen" className="rounded px-2 py-1 text-lg">
          ✕
        </button>
        <span className="font-mono text-xs text-muted">Deck-QR scannen</span>
      </div>
      <div className="absolute inset-x-0 bottom-24 top-14 flex items-center justify-center">
        <div
          ref={reticleRef}
          className="aspect-square w-[min(70vw,55vh)] rounded-xl border-2 border-accent"
          style={{ boxShadow: '0 0 0 9999px rgb(var(--c-bg) / 0.55)' }}
        />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-24 bg-bg/95 px-4 py-3 text-center font-mono text-xs">
        {error ? (
          <span className="text-card-red">Kamera nicht verfügbar: {error}</span>
        ) : (
          <span className={hint ? 'text-accent' : 'text-muted'}>
            {hint ?? 'QR-Code eines engram-Decks in den Rahmen halten.'}
          </span>
        )}
      </div>
    </div>,
    document.body,
  );
}
