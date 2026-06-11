/**
 * Procedurally generated sample room photo + white-on-black wall masks for mock
 * mode, encoded as real PNGs with Node's built-in zlib (no image dependencies).
 * The recolor shader samples masks in normalised UV space, so masks only need to
 * share the image's aspect, not its resolution.
 */

import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// Minimal PNG encoder (8-bit grayscale or RGB, no interlace).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** Encode raw pixels (gray: 1 byte/px, rgb: 3 bytes/px) as a PNG. */
function encodePng(width: number, height: number, pixels: Buffer, gray: boolean): Buffer {
  const channels = gray ? 1 : 3;
  const stride = width * channels;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter: none
    pixels.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = gray ? 0 : 2; // color type
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Tiny software rasteriser: scanline polygon fill.
// ---------------------------------------------------------------------------

type Pt = readonly [number, number];
type RGB = readonly [number, number, number];

function hex(c: string): RGB {
  return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)];
}

/** Fill a polygon, calling plot(x, y, t) where t runs 0 (top) → 1 (bottom). */
function fillPoly(pts: ReadonlyArray<Pt>, plot: (x: number, y: number, t: number) => void) {
  const ys = pts.map((p) => p[1]);
  const yMin = Math.max(0, Math.floor(Math.min(...ys)));
  const yMax = Math.ceil(Math.max(...ys));
  const span = Math.max(1, yMax - yMin);
  for (let y = yMin; y < yMax; y++) {
    const sy = y + 0.5;
    const xs: number[] = [];
    for (let i = 0; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      const [x2, y2] = pts[(i + 1) % pts.length]!;
      if ((y1 <= sy && y2 > sy) || (y2 <= sy && y1 > sy)) {
        xs.push(x1 + ((sy - y1) / (y2 - y1)) * (x2 - x1));
      }
    }
    xs.sort((a, b) => a - b);
    const t = (y - yMin) / span;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const from = Math.max(0, Math.round(xs[i]!));
      const to = Math.round(xs[i + 1]!);
      for (let x = from; x < to; x++) plot(x, y, t);
    }
  }
}

function rect(x1: number, y1: number, x2: number, y2: number): Pt[] {
  return [
    [x1, y1],
    [x2, y1],
    [x2, y2],
    [x1, y2],
  ];
}

class Canvas {
  readonly data: Buffer;
  constructor(
    readonly width: number,
    readonly height: number,
    readonly gray: boolean,
  ) {
    this.data = Buffer.alloc(width * height * (gray ? 1 : 3));
  }

  /** Fill with a flat colour, optionally fading brightness top→bottom for a hint of light. */
  fill(pts: ReadonlyArray<Pt>, color: RGB | number, fadeTo = 1) {
    fillPoly(pts, (x, y, t) => {
      if (x >= this.width || y >= this.height) return;
      const k = fadeTo === 1 ? 1 : 1 + (fadeTo - 1) * t;
      if (this.gray) {
        this.data[y * this.width + x] = typeof color === "number" ? color : color[0];
      } else {
        const [r, g, b] = color as RGB;
        const i = (y * this.width + x) * 3;
        this.data[i] = Math.min(255, Math.round(r * k));
        this.data[i + 1] = Math.min(255, Math.round(g * k));
        this.data[i + 2] = Math.min(255, Math.round(b * k));
      }
    });
  }

  png(): Buffer {
    return encodePng(this.width, this.height, this.data, this.gray);
  }
}

// ---------------------------------------------------------------------------
// The sample room (1024×768): back wall + accent wall + trim + window + sofa.
// ---------------------------------------------------------------------------

const W = 1024;
const H = 768;

