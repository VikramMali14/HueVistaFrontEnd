/**
 * The printable QR poster a shop downloads for its kiosk counter.
 *
 * The store link is only worth having once it is on the wall, and telling a
 * shopkeeper to "print it as a QR" left them to find a QR generator, paste a URL
 * into it and lay the result out themselves — with nothing on the sheet saying
 * whose counter it belongs to. This builds the finished sheet instead: the
 * HueVista wordmark, the shop's own name, and the QR to its store link.
 *
 * Drawn on a canvas at A4/150dpi so it prints at a full page without going soft,
 * and always in ink-on-paper colours — this is the one surface in the app that
 * must ignore the viewer's theme, because a dark-mode poster would waste a
 * cartridge and scan worse than the white one.
 */
import type { BitMatrix } from "qrcode";

/** A4 at 150dpi. Big enough to print full-page, small enough to stay a quick PNG. */
const WIDTH = 1240;
const HEIGHT = 1754;
const MARGIN = 110;
const CONTENT = WIDTH - MARGIN * 2;

/**
 * Fixed print palette, tracking the light theme's tokens (globals.css §2b) rather
 * than reading them — the poster leaves the browser, so it cannot borrow whatever
 * theme the shopkeeper happens to be using.
 */
const PAPER = "#ffffff";
const INK = "#1a1828";
const INK_SOFT = "#3d3a55";
const INK_MUTE = "#6b687e";
const ACCENT = "#7c5cff";
const ACCENT_SOFT = "#a080ff";
const ACCENT_DEEP = "#5a3fcc";
const RULE = "#d8d5e2";

/**
 * The QR itself is pure black regardless of the ink used for text. Scanners read
 * contrast, and a cheap phone camera under shop lighting should not be asked to
 * work harder than it must for the sake of matching a brand colour.
 */
const QR_INK = "#000000";

export interface KioskPosterInput {
  /** The shop's name, printed under the wordmark. */
  shopName: string;
  /** Absolute URL of the shop's public store page — what the QR encodes. */
  url: string;
}

/** Measures `text` at `size` px in the face a block is drawn in. */
export type Measure = (text: string, size: number) => number;

// ── Layout maths (pure, so the awkward cases are testable without a canvas) ──

/**
 * Greedy word wrap. A single word wider than `maxWidth` keeps its own overlong
 * line; `fitHeadline` is what decides whether to shrink or clip it.
 */
export function wrapWords(text: string, size: number, maxWidth: number, measure: Measure): string[] {
  const [first, ...rest] = text.trim().split(/\s+/).filter(Boolean);
  if (first === undefined) return [];
  const lines: string[] = [];
  let line = first;
  for (const word of rest) {
    const candidate = `${line} ${word}`;
    if (measure(candidate, size) <= maxWidth) line = candidate;
    else {
      lines.push(line);
      line = word;
    }
  }
  lines.push(line);
  return lines;
}

/** Trims `text` until it fits `maxWidth`, ending in an ellipsis. */
export function ellipsise(text: string, size: number, maxWidth: number, measure: Measure): string {
  if (measure(text, size) <= maxWidth) return text;
  let cut = text;
  while (cut.length > 1 && measure(`${cut.trimEnd()}…`, size) > maxWidth) {
    cut = cut.slice(0, -1);
  }
  return `${cut.trimEnd()}…`;
}

/**
 * Picks the largest size at which a shop name fits the sheet in `maxLines`,
 * clipping only when even the smallest size cannot hold it.
 *
 * Shop names run from "Ravi Paints" to "Shree Balaji Paints & Hardware Traders" —
 * setting one size for both would either shrink the short name to nothing or run
 * the long one off the page.
 */
export function fitHeadline(
  text: string,
  opts: {
    maxWidth: number;
    maxLines: number;
    /** Largest first. Typed non-empty because "no size at all" has no answer. */
    sizes: readonly [number, ...number[]];
    measure: Measure;
  },
): { size: number; lines: string[] } {
  const { maxWidth, maxLines, sizes, measure } = opts;
  let size = sizes[0];
  for (const candidate of sizes) {
    size = candidate;
    const lines = wrapWords(text, size, maxWidth, measure);
    if (lines.length <= maxLines && lines.every((l) => measure(l, size) <= maxWidth)) {
      return { size, lines };
    }
  }
  // Nothing fit, so clip at the smallest size — `size` came out of the loop holding it.
  const lines = wrapWords(text, size, maxWidth, measure).slice(0, maxLines);
  const tail = lines.pop();
  if (tail !== undefined) lines.push(ellipsise(tail, size, maxWidth, measure));
  return { size, lines };
}

