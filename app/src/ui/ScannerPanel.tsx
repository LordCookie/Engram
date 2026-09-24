import { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginListenerHandle } from '@capacitor/core';
import type { Scheduler } from 'tesseract.js';
import { catalog, cardIndex, altPrintingId, baseCardId, hasAltArt, isAltPrintingId } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { loadHashIndex, nearestByHashMulti, searchHashes, type HashIndex, type HashMatch } from '../data/imageHash';
import { addToCollection } from '../db/db';
import {
  AUTO_BASKET_CHANGE_FRAMES,
  AUTO_BASKET_START,
  afterAutoAdd,
  mayAutoAdd,
  observeFrame,
  type AutoBasketState,
} from '../domain/autoBasket';
import { isAmbiguous, matchTextLines } from '../domain/cardText';
import { laplacianVariance } from '../domain/focus';
import { matchCardName, type NameCandidate, type NameCard } from '../domain/nameMatch';
import { ocrEffectiveScore } from '../domain/ocrQuality';
import { FUSE_DEFAULTS, fuseScan, methodLabel } from '../domain/scanFuse';
import { searchCards } from '../domain/search';
import { EngramCamera, hasNativeCamera, reticleOf, type NativeFrame } from '../native/engramCamera';
import { feedbackAdded, initFeedbackPrefs } from '../native/feedback';
import { CardImage } from './CardImage';
import { ScanOverlay } from './ScanOverlay';
import type { Card, Color } from '../domain/types';

/**
 * Kartenscanner (PLAN.md § 6; Aufbau aus ScryGlass, scanner-v2-plan.md). Ein Knopf öffnet
 * den Vollbild-Scanner (`ScanOverlay`), der die Karte an BILD und NAME erkennt:
 *   • Bild: pHash-Index aller Printings (`data/imageHash.ts`) mit Ausschnitt-Suche gegen
 *     Versatz — erkennt auch Alt-Arts.
 *   • Name/Nummer: in der Android-App ML Kit auf dem Gerät (EngramCamera-Plugin, CameraX),
 *     im Browser Tesseract (Worker-Pool, Webcam-Video im Overlay).
 *   • Fusion (`scanFuse`) + Auto-Korb mit Kartenwechsel-Erkennung (`autoBasket`).
 * Alles lokal; keine Bilder, keine Nutzerdaten verlassen das Gerät.
 */

// Bildwechsel-Erkennung (Browser): winziges Graustufen-Thumbnail des Karten-Ausschnitts.
const THUMB_W = 24;
const THUMB_H = 34;
// Mittlere abs. Grauwert-Differenz (0..255): darunter gilt der Frame als „unverändert"
// (dieselbe Karte liegt noch da) → kein erneuter Scan.
const FRAME_SAME = 6;
// Poll-Intervall der Browser-Kamera; Untergrenze = OCR-Zeit (busy-Schutz).
const WEB_POLL_MS = 300;
// Zeitlicher Konsens (nativ, ~4 Bilder/s): so viele Bilder hintereinander dieselbe Karte,
// bevor automatisch übernommen wird (Kreuz-Bestätigung Bild + Name darf sofort).
const AUTO_CONSENSUS = 2;
// Schärfe-Gate im nativen Plugin (Laplace-Varianz, 128 px breit). Gemessen an
// Cyberpunk-Karten: scharf ≈ 2000, stark verwackelt noch ≈ 150 → 30 verwirft nur
// wirklich unbrauchbare Bilder. 0 = aus.
const NATIVE_SHARP_MIN = 30;
// Scan-Protokoll (Kalibrierung): so viele Einträge im Speicher.
const PROTOCOL_MAX = 300;

/** Läuft die App nativ (Capacitor)? Dann anderer Kamera-Hinweis (kein „HTTPS öffnen"). */
const isNativeApp =
  typeof window !== 'undefined' &&
  !!(window as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor?.isNativePlatform?.();

const colorDot: Record<Color, string> = {
  RED: 'bg-card-red',
  GREEN: 'bg-card-green',
  BLUE: 'bg-card-blue',
  YELLOW: 'bg-card-yellow',
};

const nameCards: NameCard[] = catalog.map((c) => ({
  id: c.id,
  name: c.name,
  subtitle: c.subtitle,
  collectorNumber: c.collectorNumber,
}));

/** Korb-/Sammlungs-Schlüssel: Alt-Art nur, wenn die Karte eine Alt-Printing hat. */
const printingKey = (cardId: string, alt: boolean): string =>
  alt && hasAltArt(cardId) ? altPrintingId(cardId) : cardId;

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(null))));

/** Ausschnitt der Karte im Videobild (Pixel). */
interface Region {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
}

/** Otsu-Schwellwert aus einem 256-Bin-Histogramm (globale Binarisierung). */
function otsuThreshold(hist: number[], total: number): number {
  let sumAll = 0;
  for (let t = 0; t < 256; t++) sumAll += t * hist[t];
  let sumB = 0, wB = 0, maxVar = -1, thr = 127;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (wB === 0) continue;
    const wF = total - wB;
    if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sumAll - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > maxVar) { maxVar = between; thr = t; }
  }
  return thr;
}

/** Globale Otsu-Binarisierung in-place (Graustufe liegt in d[i]). */
function binarizeOtsu(d: Uint8ClampedArray, total: number): void {
  const hist = new Array<number>(256).fill(0);
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  const thr = otsuThreshold(hist, total);
  for (let i = 0; i < d.length; i += 4) {
    const bw = d[i] >= thr ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = bw;
  }
}

/**
 * Adaptive (lokale) Binarisierung nach Bradley (Integralbild). Schwellt jeden Pixel
 * gegen seinen lokalen Mittelwert — robust gegen **Glanz/Reflexe (Foils)** und
 * ungleiches Licht, wo ein globaler Schwellwert Teile der Schrift „wegfrisst".
 */
