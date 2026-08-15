import { describe, expect, it } from "vitest";
import { ellipsise, fitHeadline, kioskPosterFileName, printableUrl, wrapWords } from "../kiosk-poster";

/**
 * A stand-in for canvas text metrics: every glyph is half the font size wide.
 * The layout maths only cares about the relationship between text length, size
 * and the space available, so a predictable face makes the awkward cases —
 * long names, single unbreakable words — assertable without a real canvas.
 */
const measure = (text: string, size: number) => text.length * size * 0.5;

describe("wrapWords", () => {
  it("keeps a name that fits on one line", () => {
    expect(wrapWords("Ravi Paints", 10, 200, measure)).toEqual(["Ravi Paints"]);
  });

  it("breaks on spaces once the line is full", () => {
    // 200px at size 10 is 40 characters.
    expect(wrapWords("Shree Balaji Paints and Hardware Traders", 10, 200, measure)).toEqual([
      "Shree Balaji Paints and Hardware Traders",
    ]);
    expect(wrapWords("Shree Balaji Paints and Hardware Traders", 10, 100, measure)).toEqual([
      "Shree Balaji Paints",
      "and Hardware Traders",
    ]);
    expect(wrapWords("Shree Balaji Paints and Hardware Traders", 10, 70, measure)).toEqual([
      "Shree Balaji",
      "Paints and",
      "Hardware",
      "Traders",
    ]);
  });

  it("gives an unbreakable word its own overlong line rather than dropping it", () => {
    expect(wrapWords("Sri Venkateswaraswamy", 10, 60, measure)).toEqual(["Sri", "Venkateswaraswamy"]);
  });

  it("collapses stray whitespace instead of wrapping on it", () => {
    expect(wrapWords("  Ravi   Paints \n", 10, 200, measure)).toEqual(["Ravi Paints"]);
  });

  it("has nothing to draw for an empty name", () => {
    expect(wrapWords("   ", 10, 200, measure)).toEqual([]);
  });
});

describe("ellipsise", () => {
  it("leaves text that already fits alone", () => {
    expect(ellipsise("Ravi Paints", 10, 200, measure)).toBe("Ravi Paints");
  });

  it("trims to fit and marks the cut", () => {
    const cut = ellipsise("Ravi Paints and Hardware", 10, 60, measure);
    expect(cut.endsWith("…")).toBe(true);
    expect(measure(cut, 10)).toBeLessThanOrEqual(60);
  });
});

describe("fitHeadline", () => {
  const sizes = [78, 64, 52] as const;

  it("prints a short name at the largest size", () => {
    const fit = fitHeadline("Ravi Paints", { maxWidth: 1020, maxLines: 2, sizes, measure });
    expect(fit).toEqual({ size: 78, lines: ["Ravi Paints"] });
  });

  it("steps down a size rather than taking a third line", () => {
    const fit = fitHeadline("Shree Balaji Paints and Hardware Traders", {
      maxWidth: 1020,
      maxLines: 2,
      sizes,
      measure,
    });
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    expect(sizes).toContain(fit.size);
    for (const line of fit.lines) expect(measure(line, fit.size)).toBeLessThanOrEqual(1020);
  });

  it("clips a name too long for even the smallest size, and keeps it on the sheet", () => {
    // The poster reserves a fixed block for the name so the QR always lands in the
    // same place — a name that overruns has to be cut, not allowed to push down.
    const fit = fitHeadline("A".repeat(400), { maxWidth: 1020, maxLines: 2, sizes, measure });
    expect(fit.size).toBe(52);
    expect(fit.lines.length).toBeLessThanOrEqual(2);
    for (const line of fit.lines) expect(measure(line, fit.size)).toBeLessThanOrEqual(1020);
    expect(fit.lines.at(-1)).toMatch(/…$/);
  });

  it("never lets a single unbreakable word run off the page", () => {
    const fit = fitHeadline("Sri Venkateswaraswamyandcompanypaintsandhardwarestores", {
      maxWidth: 300,
      maxLines: 2,
      sizes,
      measure,
    });
    for (const line of fit.lines) expect(measure(line, fit.size)).toBeLessThanOrEqual(300);
  });
});

describe("kioskPosterFileName", () => {
  it("names the file after the shop, so two counters' sheets don't collide", () => {
    expect(kioskPosterFileName("Mehta Paint House")).toBe("huevista-mehta-paint-house-qr.png");
  });

  it("folds punctuation and accents into the slug", () => {
    expect(kioskPosterFileName("Shree Balaji Paints & Hardware")).toBe(
      "huevista-shree-balaji-paints-hardware-qr.png",
    );
    expect(kioskPosterFileName("Café Colours")).toBe("huevista-cafe-colours-qr.png");
  });

  it("falls back when the name leaves nothing to slug", () => {
    // A shop named only in Devanagari slugs to nothing; a file called
    // "huevista--qr.png" would be worse than one that simply says what it is.
    expect(kioskPosterFileName("रंग महल")).toBe("huevista-kiosk-qr.png");
    expect(kioskPosterFileName("   ")).toBe("huevista-kiosk-qr.png");
  });

  it("keeps a very long name to a sane filename with no trailing dash", () => {
    const name = kioskPosterFileName("Shree Balaji Paints and Hardware Traders Private Limited");
    // "huevista-" + at most 48 slug characters + "-qr.png".
    expect(name.length).toBeLessThanOrEqual(64);
    expect(name).toMatch(/^huevista-[a-z0-9-]*[a-z0-9]-qr\.png$/);
  });
});

describe("printableUrl", () => {
  it("drops the scheme, which nobody types", () => {
    expect(printableUrl("https://app.huevista.org/store/mehta-paints")).toBe(
      "app.huevista.org/store/mehta-paints",
    );
  });

  it("drops a trailing slash", () => {
    expect(printableUrl("http://localhost:3000/store/x/")).toBe("localhost:3000/store/x");
  });
});
