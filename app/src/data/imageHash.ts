/**
 * Bild-Matching für den Scanner v2 (übernommen aus ScryGlass, scanner-v2-plan.md § 3.4).
 * Der Kamera-Ausschnitt wird per **pHash** gehasht und gegen den vorberechneten Index
 * aller Printings verglichen (Hamming-Distanz). Das erkennt die Karte am BILD — robust
 * gegen die stilisierte Schrift — und unterscheidet Standard- von Alt-Art-Drucken.
 *
 * Der Hash MUSS Bit für Bit zur Pipeline passen (`pipeline/hash_images.py`): Graustufe
 * (ITU-R 601) → P_IMG² → 2D-DCT (C·X·Cᵀ, gleiche Schleifenreihenfolge) → obere
 * P_HASH²-Koeffizienten → Bit = Koeffizient > Median, MSB zuerst. Der Paritäts-Test
 * (imageHash.test.ts ↔ test_hash_images.py) sichert das ab.
 *
 * Index: `hashes.json` (gitignored, ~500 Printings) — optional und **lazy** in einem
 * eigenen Chunk (wie coplay.json). Fehlt die Datei, bleibt der Scanner bei reiner OCR.
 */

export const P_IMG = 32; // Graustufe auf P_IMG×P_IMG
export const P_HASH = 16; // obere P_HASH×P_HASH DCT-Koeffizienten → 256 Bit
const TOTAL_BITS = P_HASH * P_HASH; // 256
const HASH_BYTES = TOTAL_BITS / 8; // 32

// Popcount-Tabelle für Bytes (Hamming-Distanz).
const POPCOUNT = new Uint8Array(256);
for (let i = 0; i < 256; i++) POPCOUNT[i] = (i & 1) + POPCOUNT[i >> 1];

// Orthonormale DCT-II-Basismatrix (n×n, row-major), einmal berechnet.
// C[k][x] = a(k)·cos(pi·(2x+1)·k/(2n)); a(0)=sqrt(1/n), sonst sqrt(2/n).
let DCTM: Float64Array | null = null;
function dctMatrix(n: number): Float64Array {
  if (DCTM && DCTM.length === n * n) return DCTM;
  const c = new Float64Array(n * n);
  for (let k = 0; k < n; k++) {
    const a = k === 0 ? Math.sqrt(1 / n) : Math.sqrt(2 / n);
    for (let x = 0; x < n; x++) c[k * n + x] = a * Math.cos((Math.PI * (2 * x + 1) * k) / (2 * n));
  }
  DCTM = c;
  return c;
}

/** pHash einer P_IMG×P_IMG-Graustufe (row-major) als 64-Hex-String. Rein, ohne DOM. */
export function phashFromGray(X: ArrayLike<number>): string {
  const n = P_IMG;
  const C = dctMatrix(n);
  // M = X · Cᵀ  →  M[i][j] = Σ_x X[i][x]·C[j][x]
  const M = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    const xi = i * n;
    for (let j = 0; j < n; j++) {
      const cj = j * n;
      let s = 0;
      for (let x = 0; x < n; x++) s += X[xi + x] * C[cj + x];
      M[xi + j] = s;
    }
  }
  // D = C · M  (nur die oberen P_HASH×P_HASH Koeffizienten)
  const low = new Float64Array(TOTAL_BITS);
  for (let k = 0; k < P_HASH; k++) {
    const ck = k * n;
    for (let j = 0; j < P_HASH; j++) {
      let s = 0;
      for (let i = 0; i < n; i++) s += C[ck + i] * M[i * n + j];
      low[k * P_HASH + j] = s;
    }
  }
  // Median (gerade Anzahl: Mittel der beiden mittleren — wie in der Pipeline).
  const sorted = Float64Array.from(low).sort();
  const m = sorted.length;
  const med = m % 2 ? sorted[(m - 1) / 2] : (sorted[m / 2 - 1] + sorted[m / 2]) / 2;
  const bits = new Uint8Array(TOTAL_BITS);
  for (let i = 0; i < TOTAL_BITS; i++) bits[i] = low[i] > med ? 1 : 0;
  return packBitsMsb(bits);
}

/** pHash eines Canvas/Bildes (ganzes Bild). */
export function phashFromCanvas(src: CanvasImageSource): string {
  return phashFromRect(src, { x: 0, y: 0, w: P_IMG, h: P_IMG, rot: false }, true);
}

