/**
 * Colour-science helpers. Used by the find-similar and ΔE-snap features
 * of the studio.
 *   hex → RGB → linear-RGB → XYZ (D65) → Lab → ΔE76
 * Everything here is pure.
 */

export interface RGB { r: number; g: number; b: number }
export interface Lab { L: number; a: number; b: number }

const HEX_RE = /^#?([0-9a-f]{6}|[0-9a-f]{3})$/i;

export function hexToRgb(hex: string): RGB {
  const m = HEX_RE.exec(hex.trim());
  if (!m) return { r: 0, g: 0, b: 0 };
  let h = m[1]!;
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
  };
}

export function rgbToHex({ r, g, b }: RGB): string {
  const clamp = (n: number) => Math.max(0, Math.min(255, Math.round(n)));
  const hex = (n: number) => clamp(n).toString(16).padStart(2, "0");
  return `#${hex(r)}${hex(g)}${hex(b)}`;
}

function lin(c: number): number {
  const n = c / 255;
  return n <= 0.04045 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
}

function rgbToXyz({ r, g, b }: RGB): [number, number, number] {
  const R = lin(r), G = lin(g), B = lin(b);
  return [
    R * 0.4124564 + G * 0.3575761 + B * 0.1804375,
    R * 0.2126729 + G * 0.7151522 + B * 0.072175,
    R * 0.0193339 + G * 0.119192 + B * 0.9503041,
  ];
}

export function rgbToLab(rgb: RGB): Lab {
  const [X, Y, Z] = rgbToXyz(rgb);
  const Xn = 0.95047, Yn = 1.0, Zn = 1.08883;
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X / Xn), fy = f(Y / Yn), fz = f(Z / Zn);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function hexToLab(hex: string): Lab {
  return rgbToLab(hexToRgb(hex));
}

export function deltaE(a: Lab, b: Lab): number {
  const dL = a.L - b.L, da = a.a - b.a, db = a.b - b.b;
  return Math.sqrt(dL * dL + da * da + db * db);
}

export function luminance({ r, g, b }: RGB): number {
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}

export function nearestShade<T extends { hex: string }>(target: string, pool: ReadonlyArray<T>): T | undefined {
  if (pool.length === 0) return undefined;
  const t = hexToLab(target);
  let best: T | undefined = pool[0];
  let bestD = Infinity;
  for (const s of pool) {
    const d = deltaE(t, hexToLab(s.hex));
    if (d < bestD) { bestD = d; best = s; }
  }
  return best;
}

/**
 * The `n` catalogue entries closest to `target` (lowest ΔE76 first), each with
 * its perceptual distance. Used by the colour-wheel "match any colour" panel.
 */
export function nearestShades<T extends { hex: string }>(
  target: string,
  pool: ReadonlyArray<T>,
  n = 5,
): Array<{ shade: T; deltaE: number }> {
  const t = hexToLab(target);
  return pool
    .map((shade) => ({ shade, deltaE: deltaE(t, hexToLab(shade.hex)) }))
    .sort((a, b) => a.deltaE - b.deltaE)
    .slice(0, Math.max(1, n));
}

// ── HSV ⇄ RGB (for the colour wheel picker) ────────────────────────────────
// h in [0,360), s and v in [0,1].
export interface HSV { h: number; s: number; v: number }

export function hsvToRgb({ h, s, v }: HSV): RGB {
  const c = v * s;
  const hp = ((h % 360) + 360) % 360 / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
}

export function rgbToHsv({ r, g, b }: RGB): HSV {
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const d = max - min;
  let h = 0;
  if (d > 1e-6) {
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function hsvToHex(hsv: HSV): string {
  return rgbToHex(hsvToRgb(hsv));
}

export function hexToHsv(hex: string): HSV {
  return rgbToHsv(hexToRgb(hex));
}
