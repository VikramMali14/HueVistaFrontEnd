/**
 * WebGL2 recolor engine.
 *
 * Uploads the source photograph once and composites ANY number of per-region
 * masks over it in a single frame, so every painted wall stays painted while
 * you edit another one (no "switching tabs wipes the last colour" bug).
 *
 * Each region is filled with the EXACT target colour by default (the true paint
 * swatch — matches the can). Optionally, per region, it can preserve the photo's
 * own light: it reads each pixel's luminance relative to the region's mean
 * luminance (its LRV in the photo) and modulates the paint, so shadows, curves
 * and soft gradients survive instead of flattening. That mode is opt-in and
 * dialable via `preserve` (0 = flat exact fill, 1 = full relief).
 *
 * 60 fps on mid-range mobile, zero backend round-trip per swatch change. The
 * mask's soft (anti-aliased) edge is the only place colour blends.
 */

import type { RecolorEngine, RegionPaint } from "./recolor-engine";
import { featherRadius } from "./recolor-engine";

// Shared with the Canvas 2D fallback engine (canvas2d-recolor.ts); re-exported
// so existing `import { type RegionPaint } from "@/lib/webgl-recolor"` keeps working.
export type { RecolorEngine, RecolorSource, RegionPaint } from "./recolor-engine";

const VERT = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  v_uv.y = 1.0 - v_uv.y;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;
uniform sampler2D u_image;
uniform sampler2D u_mask;
// Low-pass (blurred) copy of the photo. Splitting the photo into this smooth
// "form" layer and a high-frequency "detail" layer (image - blur) lets us tint
// the swatch by the large-scale light while carrying the surface's REAL texture
// — plaster stipple, dirt, seams, micro-shadows — onto whatever colour the user
// picks. That real texture is what a flat fill (or synthetic grain) can't fake.
uniform sampler2D u_blur;
uniform vec3 u_target;
uniform float u_strength;
uniform int u_useMask;
// Shadow/relief preservation. 0 = flat exact fill (the swatch everywhere);
// 1 = fully follow the photo's light. u_baseL is the region's mean luminance.
uniform float u_preserve;
uniform float u_baseL;
// Surface grain: a hair of per-pixel noise, a floor of texture for perfectly
// smooth walls where the photo itself carries almost no detail. 0 disables it.
uniform float u_grain;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

// Cheap hash -> pseudo-random 0..1 from a screen-space position, for grain.
float hash(vec2 p) {
  p = fract(p * vec2(123.34, 345.45));
  p += dot(p, p + 34.345);
  return fract(p.x * p.y);
}

