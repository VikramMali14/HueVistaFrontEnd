/**
 * Tiny, dependency-free PDF builder for the "Add to PDF" colour board.
 *
 * The studio lets the user snapshot the recoloured canvas (up to 8 options) and
 * download them as a single multi-page PDF. Each page is a branded A4 sheet:
 * a palette strip of the option's colours across the top edge, a header with
 * the project title / option counter / date, the painted photo hairline-framed
 * in the middle, and a table of the shades used — paint chip, region, shade
 * name, shade number and hex — anchored above a footer with page numbers.
 *
 * Why hand-rolled instead of a library: the whole board is a handful of images
 * plus text, so a full PDF dependency (jsPDF et al.) would dwarf the feature. A
 * JPEG can be embedded straight into a PDF as a DCTDecode image XObject with no
 * re-encoding, and text needs only the built-in Helvetica faces — so the entire
 * generator is a few hundred bytes of object plumbing. Everything runs in the
 * browser (uses atob), which is where the canvas snapshots live.
 */

/** One shade shown under a snapshot: a colour preview plus its name/code. */
export interface PdfShade {
  /** Region this colour was applied to, e.g. "Main wall" / "Accent wall" / "Border". */
  label: string;
  /** Catalogue shade name, or a generic label for an exact custom colour. */
  name: string;
  /** Shade code / number, when known (hidden for guests / custom colours). */
  code?: string;
  /** Colour preview, as #rrggbb. */
  hex: string;
}

/** One snapshot added to the board: the painted photo + the shades it used. */
export interface PdfImageEntry {
  /** data:image/jpeg;base64,… snapshot of the recoloured canvas. */
  jpegDataUrl: string;
  shades: PdfShade[];
}

/** A4 portrait, in PostScript points (1/72"). */
const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 48;

/* Page furniture metrics (all in points, measured from the page bottom). */
const STRIP_H = 10; // full-bleed palette strip along the top edge
const ROW_H = 26; // one shade-table row
const TABLE_BOTTOM = 64; // bottom of the shade table, above the footer
const FOOT_RULE_Y = 46;
const FOOT_BASE = 33;

/* Brand palette (matches globals.css light theme), as PDF "r g b" strings. */
const INK = "0.1 0.09 0.16"; // #1a1828
const MUTE = "0.42 0.41 0.49"; // #6b687e
const ACCENT = "0.49 0.36 1"; // #7c5cff
const RULE_SOFT = "0.89 0.88 0.93";
const RULE_STRONG = "0.81 0.8 0.86";

/**
 * Render the recoloured `source` canvas to a JPEG data URL, downscaled so its
 * longest edge is at most `maxEdge` px. The studio canvas is drawn at up to 4K ×
 * devicePixelRatio, so a raw PNG export is many megabytes; a bounded JPEG keeps
 * both the single-image download and the PDF small. Returns "" if a 2D context
 * or the source dimensions aren't available.
 */
export function canvasToJpegDataUrl(
  source: HTMLCanvasElement,
  maxEdge = 1600,
  quality = 0.85,
): string {
  const sw = source.width;
  const sh = source.height;
  if (sw <= 0 || sh <= 0) return "";
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const out = document.createElement("canvas");
  out.width = w;
  out.height = h;
  const ctx = out.getContext("2d");
  if (!ctx) return "";
  // White matte behind the photo so any (there shouldn't be) transparency in the
  // canvas never bleeds to black inside the JPEG.
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(source, 0, 0, w, h);
  return out.toDataURL("image/jpeg", quality);
}

/** Decode a base64 data URL's payload into raw bytes. */
function dataUrlToBytes(dataUrl: string): Uint8Array {
  const comma = dataUrl.indexOf(",");
  const b64 = comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl;
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

/**
 * Read a baseline JPEG's pixel dimensions from its SOF marker. Canvas JPEG
 * output is always a baseline, 3-component (YCbCr → DeviceRGB) stream, so this
 * simple marker scan is enough. Returns {0,0} if no SOF is found.
 */
function jpegSize(bytes: Uint8Array): { w: number; h: number } {
  let i = 2; // skip SOI (FF D8)
  const n = bytes.length;
  while (i + 1 < n) {
    if (bytes[i] !== 0xff) {
      i++;
      continue;
    }
    let marker = bytes[i + 1]!;
    // Collapse any run of 0xFF fill bytes onto the real marker.
    while (marker === 0xff && i + 2 < n) {
      i++;
      marker = bytes[i + 1]!;
    }
    i += 2;
    // Standalone markers (no length): SOI, EOI, RSTn, TEM.
    if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) {
      continue;
    }
    if (i + 1 >= n) break;
    const segLen = (bytes[i]! << 8) | bytes[i + 1]!;
    // SOF0..SOF15 carry the frame size, except DHT(C4), JPG(C8) and DAC(CC).
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof && i + 6 < n) {
      const h = (bytes[i + 3]! << 8) | bytes[i + 4]!;
      const w = (bytes[i + 5]! << 8) | bytes[i + 6]!;
      return { w, h };
    }
    i += segLen;
  }
  return { w: 0, h: 0 };
}