// --- Ausschnitt-Suche (gegen Versatz) ----------------------------------------
//
// Der pHash reagiert kaum auf Unschärfe/Licht (Abstand ~4), aber stark auf VERSATZ:
// schon 2 % Verschiebung kosten ~60 Bit, bei 4 % scheitert der Abgleich (gemessen an
// simulierten Kamerabildern). Darum hashen wir nicht nur den Rahmen, sondern ein
// kleines Raster verschobener/skalierter Ausschnitte und nehmen den besten Treffer:
// 50/50 korrekt statt 38/50, ohne einen einzigen Fehltreffer (leerer Tisch, Hand,
// überlappende Karten blieben alle außerhalb der Gates).

/** Verschiebungen (Anteil der Rahmengröße) und Skalierungen der Suche. */
export const SEARCH_SHIFTS = [-0.03, 0, 0.03] as const;
export const SEARCH_SCALES = [0.95, 1, 1.05] as const;

export interface SearchRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** 180° gedreht (kopfüber gehaltene Karte) */
  rot: boolean;
}

/**
 * Such-Ausschnitte um den Rahmen (x, y, w, h) herum, nur solche, die vollständig im
 * Quellbild (srcW × srcH) liegen. Dazu die 180°-Drehung der unskalierten Ausschnitte.
 * Rein (ohne DOM), damit testbar.
 */
export function searchRects(x: number, y: number, w: number, h: number, srcW: number, srcH: number): SearchRect[] {
  const out: SearchRect[] = [];
  const inside = (r: SearchRect) => r.x >= -0.5 && r.y >= -0.5 && r.x + r.w <= srcW + 0.5 && r.y + r.h <= srcH + 0.5;
  for (const sc of SEARCH_SCALES) {
    for (const dy of SEARCH_SHIFTS) {
      for (const dx of SEARCH_SHIFTS) {
        const ww = w * sc;
        const hh = h * sc;
        const r = { x: x + w / 2 + dx * w - ww / 2, y: y + h / 2 + dy * h - hh / 2, w: ww, h: hh, rot: false };
        if (inside(r)) out.push(r);
      }
    }
  }
  for (const r of out.filter((q) => q.w === w)) out.push({ ...r, rot: true });
  return out;
}

let searchCanvas: HTMLCanvasElement | null = null;

/** pHash eines Ausschnitts (direkt auf P_IMG² verkleinert, optional 180° gedreht). */
function phashFromRect(src: CanvasImageSource, r: SearchRect, whole = false): string {
  const n = P_IMG;
  const cv = searchCanvas ?? (searchCanvas = document.createElement('canvas'));
  cv.width = n; // setzt auch die Transformation zurück
  cv.height = n;
  const ctx = cv.getContext('2d', { willReadFrequently: true });
  if (!ctx) return '';
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  if (r.rot) {
    ctx.translate(n, n);
    ctx.rotate(Math.PI);
  }
  if (whole) ctx.drawImage(src, 0, 0, n, n);
  else ctx.drawImage(src, r.x, r.y, r.w, r.h, 0, 0, n, n);
  const d = ctx.getImageData(0, 0, n, n).data;
  const X = new Float64Array(n * n);
  for (let i = 0, p = 0; i < d.length; i += 4, p++) X[p] = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
  return phashFromGray(X);
}

/** Query-Hashes der Ausschnitt-Suche um den Kartenrahmen (für `nearestByHashMulti`). */
export function searchHashes(
  src: CanvasImageSource,
  x: number,
  y: number,
  w: number,
  h: number,
  srcW: number,
  srcH: number,
): string[] {
  return searchRects(x, y, w, h, srcW, srcH)
    .map((r) => phashFromRect(src, r))
    .filter((q) => !!q);
}

/** Bits (MSB zuerst je Byte) → Hex. Muss zur Pipeline (bits_to_hex) passen. */
export function packBitsMsb(bits: ArrayLike<number>): string {
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bits.length; i++) {
    if (bits[i]) bytes[i >> 3] |= 0x80 >> (i & 7);
  }
  return bytesToHex(bytes);
}

export function bytesToHex(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** Hex → Bytes (in `out` bei `offset`, sonst neues Array). */
export function hexToBytes(hex: string, out?: Uint8Array, offset = 0): Uint8Array {
  const b = out ?? new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) b[offset + i / 2] = parseInt(hex.slice(i, i + 2), 16);
  return b;
}

