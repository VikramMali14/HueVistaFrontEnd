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
uniform vec3 u_target;
uniform float u_strength;
uniform int u_useMask;
// Shadow/relief preservation. 0 = flat exact fill (the swatch everywhere);
// 1 = fully follow the photo's light. u_baseL is the region's mean luminance.
uniform float u_preserve;
uniform float u_baseL;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

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
    // Relative shading: where the wall is darker than its average it darkens the
    // paint, where it's brighter it lifts it — so shadows and curvature read.
    float L = luma(src.rgb);
    float ratio = clamp(L / u_baseL, 0.35, 2.2);
    ratio = mix(1.0, ratio, u_preserve);
    if (ratio <= 1.0) {
      // Darken by multiply — keeps the swatch hue, no clipping.
      paint = u_target * ratio;
    } else {
      // Brighten by lifting uniformly toward white, so the hue holds (rather than
      // letting channels clip to 1.0 at different rates and shifting colour).
      paint = mix(u_target, vec3(1.0), clamp(ratio - 1.0, 0.0, 1.0));
    }
    paint = clamp(paint, 0.0, 1.0);
  }
  outColor = vec4(paint, u_strength * m);
}`;

/** One painted region to composite over the photo. */
export interface RegionPaint {
  /** White-on-black region mask at (any) resolution; null skips the region. */
  mask: TexImageSource | null;
  /** Target paint colour, components in 0..1. */
  target: [number, number, number];
  /** Shadow/relief preservation strength, 0..1. 0 = flat exact swatch. */
  preserve?: number;
  /** Region mean luminance in the source photo, 0..1 (needed when preserve>0). */
  baseL?: number;
  /** Overall opacity 0..1 — used to fade a region out (e.g. compare view). */
  strength?: number;
}

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

export class Recolor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private imgTex: WebGLTexture | null = null;
  // GPU mask textures cached by source identity — a mask's pixels never change
  // for a given source object, so we upload each one ONCE and just rebind it on
  // subsequent renders (no per-frame texImage2D when only colour/shadow change).
  private maskTexCache = new Map<TexImageSource, WebGLTexture>();
  private locTarget: WebGLUniformLocation | null;
  private locStrength: WebGLUniformLocation | null;
  private locUseMask: WebGLUniformLocation | null;
  private locPreserve: WebGLUniformLocation | null;
  private locBaseL: WebGLUniformLocation | null;
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
    this.locTarget = gl.getUniformLocation(program, "u_target");
    this.locStrength = gl.getUniformLocation(program, "u_strength");
    this.locUseMask = gl.getUniformLocation(program, "u_useMask");
    this.locPreserve = gl.getUniformLocation(program, "u_preserve");
    this.locBaseL = gl.getUniformLocation(program, "u_baseL");
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
    const dpr = Math.min(2, typeof window === "undefined" ? 1 : window.devicePixelRatio);
    this.canvas.width = Math.round(this.width * dpr);
    this.canvas.height = Math.round(this.height * dpr);
    // A new photo means the old project's masks are gone — drop their textures.
    this.clearMaskCache();
  }

  /** Get (or upload-once) the cached GL texture for a mask source. */
  private maskTexture(mask: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const cached = this.maskTexCache.get(mask);
    if (cached) return cached;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
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

    // Base pass: the untouched photograph.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(this.locUseMask, 0);
    gl.uniform1f(this.locStrength, 1);
    gl.uniform1f(this.locPreserve, 0);
    gl.uniform1f(this.locBaseL, 0);
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
    this.clearMaskCache();
    gl.deleteBuffer(this.vbo);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
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