/**
 * What the downloaded file is called. Shops print for more than one counter and
 * download more than once, so the name has to say which shop it is rather than
 * landing as another `download (3).png`.
 */
export function kioskPosterFileName(shopName: string): string {
  const slug = shopName
    .normalize("NFKD")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 48)
    .replace(/^-+|-+$/g, "");
  return slug ? `huevista-${slug}-qr.png` : "huevista-kiosk-qr.png";
}

// ── Painting ────────────────────────────────────────────────────────────────

type Ctx = CanvasRenderingContext2D;

/**
 * A font shorthand in the face the app itself uses.
 *
 * next/font hashes its family names, so they can only be had from the live
 * `--serif`/`--sans`/`--mono` variables on `<html>`. The literal fallback covers
 * the case where the variable has not resolved — an invalid shorthand is
 * silently ignored by canvas, which would leave a block in whatever face the
 * previous one used.
 */
function face(token: "--serif" | "--sans" | "--mono", fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(token).trim();
  return value.startsWith(",") || value === "" ? fallback : value;
}

/** Draws `text` centred on `cx`, top-aligned at `y`. Returns the y below it. */
function centred(ctx: Ctx, text: string, cx: number, y: number, font: string, fill: string, lineHeight: number): number {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  ctx.fillText(text, cx, y);
  return y + lineHeight;
}

/**
 * Centred text with letter-spacing, drawn a character at a time.
 *
 * `ctx.letterSpacing` would do this in one line but is too new to rely on for a
 * file the shop is going to print — where it is missing the eyebrow would set
 * solid and stop reading as the app's tracked caps.
 */
function tracked(ctx: Ctx, text: string, cx: number, y: number, font: string, fill: string, tracking: number): void {
  ctx.font = font;
  ctx.fillStyle = fill;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  const glyphs = [...text].map((char) => ({ char, width: ctx.measureText(char).width }));
  const total =
    glyphs.reduce((sum, g) => sum + g.width, 0) + tracking * Math.max(0, glyphs.length - 1);
  let x = cx - total / 2;
  for (const glyph of glyphs) {
    ctx.fillText(glyph.char, x, y);
    x += glyph.width + tracking;
  }
}

/**
 * The HueVista arch mark, from the same path data as `BrandMark` — redrawn here
 * because that component paints with CSS variables an exported PNG cannot carry.
 * Skipped rather than fatal where `Path2D` is missing: a poster without the mark
 * still scans, one that threw is no poster at all.
 */
function brandMark(ctx: Ctx, cx: number, top: number, height: number): void {
  if (typeof Path2D === "undefined") return;
  const scale = height / 31;
  const width = 48 * scale;
  ctx.save();
  ctx.translate(cx - width / 2, top);
  ctx.scale(scale, scale);
  const grad = ctx.createLinearGradient(0, 0, 48, 31);
  grad.addColorStop(0, ACCENT_SOFT);
  grad.addColorStop(1, ACCENT_DEEP);
  ctx.fillStyle = grad;
  ctx.fill(new Path2D("M0 24 A24 24 0 0 1 48 24 L48 27 A4 4 0 0 1 44 31 L4 31 A4 4 0 0 1 0 27 Z"));
  // The crescent and the H are knocked out in the paper colour, the way the
  // component knocks them out in the page colour.
  ctx.fillStyle = PAPER;
  ctx.globalAlpha = 0.85;
  ctx.fill(new Path2D("M14.6 6.4 A10.2 10.2 0 0 0 8.4 22.8 A19 19 0 0 1 14.6 6.4 Z"));
  ctx.globalAlpha = 1;
  ctx.fill(new Path2D("M16.6 9.2 H20.8 V14.4 H27.2 V9.2 H31.4 V22.4 H27.2 V17.6 H20.8 V22.4 H16.6 Z"));
  ctx.restore();
}

/**
 * Paints the QR from its module matrix rather than from a rendered image.
 *
 * Each module lands on an integer pixel, so the squares stay hard-edged at any
 * poster size — a resampled QR blurs at the module edges, which is exactly what
 * a scanner is looking at. The 4-module quiet zone is the spec's, and a QR
 * printed without it is the usual reason one refuses to scan.
 */