void main() {
  vec4 src = texture(u_image, v_uv);
  // Base pass (no mask): pass the photo straight through (forced opaque so the
  // exported PNG never has see-through holes from a transparent source). Painted
  // regions are composited on top in their own blended passes.
  if (u_useMask == 0) {
    outColor = vec4(src.rgb, 1.0);
    return;
  }
  float m = texture(u_mask, v_uv).r;
  vec3 paint = u_target;
  if (u_preserve > 0.001 && u_baseL > 0.001) {
    float L = luma(src.rgb);
    float B = luma(texture(u_blur, v_uv).rgb); // large-scale (form) luminance
    // FORM: tint the swatch by the SMOOTH large-scale light relative to the
    // region mean. Form shadows (eaves, reveals, the facade's own gradient)
    // survive, while the wall still averages to the true swatch colour.
    float form = clamp(B / u_baseL, 0.30, 2.4);
    form = mix(1.0, form, u_preserve);
    if (form <= 1.0) {
      // Multiply with a mild gamma so genuine shadows deepen and the paint sits
      // INTO the surface instead of floating flat on top of it.
      paint = u_target * pow(form, 1.0 + 0.25 * u_preserve);
    } else {
      // Lift toward white for highlights, rolled off so a bright wall never clips
      // to pure white — that hard clip made sunlit walls read as blown-out patches.
      float lift = form - 1.0;
      lift = (lift / (lift + 0.7)) * 0.7;
      paint = mix(u_target, vec3(1.0), lift);
    }
    // DETAIL: add the photo's real high-frequency texture on top. (L - B) is
    // ~zero-mean, so it adds surface texture and micro-shadows WITHOUT shifting
    // the paint colour. Clamp it to a small band: genuine surface texture is
    // low-amplitude and passes through, but the big luminance STEP at an edge —
    // building/sky silhouette, window and railing borders — is clipped, so it
    // no longer blooms into a bright unsharp-mask halo (the glowing edges).
    float detail = clamp(L - B, -0.05, 0.05);
    paint += detail * u_preserve;
  }
  if (u_grain > 0.0001) {
    // Signed, ~zero-mean noise. Scaled up a little on brighter paint so it reads
    // as surface texture without muddying shadow recesses.
    float n = hash(gl_FragCoord.xy) - 0.5;
    paint += n * u_grain * (0.5 + 0.5 * luma(paint));
  }
  paint = clamp(paint, 0.0, 1.0);
  outColor = vec4(paint, u_strength * m);
}`;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Default per-pixel grain amplitude when a region doesn't set its own. Subtle by
// design — enough to break the CGI flatness, not enough to look noisy.
const DEFAULT_GRAIN = 0.03;

export class Recolor implements RecolorEngine {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private imgTex: WebGLTexture | null = null;
  // Blurred copy of the photo (the "form" layer for the form/detail texture
  // split). Rebuilt once per setImage, sampled every frame as u_blur on unit 2.
  private blurTex: WebGLTexture | null = null;
  // GPU mask textures cached by source identity — a mask's pixels never change
  // for a given source object, so we upload each one ONCE and just rebind it on
  // subsequent renders (no per-frame texImage2D when only colour/shadow change).
  private maskTexCache = new Map<TexImageSource, WebGLTexture>();
  private locTarget: WebGLUniformLocation | null;
  private locStrength: WebGLUniformLocation | null;
  private locUseMask: WebGLUniformLocation | null;
  private locPreserve: WebGLUniformLocation | null;
  private locBaseL: WebGLUniformLocation | null;
  private locGrain: WebGLUniformLocation | null;
  private width = 0;
  private height = 0;

  constructor(public readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not supported in this browser.");
    this.gl = gl;
    const vs = compile(gl, gl.VERTEX_SHADER, VERT);
    const fs = compile(gl, gl.FRAGMENT_SHADER, FRAG);
    const program = gl.createProgram()!;
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Link failed: " + gl.getProgramInfoLog(program));
    }
    this.program = program;
    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    this.vbo = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, "a_pos");
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(program);
    gl.uniform1i(gl.getUniformLocation(program, "u_image"), 0);
    gl.uniform1i(gl.getUniformLocation(program, "u_mask"), 1);
    gl.uniform1i(gl.getUniformLocation(program, "u_blur"), 2);
    this.locTarget = gl.getUniformLocation(program, "u_target");
    this.locStrength = gl.getUniformLocation(program, "u_strength");
    this.locUseMask = gl.getUniformLocation(program, "u_useMask");
    this.locPreserve = gl.getUniformLocation(program, "u_preserve");
    this.locBaseL = gl.getUniformLocation(program, "u_baseL");
    this.locGrain = gl.getUniformLocation(program, "u_grain");
  }

  setImage(source: TexImageSource & { width?: number; height?: number }) {
    const gl = this.gl;
    if (!this.imgTex) this.imgTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.width = source.width ?? this.canvas.width;
    this.height = source.height ?? this.canvas.height;

    // Blurred copy for the form/detail split. If the blur can't be built (no DOM
    // / 2D context / tainted source), fall back to the sharp photo: then B == L,
    // the detail term is zero, and the form ratio degrades to a per-pixel
    // luminance multiply — still correct, just without the texture transfer.
    if (!this.blurTex) this.blurTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE2);
    gl.bindTexture(gl.TEXTURE_2D, this.blurTex);
    const blurred = blurredCopy(source as CanvasImageSource, this.width, this.height);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, blurred ?? source);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    // A new photo means the old project's masks are gone — drop their textures.
    this.clearMaskCache();
  }

  /**
   * Soften a hard binary mask's edge so the painted region blends into the
   * photo instead of reading as a cut-out sticker. The blur is GPU-accelerated
   * via the 2D canvas filter and runs ONCE per mask (the feathered result is
   * cached as a GL texture below). Degrades to the original crisp mask wherever
   * the canvas filter or a 2D context is unavailable — still correct, just sharp.
   */
  private feather(mask: TexImageSource): TexImageSource {
    if (typeof document === "undefined") return mask;
    const dims = texSize(mask);
    if (!dims) return mask;
    const c = document.createElement("canvas");
    c.width = dims.w;
    c.height = dims.h;
    const ctx = c.getContext("2d");
    if (!ctx) return mask;
    ctx.filter = `blur(${featherRadius(dims.w, dims.h)}px)`;
    ctx.drawImage(mask as CanvasImageSource, 0, 0, dims.w, dims.h);
    return c;
  }

  /** Get (or upload-once) the cached GL texture for a mask source. */
  private maskTexture(mask: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const cached = this.maskTexCache.get(mask);
    if (cached) return cached;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.feather(mask));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.maskTexCache.set(mask, tex);
    return tex;
  }

  private clearMaskCache() {
    for (const tex of this.maskTexCache.values()) this.gl.deleteTexture(tex);
    this.maskTexCache.clear();
  }

  /** Paint the photo through 0..N region masks, compositing them all in one frame. */
  renderRegions(regions: ReadonlyArray<RegionPaint>) {
    const gl = this.gl;
    if (!this.imgTex) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Bind the blurred form layer once (unit 2); it's shared by every region pass.
    if (this.blurTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTex);
    }

    // Base pass: the untouched photograph.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(this.locUseMask, 0);
    gl.uniform1f(this.locStrength, 1);
    gl.uniform1f(this.locPreserve, 0);
    gl.uniform1f(this.locBaseL, 0);
    gl.uniform1f(this.locGrain, 0);
    gl.uniform3fv(this.locTarget, [0, 0, 0]);
    gl.drawArrays(gl.TRIANGLES, 0, 3);

    // Region passes: blend each painted mask on top.
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    for (const r of regions) {
      if (!r.mask) continue;
      const maskTex = this.maskTexture(r.mask);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, maskTex);
      gl.uniform1i(this.locUseMask, 1);
      gl.uniform3fv(this.locTarget, r.target);
      gl.uniform1f(this.locStrength, clamp01(r.strength ?? 1));
      gl.uniform1f(this.locPreserve, clamp01(r.preserve ?? 0));
      gl.uniform1f(this.locBaseL, Math.max(0, r.baseL ?? 0));
      gl.uniform1f(this.locGrain, Math.max(0, r.grain ?? DEFAULT_GRAIN));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }

  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase() {
    this.renderRegions([]);
  }

  exportPng(): string { return this.canvas.toDataURL("image/png"); }

  dispose() {
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.blurTex) gl.deleteTexture(this.blurTex);
    this.clearMaskCache();
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}

/**
 * A large-radius blurred copy of the photo, used as the low-pass "form" layer:
 * the recolor tints the swatch by this smooth luminance (big form shadows) and
 * carries `photo - blur` on top as real surface texture. The radius (~2% of the
 * longest side) is the split point between "form" (kept as shading) and "detail"
 * (kept as texture): stipple, dirt and seams fall below it; eaves and facade
 * gradients above it. Returns null (caller falls back to the sharp photo) where
 * the DOM, a 2D context, or a readable source isn't available.
 */
function blurredCopy(source: CanvasImageSource, w: number, h: number): HTMLCanvasElement | null {
  if (typeof document === "undefined" || w <= 0 || h <= 0) return null;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d");
  if (!ctx) return null;
  const radius = Math.min(28, Math.max(6, Math.round(Math.max(w, h) * 0.01)));
  ctx.filter = `blur(${radius}px)`;
  try {
    ctx.drawImage(source, 0, 0, w, h);
  } catch {
    return null;
  }
  return c;
}

function compile(gl: WebGL2RenderingContext, kind: number, src: string): WebGLShader {
  const sh = gl.createShader(kind)!;
  gl.shaderSource(sh, src);
  gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(sh);
    gl.deleteShader(sh);
    throw new Error("Shader compile failed: " + log);
  }
  return sh;
}

export function hexToRgb01(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [
    parseInt(full.substring(0, 2), 16) / 255,
    parseInt(full.substring(2, 4), 16) / 255,
    parseInt(full.substring(4, 6), 16) / 255,
  ];
}

/**
 * Mean perceptual luminance (0..1) of the source pixels that fall inside a mask.
 * Used as a region's "LRV in the photo" so shadow preservation knows the neutral
 * point. Both inputs are drawn to a small shared canvas for a fast average; a
 * region with no covered pixels returns 0 (which disables shading for it).
 */
export function regionMeanLuma(
  source: CanvasImageSource,
  mask: CanvasImageSource,
  sampleMax = 192,
): number {
  if (typeof document === "undefined") return 0;
  const dims = imageSize(source);
  if (!dims) return 0;
  const scale = Math.min(1, sampleMax / Math.max(dims.w, dims.h));
  const w = Math.max(1, Math.round(dims.w * scale));
  const h = Math.max(1, Math.round(dims.h * scale));

  const srcCanvas = document.createElement("canvas");
  srcCanvas.width = w; srcCanvas.height = h;
  const sctx = srcCanvas.getContext("2d", { willReadFrequently: true });
  const mctx = document.createElement("canvas");
  mctx.width = w; mctx.height = h;
  const mc = mctx.getContext("2d", { willReadFrequently: true });
  if (!sctx || !mc) return 0;
  sctx.drawImage(source, 0, 0, w, h);
  mc.drawImage(mask, 0, 0, w, h);

  let src: ImageData, msk: ImageData;
  try {
    src = sctx.getImageData(0, 0, w, h);
    msk = mc.getImageData(0, 0, w, h);
  } catch {
    return 0; // tainted canvas — skip shading rather than throw
  }
  let sum = 0;
  let count = 0;
  for (let i = 0; i < src.data.length; i += 4) {
    if (msk.data[i]! < 128) continue; // outside the region
    const L = 0.2126 * src.data[i]! + 0.7152 * src.data[i + 1]! + 0.0722 * src.data[i + 2]!;
    sum += L;
    count++;
  }
  return count === 0 ? 0 : sum / count / 255;
}

function imageSize(s: CanvasImageSource): { w: number; h: number } | null {
  const any = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = any.naturalWidth || any.width || 0;
  const h = any.naturalHeight || any.height || 0;
  return w > 0 && h > 0 ? { w: Number(w), h: Number(h) } : null;
}

/** Pixel dimensions of any texture source (img/canvas/bitmap) for feathering. */
function texSize(s: TexImageSource): { w: number; h: number } | null {
  const any = s as { naturalWidth?: number; naturalHeight?: number; width?: number; height?: number };
  const w = any.naturalWidth || any.width || 0;
  const h = any.naturalHeight || any.height || 0;
  return w > 0 && h > 0 ? { w: Number(w), h: Number(h) } : null;
}