/** Latin-1 encode a JS string into bytes (PDF content is byte-oriented). */
function latin1(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
  return out;
}

/**
 * Escape a string for a PDF literal ( … ). Typographic punctuation maps onto
 * its real WinAnsi byte (octal escape); anything else WinAnsi can't show
 * becomes "?".
 */
function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch; // ASCII
    else if (code >= 0xa0 && code <= 0xff) out += ch; // Latin-1 upper (WinAnsi)
    else if (code === 0x2018) out += "\\221"; // ' left single quote
    else if (code === 0x2019) out += "\\222"; // ' right single quote
    else if (code === 0x201c) out += "\\223"; // " left double quote
    else if (code === 0x201d) out += "\\224"; // " right double quote
    else if (code === 0x2013) out += "\\226"; // – en dash
    else if (code === 0x2014) out += "\\227"; // — em dash
    else if (code === 0x2022) out += "\\225"; // • bullet
    else if (code === 0x2026) out += "\\205"; // … ellipsis
    else out += "?";
  }
  return out;
}

/** Compact number formatting for the content stream. */
function num(n: number): string {
  return (Math.round(n * 100) / 100).toString();
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return [
    Number.isFinite(r) ? r / 255 : 0,
    Number.isFinite(g) ? g / 255 : 0,
    Number.isFinite(b) ? b / 255 : 0,
  ];
}

/**
 * Helvetica / Helvetica-Bold advance widths for ASCII 0x20–0x7E, in 1/1000 em,
 * straight from the Adobe AFM metrics for the built-in base-14 fonts. They let
 * us right-align and ellipsis-truncate text without embedding a font.
 */
// prettier-ignore
const W_HELV = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
];
// prettier-ignore
const W_HELV_BOLD = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
];

/** Width of `s` set in Helvetica (`bold` for Helvetica-Bold) at `size` pt. */
function textWidth(s: string, size: number, bold = false): number {
  const table = bold ? W_HELV_BOLD : W_HELV;
  let units = 0;
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c >= 0x20 && c <= 0x7e) units += table[c - 0x20]!;
    else if (c === 0x2026) units += 1000; // ellipsis
    else units += 556; // fair average for the Latin-1 upper range
  }
  return (units / 1000) * size;
}

/** Truncate `s` with an ellipsis so it sets no wider than `maxWidth` pt. */
function fitText(s: string, size: number, maxWidth: number, bold = false): string {
  if (textWidth(s, size, bold) <= maxWidth) return s;
  let out = s;
  while (out.length > 0 && textWidth(out.trimEnd() + "…", size, bold) > maxWidth) {
    out = out.slice(0, -1);
  }
  return out.trimEnd() + "…";
}

/** One text run: fill colour, face, size, position, string. `tracking` = letterspacing (Tc). */
function textOp(
  font: "F1" | "F2",
  size: number,
  x: number,
  y: number,
  s: string,
  color: string,
  tracking = 0,
): string {
  const tc = tracking ? ` ${num(tracking)} Tc` : "";
  const reset = tracking ? " 0 Tc" : "";
  return `${color} rg BT /${font} ${num(size)} Tf${tc} ${num(x)} ${num(y)} Td (${pdfText(s)}) Tj${reset} ET`;
}