// Shared geometry so the photo and its masks line up exactly.
const CEILING: Pt[] = [[0, 0], [W, 0], [764, 90], [260, 90]];
const LEFT_WALL: Pt[] = [[0, 0], [260, 90], [260, 560], [0, 690]];
const RIGHT_WALL: Pt[] = [[764, 90], [W, 0], [W, 690], [764, 560]];
const BACK_WALL: Pt[] = rect(260, 90, 764, 560);
const FLOOR: Pt[] = [[0, 690], [260, 560], [764, 560], [W, 690], [W, H], [0, H]];
const SKIRT_BACK: Pt[] = rect(260, 535, 764, 560);
const SKIRT_LEFT: Pt[] = [[0, 665], [260, 535], [260, 560], [0, 690]];
const SKIRT_RIGHT: Pt[] = [[764, 535], [W, 665], [W, 690], [764, 560]];
const WINDOW_OUTER: Pt[] = rect(424, 160, 624, 396);
const WINDOW_GLASS: Pt[] = rect(440, 176, 608, 380);
const FRAME_OUTER: Pt[] = [[78, 230], [196, 272], [196, 408], [78, 398]];
const FRAME_INNER: Pt[] = [[92, 248], [182, 286], [182, 392], [92, 384]];
const SOFA_BACK: Pt[] = rect(316, 408, 584, 480);
const SOFA_SEAT: Pt[] = rect(300, 470, 600, 562);
const RUG: Pt[] = [[396, 592], [704, 592], [768, 686], [332, 686]];

let sceneCache: { image: Buffer; masks: Record<"main" | "accent" | "trim", Buffer> } | null = null;

/** The bundled demo photo + perfectly matching segmentation masks. */
export function sampleRoomAssets() {
  if (sceneCache) return sceneCache;

  const img = new Canvas(W, H, false);
  img.fill(CEILING, hex("#efe8db"));
  img.fill(LEFT_WALL, hex("#c8b194"), 0.86);
  img.fill(RIGHT_WALL, hex("#d4c2a8"), 0.88);
  img.fill(BACK_WALL, hex("#dbcab1"), 0.9);
  img.fill(FLOOR, hex("#9a6f4e"), 1.12);
  img.fill(RUG, hex("#b3a489"), 1.05);
  img.fill(SKIRT_BACK, hex("#f0e9da"));
  img.fill(SKIRT_LEFT, hex("#e8e0d0"));
  img.fill(SKIRT_RIGHT, hex("#ece4d4"));
  img.fill(WINDOW_OUTER, hex("#f2ecdf"));
  img.fill(WINDOW_GLASS, hex("#b9cfd8"), 1.15);
  img.fill(rect(519, 176, 529, 380), hex("#f2ecdf")); // mullion
  img.fill(rect(440, 273, 608, 283), hex("#f2ecdf")); // transom
  img.fill(FRAME_OUTER, hex("#8a6f55"));
  img.fill(FRAME_INNER, hex("#c8b9a0"));
  img.fill(SOFA_BACK, hex("#7d6a55"), 0.92);
  img.fill(SOFA_SEAT, hex("#8a755e"), 0.9);

  const main = new Canvas(W, H, true);
  main.fill(BACK_WALL, 255);
  // Punch out everything sitting on the back wall so paint never bleeds onto it.
  for (const hole of [WINDOW_OUTER, SKIRT_BACK, SOFA_BACK, SOFA_SEAT]) main.fill(hole, 0);

  const accent = new Canvas(W, H, true);
  accent.fill(LEFT_WALL, 255);
  for (const hole of [FRAME_OUTER, SKIRT_LEFT]) accent.fill(hole, 0);

  const trim = new Canvas(W, H, true);
  for (const band of [SKIRT_BACK, SKIRT_LEFT, SKIRT_RIGHT]) trim.fill(band, 255);
  for (const hole of [SOFA_SEAT]) trim.fill(hole, 0);

  sceneCache = { image: img.png(), masks: { main: main.png(), accent: accent.png(), trim: trim.png() } };
  return sceneCache;
}

let genericCache: Record<"main" | "accent" | "trim", Buffer> | null = null;

/**
 * Rough one-size masks used when mock "segmentation" runs on a photo the tester
 * uploaded themselves: left third = accent, the rest = main, bottom band = trim.
 */
export function genericMasks() {
  if (genericCache) return genericCache;
  const w = 800;
  const h = 600;

  const accent = new Canvas(w, h, true);
  accent.fill(rect(0, 0, Math.round(w * 0.34), Math.round(h * 0.88)), 255);

  const main = new Canvas(w, h, true);
  main.fill(rect(Math.round(w * 0.34), 0, w, Math.round(h * 0.88)), 255);

  const trim = new Canvas(w, h, true);
  trim.fill(rect(0, Math.round(h * 0.88), w, Math.round(h * 0.96)), 255);

  genericCache = { main: main.png(), accent: accent.png(), trim: trim.png() };
  return genericCache;
}
