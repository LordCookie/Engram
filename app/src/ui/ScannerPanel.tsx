import { useEffect, useMemo, useRef, useState } from 'react';
import { createWorker, createScheduler, PSM, type Scheduler } from 'tesseract.js';
import { catalog, cardIndex } from '../data/catalog';
import { useCardImages } from '../data/cardImages';
import { addToCollection } from '../db/db';
import { matchCardName, type NameCard } from '../domain/nameMatch';
import { searchCards } from '../domain/search';
import { CardImage } from './CardImage';
import type { Card, Color } from '../domain/types';

/**
 * Kartenscanner (PLAN.md § 6, Phase 3) — OCR-Ansatz wie ManaBox & Co.: Text ist
 * robuster als ein Bild-Hash. Wir lesen per OCR den Kartennamen aus dem Foto und
 * gleichen ihn unscharf gegen die 151 Namen ab. Alles lokal; das OCR-Modell
 * (tesseract.js) wird einmalig geladen und gecacht. Keine Bilder, keine Nutzerdaten
 * verlassen das Gerät.
 */

const CARD_ASPECT = 733 / 1024;

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

function confidence(score: number): { label: string; cls: string } {
  if (score >= 0.85) return { label: 'sehr sicher', cls: 'text-card-green' };
  if (score >= 0.6) return { label: 'wahrscheinlich', cls: 'text-accent' };
  return { label: 'unsicher', cls: 'text-card-red' };
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

interface ZoomCaps {
  min: number;
  max: number;
  step: number;
}

export function ScannerPanel() {
  const images = useCardImages();
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const schedulerRef = useRef<Scheduler | null>(null);
  const busyRef = useRef(false);

  const [workerReady, setWorkerReady] = useState(false);
  const [camOn, setCamOn] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [vdim, setVdim] = useState<{ w: number; h: number } | null>(null);

  const [boxScale, setBoxScale] = useState(0.8);
  const [zoomCaps, setZoomCaps] = useState<ZoomCaps | null>(null);
  const [zoom, setZoom] = useState(1);
  const [torchAvailable, setTorchAvailable] = useState(false); // Rückkamera-Licht steuerbar?
  const [torchOn, setTorchOn] = useState(false);
  const [focusAvailable, setFocusAvailable] = useState(false); // Tipp-zum-Fokussieren möglich?
  const [focusRing, setFocusRing] = useState<{ x: number; y: number; key: number } | null>(null);
  const [live, setLive] = useState(false);
  // Pause zwischen Live-Scans (ms). Bremst die Auto-Übernahme, damit sie beim
  // schnellen Blättern nicht durchrattert. Untergrenze = OCR-Zeit (busy-Schutz).
  const [scanDelay, setScanDelay] = useState(800);

  const [scanning, setScanning] = useState(false);
  const [ocrText, setOcrText] = useState('');
  const [matches, setMatches] = useState<{ card: Card; score: number; numberHit: boolean }[]>([]);
  // Scan-Korb: gesammelte Karten dieser Sitzung, am Ende gebündelt in die Sammlung.
  const [basket, setBasket] = useState<{ cardId: string; count: number }[]>([]);
  const [added, setAdded] = useState(0);
  const [flashId, setFlashId] = useState<string | null>(null); // kurz „✓ +1" nach dem Legen
  const flashTimer = useRef<number>();
  const [autoAdd, setAutoAdd] = useState(false); // sicheren Treffer automatisch in den Korb
  const lastAutoRef = useRef<string | null>(null);
  const votesRef = useRef<string[]>([]); // letzte Top-Treffer (leichter Konsens fürs Auto-Add)
  const [autoToast, setAutoToast] = useState<string | null>(null); // „✓ … in den Korb"
  const autoToastTimer = useRef<number>();
  const [manualQuery, setManualQuery] = useState('');
  const manualResults = useMemo(
    () => (manualQuery.trim() ? searchCards(catalog, manualQuery, { limit: 6 }) : []),
    [manualQuery],
  );

  // OCR-Worker-POOL einmalig laden: mehrere Worker an einem Scheduler, damit die
  // Namens-Pässe PARALLEL über mehrere CPU-Kerne laufen (statt seriell auf einem).
  useEffect(() => {
    let alive = true;
    const scheduler = createScheduler();
    schedulerRef.current = scheduler;
    // 2–3 Worker: nutzt die Handy-Kerne, ohne den Speicher zu sprengen.
    const poolSize = Math.min(3, Math.max(1, navigator.hardwareConcurrency || 2));
    void (async () => {
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
          // Modell nicht ladbar (offline beim ersten Mal) — Hinweis erscheint unten.
          if (i === 0) break;
        }
      }
    })();
    return () => {
      alive = false;
      void schedulerRef.current?.terminate(); // beendet alle Worker im Pool
      schedulerRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);

  function cropRegion(): { sx: number; sy: number; sw: number; sh: number } | null {
    if (!vdim) return null;
    let sh = vdim.h * boxScale;
    let sw = sh * CARD_ASPECT;
    if (sw > vdim.w * 0.98) {
      sw = vdim.w * 0.98;
      sh = sw / CARD_ASPECT;
    }
    return { sx: (vdim.w - sw) / 2, sy: (vdim.h - sh) / 2, sw, sh };
  }

  /**
   * Ein (Teil-)Ausschnitt des Karten-Rahmens, hochskaliert + OCR-vorbereitet:
   * Graustufe → Kontrast auf vollen Bereich strecken (macht stilisierte Schrift
   * knackig) → bei dunklem Grund invertieren (Tesseract mag dunkle Schrift auf hell).
   * `sub` = Teilrechteck des Karten-Rahmens in Bruchteilen [x, y, w, h].
   */
  function regionCanvas(
    sub: [number, number, number, number],
    targetW: number,
    binarize: 'otsu' | 'adaptive' = 'otsu',
  ): HTMLCanvasElement | null {
    const video = videoRef.current;
    const region = cropRegion();
    if (!video || !region) return null;
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
    // Perzentil-Grenzen: die hellsten/dunkelsten 2 % (Glanz auf Hüllen, harte
    // Schatten) ignorieren, damit die Streckung dem eigentlichen Karteninhalt gilt.
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
      d[i] = v | 0; // gestreckte Graustufe (nur R; G/B werden bei der Binarisierung gesetzt)
    }
    // Reines Schwarz/Weiß liest Tesseract am besten. „adaptive" = glanz-/lichtrobust
    // (Foils), „otsu" = global (Standardkarten + Sammlernummer).
    if (binarize === 'adaptive') binarizeAdaptive(d, targetW, targetH);
    else binarizeOtsu(d, n);
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /**
   * `full` (manuelles „Scannen"): drei Reads für maximale Genauigkeit.
   * `live` (Dauer-/Bulk-Modus): nur Mitte + Ganzkarte — die Ganzkarte behält die
   * Sammlernummer als Entscheider (namensgleiche Karten), das obere Alt-Art-Band
   * entfällt (die Ganzkarten-Lesung fängt es ab). Ein Read weniger = mehr Frames/s
   * → Konsens schneller erreicht, ohne die Nummer aufzugeben.
   */
  async function scan(mode: 'live' | 'full' = 'full') {
    const scheduler = schedulerRef.current;
    if (!scheduler || busyRef.current) return;
    // Ganzkarte global (Otsu): liefert die Sammlernummer + einen robusten Global-Read
    // des Namens (Sicherheitsnetz, falls die adaptiven Bänder mal danebenliegen).
    const whole = regionCanvas([0, 0, 1, 1], 800, 'otsu');
    if (!whole) return;
    // Namensband Mitte (Grundlayout dieser Karten), ADAPTIV binarisiert (glanz-/foil-
    // robust). Höhere Zielbreite = größere Glyphen für Tesseract (~30 px Höhe ist ideal).
    const bandMid = regionCanvas([0.04, 0.44, 0.92, 0.24], 900, 'adaptive');
    // Oberes Band (Alt-Art setzt den Namen oft nach oben) nur im vollen Scan.
    const bandTop = mode === 'full' ? regionCanvas([0.03, 0.05, 0.94, 0.16], 900, 'adaptive') : null;
    busyRef.current = true;
    setScanning(true);
    try {
      // Pässe laufen PARALLEL über den Worker-Pool (mehrere CPU-Kerne) statt seriell.
      const rec = (c: HTMLCanvasElement | null) =>
        c ? scheduler.addJob('recognize', c).then((r) => r.data.text ?? '') : Promise.resolve('');
      const [midText, topText, wholeText] = await Promise.all([rec(bandMid), rec(bandTop), rec(whole)]);
      const text = `${midText} ${topText} ${wholeText}`;
      setOcrText(text.replace(/\s+/g, ' ').trim());
      const top = matchCardName(text, nameCards, 5);
      const mapped = top
        .map((m) => ({ card: cardIndex.get(m.cardId), score: m.score, numberHit: m.numberHit }))
        .filter((x): x is { card: Card; score: number; numberHit: boolean } => x.card !== undefined);
      setMatches(mapped);

      // Auto-Übernahme: sicherer Treffer, nur wenn sich die Karte geändert hat
      // (kein Mehrfach-Eintrag, solange dieselbe Karte im Bild bleibt). Im LIVE-Modus
      // zusätzlich Frame-Konsens (2 von 3) gegen Wackel-/Foil-Ausreißer beim Blättern;
      // manuelles „Scannen" übernimmt sofort.
      const best = mapped[0];
      const votes = votesRef.current;
      votes.push(best ? best.card.id : '');
      while (votes.length > 3) votes.shift();
      const agree = best ? votes.filter((v) => v === best.card.id).length : 0;
      const confident = !!best && (best.numberHit || best.score >= 0.85) && (!live || agree >= 2);
      if (autoAdd && best && confident) {
        if (lastAutoRef.current !== best.card.id) {
          lastAutoRef.current = best.card.id;
          addToBasket(best.card.id);
          setAutoToast(best.card.name);
          window.clearTimeout(autoToastTimer.current);
          autoToastTimer.current = window.setTimeout(() => setAutoToast(null), 1500);
        }
      } else if (!best) {
        lastAutoRef.current = null;
      }
    } catch {
      /* Einzelne Erkennung fehlgeschlagen — nächster Versuch */
    } finally {
      busyRef.current = false;
      setScanning(false);
    }
  }

  // Optionale Live-Erkennung. Einstellbare Pause + `busy`-Schutz: bei kleiner Pause
  // OCR-gebundenes Back-to-Back, größere Pause bremst gezielt die Auto-Übernahme.
  // Zwei Reads parallel über den Pool.
  useEffect(() => {
    if (!camOn || !live || !workerReady) return;
    const id = window.setInterval(() => void scan('live'), Math.max(150, scanDelay));
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camOn, live, workerReady, boxScale, vdim, autoAdd, scanDelay]);

  async function startCamera() {
    setCamError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const track = stream.getVideoTracks()[0];
      const caps = track.getCapabilities?.() as unknown as {
        zoom?: { min: number; max: number; step?: number };
        torch?: boolean;
        focusMode?: string[];
      };
      if (caps?.zoom) {
        setZoomCaps({ min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step ?? 0.1 });
        const s = track.getSettings() as unknown as { zoom?: number };
        setZoom(s.zoom ?? caps.zoom.min);
      } else {
        setZoomCaps(null);
      }
      // Kontinuierlicher Autofokus (Handy): scharfe Frames sind der Hauptfaktor —
      // die Webcam ist ohnehin scharf, hier ändert sich nichts.
      if (caps?.focusMode?.includes('continuous')) {
        void track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] } as unknown as MediaTrackConstraints);
      }
      // Tipp-zum-Fokussieren nur anbieten, wenn das Gerät gezielt fokussieren kann.
      setFocusAvailable(
        !!caps?.focusMode?.some((m) => m === 'continuous' || m === 'single-shot') ||
          'pointsOfInterest' in (caps ?? {}),
      );
      setTorchAvailable(!!caps?.torch); // z. B. Rückkamera mit Blitz-LED
      setTorchOn(false);
      setCamOn(true);
    } catch (e) {
      setCamError(e instanceof Error ? e.message : 'Kamera nicht verfügbar.');
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCamOn(false);
    setVdim(null);
    setTorchAvailable(false);
    setTorchOn(false);
    setFocusAvailable(false);
    setFocusRing(null);
    votesRef.current = [];
    lastAutoRef.current = null;
    setAutoToast(null);
  }

  function applyZoom(value: number) {
    setZoom(value);
    const track = streamRef.current?.getVideoTracks()[0];
    void track?.applyConstraints({ advanced: [{ zoom: value }] } as unknown as MediaTrackConstraints);
  }

  /**
   * Tipp-zum-Fokussieren: richtet den Autofokus auf die getippte Stelle (gegen
   * Glanz/Foils). Rein additiv — schlägt es fehl oder kann das Gerät es nicht,
   * bleibt der kontinuierliche Autofokus unangetastet (kein Regressionsrisiko).
   */
  async function focusAt(clientX: number, clientY: number) {
    const video = videoRef.current;
    const track = streamRef.current?.getVideoTracks()[0];
    if (!video || !track) return;
    const rect = video.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const nx = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (clientY - rect.top) / rect.height));
    // Sofortiges visuelles Feedback (Ring an der Tipp-Stelle, verschwindet von selbst).
    setFocusRing({ x: clientX - rect.left, y: clientY - rect.top, key: Date.now() });
    const caps = track.getCapabilities?.() as unknown as {
      focusMode?: string[];
      pointsOfInterest?: unknown;
    };
    const modes = caps?.focusMode ?? [];
    const advanced: Record<string, unknown> = {};
    if ('pointsOfInterest' in (caps ?? {})) advanced.pointsOfInterest = [{ x: nx, y: ny }];
    if (modes.includes('continuous')) advanced.focusMode = 'continuous';
    else if (modes.includes('single-shot')) advanced.focusMode = 'single-shot';
    if (Object.keys(advanced).length === 0) return;
    try {
      await track.applyConstraints({ advanced: [advanced] } as unknown as MediaTrackConstraints);
      // Nach single-shot zurück auf kontinuierlich, damit's beim Weiterblättern scharf bleibt.
      if (advanced.focusMode === 'single-shot' && modes.includes('continuous')) {
        window.setTimeout(() => {
          void track.applyConstraints({
            advanced: [{ focusMode: 'continuous' }],
          } as unknown as MediaTrackConstraints);
        }, 1500);
      }
    } catch {
      /* Gezielter Fokus nicht unterstützt — Autofokus bleibt aktiv, kein Problem. */
    }
  }

  /** Kamera-Licht (Torch) der Rückkamera an/aus. */
  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
      setTorchOn(next);
    } catch {
      setTorchAvailable(false); // Gerät meldet Torch, kann ihn aber nicht setzen → Taste ausblenden
    }
  }

  function addToBasket(cardId: string) {
    setBasket((b) => {
      const i = b.findIndex((x) => x.cardId === cardId);
      if (i >= 0) return b.map((x, j) => (j === i ? { ...x, count: x.count + 1 } : x));
      return [...b, { cardId, count: 1 }];
    });
    setAdded(0);
    // Sichtbare + haptische Rückmeldung.
    setFlashId(cardId);
    if (typeof navigator.vibrate === 'function') navigator.vibrate(25);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlashId(null), 900);
  }
  function basketAdjust(cardId: string, delta: number) {
    setBasket((b) =>
      b.map((x) => (x.cardId === cardId ? { ...x, count: x.count + delta } : x)).filter((x) => x.count > 0),
    );
  }
  async function commitBasket() {
    const items = basket;
    for (const it of items) await addToCollection(it.cardId, it.count, 'scan');
    setBasket([]);
    setAdded(items.reduce((s, it) => s + it.count, 0));
  }

  const region = cropRegion();
  const boxWidthPct = region && vdim ? (region.sw / vdim.w) * 100 : 60;
  const best = matches[0]?.score;
  // Nur den besten Treffer immer zeigen, weitere erst ab brauchbarer Konfidenz.
  const shown = matches.filter((m, i) => i === 0 || m.score >= 0.4);
  const basketTotal = basket.reduce((s, it) => s + it.count, 0);

  return (
    <section className="space-y-4">
      <div className="rounded-lg bg-surface p-4">
        <h2 className="mb-1 font-mono text-lg">Scanner</h2>
        <p className="mb-3 text-xs text-muted">
          Karte in den Rahmen halten, sodass der <b>Name gut lesbar</b> ist. Die App
          liest den Namen per Texterkennung und gleicht ihn mit allen Karten ab
          (wie ManaBox). Alles lokal (§ 8).
        </p>
        <p className="mb-3 font-mono text-xs text-muted">
          {workerReady ? 'Texterkennung bereit.' : 'Texterkennung wird geladen… (einmalig)'}
        </p>

        <div
          className={`relative overflow-hidden rounded-md bg-black ${
            camOn && focusAvailable ? 'cursor-crosshair' : ''
          }`}
          onClick={
            camOn && focusAvailable ? (e) => void focusAt(e.clientX, e.clientY) : undefined
          }
        >
          <video
            ref={videoRef}
            playsInline
            muted
            onLoadedMetadata={(e) =>
              setVdim({ w: e.currentTarget.videoWidth, h: e.currentTarget.videoHeight })
            }
            className="block h-auto w-full"
          />
          {camOn && (
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-md border-2 border-accent/80"
              style={{ height: `${boxScale * 100}%`, width: `${boxWidthPct}%` }}
            />
          )}
          {focusRing && (
            <div
              key={focusRing.key}
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2"
              style={{ left: focusRing.x, top: focusRing.y }}
            >
              <div
                onAnimationEnd={() => setFocusRing(null)}
                className="h-14 w-14 rounded-full border-2 border-accent"
                style={{ animation: 'focusPulse 0.7s ease-out forwards' }}
              />
            </div>
          )}
          {!camOn && (
            <div className="flex h-40 items-center justify-center text-sm text-muted">Kamera aus</div>
          )}
        </div>
        {camOn && focusAvailable && (
          <p className="mt-2 font-mono text-[11px] text-muted">
            Tipp aufs Bild = dort scharfstellen (gegen Glanz/Foils).
          </p>
        )}

        {camOn && (
          <div className="mt-3 space-y-2 font-mono text-xs text-muted">
            <label className="flex items-center gap-2">
              <span className="w-16 shrink-0">Rahmen</span>
              <input
                type="range"
                min={0.25}
                max={0.95}
                step={0.01}
                value={boxScale}
                onChange={(e) => setBoxScale(Number(e.target.value))}
                className="flex-1 accent-accent"
                aria-label="Rahmengröße"
              />
              <span className="w-10 text-right">{Math.round(boxScale * 100)}%</span>
            </label>
            {zoomCaps && (
              <label className="flex items-center gap-2">
                <span className="w-16 shrink-0">Zoom</span>
                <input
                  type="range"
                  min={zoomCaps.min}
                  max={zoomCaps.max}
                  step={zoomCaps.step}
                  value={zoom}
                  onChange={(e) => applyZoom(Number(e.target.value))}
                  className="flex-1 accent-accent"
                  aria-label="Kamera-Zoom"
                />
                <span className="w-10 text-right">{zoom.toFixed(1)}×</span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={live} onChange={(e) => setLive(e.target.checked)} />
              <span>Live-Erkennung</span>
            </label>
            {live && (
              <label className="flex items-center gap-2">
                <span className="w-16 shrink-0">Scan-Pause</span>
                <input
                  type="range"
                  min={200}
                  max={2500}
                  step={100}
                  value={scanDelay}
                  onChange={(e) => setScanDelay(Number(e.target.value))}
                  className="flex-1 accent-accent"
                  aria-label="Pause zwischen Live-Scans"
                />
                <span className="w-12 text-right">{(scanDelay / 1000).toFixed(1)}s</span>
              </label>
            )}
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={autoAdd}
                onChange={(e) => setAutoAdd(e.target.checked)}
              />
              <span>Sicheren Treffer automatisch in den Korb</span>
            </label>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          {!camOn ? (
            <button
              onClick={() => void startCamera()}
              className="rounded border border-white/10 px-3 py-1.5 font-mono text-sm hover:border-accent"
            >
              Kamera starten
            </button>
          ) : (
            <>
              <button
                onClick={() => void scan('full')}
                disabled={!workerReady || scanning}
                className="rounded bg-accent px-3 py-1.5 font-mono text-sm text-bg disabled:opacity-40"
              >
                {scanning ? 'Lese…' : 'Scannen'}
              </button>
              {torchAvailable && (
                <button
                  onClick={() => void toggleTorch()}
                  aria-pressed={torchOn}
                  className={`rounded border px-3 py-1.5 font-mono text-sm ${
                    torchOn ? 'border-accent bg-accent text-bg' : 'border-white/10 text-muted hover:border-accent'
                  }`}
                >
                  {torchOn ? '🔦 Licht an' : '🔦 Licht aus'}
                </button>
              )}
              <button
                onClick={stopCamera}
                className="rounded border border-white/10 px-3 py-1.5 font-mono text-sm text-muted hover:border-card-red hover:text-card-red"
              >
                Kamera stoppen
              </button>
            </>
          )}
        </div>

        {autoToast && (
          <p className="mt-2 rounded-md bg-card-green/15 px-2 py-1 font-mono text-sm text-card-green">
            ✓ {autoToast} in den Korb
          </p>
        )}
        {ocrText && (
          <p className="mt-2 break-words font-mono text-[10px] text-muted">
            Gelesen: „{ocrText.slice(0, 120)}"
          </p>
        )}
        {camOn && typeof best === 'number' && best < 0.6 && !scanning && (
          <p className="mt-1 text-xs text-card-red">
            Name noch nicht sicher erkannt — näher ran/zoomen (Name scharf & groß), gerade
            halten. Bei Hüllen/Bindern: Karte leicht kippen, um Reflexionen/Glanz vom Namen
            wegzubekommen, oder unten „Manuell hinzufügen" nutzen.
          </p>
        )}

        {camError && (
          <p className="mt-2 text-sm text-card-red">
            Kamera nicht verfügbar: {camError}.{' '}
            {isNativeApp
              ? 'Beim Start fragt die App nach Kamerazugriff — bitte erlauben. Falls zuvor abgelehnt: Android-Einstellungen → Apps → engram → Berechtigungen → Kamera aktivieren, dann erneut „Kamera starten".'
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
      </div>

      {shown.length > 0 && (
        <div className="rounded-lg bg-surface p-4">
          <h3 className="mb-2 font-mono text-sm">Erkannt</h3>
          <ol className="space-y-2">
            {shown.map((m, i) => {
              const c = confidence(m.score);
              const pct = Math.round(m.score * 100);
              return (
                <li
                  key={m.card.id}
                  className={`relative flex items-center gap-3 rounded-md p-2 ${i === 0 ? 'bg-bg' : 'bg-bg/60'}`}
                >
                  {flashId === m.card.id && (
                    <span className="animate-rise pointer-events-none absolute right-3 top-1 font-mono text-sm font-bold text-card-green">
                      +1
                    </span>
                  )}
                  <CardImage card={m.card} src={images.get(m.card.id)} className="h-16 w-11" />
                  <span className={`h-2 w-2 rounded-full ${colorDot[m.card.color]}`} />
                  <div className="min-w-0 flex-1">
                    <div className="font-mono">
                      {i > 0 && <span className="text-muted">{i + 1}. </span>}
                      {m.card.name}{' '}
                      {m.card.subtitle && (
                        <span className="text-xs text-muted">{m.card.subtitle}</span>
                      )}
                    </div>
                    <div className="font-mono text-xs text-muted">
                      {pct}% · <span className={c.cls}>{c.label}</span>
                      {m.numberHit && <span className="text-card-green"> · Nr. ✓</span>}
                    </div>
                  </div>
                  <button
                    onClick={() => addToBasket(m.card.id)}
                    title="In den Scan-Korb legen"
                    className={`shrink-0 rounded px-2 py-1 font-mono text-xs transition-colors ${
                      flashId === m.card.id
                        ? 'animate-pop bg-card-green/30 text-card-green'
                        : 'bg-accent/20 text-accent hover:bg-accent/40'
                    }`}
                  >
                    {flashId === m.card.id ? '✓ +1' : '＋ Sammlung'}
                  </button>
                </li>
              );
            })}
          </ol>
        </div>
      )}

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
                  const card = cardIndex.get(it.cardId);
                  if (!card) return null;
                  return (
                    <li key={it.cardId} className="flex items-center gap-2 font-mono text-sm">
                      <CardImage card={card} src={images.get(card.id)} className="h-8 w-6" />
                      <span className={`h-2 w-2 shrink-0 rounded-full ${colorDot[card.color]}`} />
                      <button
                        onClick={() => basketAdjust(it.cardId, -1)}
                        className="text-muted hover:text-text"
                      >
                        −
                      </button>
                      <span className="w-8 text-center text-accent">{it.count}×</span>
                      <button
                        onClick={() => basketAdjust(it.cardId, 1)}
                        className="text-muted hover:text-text"
                      >
                        +
                      </button>
                      <span className="truncate">{card.name}</span>
                      <button
                        onClick={() => basketAdjust(it.cardId, -it.count)}
                        className="ml-auto text-muted hover:text-card-red"
                      >
                        ✕
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => void commitBasket()}
                  className="rounded bg-accent px-3 py-1.5 font-mono text-sm text-bg"
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
    </section>
  );
}
