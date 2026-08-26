/**
 * Measuring a recolour the way a rendering complaint has to be measured.
 *
 * "The walls look flat" is a real defect and an unfalsifiable sentence. These are the
 * numbers behind it, computed from the pixels actually on screen, restricted to the
 * pixels one mask covers — so the answer is about a wall rather than about a photo
 * that happens to contain sky, furniture and a window.
 *
 * The one that matters most is {@link LumaStats.spread}. A real wall plane in daylight
 * spans a wide brightness range — that spread IS the realism — and the recolour engine
 * works by MODULATING the swatch with the light it finds in the canvas underneath. So
 * if the canvas arrives with its light already flattened, the engine has nothing to
 * modulate and multiplies by a near-constant, which is a flat sticker no matter how
 * good the shader is. Reading the base canvas's spread separately from the photo's is
 * what tells a shading bug apart from a canvas that was handed over pre-flattened.
 *
 * Everything here is pure measurement over ImageData: no engine calls, no network, and
 * nothing that writes. The caller supplies already-rasterized pixels, all at one shared
 * working resolution, so every comparison is pixel-aligned by construction and there is
 * no registration error to argue about.
 */

/** Luminance distribution over a masked region, in 0..255. */
export interface LumaStats {
  /** 5th percentile — the region's shadow floor. */
  p5: number;
  /** 95th percentile — its lit peak. */
  p95: number;
  mean: number;
  /**
   * p95 / p5: how many times brighter the lit part is than the shadowed part.
   *
   * Percentiles rather than raw min/max on purpose — one stray specular pixel or one
   * black window mullion inside a sloppy mask would otherwise set the whole figure,
   * and this number is meant to describe the plane, not its worst pixel.
   */
  spread: number;
}

/** Least-squares fit of one output channel against the same channel underneath. */
export interface ChannelFit {
  slope: number;
  intercept: number;
  /** 1.0 = the output is EXACTLY an affine function of the layer below it. */
  r2: number;
}

/**
 * How the painted output relates to the canvas under it.
 *
 * A pure multiply shows up as intercept ≈ 0 with R² ≈ 1, and the slope is then just the
 * colour ratio. That is not damning on its own — multiplicative shading is the correct
 * model for paint on a lit surface. It is damning together with a low base spread: a
 * multiply by something that does not vary is a fill.
 */
export interface BlendFit {
  r: ChannelFit;
  g: ChannelFit;
  b: ChannelFit;
  meanR2: number;
}

/** Micro-detail: whether the surface texture on screen came from the photograph. */
export interface TextureStats {
  /** Mean |Laplacian| of the base canvas — its real high-frequency energy. */
  baseEnergy: number;
  /** The same for the painted output. */
  paintedEnergy: number;
  /** painted / base. Well above 1 means texture was ADDED, not carried through. */
  ratio: number;
  /**
   * Pearson r between the two high-pass signals, over the same pixels.
   *
   * Near 1 = the output's texture IS the photo's texture, riding on a new colour.
   * Near 0 = the two are unrelated, i.e. the real grain was dropped and something
   * synthetic put in its place. Sign is kept: a negative r is its own bug.
   */
  correlation: number;
}

/** How soft the mask boundary is, which is how pasted-on the edge reads. */
export interface EdgeStats {
  /** Median 10%→90% transition, in mask pixels. */
  medianMaskPx: number;
  /** The same distance expressed on the canvas the mask is stretched onto. */
  medianCanvasPx: number;
  /** How many boundary crossings the median is taken over. */
  transitions: number;
}

export interface SurfaceMetrics {
  /** Mask pixels the statistics are taken over, at the working resolution. */
  samples: number;
  /** The ORIGINAL photograph — the light as the camera recorded it. */
  photo: LumaStats;
  /** The canvas actually being painted. Equal to `photo` when they are the same image. */
  base: LumaStats;
  /** What comes out of the engine. */
  painted: LumaStats;
  fit: BlendFit;
  texture: TextureStats;
  edge: EdgeStats | null;
}

const LUMA_R = 0.2126;
const LUMA_G = 0.7152;
const LUMA_B = 0.0722;

/** Mask foreground: bright pixel (white-on-black), respecting alpha. */
const MASK_ALPHA_MIN = 127;
const MASK_SUM_MIN = 382;

/**
 * Draw any image source onto a fresh w×h grid and return its pixels.
 *
 * Every layer goes through this at ONE shared size, which is what makes the
 * comparisons below pixel-aligned. Smoothing is the caller's choice: on for photos
 * and canvases (a box-filtered downscale is the honest average), off for masks, whose
 * hard 0/255 steps must not be invented into ramps before the edge is measured.
 */
export function rasterize(
  source: CanvasImageSource,
  w: number,
  h: number,
  smooth: boolean,
): ImageData | null {
  if (typeof document === "undefined") return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(source, 0, 0, w, h);
  try {
    return ctx.getImageData(0, 0, w, h);
  } catch {
    return null; // tainted canvas — report nothing rather than a wrong number
  }
}