/** A horizontal hairline from x1 to x2 at height y. */
function hline(y: number, x1: number, x2: number, color: string, w = 0.6): string {
  return `${color} RG ${num(w)} w ${num(x1)} ${num(y)} m ${num(x2)} ${num(y)} l S`;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDateLine(d: Date): string {
  return `Generated ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Branded header (palette strip, eyebrow, date, title) + footer, shared by every page. */
function pageChrome(
  stripHexes: string[],
  title: string,
  dateLine: string,
  pageNo: number,
  pageCount: number,
  counter?: string,
): string[] {
  const ops: string[] = [];
  const right = PAGE_W - MARGIN;

  // Full-bleed palette strip along the top edge — this option's colours.
  const seg = PAGE_W / stripHexes.length;
  stripHexes.forEach((hex, i) => {
    const [r, g, b] = hexToRgb(hex);
    ops.push(`${num(r)} ${num(g)} ${num(b)} rg`);
    // +0.5 overlap hides hairline gaps between antialiased segment edges.
    ops.push(`${num(i * seg)} ${num(PAGE_H - STRIP_H)} ${num(seg + 0.5)} ${num(STRIP_H)} re f`);
  });

  // Eyebrow + date line.
  const eyebrowY = PAGE_H - 58;
  ops.push(textOp("F2", 8, MARGIN, eyebrowY, "HUEVISTA · COLOUR BOARD", ACCENT, 1.5));
  ops.push(textOp("F1", 8.5, right - textWidth(dateLine, 8.5), eyebrowY, dateLine, MUTE));

  // Project title, with the option counter on the right.
  const titleY = PAGE_H - 84;
  const counterW = counter ? textWidth(counter, 10) : 0;
  ops.push(
    textOp("F2", 19, MARGIN, titleY, fitText(title, 19, right - MARGIN - counterW - 24, true), INK),
  );
  if (counter) ops.push(textOp("F1", 10, right - counterW, titleY, counter, MUTE));
  ops.push(hline(PAGE_H - 100, MARGIN, right, RULE_STRONG, 1));

  // Footer.
  ops.push(hline(FOOT_RULE_Y, MARGIN, right, RULE_SOFT));
  ops.push(textOp("F1", 8, MARGIN, FOOT_BASE, "Made with HueVista", MUTE));
  const pg = `Page ${pageNo} of ${pageCount}`;
  ops.push(textOp("F1", 8, right - textWidth(pg, 8), FOOT_BASE, pg, MUTE));

  return ops;
}

/** Build the content-stream drawing ops for one option's page. */
function pageContent(
  entry: PdfImageEntry,
  imgW: number,
  imgH: number,
  title: string,
  index: number,
  total: number,
  dateLine: string,
): string {
  const right = PAGE_W - MARGIN;
  const stripHexes = entry.shades.length ? entry.shades.map((s) => s.hex) : ["#7c5cff"];
  const ops = pageChrome(stripHexes, title, dateLine, index + 1, total, `Option ${index + 1} of ${total}`);

  // Shade table, anchored to the bottom so every page shares one layout.
  const rows = Math.max(1, entry.shades.length);
  const tableTop = TABLE_BOTTOM + rows * ROW_H;
  ops.push(textOp("F2", 8, MARGIN, tableTop + 14, "COLOURS IN THIS OPTION", MUTE, 1.5));
  ops.push(hline(tableTop + 6, MARGIN, right, RULE_STRONG, 1));

  entry.shades.forEach((shade, j) => {
    const rowTop = TABLE_BOTTOM + (rows - j) * ROW_H;
    const base = rowTop - 16.5; // text baseline within the row
    const [r, g, b] = hexToRgb(shade.hex);
    // Paint chip, with a hairline border so pale colours read on white paper.
    ops.push(`${num(r)} ${num(g)} ${num(b)} rg ${num(MARGIN)} ${num(rowTop - 21)} 34 16 re f`);
    ops.push(`0.73 0.71 0.79 RG 0.6 w ${num(MARGIN)} ${num(rowTop - 21)} 34 16 re S`);
    // Columns: region · shade name · shade number (right side). No hex — the
    // chip shows the colour; codes are what the counter works from.
    ops.push(textOp("F2", 9.5, MARGIN + 46, base, fitText(shade.label, 9.5, 128, true), INK));
    ops.push(textOp("F1", 10, MARGIN + 182, base, fitText(shade.name, 10, 148), INK));
    if (shade.code) {
      ops.push(textOp("F1", 9.5, MARGIN + 338, base, fitText(`Shade No. ${shade.code}`, 9.5, 170), MUTE));
    }
    ops.push(hline(rowTop - ROW_H, MARGIN, right, RULE_SOFT));
  });

  // Photo: centred in the space between the header and the table, hairline-framed.
  const areaTop = PAGE_H - 118;
  const areaBottom = tableTop + 36;
  const availW = right - MARGIN;
  const availH = areaTop - areaBottom;
  let dispW = availW;
  let dispH = availH;
  if (imgW > 0 && imgH > 0) {
    const scale = Math.min(availW / imgW, availH / imgH);
    dispW = imgW * scale;
    dispH = imgH * scale;
  }
  const imgX = (PAGE_W - dispW) / 2;
  const imgY = areaBottom + (availH - dispH) / 2;
  ops.push(`q ${num(dispW)} 0 0 ${num(dispH)} ${num(imgX)} ${num(imgY)} cm /Im0 Do Q`);
  ops.push(`${RULE_STRONG} RG 1 w ${num(imgX)} ${num(imgY)} ${num(dispW)} ${num(dispH)} re S`);

  return ops.join("\n");
}

/**
 * Assemble the entries into a single PDF and return it as a Blob. Each entry is
 * one branded A4 page (palette strip, header, framed photo, shade table, footer).
 * Entries with an unreadable JPEG are skipped; an empty list yields a one-line
 * notice page.
 */
export function buildColourBoardPdf(entries: PdfImageEntry[], title = "HueVista"): Blob {
  const chunks: Uint8Array[] = [];
  let length = 0;
  const push = (part: Uint8Array | string) => {
    const bytes = typeof part === "string" ? latin1(part) : part;
    chunks.push(bytes);
    length += bytes.length;
  };

  // Object bodies are collected first; offsets are filled in as we stream them.
  const objects: Array<Uint8Array[]> = [];
  const addObject = (parts: Array<Uint8Array | string>): number => {
    objects.push(parts.map((p) => (typeof p === "string" ? latin1(p) : p)));
    return objects.length; // 1-based object number
  };

  const catalogId = addObject(["<< /Type /Catalog /Pages 2 0 R >>"]);
  const pagesId = addObject([""]); // body patched in once kids are known
  const fontId = addObject([
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
  ]);
  const boldFontId = addObject([
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>",
  ]);
  const fontRes = `/Font << /F1 ${fontId} 0 R /F2 ${boldFontId} 0 R >>`;

  const dateLine = formatDateLine(new Date());
  const usable = entries
    .map((e) => ({ entry: e, bytes: safeBytes(e.jpegDataUrl) }))
    .filter((e): e is { entry: PdfImageEntry; bytes: Uint8Array } => e.bytes !== null);

  const kids: number[] = [];
  if (usable.length === 0) {
    // Degenerate case: a branded page telling the user there was nothing to add.
    const ops = pageChrome(["#7c5cff"], title, dateLine, 1, 1);
    ops.push(textOp("F1", 12, MARGIN, PAGE_H - 160, "No coloured images were added.", MUTE));
    const content = ops.join("\n");
    const contentId = addObject([`<< /Length ${latin1(content).length} >>\nstream\n`, content, "\nendstream"]);
    const pageId = addObject([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << ${fontRes} >> /Contents ${contentId} 0 R >>`,
    ]);
    kids.push(pageId);
  } else {
    usable.forEach(({ entry, bytes }, i) => {
      const { w, h } = jpegSize(bytes);
      const imageId = addObject([
        `<< /Type /XObject /Subtype /Image /Width ${w || 1} /Height ${h || 1} ` +
          `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`,
        bytes,
        "\nendstream",
      ]);
      const content = pageContent(entry, w, h, title, i, usable.length, dateLine);
      const contentBytes = latin1(content);
      const contentId = addObject([
        `<< /Length ${contentBytes.length} >>\nstream\n`,
        content,
        "\nendstream",
      ]);
      const pageId = addObject([
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
          `/Resources << ${fontRes} /XObject << /Im0 ${imageId} 0 R >> >> ` +
          `/Contents ${contentId} 0 R >>`,
      ]);
      kids.push(pageId);
    });
  }

  // Now that kids are known, fill in the Pages object body.
  objects[pagesId - 1] = [
    latin1(`<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${kids.length} >>`),
  ];

  // Serialise: header, objects (recording byte offsets), xref, trailer.
  push("%PDF-1.4\n");
  push(new Uint8Array([0x25, 0xe2, 0xe3, 0xcf, 0xd3, 0x0a])); // binary marker comment

  const offsets: number[] = new Array(objects.length).fill(0);
  objects.forEach((parts, idx) => {
    offsets[idx] = length;
    push(`${idx + 1} 0 obj\n`);
    for (const p of parts) push(p);
    push("\nendobj\n");
  });

  const xrefOffset = length;
  const count = objects.length + 1; // +1 for the free object 0
  let xref = `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (const off of offsets) {
    xref += `${off.toString().padStart(10, "0")} 00000 n \n`;
  }
  push(xref);
  push(`trailer\n<< /Size ${count} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`);

  return new Blob(chunks as BlobPart[], { type: "application/pdf" });
}

function safeBytes(dataUrl: string): Uint8Array | null {
  try {
    if (!dataUrl) return null;
    const bytes = dataUrlToBytes(dataUrl);
    return bytes.length > 0 ? bytes : null;
  } catch {
    return null;
  }
}

/** Trigger a browser download of `blob` under `filename`. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}
