/**
 * A pixel-backed 2D canvas for jsdom.
 *
 * jsdom has no canvas at all — `getContext("2d")` returns null and logs "not
 * implemented" — so the studio tests that stub it to null (see visualizer.test.tsx) can
 * only assert on things that happen AROUND the pixels. The Mask Studio's interesting
 * behaviour IS the pixels: whether an alignment nudge moved every open mask by the same
 * amount, whether restoring the original actually brought the original back, whether a
 * mask nobody touched was left alone. Those need a real backing store.
 *
 * So this implements the operations the studio performs on its mask canvases, on a plain
 * RGBA array: clears, image data in and out, drawImage (translating and scaling, over
 * and destination-out), fills of the two shapes it draws, and the source-in tint. Path
 * stroking is deliberately a no-op — no test here drags a brush, and rasterising a thick
 * polyline correctly is a lot of code to support an assertion nobody makes.
 *
 * Not a canvas implementation. Just enough of one to tell the truth about masks.
 */

interface Pixels {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

const stores = new WeakMap<HTMLCanvasElement, StubContext>();

function parseColor(style: string): [number, number, number, number] {
  const s = style.trim().toLowerCase();
  const rgba = /^rgba?\(([^)]+)\)$/.exec(s);
  if (rgba) {
    const parts = rgba[1]!.split(",").map((p) => Number(p.trim()));
    return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0, Math.round((parts[3] ?? 1) * 255)];
  }
  const hex = s.replace("#", "");
  if (hex.length === 3) {
    return [
      parseInt(hex[0]! + hex[0]!, 16),
      parseInt(hex[1]! + hex[1]!, 16),
      parseInt(hex[2]! + hex[2]!, 16),
      255,
    ];
  }
  if (hex.length === 6) {
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
      255,
    ];
  }
  return [0, 0, 0, 255];
}

class StubContext {
  data: Uint8ClampedArray;
  width: number;
  height: number;

  globalCompositeOperation = "source-over";
  globalAlpha = 1;
  imageSmoothingEnabled = true;
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  lineCap = "butt";
  lineJoin = "miter";

  private path: Array<{ x: number; y: number }> = [];
  private disc: { x: number; y: number; r: number } | null = null;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.width = canvas.width;
    this.height = canvas.height;
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }

  /** The studio resizes canvases it reuses; follow it, blanking like a real one does. */
  sync() {
    if (this.canvas.width !== this.width || this.canvas.height !== this.height) {
      this.width = this.canvas.width;
      this.height = this.canvas.height;
      this.data = new Uint8ClampedArray(this.width * this.height * 4);
    }
  }

  // -- state / paths (shape recorded, ink laid down by fill) -----------------
  save() {}
  restore() {}
  setTransform() {}
  setLineDash() {}
  beginPath() {
    this.path = [];
    this.disc = null;
  }
  closePath() {}
  moveTo(x: number, y: number) {
    this.path.push({ x, y });
  }
  lineTo(x: number, y: number) {
    this.path.push({ x, y });
  }
  arc(x: number, y: number, r: number) {
    this.disc = { x, y, r };
  }
  stroke() {}

  // -- pixels ---------------------------------------------------------------
  private put(x: number, y: number, rgba: [number, number, number, number]) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    const i = (y * this.width + x) * 4;
    if (this.globalCompositeOperation === "destination-out") {
      this.data[i + 3] = Math.round(this.data[i + 3]! * (1 - rgba[3] / 255));
      return;
    }
    this.data[i] = rgba[0];
    this.data[i + 1] = rgba[1];
    this.data[i + 2] = rgba[2];
    this.data[i + 3] = rgba[3];
  }

  clearRect(x: number, y: number, w: number, h: number) {
    this.sync();
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.height, (y + h) | 0); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.width, (x + w) | 0); xx++) {
        const i = (yy * this.width + xx) * 4;
        this.data[i] = 0;
        this.data[i + 1] = 0;
        this.data[i + 2] = 0;
        this.data[i + 3] = 0;
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number) {
    this.sync();
    const [r, g, b, a] = parseColor(this.fillStyle);
    const sourceIn = this.globalCompositeOperation === "source-in";
    for (let yy = Math.max(0, y | 0); yy < Math.min(this.height, (y + h) | 0); yy++) {
      for (let xx = Math.max(0, x | 0); xx < Math.min(this.width, (x + w) | 0); xx++) {
        const i = (yy * this.width + xx) * 4;
        // source-in recolours what is already there and keeps its coverage — that is
        // how the studio tints a mask without changing its shape.
        if (sourceIn) {
          if (this.data[i + 3]! === 0) continue;
          this.data[i] = r;
          this.data[i + 1] = g;
          this.data[i + 2] = b;
          continue;
        }
        this.put(xx, yy, [r, g, b, a]);
      }
    }
  }

  fill() {
    this.sync();
    const [r, g, b, a] = parseColor(this.fillStyle);
    if (this.disc) {
      const { x, y, r: rad } = this.disc;
      for (let yy = Math.floor(y - rad); yy <= Math.ceil(y + rad); yy++) {
        for (let xx = Math.floor(x - rad); xx <= Math.ceil(x + rad); xx++) {
          if (Math.hypot(xx - x, yy - y) <= rad) this.put(xx, yy, [r, g, b, a]);
        }
      }
      return;
    }
    if (this.path.length < 3) return;
    // Even-odd scanline fill — enough for the convex-ish outlines the corners tool makes.
    const ys = this.path.map((p) => p.y);
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const bottom = Math.min(this.height - 1, Math.ceil(Math.max(...ys)));
    for (let yy = top; yy <= bottom; yy++) {
      const xs: number[] = [];
      for (let i = 0; i < this.path.length; i++) {
        const p1 = this.path[i]!;
        const p2 = this.path[(i + 1) % this.path.length]!;
        if (p1.y === p2.y) continue;
        const lo = Math.min(p1.y, p2.y);
        const hi = Math.max(p1.y, p2.y);
        if (yy + 0.5 < lo || yy + 0.5 >= hi) continue;
        xs.push(p1.x + ((yy + 0.5 - p1.y) / (p2.y - p1.y)) * (p2.x - p1.x));
      }
      xs.sort((m, n) => m - n);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let xx = Math.ceil(xs[k]!); xx <= Math.floor(xs[k + 1]!); xx++) {
          this.put(xx, yy, [r, g, b, a]);
        }
      }
    }
  }

  createImageData(w: number, h: number): Pixels {
    return { data: new Uint8ClampedArray(w * h * 4), width: w, height: h };
  }

  getImageData(x: number, y: number, w: number, h: number): Pixels {
    this.sync();
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = x + xx;
        const sy = y + yy;
        if (sx < 0 || sy < 0 || sx >= this.width || sy >= this.height) continue;
        const si = (sy * this.width + sx) * 4;
        const di = (yy * w + xx) * 4;
        out[di] = this.data[si]!;
        out[di + 1] = this.data[si + 1]!;
        out[di + 2] = this.data[si + 2]!;
        out[di + 3] = this.data[si + 3]!;
      }
    }
    return { data: out, width: w, height: h };
  }

  putImageData(img: Pixels, x: number, y: number) {
    this.sync();
    for (let yy = 0; yy < img.height; yy++) {
      for (let xx = 0; xx < img.width; xx++) {
        const dx = x + xx;
        const dy = y + yy;
        if (dx < 0 || dy < 0 || dx >= this.width || dy >= this.height) continue;
        const si = (yy * img.width + xx) * 4;
        const di = (dy * this.width + dx) * 4;
        // putImageData replaces outright — it ignores the composite mode, as in a browser.
        this.data[di] = img.data[si]!;
        this.data[di + 1] = img.data[si + 1]!;
        this.data[di + 2] = img.data[si + 2]!;
        this.data[di + 3] = img.data[si + 3]!;
      }
    }
  }

  drawImage(src: unknown, dx: number, dy: number, dw?: number, dh?: number) {
    this.sync();
    const from = pixelsOf(src);
    if (!from) return;
    const w = dw ?? from.width;
    const h = dh ?? from.height;
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        const sx = Math.min(from.width - 1, Math.floor((xx * from.width) / w));
        const sy = Math.min(from.height - 1, Math.floor((yy * from.height) / h));
        const si = (sy * from.width + sx) * 4;
        const a = from.data[si + 3]!;
        if (a === 0) continue;
        this.put(dx + xx, dy + yy, [from.data[si]!, from.data[si + 1]!, from.data[si + 2]!, a]);
      }
    }
  }
}