/** 0/1 foreground bitmap from a white-on-black mask. */
export function maskBits(mask: ImageData): Uint8Array {
  const d = mask.data;
  const bits = new Uint8Array(d.length / 4);
  for (let i = 0; i < bits.length; i++) {
    const o = i * 4;
    if ((d[o + 3] ?? 0) > MASK_ALPHA_MIN &&
        (d[o] ?? 0) + (d[o + 1] ?? 0) + (d[o + 2] ?? 0) > MASK_SUM_MIN) {
      bits[i] = 1;
    }
  }
  return bits;
}

const lumaAt = (d: Uint8ClampedArray, o: number) =>
  LUMA_R * (d[o] ?? 0) + LUMA_G * (d[o + 1] ?? 0) + LUMA_B * (d[o + 2] ?? 0);

function percentile(sorted: Float64Array, p: number): number {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.round((p / 100) * (sorted.length - 1))));
  return sorted[i]!;
}

/** Luminance distribution of the masked pixels of one layer. */
export function lumaStats(px: ImageData, bits: Uint8Array): LumaStats {
  const d = px.data;
  const vals = new Float64Array(bits.length);
  let n = 0;
  let sum = 0;
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const L = lumaAt(d, i * 4);
    vals[n++] = L;
    sum += L;
  }
  if (n === 0) return { p5: 0, p95: 0, mean: 0, spread: 1 };
  const sorted = vals.slice(0, n).sort();
  const p5 = percentile(sorted, 5);
  const p95 = percentile(sorted, 95);
  return {
    p5: round1(p5),
    p95: round1(p95),
    mean: round1(sum / n),
    // A floor on the denominator: a genuinely black region would otherwise divide by
    // ~0 and report a spread of thousands, which says nothing about the plane.
    spread: round2(p95 / Math.max(p5, 1)),
  };
}

function fitChannel(base: Float64Array, out: Float64Array, n: number): ChannelFit {
  if (n < 2) return { slope: 0, intercept: 0, r2: 0 };
  let sx = 0, sy = 0;
  for (let i = 0; i < n; i++) { sx += base[i]!; sy += out[i]!; }
  const mx = sx / n, my = sy / n;
  let sxx = 0, sxy = 0, syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = base[i]! - mx;
    const dy = out[i]! - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  // A base with no variance has no line to fit — which is itself the finding, and is
  // reported honestly as R² 0 rather than as a spurious perfect fit.
  if (sxx < 1e-9 || syy < 1e-9) return { slope: 0, intercept: round2(my), r2: 0 };
  const slope = sxy / sxx;
  return {
    slope: round3(slope),
    intercept: round2(my - slope * mx),
    r2: round3((sxy * sxy) / (sxx * syy)),
  };
}

/** Regress the painted output against the canvas under it, per channel. */
export function blendFit(base: ImageData, painted: ImageData, bits: Uint8Array): BlendFit {
  const bd = base.data;
  const pd = painted.data;
  const bx = new Float64Array(bits.length);
  const px = new Float64Array(bits.length);
  const out: ChannelFit[] = [];
  for (let ch = 0; ch < 3; ch++) {
    let n = 0;
    for (let i = 0; i < bits.length; i++) {
      if (!bits[i]) continue;
      bx[n] = bd[i * 4 + ch] ?? 0;
      px[n] = pd[i * 4 + ch] ?? 0;
      n++;
    }
    out.push(fitChannel(bx, px, n));
  }
  const [r, g, b] = out as [ChannelFit, ChannelFit, ChannelFit];
  return { r, g, b, meanR2: round3((r.r2 + g.r2 + b.r2) / 3) };
}

/** 4-neighbour Laplacian of luminance — the high-pass this uses as "texture". */
function laplacian(px: ImageData, w: number, h: number): Float64Array {
  const d = px.data;
  const out = new Float64Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      out[i] =
        4 * lumaAt(d, i * 4) -
        lumaAt(d, (i - 1) * 4) -
        lumaAt(d, (i + 1) * 4) -
        lumaAt(d, (i - w) * 4) -
        lumaAt(d, (i + w) * 4);
    }
  }
  return out;
}

/**
 * Whether the texture on screen came from the photograph.
 *
 * Only pixels whose whole 4-neighbourhood is inside the mask are counted. Including
 * the boundary would measure the mask's own edge — a huge luminance step — as if it
 * were plaster, and that step alone would carry both the energy and the correlation.
 */