/** Hamming-Distanz zweier Hex-Hashes. */
export function hammingHex(a: string, b: string): number {
  const ba = hexToBytes(a);
  const bb = hexToBytes(b);
  let d = 0;
  for (let i = 0; i < ba.length; i++) d += POPCOUNT[ba[i] ^ bb[i]];
  return d;
}

// --- Index ------------------------------------------------------------------

/** Eine Zeile aus `hashes.json` (Pipeline-Ausgabe). */
export interface HashRow {
  id: string;
  card: string;
  alt: boolean;
  h: string;
}

export interface HashIndex {
  count: number;
  buf: Uint8Array; // count × 32 Byte, flach
  cards: string[];
  alts: boolean[];
}

export function buildHashIndex(rows: readonly HashRow[]): HashIndex {
  const ok = rows.filter((r) => typeof r.h === 'string' && r.h.length === HASH_BYTES * 2 && r.card);
  const buf = new Uint8Array(ok.length * HASH_BYTES);
  ok.forEach((r, i) => hexToBytes(r.h, buf, i * HASH_BYTES));
  return { count: ok.length, buf, cards: ok.map((r) => r.card), alts: ok.map((r) => !!r.alt) };
}

export interface HashMatch {
  cardId: string;
  /** Bester Treffer ist ein Alt-Art-Druck. */
  alt: boolean;
  /** Hamming-Distanz (0..256; klein = besser). */
  distance: number;
  /** Abstand zur nächsten FREMDEN Karte (groß = eindeutig). */
  margin: number;
  /** Abstand zur anderen Variante derselben Karte (Standard ↔ Alt); 256, wenn keine. */
  altMargin: number;
}

/**
 * Nächster Index-Hash (linearer Hamming-Scan, ~500 × 32 Byte = Bruchteil einer ms).
 * Der Margin misst gegen die nächste FREMDE Karte — Nachdrucke und die Alt-Art
 * derselben Karte sind keine Konkurrenz.
 */
export function nearestByHash(index: HashIndex, hashHex: string): HashMatch | null {
  if (index.count === 0 || hashHex.length !== HASH_BYTES * 2) return null;
  const q = hexToBytes(hashHex);
  const dist = new Uint16Array(index.count);
  let best = 257;
  let bi = -1;
  for (let i = 0; i < index.count; i++) {
    const off = i * HASH_BYTES;
    let d = 0;
    for (let k = 0; k < HASH_BYTES; k++) d += POPCOUNT[q[k] ^ index.buf[off + k]];
    dist[i] = d;
    if (d < best) {
      best = d;
      bi = i;
    }
  }
  if (bi < 0) return null;
  const card = index.cards[bi];
  const alt = index.alts[bi];
  let otherCard = 257;
  let otherVariant = 257;
  for (let i = 0; i < index.count; i++) {
    if (index.cards[i] !== card) otherCard = Math.min(otherCard, dist[i]);
    else if (index.alts[i] !== alt) otherVariant = Math.min(otherVariant, dist[i]);
  }
  return {
    cardId: card,
    alt,
    distance: best,
    margin: Math.min(otherCard, TOTAL_BITS) - best,
    altMargin: Math.min(otherVariant, TOTAL_BITS) - best,
  };
}

/**
 * Bester Treffer über mehrere Query-Hashes desselben Frames (Ausschnitt-Varianten +
 * 180°-Drehung): kleinste Distanz gewinnt, bei Gleichstand der größere Margin.
 */
export function nearestByHashMulti(index: HashIndex, hashes: readonly string[]): HashMatch | null {
  let best: HashMatch | null = null;
  for (const h of hashes) {
    if (!h) continue;
    const m = nearestByHash(index, h);
    if (!m) continue;
    if (!best || m.distance < best.distance || (m.distance === best.distance && m.margin > best.margin)) best = m;
  }
  return best;
}

// --- Laden (lazy, optional) ------------------------------------------------

const loaders = import.meta.glob<{ default: HashRow[] }>('./hashes.json');
let cache: Promise<HashIndex> | null = null;

/** Lädt den Hash-Index einmalig (eigener Chunk). Fehlt die Datei: leerer Index. */
export function loadHashIndex(): Promise<HashIndex> {
  if (!cache) {
    cache = (async () => {
      const load = Object.values(loaders)[0];
      if (!load) return buildHashIndex([]);
      try {
        return buildHashIndex((await load()).default ?? []);
      } catch {
        return buildHashIndex([]);
      }
    })();
  }
  return cache;
}