function binarizeAdaptive(d: Uint8ClampedArray, w: number, h: number): void {
  const n = w * h;
  const gray = new Float64Array(n);
  for (let p = 0, i = 0; p < n; p++, i += 4) gray[p] = d[i];
  const W = w + 1;
  const integ = new Float64Array(W * (h + 1));
  for (let y = 0; y < h; y++) {
    let rowSum = 0;
    for (let x = 0; x < w; x++) {
      rowSum += gray[y * w + x];
      integ[(y + 1) * W + (x + 1)] = integ[y * W + (x + 1)] + rowSum;
    }
  }
  const S = Math.max(8, Math.floor(Math.min(w, h) / 3)); // Fenstergröße
  const half = S >> 1;
  const T = 0.15; // Pixel gilt als „dunkel", wenn < lokaler Mittel × (1−T)
  for (let y = 0; y < h; y++) {
    const y1 = Math.max(0, y - half), y2 = Math.min(h - 1, y + half);
    for (let x = 0; x < w; x++) {
      const x1 = Math.max(0, x - half), x2 = Math.min(w - 1, x + half);
      const count = (x2 - x1 + 1) * (y2 - y1 + 1);
      const sum =
        integ[(y2 + 1) * W + (x2 + 1)] - integ[y1 * W + (x2 + 1)] - integ[(y2 + 1) * W + x1] + integ[y1 * W + x1];
      const p = y * w + x, i = p * 4;
      const bw = gray[p] * count <= sum * (1 - T) ? 0 : 255;
      d[i] = d[i + 1] = d[i + 2] = bw;
    }
  }
}

/**
 * Ein (Teil-)Ausschnitt des Karten-Rahmens, hochskaliert + OCR-vorbereitet (Browser/
 * Tesseract): Graustufe → Kontrast strecken (macht stilisierte Schrift knackig) → bei
 * dunklem Grund invertieren → binarisieren. `sub` = Teilrechteck in Bruchteilen [x, y, w, h].
 */
function regionCanvas(
  video: HTMLVideoElement,
  region: Region,
  sub: [number, number, number, number],
  targetW: number,
  binarize: 'otsu' | 'adaptive',
): HTMLCanvasElement | null {
  const sx = region.sx + sub[0] * region.sw;
  const sy = region.sy + sub[1] * region.sh;
  const sw = sub[2] * region.sw;
  const sh = sub[3] * region.sh;
  const targetH = Math.max(1, Math.round((targetW * sh) / sw));
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(video, sx, sy, sw, sh, 0, 0, targetW, targetH);

  const img = ctx.getImageData(0, 0, targetW, targetH);
  const d = img.data;
  const n = d.length / 4;
  const hist = new Array<number>(256).fill(0);
  let sum = 0;
  for (let i = 0; i < d.length; i += 4) {
    const g = Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]);
    d[i] = g; // Graustufe vorläufig in R zwischenspeichern
    hist[g]++;
    sum += g;
  }
  // Perzentil-Grenzen: die hellsten/dunkelsten 2 % (Glanz, harte Schatten) ignorieren.
  const cut = n * 0.02;
  let acc = 0;
  let lo = 0;
  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (acc >= cut) {
      lo = v;
      break;
    }
  }
  acc = 0;
  let hi = 255;
  for (let v = 255; v >= 0; v--) {
    acc += hist[v];
    if (acc >= cut) {
      hi = v;
      break;
    }
  }
  const range = Math.max(1, hi - lo);
  const invert = sum / n < 128; // dunkler Grund → invertieren (dunkle Schrift auf hell)
  for (let i = 0; i < d.length; i += 4) {
    let v = ((d[i] - lo) / range) * 255;
    v = v < 0 ? 0 : v > 255 ? 255 : v;
    if (invert) v = 255 - v;
    d[i] = v | 0;
  }
  if (binarize === 'adaptive') binarizeAdaptive(d, targetW, targetH);
  else binarizeOtsu(d, n);
  ctx.putImageData(img, 0, 0);
  return canvas;
}

/** Schärfemaß (Laplace-Varianz) eines Ausschnitts auf 128 px Breite — wie das native Plugin. */
function sharpnessOf(src: CanvasImageSource, r: Region): number {
  const w = 128;
  const h = Math.max(3, Math.round((w * r.sh) / r.sw));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return 0;
  ctx.drawImage(src, r.sx, r.sy, r.sw, r.sh, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const gray = new Uint8Array(w * h);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) gray[j] = (0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]) | 0;
  return laplacianVariance(gray, w, h);
}

function decodeJpeg(b64: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Ausschnitt nicht lesbar'));
    img.src = `data:image/jpeg;base64,${b64}`;
  });
}

/** Mittlere absolute Grauwert-Differenz zweier gleich großer Thumbnails (0..255). */
function thumbDiff(a: Uint8Array, b: Uint8Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}

interface ScanMatch {
  card: Card;
  score: number;
  /** Bild zeigt den Alt-Art-Druck. */
  alt: boolean;
  /** wie erkannt (Bild / Name / Bild + Name / Nummer) */
  method: string;
  /** sicher genug für den Auto-Korb */
  confident: boolean;
}

/** Eingabe der gemeinsamen Auswertung (Browser: Tesseract, nativ: ML Kit). */
interface EvalInput {
  native: boolean;
  cands: NameCandidate[];
  ambiguous: boolean;
  /** Sicherheit der Namenslesung 0..100. */
  ocrConf: number;
  hash: HashMatch | null;
  sharpness: number;
}

/** Ein Eintrag im Scan-Protokoll (Kalibrierung der Schwellen). */
type ProtocolEntry =
  | {
      k: 'frame';
      t: number;
      src: 'web' | 'nativ';
      name?: string;
      nameScore?: number;
      /** Sammlernummer im Text gefunden */
      nr?: boolean;
      conf?: number;
      bild?: string;
      dist?: number;
      margin?: number;
      alt?: boolean;
      altMargin?: number;
      sharp?: number;
      method: string;
      pick?: string;
      sicher: boolean;
    }
  | { k: 'korb'; t: number; key: string; via: 'auto' | 'manuell' }
  | { k: 'korrektur'; t: number; von: string; zu: string };