export function textureStats(
  base: ImageData, painted: ImageData, bits: Uint8Array, w: number, h: number,
): TextureStats {
  const lb = laplacian(base, w, h);
  const lp = laplacian(painted, w, h);
  let n = 0, sb = 0, sp = 0;
  const bv = new Float64Array(bits.length);
  const pv = new Float64Array(bits.length);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      if (!bits[i] || !bits[i - 1] || !bits[i + 1] || !bits[i - w] || !bits[i + w]) continue;
      bv[n] = lb[i]!;
      pv[n] = lp[i]!;
      sb += Math.abs(lb[i]!);
      sp += Math.abs(lp[i]!);
      n++;
    }
  }
  if (n < 2) {
    return { baseEnergy: 0, paintedEnergy: 0, ratio: 0, correlation: 0 };
  }
  const baseEnergy = sb / n;
  const paintedEnergy = sp / n;
  let mb = 0, mp = 0;
  for (let i = 0; i < n; i++) { mb += bv[i]!; mp += pv[i]!; }
  mb /= n; mp /= n;
  let cov = 0, vb = 0, vp = 0;
  for (let i = 0; i < n; i++) {
    const db = bv[i]! - mb;
    const dp = pv[i]! - mp;
    cov += db * dp;
    vb += db * db;
    vp += dp * dp;
  }
  const denom = Math.sqrt(vb * vp);
  return {
    baseEnergy: round2(baseEnergy),
    paintedEnergy: round2(paintedEnergy),
    ratio: round2(paintedEnergy / Math.max(baseEnergy, 1e-6)),
    correlation: denom < 1e-9 ? 0 : round3(cov / denom),
  };
}

/**
 * Median 10%→90% transition width along the mask's boundary.
 *
 * Measured on the mask at its OWN resolution — a downscale would invent the very ramp
 * being measured. Rows only: a wall boundary that is purely horizontal would be missed,
 * but every real room has verticals, and scanning both doubles the cost for a figure
 * whose median barely moves.
 */
export function edgeStats(mask: ImageData, canvasW: number): EdgeStats | null {
  const { width: w, height: h, data } = mask;
  const runs: number[] = [];
  for (let y = 0; y < h; y++) {
    let run = 0;
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      const v = (data[o] ?? 0) / 255;
      if (v > 0.1 && v < 0.9) {
        run++;
      } else {
        // A crossing with no in-between pixels at all is a perfectly hard edge, and
        // is recorded as 0 rather than skipped — those are the ones being counted.
        if (run > 0) { runs.push(run); run = 0; }
        else if (x > 0) {
          const prev = (data[(y * w + x - 1) * 4] ?? 0) / 255;
          if ((prev <= 0.1 && v >= 0.9) || (prev >= 0.9 && v <= 0.1)) runs.push(0);
        }
      }
    }
    if (run > 0) runs.push(run);
  }
  if (runs.length === 0) return null;
  runs.sort((a, b) => a - b);
  const median = runs[Math.floor(runs.length / 2)]!;
  return {
    medianMaskPx: median,
    medianCanvasPx: round2(median * (canvasW / w)),
    transitions: runs.length,
  };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** Longest side of the grid every layer is compared on. */
export const METRICS_MAX_DIM = 900;

export interface MeasureInputs {
  /** The original photograph, always — the light as the camera recorded it. */
  photo: CanvasImageSource;
  /** The canvas being painted (the cleaned image, or the photo again). */
  base: CanvasImageSource;
  /** The engine's own canvas, read back after a render. */
  painted: CanvasImageSource;
  /** This surface's stored mask. */
  mask: CanvasImageSource;
  /** Canvas width in real pixels, for expressing the edge width at true scale. */
  canvasWidth: number;
  /** Working grid. Defaults to a box fitting METRICS_MAX_DIM. */
  size: { w: number; h: number };
}

/**
 * Every figure for one surface, in one pass.
 *
 * Returns null when any layer cannot be read — a tainted canvas, or a browser with no
 * 2D context. A missing number is reported as missing; there is no partial result here
 * that could be mistaken for a measurement.
 */
export function measureSurface(input: MeasureInputs): SurfaceMetrics | null {
  const { w, h } = input.size;
  const photo = rasterize(input.photo, w, h, true);
  const base = rasterize(input.base, w, h, true);
  const painted = rasterize(input.painted, w, h, true);
  const maskSmall = rasterize(input.mask, w, h, false);
  if (!photo || !base || !painted || !maskSmall) return null;

  const bits = maskBits(maskSmall);
  let samples = 0;
  for (let i = 0; i < bits.length; i++) samples += bits[i]!;
  if (samples < 64) return null; // too little of the frame to say anything about

  // The edge is measured on the mask at its OWN size, not the working grid.
  const native = sizeOf(input.mask);
  const maskFull = native ? rasterize(input.mask, native.w, native.h, false) : null;

  return {
    samples,
    photo: lumaStats(photo, bits),
    base: lumaStats(base, bits),
    painted: lumaStats(painted, bits),
    fit: blendFit(base, painted, bits),
    texture: textureStats(base, painted, bits, w, h),
    edge: maskFull ? edgeStats(maskFull, input.canvasWidth) : null,
  };
}

/** Working grid for a canvas of these dimensions, capped at METRICS_MAX_DIM. */
export function metricsSize(w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, METRICS_MAX_DIM / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function sizeOf(s: CanvasImageSource): { w: number; h: number } | null {
  const any = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = Number(any.naturalWidth || any.width || 0);
  const h = Number(any.naturalHeight || any.height || 0);
  return w > 0 && h > 0 ? { w, h } : null;
}
