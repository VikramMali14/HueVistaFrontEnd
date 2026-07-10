import { describe, it, expect } from "vitest";
import { buildColourBoardPdf, type PdfImageEntry } from "../pdf-export";

/**
 * Build a minimal but structurally-valid baseline JPEG (SOI, an SOF0 frame
 * header carrying width/height, then EOI) and wrap it as a data URL. Enough for
 * the PDF builder's marker scan to read the dimensions and embed the bytes.
 */
function fakeJpegDataUrl(w: number, h: number): string {
  const bytes = [
    0xff, 0xd8, // SOI
    0xff, 0xc0, // SOF0
    0x00, 0x11, // segment length (17)
    0x08, // precision
    (h >> 8) & 0xff, h & 0xff, // height
    (w >> 8) & 0xff, w & 0xff, // width
    0x03, // components
    0x01, 0x22, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    0xff, 0xd9, // EOI
  ];
  const b64 = Buffer.from(bytes).toString("base64");
  return `data:image/jpeg;base64,${b64}`;
}

async function pdfText(blob: Blob): Promise<string> {
  // Latin-1 view is enough to inspect the object structure (JPEG payload aside).
  const buf = new Uint8Array(await blob.arrayBuffer());
  let s = "";
  for (const b of buf) s += String.fromCharCode(b);
  return s;
}

describe("buildColourBoardPdf", () => {
  const entry = (w = 640, h = 480): PdfImageEntry => ({
    jpegDataUrl: fakeJpegDataUrl(w, h),
    shades: [
      { label: "Main wall", name: "Off White", code: "7112", hex: "#f4efe6" },
      { label: "Accent wall", name: "Custom colour", hex: "#c73f8a" },
    ],
  });

  it("produces a well-formed PDF with one page per entry", async () => {
    const blob = buildColourBoardPdf([entry(), entry(800, 600)], "My room");
    expect(blob.type).toBe("application/pdf");
    const text = await pdfText(blob);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    expect(text.trimEnd().endsWith("%%EOF")).toBe(true);
    // Two image XObjects, two pages.
    expect((text.match(/\/Subtype \/Image/g) ?? []).length).toBe(2);
    expect(text).toContain("/Count 2");
    // Dimensions parsed from the SOF0 markers.
    expect(text).toContain("/Width 640");
    expect(text).toContain("/Width 800");
    // Shade text rendered onto the page.
    expect(text).toContain("Shade No. 7112");
    expect(text).toContain("Off White");
  });

  it("caps the caller's collection at what it is given (8 max enforced upstream)", async () => {
    const many = Array.from({ length: 8 }, () => entry());
    const text = await pdfText(buildColourBoardPdf(many));
    expect(text).toContain("/Count 8");
  });

  it("emits a single notice page when there is nothing usable", async () => {
    const text = await pdfText(buildColourBoardPdf([]));
    expect(text).toContain("/Count 1");
    expect(text).toContain("No coloured images were added.");
  });

  it("skips entries whose image cannot be decoded", async () => {
    const text = await pdfText(
      buildColourBoardPdf([
        entry(),
        { jpegDataUrl: "data:image/jpeg;base64,@@not-base64@@", shades: [] },
      ]),
    );
    expect(text).toContain("/Count 1");
  });

  it("writes byte-accurate xref offsets (what makes the PDF actually open)", async () => {
    const text = await pdfText(buildColourBoardPdf([entry(), entry()]));

    // startxref points at the xref table.
    const startMatch = text.match(/startxref\s+(\d+)/);
    expect(startMatch).not.toBeNull();
    const xrefOffset = Number(startMatch![1]);
    expect(text.slice(xrefOffset, xrefOffset + 4)).toBe("xref");

    // Each in-use xref entry must point exactly at "<n> 0 obj".
    const header = text.slice(xrefOffset).match(/xref\s+0 (\d+)/);
    expect(header).not.toBeNull();
    const size = Number(header![1]);
    const entryRe = /(\d{10}) (\d{5}) (n|f) ?\r?\n/g;
    const rows: Array<{ off: number; type: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = entryRe.exec(text.slice(xrefOffset))) && rows.length < size) {
      rows.push({ off: Number(m[1]), type: m[3]! });
    }
    expect(rows.length).toBe(size);
    rows.forEach((row, i) => {
      if (i === 0 || row.type === "f") return; // object 0 is the free head
      expect(text.slice(row.off, row.off + `${i} 0 obj`.length)).toBe(`${i} 0 obj`);
    });
  });
});
