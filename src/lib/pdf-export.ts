/**
 * Tiny, dependency-free PDF builder for the "Add to PDF" colour board.
 *
 * The studio lets the user snapshot the recoloured canvas (up to 8 options) and
 * download them as a single multi-page PDF: one page per snapshot, the painted
 * photo at the top and, underneath it, the shades used on that option — each as
 * a colour-preview swatch alongside its shade name and shade code/number.
 *
 * Why hand-rolled instead of a library: the whole board is a handful of images
 * plus text, so a full PDF dependency (jsPDF et al.) would dwarf the feature. A
 * JPEG can be embedded straight into a PDF as a DCTDecode image XObject with no
 * re-encoding, and text needs only the built-in Helvetica font — so the entire
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
const MARGIN = 36;

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

/** Escape a string for a PDF literal ( … ) and drop characters WinAnsi can't show. */
function pdfText(s: string): string {
  let out = "";
  for (const ch of s) {
    const code = ch.codePointAt(0)!;
    if (ch === "\\") out += "\\\\";
    else if (ch === "(") out += "\\(";
    else if (ch === ")") out += "\\)";
    else if (code >= 0x20 && code <= 0x7e) out += ch; // ASCII
    else if (code >= 0xa0 && code <= 0xff) out += ch; // Latin-1 upper (WinAnsi)
    else if (code === 0x2018 || code === 0x2019) out += "'"; // curly single quotes
    else if (code === 0x201c || code === 0x201d) out += '"'; // curly double quotes
    else if (code === 0x2013 || code === 0x2014) out += "-"; // en/em dash
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

/** Vertical space (pt) reserved under the photo for the swatch list. */
function swatchBlockHeight(shadeCount: number): number {
  const HEADING = 22;
  const ROW = 22;
  return HEADING + Math.max(1, shadeCount) * ROW + 8;
}

/** Build the content-stream drawing ops for one page. */
function pageContent(entry: PdfImageEntry, imgW: number, imgH: number, title: string, index: number, total: number): string {
  const ops: string[] = [];

  // Header line (project name · option n of N).
  const header = `${title}  ·  Option ${index + 1} of ${total}`;
  ops.push("0.28 0.26 0.24 rg");
  ops.push(`BT /F1 12 Tf ${num(MARGIN)} ${num(PAGE_H - MARGIN - 4)} Td (${pdfText(header)}) Tj ET`);

  // Fit the photo between the header and the reserved swatch block.
  const blockH = swatchBlockHeight(entry.shades.length);
  const topY = PAGE_H - MARGIN - 26;
  const bottomLimit = MARGIN + blockH;
  const availW = PAGE_W - 2 * MARGIN;
  const availH = topY - bottomLimit;
  let dispW = availW;
  let dispH = availH;
  if (imgW > 0 && imgH > 0) {
    const scale = Math.min(availW / imgW, availH / imgH);
    dispW = imgW * scale;
    dispH = imgH * scale;
  }
  const imgX = (PAGE_W - dispW) / 2;
  const imgY = topY - dispH;
  ops.push(`q ${num(dispW)} 0 0 ${num(dispH)} ${num(imgX)} ${num(imgY)} cm /Im0 Do Q`);

  // Swatch list, laid down inside the reserved block below the photo.
  const sy = imgY - 22; // heading baseline
  ops.push("0.28 0.26 0.24 rg");
  ops.push(`BT /F1 11 Tf ${num(MARGIN)} ${num(sy)} Td (${pdfText("Colours in this option")}) Tj ET`);

  entry.shades.forEach((shade, j) => {
    const rowY = sy - 22 * (j + 1); // baseline of this row
    const [r, g, b] = hexToRgb(shade.hex);
    // Colour-preview swatch.
    ops.push(`${num(r)} ${num(g)} ${num(b)} rg`);
    ops.push(`${num(MARGIN)} ${num(rowY - 4)} 26 14 re f`);
    // Thin border around the swatch so pale colours read on white paper.
    ops.push("0.6 0.6 0.6 RG 0.6 w");
    ops.push(`${num(MARGIN)} ${num(rowY - 4)} 26 14 re S`);
    // Label · name · code · hex.
    const parts = [shade.label + ":", shade.name];
    if (shade.code) parts.push("Shade No. " + shade.code);
    parts.push(shade.hex.toUpperCase());
    ops.push("0.1 0.1 0.1 rg");
    ops.push(`BT /F1 10 Tf ${num(MARGIN + 36)} ${num(rowY)} Td (${pdfText(parts.join("   ·   "))}) Tj ET`);
  });

  return ops.join("\n");
}

/**
 * Assemble the entries into a single PDF and return it as a Blob. Each entry is
 * one A4 page (painted photo on top, its shades listed underneath). Entries with
 * an unreadable JPEG are skipped; an empty list yields a one-line notice page.
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

  const usable = entries
    .map((e) => ({ entry: e, bytes: safeBytes(e.jpegDataUrl) }))
    .filter((e): e is { entry: PdfImageEntry; bytes: Uint8Array } => e.bytes !== null);

  const kids: number[] = [];
  if (usable.length === 0) {
    // Degenerate case: a single page telling the user there was nothing to add.
    const content = `BT /F1 14 Tf ${num(MARGIN)} ${num(PAGE_H - MARGIN - 20)} Td (${pdfText(
      "No coloured images were added.",
    )}) Tj ET`;
    const contentId = addObject([`<< /Length ${latin1(content).length} >>\nstream\n`, content, "\nendstream"]);
    const pageId = addObject([
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
        `/Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`,
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
      const content = pageContent(entry, w, h, title, i, usable.length);
      const contentBytes = latin1(content);
      const contentId = addObject([
        `<< /Length ${contentBytes.length} >>\nstream\n`,
        content,
        "\nendstream",
      ]);
      const pageId = addObject([
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(PAGE_W)} ${num(PAGE_H)}] ` +
          `/Resources << /Font << /F1 ${fontId} 0 R >> /XObject << /Im0 ${imageId} 0 R >> >> ` +
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
