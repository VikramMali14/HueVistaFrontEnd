// @vitest-environment jsdom
/**
 * Cropping and re-encoding — the arithmetic that makes "that image is too large"
 * and "the wrong shape" impossible to reach rather than merely reported.
 *
 * The canvas is stubbed rather than run: jsdom has no raster engine, and what is
 * worth pinning here is not that a browser can draw, but the decisions made
 * around the drawing — where a centred crop lands, that a crop can never leave
 * the image, that the target dimensions are computed from the CROP and not the
 * original, and that quality is stepped down until the byte budget is met.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { centredCrop, clampCrop, cropAndEncode, type CropRect } from "../image-upload";

describe("centredCrop", () => {
  it("keeps the full height and trims the sides of a too-wide image", () => {
    // 4000×2000 (2:1) into 1:1 → a 2000-wide square, centred.
    expect(centredCrop(4000, 2000, 1)).toEqual({ x: 1000, y: 0, width: 2000, height: 2000 });
  });

  it("keeps the full width and trims top and bottom of a too-tall image", () => {
    // 1000×4000 into 2:1 → 1000×500, centred vertically.
    expect(centredCrop(1000, 4000, 2)).toEqual({ x: 0, y: 1750, width: 1000, height: 500 });
  });

  it("takes the whole image when it is already the target shape", () => {
    const crop = centredCrop(2100, 1000, 2.1);
    expect(crop).toEqual({ x: 0, y: 0, width: 2100, height: 1000 });
  });
});

describe("clampCrop", () => {
  it("pushes a crop that has been dragged off the edge back inside", () => {
    expect(clampCrop({ x: -50, y: -80, width: 400, height: 300 }, 1000, 800))
      .toEqual({ x: 0, y: 0, width: 400, height: 300 });
    expect(clampCrop({ x: 900, y: 700, width: 400, height: 300 }, 1000, 800))
      .toEqual({ x: 600, y: 500, width: 400, height: 300 });
  });

  it("shrinks a crop that is bigger than the image rather than overflowing it", () => {
    expect(clampCrop({ x: 0, y: 0, width: 4000, height: 4000 }, 1000, 800))
      .toEqual({ x: 0, y: 0, width: 1000, height: 800 });
  });
});

describe("cropAndEncode", () => {
  const drawImage = vi.fn();
  const toBlobCalls: Array<{ type: string; quality: number }> = [];
  /** Bytes the stub pretends each quality produces; index matches call order. */
  let sizes: number[];
  let canvases: HTMLCanvasElement[];

  const originalCreate = document.createElement.bind(document);

  beforeEach(() => {
    drawImage.mockClear();
    toBlobCalls.length = 0;
    sizes = [];
    canvases = [];
    vi.spyOn(document, "createElement").mockImplementation((tag: string, ...rest) => {
      const el = originalCreate(tag as "canvas", ...(rest as []));
      if (tag !== "canvas") return el;
      const canvas = el as HTMLCanvasElement;
      canvases.push(canvas);
      canvas.getContext = vi.fn(() => ({ drawImage, imageSmoothingEnabled: false, imageSmoothingQuality: "low" })) as never;
      canvas.toBlob = ((cb: BlobCallback, type: string, quality: number) => {
        const size = sizes[toBlobCalls.length] ?? 1000;
        toBlobCalls.push({ type, quality });
        cb(new Blob([new Uint8Array(size)], { type }));
      }) as never;
      return canvas;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const img = (w: number, h: number) =>
    ({ naturalWidth: w, naturalHeight: h, src: "" }) as unknown as HTMLImageElement;

  const full = (w: number, h: number): CropRect => ({ x: 0, y: 0, width: w, height: h });

  it("sizes the canvas from the CROP, scaled to maxDim — not from the original", async () => {
    sizes = [500];
    // A 6000×4000 photo cropped to a 2000×1000 strip, capped at 1000px.
    await cropAndEncode(img(6000, 4000), { x: 100, y: 100, width: 2000, height: 1000 }, { maxDim: 1000 });
    const canvas = canvases[0]!;
    expect(canvas.width).toBe(1000);
    expect(canvas.height).toBe(500);
    // Source rectangle is the crop; destination is the whole scaled canvas.
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 100, 100, 2000, 1000, 0, 0, 1000, 500);
  });

  it("never scales a small crop UP to fill maxDim", async () => {
    sizes = [400];
    await cropAndEncode(img(800, 600), full(800, 600), { maxDim: 4000 });
    expect(canvases[0]!.width).toBe(800);
    expect(canvases[0]!.height).toBe(600);
  });

  it("stops at the first quality that meets the byte budget", async () => {
    // 5 MB, then 3 MB, then 1 MB — the budget is 2 MB, so the third one wins.
    sizes = [5_000_000, 3_000_000, 1_000_000];
    const out = await cropAndEncode(img(2000, 1000), full(2000, 1000), { maxBytes: 2_000_000 });
    expect(toBlobCalls.map((c) => c.quality)).toEqual([0.9, 0.82, 0.72]);
    expect(out.size).toBe(1_000_000);
  });

  it("encodes once when the first attempt is already small enough", async () => {
    sizes = [100_000];
    await cropAndEncode(img(2000, 1000), full(2000, 1000), { maxBytes: 8_000_000 });
    expect(toBlobCalls).toHaveLength(1);
  });

  it("returns the last attempt rather than failing when nothing fits the budget", async () => {
    // Below 0.5 the artefacts would show on a photograph, so the caller's own
    // validation gets the final word instead of this throwing.
    sizes = [9, 8, 7, 6, 5].map((n) => n * 1_000_000);
    const out = await cropAndEncode(img(2000, 1000), full(2000, 1000), { maxBytes: 1_000 });
    expect(toBlobCalls).toHaveLength(5);
    expect(out.size).toBe(5_000_000);
  });

  it("clamps a crop that runs past the edge before drawing it", async () => {
    sizes = [500];
    await cropAndEncode(img(1000, 800), { x: 900, y: 700, width: 400, height: 300 }, { maxDim: 4000 });
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 600, 500, 400, 300, 0, 0, 400, 300);
  });

  it("names the file for the format it actually encoded", async () => {
    sizes = [500];
    const jpeg = await cropAndEncode(img(100, 100), full(100, 100), { filename: "Room Photo.PNG" });
    expect(jpeg.name).toBe("Room Photo.jpg");
    expect(jpeg.type).toBe("image/jpeg");

    sizes = [500];
    const webp = await cropAndEncode(img(100, 100), full(100, 100), { filename: "shot.jpeg", type: "image/webp" });
    expect(webp.name).toBe("shot.webp");
  });

  it("says so plainly when the browser cannot give it a canvas", async () => {
    vi.spyOn(document, "createElement").mockImplementation((tag: string, ...rest) => {
      const el = originalCreate(tag as "canvas", ...(rest as []));
      if (tag === "canvas") (el as HTMLCanvasElement).getContext = vi.fn(() => null) as never;
      return el;
    });
    await expect(cropAndEncode(img(100, 100), full(100, 100))).rejects.toThrow(/could not prepare/i);
  });
});