function drawQr(ctx: Ctx, modules: BitMatrix, left: number, top: number, size: number): void {
  const QUIET = 4;
  const count = modules.size;
  const scale = Math.max(1, Math.floor(size / (count + QUIET * 2)));
  const drawn = scale * (count + QUIET * 2);
  const originX = Math.round(left + (size - drawn) / 2);
  const originY = Math.round(top + (size - drawn) / 2);

  ctx.fillStyle = PAPER;
  ctx.fillRect(originX, originY, drawn, drawn);
  ctx.fillStyle = QR_INK;
  for (let row = 0; row < count; row++) {
    for (let col = 0; col < count; col++) {
      if (modules.get(row, col)) {
        ctx.fillRect(originX + (col + QUIET) * scale, originY + (row + QUIET) * scale, scale, scale);
      }
    }
  }
}

/** The URL as it reads on paper — a scheme adds nothing for someone typing it in. */
export function printableUrl(url: string): string {
  return url.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

/**
 * Renders the poster and returns it as a PNG.
 *
 * `qrcode` is loaded on demand: it is a chunk of a library that only matters the
 * moment a shop actually asks for the sheet, and the retailer portal should not
 * carry it on every visit.
 */
export async function buildKioskPoster({ shopName, url }: KioskPosterInput): Promise<Blob> {
  const { create } = await import("qrcode");
  // Q tolerates a quarter of the symbol being lost, which is the right budget for
  // something taped to a counter and rubbed at by sleeves.
  const qr = create(url, { errorCorrectionLevel: "Q" });

  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser can't draw the poster. Try Chrome, or copy the URL instead.");

  const serif = face("--serif", "'Space Grotesk', system-ui, sans-serif");
  const sans = face("--sans", "Inter, system-ui, sans-serif");
  const mono = face("--mono", "'JetBrains Mono', ui-monospace, monospace");
  const cx = WIDTH / 2;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A frame, so the sheet still reads as a printed card once it is cut out of A4.
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.strokeRect(48, 48, WIDTH - 96, HEIGHT - 96);

  brandMark(ctx, cx, 185, 96);
  centred(ctx, "HueVista", cx, 315, `600 96px ${serif}`, INK, 101);

  // The wordmark's own eyebrow, rules and all, as the nav lockup sets it. The
  // rules start clear of the tracked caps at their widest — they read as framing
  // only while there is air between them and the first letter.
  tracked(ctx, "AI SHADE VISUALISER", cx, 442, `500 24px ${mono}`, INK_MUTE, 5.3);
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 340, 454);
  ctx.lineTo(cx - 220, 454);
  ctx.moveTo(cx + 220, 454);
  ctx.lineTo(cx + 340, 454);
  ctx.stroke();

  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(cx - 60, 530);
  ctx.lineTo(cx + 60, 530);
  ctx.stroke();

  // The shop's name sits in a block of fixed height whatever its length, so every
  // poster puts its QR in the same place on the page.
  const NAME_TOP = 566;
  const NAME_BLOCK = 184;
  const { size, lines } = fitHeadline(shopName.trim() || "Your shop", {
    maxWidth: CONTENT,
    maxLines: 2,
    sizes: [78, 64, 52],
    measure: (text, px) => {
      ctx.font = `500 ${px}px ${serif}`;
      return ctx.measureText(text).width;
    },
  });
  const lineHeight = size * 1.18;
  let y = NAME_TOP + (NAME_BLOCK - lines.length * lineHeight) / 2;
  for (const line of lines) {
    y = centred(ctx, line, cx, y, `500 ${size}px ${serif}`, INK, lineHeight);
  }

  const QR_TOP = 808;
  const QR_BOX = 640;
  ctx.strokeStyle = RULE;
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - QR_BOX / 2, QR_TOP, QR_BOX, QR_BOX);
  drawQr(ctx, qr.modules, cx - QR_BOX / 2, QR_TOP, QR_BOX);

  centred(ctx, "Scan to see your walls in any colour", cx, 1492, `400 36px ${sans}`, INK_SOFT, 44);

  // The URL in full, for the customer whose camera won't cooperate — so it has to
  // shrink to fit rather than run out past the frame, which a long shop slug does
  // at any fixed size.
  const printed = fitHeadline(printableUrl(url), {
    maxWidth: CONTENT,
    maxLines: 1,
    sizes: [30, 26, 22, 18],
    measure: (text, px) => {
      ctx.font = `500 ${px}px ${mono}`;
      return ctx.measureText(text).width;
    },
  });
  for (const line of printed.lines) {
    centred(ctx, line, cx, 1554, `500 ${printed.size}px ${mono}`, ACCENT_DEEP, 36);
  }

  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not save the poster. Try again, or copy the URL instead."));
    }, "image/png");
  });
}