/** The backing store behind any canvas (or canvas-shaped stand-in for an image). */
function pixelsOf(src: unknown): Pixels | null {
  const canvas = src as HTMLCanvasElement;
  const ctx = canvas && stores.get(canvas);
  if (!ctx) return null;
  ctx.sync();
  return { data: ctx.data, width: ctx.width, height: ctx.height };
}

/**
 * Give every canvas in this jsdom a working 2D context. Returns the undo, for afterAll.
 */
export function installCanvas2D(): () => void {
  const original = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d") return null;
    let ctx = stores.get(this);
    if (!ctx) {
      ctx = new StubContext(this);
      stores.set(this, ctx);
    }
    ctx.sync();
    return ctx;
  } as unknown as typeof HTMLCanvasElement.prototype.getContext;
  return () => {
    HTMLCanvasElement.prototype.getContext = original;
  };
}

/** A canvas filled white inside `rect` — a stand-in for a stored mask PNG. */
export function maskCanvas(
  w: number,
  h: number,
  rect: { x: number; y: number; w: number; h: number },
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  return canvas;
}

/**
 * Is this pixel part of the mask?
 *
 * Both tests — opaque AND white — because the studio holds masks in two shapes and the
 * assertions have to read either. A working canvas is white on TRANSPARENT, so alpha
 * alone would do; a saved one is white on opaque BLACK, where alpha alone says every
 * pixel in the photo is covered.
 */
function covered(data: Uint8ClampedArray, i: number): boolean {
  return data[i + 3]! > 127 && data[i]! > 127;
}

/** Every pixel with coverage, as "x,y" strings — the shape of a mask, comparably. */
export function coveredPixels(canvas: HTMLCanvasElement): Set<string> {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const out = new Set<string>();
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (covered(img.data, (y * img.width + x) * 4)) out.add(`${x},${y}`);
    }
  }
  return out;
}

/** The tight bounding box of a mask's coverage, or null if it has none. */
export function coverageBox(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext("2d")!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      if (covered(img.data, (y * img.width + x) * 4)) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  return minX === Infinity ? null : { minX, minY, maxX, maxY };
}