export function ScannerPanel() {
  const images = useCardImages();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const busyRef = useRef(false);
  const [workerReady, setWorkerReady] = useState(false);

  // Kameraweg: nativ (App mit Plugin) oder Browser (getUserMedia + Tesseract).
  const nativeAvailable = useMemo(() => hasNativeCamera(), []);
  const [forceWeb, setForceWeb] = useState(false); // native Kamera fehlgeschlagen → Browser-Kamera
  const useNative = nativeAvailable && !forceWeb;
  const needOcr = !useNative; // Tesseract nur für die Browser-Kamera

  // Vollbild-Scanner offen? (und mit welchem Kameraweg)
  const [open, setOpen] = useState<'native' | 'web' | null>(null);
  const openRef = useRef<'native' | 'web' | null>(null);
  const [camError, setCamError] = useState<string | null>(null);
  const [vdim, setVdim] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState<{ min: number; max: number; value: number } | null>(null);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [best, setBest] = useState<ScanMatch | null>(null);
  const [blurry, setBlurry] = useState(false);
  const [debug, setDebug] = useState('');
  const [autoAdd, setAutoAdd] = useState(false); // sicheren Treffer automatisch in den Korb
  const [autoToast, setAutoToast] = useState<string | null>(null);
  const autoToastTimer = useRef<number>();
  const [flashKey, setFlashKey] = useState(0);

  // Scan-Korb: gesammelte Printings (`<cardId>` oder `<cardId>#alt`), gebündelt übernehmen.
  const [basket, setBasket] = useState<{ printingId: string; count: number }[]>([]);
  const [correctingId, setCorrectingId] = useState<string | null>(null);
  const [correctQuery, setCorrectQuery] = useState('');
  const [added, setAdded] = useState(0);
  const [manualQuery, setManualQuery] = useState('');
  const manualResults = useMemo(
    () => (manualQuery.trim() ? searchCards(catalog, manualQuery, { limit: 6 }) : []),
    [manualQuery],
  );

  const hashIndexRef = useRef<HashIndex | null>(null);
  const [hashCount, setHashCount] = useState<number | null>(null);
  const autoBasketRef = useRef<AutoBasketState>(AUTO_BASKET_START);
  const consensusRef = useRef<{ cardId: string; count: number }>({ cardId: '', count: 0 });
  const protocolRef = useRef<ProtocolEntry[]>([]);
  const [protocolCount, setProtocolCount] = useState(0);
  const [protocolMsg, setProtocolMsg] = useState<string | null>(null);
  const nativeListenerRef = useRef<PluginListenerHandle | null>(null);
  const reticleElRef = useRef<HTMLDivElement>(null);
  // Frame-Handler über eine Ref: das einmal registrierte Event sieht so immer den
  // aktuellen Zustand (Auto-Korb an/aus usw.).
  const onFrameRef = useRef<(f: NativeFrame) => void>(() => {});
  const lastThumbRef = useRef<Uint8Array | null>(null);
  const thumbCanvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    void initFeedbackPrefs();
  }, []);

  // Bild-Hash-Index (eigener Chunk) laden, sobald der Scanner-Tab offen ist.
  useEffect(() => {
    let alive = true;
    void loadHashIndex().then((idx) => {
      if (!alive) return;
      hashIndexRef.current = idx;
      setHashCount(idx.count);
    });
    return () => {
      alive = false;
    };
  }, []);

  // OCR-Worker-POOL (nur Browser-Kamera) — tesseract per dynamischem Import (eigener
  // Chunk, nicht im Haupt-Bundle). Mehrere Worker = Namens-Pässe parallel über die Kerne.
  useEffect(() => {
    if (!needOcr) return;
    let alive = true;
    void (async () => {
      const { createWorker, createScheduler, PSM } = await import('tesseract.js');
      if (!alive) return;
      const scheduler = createScheduler();
      schedulerRef.current = scheduler;
      const poolSize = Math.min(3, Math.max(1, navigator.hardwareConcurrency || 2));
      for (let i = 0; i < poolSize; i++) {
        try {
          const worker = await createWorker('eng');
          await worker.setParameters({
            tessedit_char_whitelist: 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 ',
            // Sparse-Text: irgendwo im Bild Text finden (Name muss nicht in einer Zeile stehen).
            tessedit_pageseg_mode: PSM.SPARSE_TEXT,
          });
          if (!alive) {
            await worker.terminate();
            return;
          }
          scheduler.addWorker(worker);
          if (i === 0) setWorkerReady(true); // ab dem ersten Worker einsatzbereit
        } catch {
          // Modell nicht ladbar (offline beim ersten Mal) — Hinweis erscheint im Scanner.
          if (i === 0) break;
        }
      }
    })();
    return () => {
      alive = false;
      setWorkerReady(false);
      void schedulerRef.current?.terminate();
      schedulerRef.current = null;
    };
  }, [needOcr]);

  // Beim Verlassen des Scanner-Tabs Kamera sicher beenden.
  useEffect(
    () => () => {
      document.documentElement.classList.remove('scan-open');
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (openRef.current === 'native') {
        void nativeListenerRef.current?.remove();
        void EngramCamera.stop().catch(() => {});
      }
    },
    [],
  );

  // Nativ: Fenstergröße/Drehung ändert die Rahmenlage → dem nativen Ausschnitt mitteilen.
  // Erst messen, wenn das (evtl. auf Querformat umgebaute) Overlay gezeichnet ist.
  useEffect(() => {
    if (open !== 'native') return;
    let id = 0;
    const h = () => {
      cancelAnimationFrame(id);
      id = requestAnimationFrame(() => {
        id = requestAnimationFrame(() => sendReticle());
      });
    };
    h();
    window.addEventListener('resize', h);
    const el = reticleElRef.current;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(h) : null;
    if (el) ro?.observe(el);
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('resize', h);
      ro?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Browser: Live-Erkennung, solange der Scanner offen ist. Gelesen wird nur bei
  // BILDWECHSEL (Thumbnail-Vergleich) — liegende Karten kosten keine OCR.
  useEffect(() => {
    if (open !== 'web' || !workerReady || !vdim) return;
    const id = window.setInterval(() => void scanWeb(), WEB_POLL_MS);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, workerReady, vdim, autoAdd]);

  /**
   * Browser: Scan-Rahmen (Bildschirm) → Ausschnitt im Videobild. Das Video füllt den
   * Bildschirm mit object-fit: cover, also skaliert und mittig beschnitten.
   */
  function cropRegion(): Region | null {
    const video = videoRef.current;
    const el = reticleElRef.current;
    if (!video || !el || !vdim) return null;
    const vr = video.getBoundingClientRect();
    const rr = el.getBoundingClientRect();
    if (vr.width === 0 || vr.height === 0) return null;
    const scale = Math.max(vr.width / vdim.w, vr.height / vdim.h);
    const offX = (vdim.w * scale - vr.width) / 2;
    const offY = (vdim.h * scale - vr.height) / 2;
    const sx = Math.max(0, (rr.left - vr.left + offX) / scale);
    const sy = Math.max(0, (rr.top - vr.top + offY) / scale);
    const sw = Math.min(vdim.w - sx, rr.width / scale);
    const sh = Math.min(vdim.h - sy, rr.height / scale);
    return sw > 8 && sh > 8 ? { sx, sy, sw, sh } : null;
  }

  /** Browser: Punkt normiert aufs Fenster → normiert aufs Videobild (für pointsOfInterest). */
  function videoPoint(nx: number, ny: number): { x: number; y: number } | null {
    const video = videoRef.current;
    if (!video || !vdim) return null;
    const vr = video.getBoundingClientRect();
    const scale = Math.max(vr.width / vdim.w, vr.height / vdim.h);
    const offX = (vdim.w * scale - vr.width) / 2;
    const offY = (vdim.h * scale - vr.height) / 2;
    const clamp = (v: number) => Math.min(1, Math.max(0, v));
    return {
      x: clamp((nx * window.innerWidth - vr.left + offX) / scale / vdim.w),
      y: clamp((ny * window.innerHeight - vr.top + offY) / scale / vdim.h),
    };
  }

  /** Winziges Graustufen-Thumbnail des Karten-Ausschnitts (für Bildwechsel-Erkennung). */
  function frameThumb(video: HTMLVideoElement, r: Region): Uint8Array | null {
    let cv = thumbCanvasRef.current;
    if (!cv) {
      cv = document.createElement('canvas');
      cv.width = THUMB_W;
      cv.height = THUMB_H;
      thumbCanvasRef.current = cv;
    }
    const ctx = cv.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(video, r.sx, r.sy, r.sw, r.sh, 0, 0, THUMB_W, THUMB_H);
    const d = ctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
    const out = new Uint8Array(THUMB_W * THUMB_H);
    for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    return out;
  }

  function showAutoToast(name: string) {
    setAutoToast(name);
    window.clearTimeout(autoToastTimer.current);
    autoToastTimer.current = window.setTimeout(() => setAutoToast(null), 1500);
  }

  function logProtocol(e: ProtocolEntry) {
    const p = protocolRef.current;
    p.push(e);
    if (p.length > PROTOCOL_MAX) p.splice(0, p.length - PROTOCOL_MAX);
    setProtocolCount(p.length);
  }

  /** Gemeinsame Auswertung: Name/Nummer/Bild fusionieren → anzeigen → Konsens → Auto-Korb. */
  function evaluate(inp: EvalInput) {
    const ocrBest = inp.cands[0];
    // Sammlernummer gelesen: eigenes Signal („druck"). Der Name geht OHNE Nummern-Bonus
    // in die Fusion — sonst könnte eine zufällig passende Zahl aus dem OCR-Rauschen einen
    // schwachen Namen „sicher" machen und einen klaren Bildtreffer überstimmen.
    const print = ocrBest?.numberHit ? { cardId: ocrBest.cardId } : null;
    const fused = fuseScan(
      {
        cardId: ocrBest?.cardId,
        // Unsichere Lesung → OCR allein nicht mehr auto-fähig, bestätigen geht noch.
        score: ocrEffectiveScore(ocrBest?.nameScore ?? 0, inp.ocrConf),
        ambiguous: inp.ambiguous,
      },
      inp.hash ? { cardId: inp.hash.cardId, distance: inp.hash.distance, margin: inp.hash.margin } : null,
      FUSE_DEFAULTS,
      print,
    );
    // Alt-Art kann nur das BILD unterscheiden (der Name ist gleich) → nur, wenn der
    // Bildtreffer genau diese Karte zeigt. Sonst: Standard.
    const alt =
      !!fused.cardId &&
      !!inp.hash &&
      inp.hash.cardId === fused.cardId &&
      inp.hash.alt &&
      inp.hash.distance <= FUSE_DEFAULTS.hashConfirmDist;

    // Anzeige: fusionierter Treffer; bloßes OCR-Rauschen (schwacher Name) nicht zeigen.
    const topCard = fused.cardId ? cardIndex.get(fused.cardId) : undefined;
    const show = !!topCard && (fused.method !== 'ocr' || fused.score >= 0.5);
    setBest(
      show && topCard
        ? {
            card: topCard,
            score: fused.score,
            alt: alt && hasAltArt(topCard.id),
            method: methodLabel(fused.method),
            confident: fused.confident,
          }
        : null,
    );

    const h = inp.hash;
    setDebug(
      `Name ${ocrBest ? `${ocrBest.cardId} ${Math.round(ocrBest.nameScore * 100)}%${ocrBest.numberHit ? ' +Nr' : ''}` : '–'}` +
        ` · Bild ${h ? `${h.cardId}${h.alt ? ' (Alt)' : ''} d${h.distance} m${h.margin}` : '–'}` +
        ` · Schärfe ${Math.round(inp.sharpness)} → ${methodLabel(fused.method)}`,
    );
    if (fused.method !== 'none' || h) {
      logProtocol({
        k: 'frame',
        t: Date.now(),
        src: inp.native ? 'nativ' : 'web',
        name: ocrBest?.cardId,
        nameScore: ocrBest ? Math.round(ocrBest.nameScore * 100) / 100 : undefined,
        nr: ocrBest?.numberHit,
        conf: Math.round(inp.ocrConf),
        bild: h?.cardId,
        dist: h?.distance,
        margin: h?.margin,
        alt: h?.alt,
        altMargin: h?.altMargin,
        sharp: Math.round(inp.sharpness),
        method: fused.method,
        pick: fused.cardId ? printingKey(fused.cardId, alt) : undefined,
        sicher: fused.confident,
      });
    }

    // Zeitlicher Konsens (nativ, viele Bilder/s): gleiche Karte über mehrere Bilder.
    // Der Browser liest ohnehin nur bei Bildwechsel → dort genügt ein sicherer Read.
    if (fused.cardId && fused.confident) {
      if (consensusRef.current.cardId === fused.cardId) consensusRef.current.count += 1;
      else consensusRef.current = { cardId: fused.cardId, count: 1 };
    } else {
      consensusRef.current = { cardId: '', count: 0 };
    }
    const required = inp.native && !fused.agree ? AUTO_CONSENSUS : 1;
    const consensusOk = fused.confident && consensusRef.current.count >= required;
    // Auto-Korb (Stapel-Scan): eine andere Karte darf sofort, dieselbe erst nach einem
    // echten Wechsel (Hand/Leere). Schlüssel = Karte (nicht Standard/Alt), damit ein
    // Bild-Aussetzer auf derselben Karte keinen Doppel-Eintrag erzeugt.
    const hasCard = fused.method !== 'none' && fused.score >= 0.6;
    autoBasketRef.current = observeFrame(
      autoBasketRef.current,
      { blurry: false, hasCard },
      inp.native ? AUTO_BASKET_CHANGE_FRAMES : 1,
    );
    if (autoAdd && topCard && consensusOk && mayAutoAdd(autoBasketRef.current, topCard.id)) {
      addToBasket(printingKey(topCard.id, alt), 'auto');
      showAutoToast(alt && hasAltArt(topCard.id) ? `${topCard.name} (Alt)` : topCard.name);
    }
  }

  /** Browser-Kamera: ein Bild auswerten (Tesseract + Bild-Hash). */
  async function scanWeb() {
    const scheduler = schedulerRef.current;
    const video = videoRef.current;
    if (!scheduler || !video || !vdim || busyRef.current) return;
    const region = cropRegion();
    if (!region) return;
    // BILDWECHSEL-ERKENNUNG: liegt noch dieselbe Karte im Bild, NICHT erneut lesen.
    const thumb = frameThumb(video, region);
    if (thumb) {
      const last = lastThumbRef.current;
      if (last && last.length === thumb.length && thumbDiff(thumb, last) < FRAME_SAME) return;
      lastThumbRef.current = thumb;
    }
    // Ganzkarte global (Otsu, trägt auch die Sammlernummer) + Namensbänder adaptiv
    // (glanz-/foil-robust): Mitte = Grundlayout, oben = Legends.
    const whole = regionCanvas(video, region, [0, 0, 1, 1], 800, 'otsu');
    if (!whole) return;
    const bandMid = regionCanvas(video, region, [0.04, 0.44, 0.92, 0.24], 900, 'adaptive');
    const bandTop = regionCanvas(video, region, [0.03, 0.05, 0.94, 0.16], 900, 'adaptive');
    // Bild-Hash + Schärfe vom SELBEN Frame (vor der OCR, danach ist das Video weiter).
    const idx = hashIndexRef.current;
    const hash =
      idx && idx.count > 0
        ? nearestByHashMulti(idx, searchHashes(video, region.sx, region.sy, region.sw, region.sh, vdim.w, vdim.h))
        : null;
    const sharp = sharpnessOf(video, region);
    busyRef.current = true;
    setScanning(true);
    try {
      // Pässe laufen PARALLEL über den Worker-Pool (mehrere CPU-Kerne).
      const rec = (c: HTMLCanvasElement | null) =>
        c ? scheduler.addJob('recognize', c).then((r) => r.data.text ?? '') : Promise.resolve('');
      const [midText, topText, wholeText] = await Promise.all([rec(bandMid), rec(bandTop), rec(whole)]);
      if (openRef.current !== 'web') return; // inzwischen geschlossen
      const cands = matchCardName(`${midText} ${topText} ${wholeText}`, nameCards, 5);
      // Tesseract-Sicherheit bewusst NICHT gedeckelt (ocrConf 100): der Web-Scanner traf
      // mit der Webcam ~100 % — Kalibrierung per Scan-Protokoll.
      evaluate({ native: false, cands, ambiguous: isAmbiguous(cands), ocrConf: 100, hash, sharpness: sharp });
    } catch {
      /* einzelne Erkennung fehlgeschlagen — nächster Versuch */
    } finally {
      busyRef.current = false;
      setScanning(false);
    }
  }

  /** Native Kamera: ein ausgewertetes Bild vom EngramCamera-Plugin (ML Kit). */
  async function onNativeFrame(f: NativeFrame) {
    if (f.blurry) {
      // Unscharf: zählt als Kartenwechsel (Hand in Bewegung) und bricht den Konsens.
      setBlurry(true);
      autoBasketRef.current = observeFrame(autoBasketRef.current, { blurry: true, hasCard: false });
      consensusRef.current = { cardId: '', count: 0 };
      setDebug(`unscharf · Schärfe ${Math.round(f.sharpness)}`);
      return;
    }
    setBlurry(false);
    if (busyRef.current) return;
    busyRef.current = true;
    setScanning(true);
    try {
      const lm = matchTextLines(f.lines ?? [], nameCards, 5);
      let hash: HashMatch | null = null;
      const idx = hashIndexRef.current;
      if (f.crop && idx && idx.count > 0) {
        // Das Plugin schickt den Rahmen mit etwas Rand (cropBox = Lage des Rahmens im
        // Bild), damit die Ausschnitt-Suche auch über den Rahmen hinaus greifen kann.
        const img = await decodeJpeg(f.crop);
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        const box = f.cropBox ?? { l: 0, t: 0, r: 1, b: 1 };
        hash = nearestByHashMulti(
          idx,
          searchHashes(img, box.l * W, box.t * H, (box.r - box.l) * W, (box.b - box.t) * H, W, H),
        );
      }
      if (openRef.current !== 'native') return;
      evaluate({
        native: true,
        cands: lm.candidates,
        ambiguous: lm.ambiguous,
        ocrConf: lm.confidence,
        hash,
        sharpness: f.sharpness,
      });
    } catch {
      /* einzelnes Bild fehlgeschlagen — das nächste kommt gleich */
    } finally {
      busyRef.current = false;
      setScanning(false);
    }
  }
  onFrameRef.current = (f) => void onNativeFrame(f);

  function resetScanState() {
    autoBasketRef.current = AUTO_BASKET_START;
    consensusRef.current = { cardId: '', count: 0 };
    lastThumbRef.current = null;
    setBlurry(false);
    setBest(null);
    setDebug('');
    setAutoToast(null);
  }

  /** Knopf „Scanner starten": in der App die native Kamera, sonst die Browser-Kamera. */
  function startScanner() {
    if (useNative) void startNative();
    else void startWeb();
  }

  async function startNative() {
    setCamError(null);
    resetScanState();
    document.documentElement.classList.add('scan-open');
    openRef.current = 'native';
    setOpen('native');
    try {
      await nextFrame(); // Overlay muss gezeichnet sein, bevor wir den Rahmen messen
      const el = reticleElRef.current;
      const rect = el ? reticleOf(el) : { left: 0.1, top: 0.2, width: 0.8, height: 0.55 };
      nativeListenerRef.current = await EngramCamera.addListener('frame', (f) => onFrameRef.current(f));
      const caps = await EngramCamera.start({ ...rect, sharpMin: NATIVE_SHARP_MIN });
      setTorchAvailable(caps.torch);
      setTorchOn(false);
      setZoom(
        typeof caps.zoomMin === 'number' && typeof caps.zoomMax === 'number'
          ? { min: caps.zoomMin, max: caps.zoomMax, value: Math.max(caps.zoomMin, 1) }
          : null,
      );
    } catch (e) {
      await closeScanner();
      // Rückfall: Browser-Kamera (lädt dafür die Texterkennung).
      setForceWeb(true);
      await startWeb();
      setCamError(`${e instanceof Error ? e.message : 'Native Kamera nicht verfügbar'} — nutze die Browser-Kamera`);
    }
  }

  async function startWeb() {
    setCamError(null);
    resetScanState();
    document.documentElement.classList.add('scan-open');
    openRef.current = 'web';
    setOpen('web');
    try {
      await nextFrame(); // Video-Element im Overlay muss existieren
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      if (openRef.current !== 'web') {
        stream.getTracks().forEach((t) => t.stop()); // inzwischen geschlossen
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as unknown as {
        zoom?: { min: number; max: number };
        torch?: boolean;
        focusMode?: string[];
      };
      if (caps?.zoom) {
        const s = track.getSettings() as unknown as { zoom?: number };
        setZoom({ min: caps.zoom.min, max: caps.zoom.max, value: s.zoom ?? caps.zoom.min });
      } else {
        setZoom(null);
      }
      // Kontinuierlicher Autofokus (Handy): scharfe Frames sind der Hauptfaktor.
      if (caps?.focusMode?.includes('continuous')) {
        void track
          .applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints)
          .catch(() => {});
      }
      setTorchAvailable(!!caps?.torch);
      setTorchOn(false);
    } catch (e) {
      await closeScanner();
      setCamError(e instanceof Error ? e.message : 'Kamera nicht verfügbar.');
    }
  }

  /** Scanner schließen (beide Kamerawege). */
  async function closeScanner() {
    document.documentElement.classList.remove('scan-open');
    const was = openRef.current;
    openRef.current = null;
    setOpen(null);
    if (was === 'native') {
      await nativeListenerRef.current?.remove();
      nativeListenerRef.current = null;
      try {
        await EngramCamera.stop();
      } catch {
        /* war schon aus */
      }
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setVdim(null);
    setTorchAvailable(false);
    setTorchOn(false);
    setZoom(null);
    resetScanState();
  }

  /** Nativ: aktuelle Lage des Scan-Rahmens an den nativen Ausschnitt melden. */
  function sendReticle() {
    const el = reticleElRef.current;
    if (el && openRef.current === 'native') void EngramCamera.setReticle(reticleOf(el)).catch(() => {});
  }

  /**
   * Tipp-zum-Fokussieren (Punkt normiert aufs Fenster). Nativ über CameraX; im Browser
   * über `pointsOfInterest` — rein additiv: kann das Gerät es nicht, bleibt der
   * kontinuierliche Autofokus unangetastet.
   */
  async function focusAt(nx: number, ny: number) {
    if (openRef.current === 'native') {
      void EngramCamera.focus({ x: nx, y: ny }).catch(() => {});
      return;
    }
    const track = streamRef.current?.getVideoTracks()[0];
    const pt = videoPoint(nx, ny);
    if (!track || !pt) return;
    const caps = track.getCapabilities?.() as unknown as { focusMode?: string[]; pointsOfInterest?: unknown };
    const modes = caps?.focusMode ?? [];
    const advanced: Record<string, unknown> = {};
    if ('pointsOfInterest' in (caps ?? {})) advanced.pointsOfInterest = [pt];
    if (modes.includes('continuous')) advanced.focusMode = 'continuous';
    else if (modes.includes('single-shot')) advanced.focusMode = 'single-shot';
    if (Object.keys(advanced).length === 0) return;
    try {
      await track.applyConstraints({ advanced: [advanced] } as unknown as MediaTrackConstraints);
      // Nach single-shot zurück auf kontinuierlich, damit's beim Weiterblättern scharf bleibt.
      if (advanced.focusMode === 'single-shot' && modes.includes('continuous')) {
        window.setTimeout(() => {
          void track
            .applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints)
            .catch(() => {});
        }, 1500);
      }
    } catch {
      /* Gezielter Fokus nicht unterstützt — Autofokus bleibt aktiv. */
    }
  }

  async function toggleTorch() {
    const next = !torchOn;
    if (openRef.current === 'native') {
      await EngramCamera.setTorch({ on: next }).catch(() => {});
      setTorchOn(next);
      return;
    }
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false); // Gerät meldet Torch, kann ihn aber nicht setzen → Taste ausblenden
    }
  }

  function applyZoom(ratio: number) {
    setZoom((z) => (z ? { ...z, value: ratio } : z));
    if (openRef.current === 'native') {
      void EngramCamera.setZoom({ ratio }).catch(() => {});
      return;
    }
    const track = streamRef.current?.getVideoTracks()[0];
    void track?.applyConstraints({ advanced: [{ zoom: ratio }] } as unknown as MediaTrackConstraints).catch(() => {});
  }

  /** Legt ein Printing (`<cardId>` oder `<cardId>#alt`) in den Scan-Korb. */
  function addToBasket(printingId: string, via: 'auto' | 'manuell' = 'manuell') {
    setBasket((b) => {
      const i = b.findIndex((x) => x.printingId === printingId);
      if (i >= 0) return b.map((x, j) => (j === i ? { ...x, count: x.count + 1 } : x));
      return [...b, { printingId, count: 1 }];
    });
    setAdded(0);
    // Egal ob automatisch oder per Knopf — dieselbe liegende Karte erst nach einem
    // Kartenwechsel wieder automatisch zählen (kein Doppel durch Knopf + Auto-Korb).
    autoBasketRef.current = afterAutoAdd(baseCardId(printingId));
    logProtocol({ k: 'korb', t: Date.now(), key: printingId, via });
    if (openRef.current) setFlashKey((k) => k + 1);
    feedbackAdded(); // Vibration (abschaltbar unter „Mehr")
  }
  function basketAdjust(printingId: string, delta: number) {
    setBasket((b) =>
      b.map((x) => (x.printingId === printingId ? { ...x, count: x.count + delta } : x)).filter((x) => x.count > 0),
    );
  }
  /** Verschiebt einen Korb-Eintrag auf ein anderes Printing (Menge bleibt, ggf. zusammengeführt). */
  function basketMove(oldId: string, newId: string) {
    if (oldId === newId) return;
    setBasket((b) => {
      const item = b.find((x) => x.printingId === oldId);
      if (!item) return b;
      const rest = b.filter((x) => x.printingId !== oldId);
      const existing = rest.find((x) => x.printingId === newId);
      if (existing) {
        return rest.map((x) => (x.printingId === newId ? { ...x, count: x.count + item.count } : x));
      }
      return [...rest, { printingId: newId, count: item.count }];
    });
    logProtocol({ k: 'korrektur', t: Date.now(), von: oldId, zu: newId });
  }
  /** Ersetzt eine falsch erkannte Korb-Karte durch die richtige (Standard-Druck). */
  function basketReplace(oldId: string, newCardId: string) {
    basketMove(oldId, newCardId);
    setCorrectingId(null);
    setCorrectQuery('');
  }
  /** Standard ↔ Alt-Art umschalten (Karten mit Alt-Art). */
  function basketToggleAlt(printingId: string) {
    const cardId = baseCardId(printingId);
    basketMove(printingId, isAltPrintingId(printingId) ? cardId : altPrintingId(cardId));
  }
  async function commitBasket() {
    const items = basket;
    for (const it of items) await addToCollection(it.printingId, it.count, 'scan');
    setBasket([]);
    setAdded(items.reduce((s, it) => s + it.count, 0));
  }

  async function copyProtocol() {
    const lines = protocolRef.current.map((e) => JSON.stringify(e)).join('\n');
    try {
      await navigator.clipboard.writeText(lines);
      setProtocolMsg(`${protocolRef.current.length} Einträge kopiert.`);
    } catch {
      setProtocolMsg('Kopieren nicht möglich (Zwischenablage gesperrt).');
    }
    window.setTimeout(() => setProtocolMsg(null), 2500);
  }

  const basketTotal = basket.reduce((s, it) => s + it.count, 0);
  const overlayStatus =
    open === 'web' && !workerReady ? 'Texterkennung wird geladen… (einmalig)' : null;

  return (
    <section className="space-y-4">
      <div className="rounded-lg bg-surface p-4">
        <h2 className="mb-1 font-mono text-lg">Scanner</h2>
        <p className="mb-3 text-xs text-muted">
          Karte formatfüllend in den Rahmen halten. Erkennt die Karte am <b>Bild</b> und am{' '}
          <b>Namen</b> — auch Alt-Arts. Alles lokal, keine Bilder verlassen das Gerät (§ 8).
        </p>
        <button
          onClick={startScanner}
          className="w-full rounded-md bg-accent px-4 py-3 font-mono text-base text-on-accent"
        >
          📷 Scanner starten
        </button>
        <p className="mt-2 font-mono text-[11px] text-muted">
          Kamera: {useNative ? 'nativ (ML Kit)' : 'Browser'} · Bild-Index:{' '}
          {hashCount === null ? 'lädt…' : hashCount > 0 ? `${hashCount} Drucke` : 'fehlt — nur Namens-Abgleich'}
          {needOcr && ` · ${workerReady ? 'Texterkennung bereit' : 'Texterkennung lädt…'}`}
        </p>

        {camError && (
          <p className="mt-2 text-sm text-card-red">
            Kamera nicht verfügbar: {camError}.{' '}
            {isNativeApp
              ? 'Beim Start fragt die App nach Kamerazugriff — bitte erlauben. Falls zuvor abgelehnt: Android-Einstellungen → Apps → engram → Berechtigungen → Kamera aktivieren, dann erneut „Scanner starten".'
              : 'Auf dem Handy: HTTPS-Adresse öffnen und Kamerazugriff erlauben.'}
          </p>
        )}

        {/* Fallback: nicht erkannt? Karte manuell suchen und in den Korb legen. */}
        <details className="mt-3">
          <summary className="cursor-pointer select-none font-mono text-xs text-muted">
            Nicht erkannt? Manuell hinzufügen
          </summary>
          <input
            value={manualQuery}
            onChange={(e) => setManualQuery(e.target.value)}
            placeholder="Karte suchen (Name oder Nummer)…"
            className="mt-2 w-full rounded-md border border-white/10 bg-bg px-3 py-2 font-mono text-sm text-text outline-none focus:border-accent"
          />
          {manualResults.length > 0 && (
            <ul className="mt-2 divide-y divide-white/5 overflow-hidden rounded-md border border-white/5">
              {manualResults.map((card) => (
                <li
                  key={card.id}
                  onClick={() => {
                    addToBasket(card.id);
                    setManualQuery('');
                  }}
                  className="flex cursor-pointer items-center gap-2 px-3 py-1.5 hover:bg-white/10"
                >
                  <CardImage card={card} src={images.get(card.id)} className="h-8 w-6" />
                  <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                  <span className="font-mono text-sm">{card.name}</span>
                  {card.subtitle && <span className="text-xs text-muted">{card.subtitle}</span>}
                  <span className="ml-auto font-mono text-xs text-accent">＋ Korb</span>
                </li>
              ))}
            </ul>
          )}
        </details>

        {/* Kalibrierung: Rohwerte je Scan zum Nachjustieren der Schwellen. */}
        <details className="mt-2">
          <summary className="cursor-pointer select-none font-mono text-xs text-muted">
            Scan-Protokoll (Kalibrierung) · {protocolCount} Einträge
          </summary>
          <p className="mt-1 text-[11px] text-muted">
            Merkt sich je Bild Name-/Bild-Treffer, Abstand, Schärfe und was im Korb landete
            (inkl. Korrekturen) — nur im Speicher, nichts verlässt das Gerät. Zum Feinjustieren
            kopieren und weitergeben.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              onClick={() => void copyProtocol()}
              disabled={protocolCount === 0}
              className="rounded border border-white/10 px-3 py-1 font-mono text-xs hover:border-accent disabled:opacity-40"
            >
              Protokoll kopieren
            </button>
            <button
              onClick={() => {
                protocolRef.current = [];
                setProtocolCount(0);
              }}
              disabled={protocolCount === 0}
              className="rounded border border-white/10 px-3 py-1 font-mono text-xs text-muted hover:border-card-red hover:text-card-red disabled:opacity-40"
            >
              Leeren
            </button>
            {protocolMsg && <span className="font-mono text-[11px] text-card-green">{protocolMsg}</span>}
          </div>
        </details>
      </div>

      {/* Scan-Korb → gebündelt in die Sammlung übernehmen */}
      {(basket.length > 0 || added > 0) && (
        <div className="rounded-lg bg-surface p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="font-mono text-sm">Scan-Korb</h3>
            {basketTotal > 0 && (
              <span
                key={basketTotal}
                className="animate-pop inline-block rounded-full bg-accent/20 px-2 py-0.5 font-mono text-xs text-accent"
              >
                {basketTotal} Karten
              </span>
            )}
          </div>

          {added > 0 && basket.length === 0 && (
            <p className="mb-2 text-sm text-card-green">
              {added} Karte{added === 1 ? '' : 'n'} in die Sammlung übernommen ✓
            </p>
          )}

          {basket.length > 0 && (
            <>
              <ul className="mb-3 space-y-1">
                {basket.map((it) => {
                  const card = cardIndex.get(baseCardId(it.printingId));
                  if (!card) return null;
                  const isAlt = isAltPrintingId(it.printingId);
                  const correcting = correctingId === it.printingId;
                  return (
                    <li key={it.printingId} className="font-mono text-sm">
                      <div className="flex items-center gap-1.5">
                        <CardImage card={card} src={images.get(card.id)} className="h-8 w-6" />
                        <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                        <button
                          onClick={() => basketAdjust(it.printingId, -1)}
                          aria-label="Eins weniger"
                          className="rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-text"
                        >
                          −
                        </button>
                        <span className="w-8 text-center text-accent">{it.count}×</span>
                        <button
                          onClick={() => basketAdjust(it.printingId, 1)}
                          aria-label="Eins mehr"
                          className="rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-text"
                        >
                          +
                        </button>
                        <button
                          onClick={() => {
                            setCorrectingId(correcting ? null : it.printingId);
                            setCorrectQuery('');
                          }}
                          title="Falsch erkannt? Antippen, um die Karte zu korrigieren"
                          className={`truncate text-left ${correcting ? 'text-accent' : 'hover:text-accent'}`}
                        >
                          {card.name}
                        </button>
                        {hasAltArt(card.id) && (
                          <button
                            onClick={() => basketToggleAlt(it.printingId)}
                            title={isAlt ? 'Ist ein Standard-Druck? Antippen' : 'Ist eine Alt-Art? Antippen'}
                            className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] ${
                              isAlt ? 'bg-accent/20 text-accent' : 'border border-white/10 text-muted hover:text-text'
                            }`}
                          >
                            {isAlt ? 'Alt' : 'Std'}
                          </button>
                        )}
                        <button
                          onClick={() => basketAdjust(it.printingId, -it.count)}
                          aria-label={`${card.name} aus dem Korb entfernen`}
                          className="ml-auto rounded px-2 py-1 text-muted hover:bg-white/10 hover:text-card-red"
                        >
                          ✕
                        </button>
                      </div>
                      {correcting && (
                        <div className="mb-1 ml-8 mt-1 rounded-md border border-accent/40 bg-bg/60 p-2">
                          <input
                            autoFocus
                            value={correctQuery}
                            onChange={(e) => setCorrectQuery(e.target.value)}
                            placeholder="Richtige Karte suchen…"
                            className="w-full rounded border border-white/10 bg-bg px-2 py-1.5 text-sm outline-none focus:border-accent"
                          />
                          {correctQuery.trim() && (
                            <ul className="mt-1 max-h-40 overflow-y-auto">
                              {searchCards(catalog, correctQuery, { limit: 5 }).map((c) => (
                                <li key={c.id}>
                                  <button
                                    onClick={() => basketReplace(it.printingId, c.id)}
                                    className="flex w-full items-center gap-2 rounded px-2 py-1.5 text-left hover:bg-white/10"
                                  >
                                    <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[c.color]}`} />
                                    <span className="truncate">{c.name}</span>
                                    {c.subtitle && <span className="truncate text-xs text-muted">{c.subtitle}</span>}
                                  </button>
                                </li>
                              ))}
                            </ul>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void commitBasket()}
                  className="rounded bg-accent px-3 py-1.5 font-mono text-sm text-on-accent"
                >
                  Alle in Sammlung übernehmen ({basketTotal})
                </button>
                <button
                  onClick={() => setBasket([])}
                  className="rounded border border-white/10 px-3 py-1.5 font-mono text-sm text-muted hover:border-card-red hover:text-card-red"
                >
                  Korb leeren
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {open && (
        <ScanOverlay
          mode={open}
          videoRef={videoRef}
          onVideoMeta={(w, h) => setVdim({ w, h })}
          reticleRef={reticleElRef}
          onTap={(x, y) => void focusAt(x, y)}
          onClose={() => void closeScanner()}
          blurry={blurry}
          scanning={scanning}
          status={overlayStatus}
          best={best ? { ...best, imageSrc: images.get(best.card.id) } : undefined}
          onAdd={() => {
            if (best) addToBasket(printingKey(best.card.id, best.alt));
          }}
          autoAdd={autoAdd}
          onToggleAuto={() => {
            autoBasketRef.current = AUTO_BASKET_START; // frischer Start: die Karte im Bild darf sofort
            lastThumbRef.current = null; // Browser: liegende Karte sofort neu lesen (sonst erst bei Bildwechsel)
            setAutoAdd((a) => !a);
          }}
          torchAvailable={torchAvailable}
          torchOn={torchOn}
          onToggleTorch={() => void toggleTorch()}
          zoom={zoom}
          onZoom={applyZoom}
          basketCount={basketTotal}
          toast={autoToast}
          flashKey={flashKey}
          debug={debug}
        />
      )}
    </section>
  );
}
