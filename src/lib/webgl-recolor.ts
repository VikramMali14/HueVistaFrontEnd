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
 * All of that shading is MULTIPLICATIVE, which is the difference between paint
 * and a sticker. Light is a ratio, so anything derived from the photo's light —
 * the big form shading, the fine surface texture — has to scale the colour
 * rather than be added to it: an added luminance delta drifts toward grey in
 * the highlights and toward black in the shadows, draining the swatch exactly
 * where the eye looks to decide what a surface is made of. For the same reason
 * a lit face is rescaled by its peak channel instead of being clipped at white,
 * so sunlight makes the colour brighter rather than washing it out.
 *
 * None of that can invent light the canvas never had, which is the one failure the
 * shader cannot answer on its own. The cleaned canvas it usually paints is a
 * generative pass, and when that pass drifts it hands back a surface painted the
 * wrong white, or one with its shadows ironed out, or both — and a multiply over a
 * near-constant is a sticker however carefully the multiply is done. So two of the
 * numbers here CAN be measured from the canvas rather than assumed about it
 * (canvas-light.ts): `u_anchorDiv`, the albedo actually delivered, and `u_relief`,
 * shading taken back off the original photograph.
 *
 * Both are opt-in and, for now, only /admin/studio-test opts in. The studio, the
 * share view and the render studio pass neither, which leaves `u_anchorDiv` at
 * REF_WHITE and `u_reliefMix` at 0 — arithmetic identical to before either existed,
 * so no customer or retailer render moves until someone decides it should. That is
 * also true of a canvas the clean-up got right, whoever is painting it: the measured
 * white of such a canvas IS REF_WHITE, and a surface with its light intact asks for
 * no relief.
 *
 * 60 fps on mid-range mobile, zero backend round-trip per swatch change. The
 * mask's soft (anti-aliased) edge is the only place colour blends.
 */

import type { RecolorEngine, RegionPaint } from "./recolor-engine";
import { anchorDivisor, REF_WHITE } from "./canvas-light";
import { featherMaskInward, featherRadiusInMaskPx, offsetMaskCanvas } from "./mask-feather";

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
// Scene-light anchoring (0 or 1). The CLEANED canvas repaints every paintable
// surface a fresh near-white, so the photo of those surfaces IS an illumination
// map — light level AND colour cast. When anchored, the swatch is modulated by
// that illumination directly (per-channel, divided by fresh-white albedo)
// instead of normalising the region mean UP to the swatch. An evening photo
// keeps its dim warm evening light instead of snapping to flat noon daylight.
uniform float u_anchor;
// The albedo anchored mode divides the canvas by to recover the scene's light.
// Computed on the CPU (anchorDivisor in canvas-light.ts) from the white this surface
// was actually DELIVERED at, rather than assumed to be fresh white: when the
// clean-up drifts and paints grey, assuming white divides by the wrong number and
// every colour on that surface renders dark by the size of the drift. Nobody reads
// that as a dark render — they read it as the swatch being wrong. Defaults to
// REF_WHITE, which is what a canvas the clean-up got right measures at anyway.
uniform float u_anchorDiv;
// Shading recovered from the ORIGINAL photograph, for a cleaned canvas that came
// back with its own light flattened out: the multiply then has nothing to modulate,
// and no shader can put back light it was never given. u_relief is a band-pass ratio
// map (buildReliefMap in canvas-light.ts) encoded so mid-grey means "no shading";
// u_reliefMix is 0 wherever the canvas still has light of its own — the usual case,
// costing one multiply by 1.0.
uniform sampler2D u_relief;
uniform float u_reliefMix;
// Surface grain: a hair of per-pixel noise, a floor of texture for perfectly
// smooth walls where the photo itself carries almost no detail. 0 disables it.
uniform float u_grain;
// Whole-image brighten (the studio's Brighten control): a gamma midtone lift,
// output = input^(1/u_bright). 1 = untouched. Applied to the base photo AND
// the painted regions alike, so the paint sits in the same brightened light
// instead of floating dark on a lifted photo. A gamma lift keeps pure white
// where it is — bright skies don't clip.
uniform float u_bright;
// 1 = sharpen the mask edge to ~one output pixel (see EDGE_T/EDGE_W below);
// 0 = use the mask's own alpha untouched. Set to 0 whenever the "soft edges"
// feather is on: that feather IS the intended edge — a deliberate multi-pixel
// ramp — and re-thresholding it here would snap it straight back to a hard line.
uniform float u_edgeAA;

// --- How the paint is made to sit in the photo's light -----------------------
// Gain on the photo's high-frequency texture, and the amplitude at which that
// texture rolls off. The knee is a SOFT saturation, not a clip (see below).
const float DETAIL_GAIN = 1.15;
const float DETAIL_KNEE = 0.06;
// How dark a form shadow may get, how bright a lit face may get, and the extra
// gamma applied below 1.0 so shadows deepen instead of sitting flat.
const float FORM_FLOOR = 0.22;
const float FORM_CEIL = 2.4;
const float SHADOW_DEPTH = 0.35;
// Mask edge: the alpha at which the surface starts, and how many output pixels
// the antialiased transition spans.
const float EDGE_T = 0.5;
const float EDGE_W = 0.9;
// How much true white a genuinely over-range highlight may take on. Small:
// this is specular sheen, not the main way a lit wall gets brighter.
const float HI_WHITE = 0.15;
// Multiplicative shading costs a little chroma; hand it back.
const float SAT = 1.06;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }

vec3 brighten(vec3 c) {
  if (u_bright <= 1.001) return c;
  return pow(max(c, 0.0), vec3(1.0 / u_bright));
}

// The albedo to assume when nothing was measured — fresh white paint at LRV ~85.
// Kept as a compile-time constant, not folded into u_anchorDiv's default, so the
// unmeasured path below compiles to the exact expression it did before u_anchorDiv
// existed. Dividing by a uniform holding 0.94 is not bit-identical to dividing by the
// literal: the compiler folds the literal to a reciprocal multiply and the last bit
// differs, which was enough to move one subpixel of a 400x300 render. That is
// invisible, but "no customer render moves" is worth being exactly true rather than
// nearly true.
const float REF_WHITE = ${REF_WHITE.toFixed(2)};

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
    outColor = vec4(brighten(src.rgb), 1.0);
    return;
  }
  float m = texture(u_mask, v_uv).r;
  vec3 paint = u_target;
  if (u_preserve > 0.001 && (u_baseL > 0.001 || u_anchor > 0.5)) {
    float L = luma(src.rgb);
    vec3 Brgb = texture(u_blur, v_uv).rgb;   // large-scale (form) light
    float B = luma(Brgb);
    // FORM: tint the swatch by the SMOOTH large-scale light. Form shadows
    // (eaves, reveals, the facade's own gradient) survive either way; the two
    // modes differ in what "neutral" means:
    vec3 form;
    if (u_anchor > 0.5) {
      // ANCHORED: the canvas is the cleaned image, whose paintable surfaces were
      // repainted a known albedo — so the smooth photo IS the illumination.
      // Per-channel, so the scene's warm or cool cast tints the paint too:
      // a dusk wall renders the swatch in dusk light, not showroom light.
      // 0 means the canvas was never measured: take the constant, by the same
      // expression as before this was measurable at all.
      if (u_anchorDiv > 0.0) form = Brgb / u_anchorDiv;
      else form = Brgb / REF_WHITE;
    } else {
      // LEGACY: normalise by the region's own mean luminance so the wall
      // still averages to the true swatch colour (the can's colour).
      form = vec3(B / u_baseL);
    }
    // Fold in whatever shading was recovered from the photograph before the clamp,
    // so borrowed relief is bounded and deepened on exactly the same terms as the
    // canvas's own. A mix at 0 is a multiply by 1.0: the normal path is untouched.
    form *= mix(1.0, 0.5 + texture(u_relief, v_uv).r, u_reliefMix);
    form = clamp(form, FORM_FLOOR, FORM_CEIL);
    form = mix(vec3(1.0), form, u_preserve);
    // Shading is MULTIPLICATIVE, split at 1.0 so each half can be treated on
    // its own terms without a branch. Below 1 is a genuine shadow, deepened by
    // an extra gamma so the paint sits INTO the surface instead of floating
    // flat on top of it. Above 1 is sunlight, which should make the swatch
    // BRIGHTER — not wash it out.
    vec3 fd = pow(min(form, vec3(1.0)), vec3(1.0 + SHADOW_DEPTH * u_preserve));
    vec3 fu = max(form, vec3(1.0));
    vec3 lit = u_target * fd * fu;
    // Rescale by the peak channel rather than clipping it. A hard clamp pins
    // the brightest channel at 1 while the others stay put, which drags the
    // hue toward white and drains the colour exactly where the sun hits —
    // that is what made light swatches read as bare, unpainted plaster.
    // Dividing by the peak keeps the ratio between channels, so the colour
    // survives at full chroma however bright the face is, and only a genuinely
    // over-range highlight earns a little real white on top.
    float pk = max(max(lit.r, lit.g), lit.b);
    paint = lit / max(pk, 1.0);
    paint = mix(paint, vec3(1.0), HI_WHITE * clamp(pk - 1.0, 0.0, 1.0));
    // DETAIL: the photo's real high-frequency texture — plaster stipple, dirt,
    // seams, micro-shadows. Applied as a RATIO, not added. Adding a luminance
    // delta to a colour pushes it toward grey in the highlights and toward
    // black in the shadows, so the swatch lost chroma precisely where the eye
    // reads material; real surface texture is a modulation of the light, so it
    // has to ride on the colour as a multiplier.
    float d = L - B;
    // A soft knee, not a clip. Clamping to a fixed band left flat plateaus
    // wherever the detail saturated — a plasticky dead patch beside every
    // railing and reveal. This saturates smoothly instead, so the big
    // luminance STEP at an edge still can't bloom into an unsharp-mask halo,
    // but nothing goes flat on the way there.
    float ds = d / (1.0 + abs(d) / DETAIL_KNEE);
    float rel = ds / max(B, 0.10);
    paint *= 1.0 + rel * DETAIL_GAIN * u_preserve;
    paint = mix(vec3(luma(paint)), paint, SAT);
  }
  if (u_grain > 0.0001) {
    // Signed, ~zero-mean noise. Scaled up a little on brighter paint so it reads
    // as surface texture without muddying shadow recesses.
    float n = hash(gl_FragCoord.xy) - 0.5;
    paint += n * u_grain * (0.5 + 0.5 * luma(paint));
  }
  paint = clamp(paint, 0.0, 1.0);
  // EDGE: the mask is bilinear-sampled from a texture that is usually LOWER
  // resolution than the photo, so the raw alpha gives a transition whose width
  // in output pixels depends on how far the mask is being stretched — often
  // several pixels of mush, with colour bleeding over window frames and
  // railings. fwidth is the screen-space rate of change of the mask, so
  // normalising the threshold by it gives a transition about ONE output pixel
  // wide whatever the mask's own resolution: crisp, but still antialiased, so
  // it never goes jaggy. Computed unconditionally (derivatives must not sit in
  // non-uniform control flow) and mixed in, so u_edgeAA = 0 leaves the mask's
  // own soft ramp — the "soft edges" feather — completely untouched.
  float w = max(fwidth(m), 1e-5) * EDGE_W;
  float aa = smoothstep(EDGE_T - w, EDGE_T + w, m);
  outColor = vec4(brighten(paint), u_strength * mix(m, aa, u_edgeAA));
}`;

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

// Default per-pixel grain amplitude when a region doesn't set its own. Subtle by
// design — enough to break the CGI flatness, not enough to look noisy.
const DEFAULT_GRAIN = 0.03;

export class Recolor implements RecolorEngine {
  private gl: WebGL2RenderingContext;
  private program!: WebGLProgram;
  private vbo!: WebGLBuffer;
  private vao!: WebGLVertexArrayObject;
  private imgTex: WebGLTexture | null = null;
  // Blurred copy of the photo (the "form" layer for the form/detail texture
  // split). Rebuilt once per setImage, sampled every frame as u_blur on unit 2.
  private blurTex: WebGLTexture | null = null;
  // Recovered-shading map (the original photograph's band-passed relief), sampled as
  // u_relief on unit 3. Always bound to something valid — a 1x1 neutral tile until a
  // real map is supplied — so no region can sample undefined texture memory.
  private reliefTex: WebGLTexture | null = null;
  private hasRelief = false;
  // GPU mask textures cached by source identity — a mask's pixels never change
  // for a given source object, so we upload each one ONCE and just rebind it on
  // subsequent renders (no per-frame texImage2D when only colour/shadow change).
  private maskTexCache = new Map<TexImageSource, WebGLTexture>();
  private locTarget!: WebGLUniformLocation | null;
  private locStrength!: WebGLUniformLocation | null;
  private locUseMask!: WebGLUniformLocation | null;
  private locPreserve!: WebGLUniformLocation | null;
  private locBaseL!: WebGLUniformLocation | null;
  private locAnchor!: WebGLUniformLocation | null;
  private locGrain!: WebGLUniformLocation | null;
  private locBright!: WebGLUniformLocation | null;
  private locEdgeAA!: WebGLUniformLocation | null;
  private locAnchorDiv!: WebGLUniformLocation | null;
  private locReliefMix!: WebGLUniformLocation | null;
  private width = 0;
  private height = 0;
  /** Mask-edge feather radius in px; 0 (default) keeps edges crisp. */
  private featherPx = 0;
  /** Whole-image brightness gamma; 1 (default) leaves the photo untouched. */
  private brightGamma = 1;
  /** Uniform edge nudge in photo px (the studio's "Edge nudge" control):
   *  positive grows every painted region outward, negative shrinks it. 0 off. */
  private edgeOffsetPx = 0;
  /**
   * True between `webglcontextlost` and `webglcontextrestored`. Every GL object this
   * class holds — program, buffers, textures — dies with the context, so each render
   * entry point returns early while this is set rather than issuing calls against a
   * dead context (which are silent no-ops at best, and console noise at worst).
   */
  private contextLost = false;

  /**
   * Called once the GPU hands the context back and this engine has rebuilt its
   * program and buffers. Its textures are NOT restored — the pixels died with the
   * context — so the owner must re-supply the photo (`setImage`) and repaint, which
   * is exactly what the studio does with it.
   */
  onContextRestored: (() => void) | null = null;

  /** Called when the GPU takes the context away, so the owner can say so on screen. */
  onContextLost: (() => void) | null = null;

  private readonly handleContextLost = (e: Event) => {
    // Without preventDefault the browser never follows up with `webglcontextrestored`
    // — that is the spec's opt-in, and skipping it is why a phone that reclaimed the
    // GPU used to leave the studio showing a permanently blank canvas with the
    // customer's paint gone and no way back but a reload.
    e.preventDefault();
    this.contextLost = true;
    // Every handle is dangling now. Drop them so nothing is deleted or rebound later
    // on the assumption it still exists.
    this.imgTex = null;
    this.blurTex = null;
    this.reliefTex = null;
    this.hasRelief = false;
    this.maskTexCache.clear();
    this.onContextLost?.();
  };

  private readonly handleContextRestored = () => {
    this.contextLost = false;
    this.initGL();
    this.onContextRestored?.();
  };

  constructor(public readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl2", { preserveDrawingBuffer: true });
    if (!gl) throw new Error("WebGL2 is not supported in this browser.");
    this.gl = gl;
    canvas.addEventListener("webglcontextlost", this.handleContextLost);
    canvas.addEventListener("webglcontextrestored", this.handleContextRestored);
    this.initGL();
  }

  /**
   * Build everything that lives inside the GL context: the program, the fullscreen
   * triangle and the uniform locations. Split out of the constructor because a
   * restored context comes back EMPTY — the same canvas and the same context object,
   * but every object made against it is gone — so this has to be able to run twice.
   */
  private initGL() {
    const gl = this.gl;
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
    gl.uniform1i(gl.getUniformLocation(program, "u_relief"), 3);
    this.locTarget = gl.getUniformLocation(program, "u_target");
    this.locStrength = gl.getUniformLocation(program, "u_strength");
    this.locUseMask = gl.getUniformLocation(program, "u_useMask");
    this.locPreserve = gl.getUniformLocation(program, "u_preserve");
    this.locBaseL = gl.getUniformLocation(program, "u_baseL");
    this.locAnchor = gl.getUniformLocation(program, "u_anchor");
    this.locGrain = gl.getUniformLocation(program, "u_grain");
    this.locBright = gl.getUniformLocation(program, "u_bright");
    this.locEdgeAA = gl.getUniformLocation(program, "u_edgeAA");
    this.locAnchorDiv = gl.getUniformLocation(program, "u_anchorDiv");
    this.locReliefMix = gl.getUniformLocation(program, "u_reliefMix");
    // Unit 3 must always sample as "no shading", so a region that asks for relief
    // before a source has been set gets a flat 1.0 rather than whatever texture
    // memory happened to hold.
    this.setReliefSource(null);
  }

  /**
   * Sets the whole-image brightness lift (the studio's "Brighten" control) as
   * a gamma, 1 = untouched. Takes effect on the next render — no caches to
   * drop, it's a plain uniform.
   */
  setBrightness(gamma: number) {
    this.brightGamma = Math.max(1, gamma);
  }

  setImage(source: TexImageSource & { width?: number; height?: number }) {
    // Nothing to draw into while the GPU has the context: every handle below is
    // dangling until `webglcontextrestored` rebuilds them.
    if (this.contextLost) return;
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
    // ...and so is the photograph the old relief map was built from. A map from the
    // previous project would be geometry from another house: worse than no relief.
    // Callers that want it re-supply it after setImage, which is the documented order.
    this.setReliefSource(null);
  }

  /**
   * Supply the ORIGINAL photograph's relief map — the shading the clean-up dropped,
   * recovered from the photo it started from (see buildReliefMap in canvas-light.ts)
   * — or null to clear it.
   *
   * Uploading a map does NOT change any render on its own: a region only draws on it
   * when it asks, via `RegionPaint.relief`, and regions on a canvas that kept its own
   * light ask for nothing. Cleared by {@link setImage}, so call this after it.
   */
  setReliefSource(source: TexImageSource | null) {
    // Nothing to draw into while the GPU has the context: every handle below is
    // dangling until `webglcontextrestored` rebuilds them.
    if (this.contextLost) return;
    const gl = this.gl;
    if (!this.reliefTex) this.reliefTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE3);
    gl.bindTexture(gl.TEXTURE_2D, this.reliefTex);
    if (source) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
    } else {
      // 1x1 mid-grey: the encoding's "no shading" value.
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array([128, 128, 128, 255]));
    }
    this.hasRelief = source !== null;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  /**
   * Set the uniform edge nudge in photo px (positive = grow the painted
   * regions, negative = shrink; 0 = off, the default). Cached mask textures
   * baked in the old offset, so a change drops them; callers re-render after.
   */
  setEdgeOffset(px: number) {
    if (px === this.edgeOffsetPx) return;
    this.edgeOffsetPx = px;
    this.clearMaskCache();
  }

  /**
   * The full mask preparation chain: apply the user's uniform edge nudge,
   * then feather inward (when the soft-edges toggle is on). Each stage
   * degrades to its input when it can't run, so the raw mask is always a
   * valid outcome.
   */
  private prepared(mask: TexImageSource): TexImageSource {
    let m = mask;
    if (this.edgeOffsetPx !== 0) {
      const dims = texSize(m);
      if (dims) {
        const off = featherRadiusInMaskPx(Math.abs(this.edgeOffsetPx), dims.w, this.width)
          * Math.sign(this.edgeOffsetPx);
        const shifted = offsetMaskCanvas(m as CanvasImageSource, dims.w, dims.h, off);
        if (shifted) m = shifted;
      }
    }
    return this.feather(m);
  }

  /**
   * Sets the mask-edge feather radius (the studio's "soft edges" toggle).
   * 0 = crisp edges, the default. Cached mask textures were uploaded with the
   * OLD radius baked in, so a change drops them — they re-upload feathered
   * (or crisp) on the next render.
   */
  setMaskFeather(radius: number) {
    const px = Math.max(0, radius);
    if (px === this.featherPx) return;
    this.featherPx = px;
    this.clearMaskCache();
  }

  /**
   * Optionally soften a hard binary mask's edge (the studio's "soft edges"
   * toggle; off by default, featherPx = 0, keeping a crisp edge exactly on
   * the surface boundary). The feather is INWARD-only — blur, re-steepen,
   * clamp by the hard mask (see mask-feather.ts) — so the paint fades in just
   * inside the boundary and NEVER spills past it: a plain Gaussian feather
   * here used to bleed colour onto the sky, window frames and railing gaps as
   * a glowing halo. The radius is given in photo pixels and rescaled to the
   * mask's own resolution, so a low-res AI mask doesn't magnify the feather
   * when it's stretched over the photo. Applied once per mask (cached as a GL
   * texture below); degrades to the crisp mask where a 2D context is
   * unavailable or the mask is unreadable (tainted).
   */
  private feather(mask: TexImageSource): TexImageSource {
    if (this.featherPx <= 0) return mask; // feathering off — keep the edge crisp
    const dims = texSize(mask);
    if (!dims) return mask;
    const radius = featherRadiusInMaskPx(this.featherPx, dims.w, this.width);
    const feathered = featherMaskInward(mask as CanvasImageSource, dims.w, dims.h, radius);
    return feathered ?? mask;
  }

  /** Get (or upload-once) the cached GL texture for a mask source. */
  private maskTexture(mask: TexImageSource): WebGLTexture {
    const gl = this.gl;
    const cached = this.maskTexCache.get(mask);
    if (cached) return cached;
    const tex = gl.createTexture()!;
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.prepared(mask));
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
    // Nothing to draw into while the GPU has the context: every handle below is
    // dangling until `webglcontextrestored` rebuilds them.
    if (this.contextLost) return;
    const gl = this.gl;
    if (!this.imgTex) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.disable(gl.BLEND);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);

    // Brightness applies to every pass (base photo AND painted regions) so the
    // whole scene lifts together; set once per frame.
    gl.uniform1f(this.locBright, this.brightGamma);
    // Sharpen the mask edge only when the soft-edges feather is OFF. With it on
    // the mask carries a deliberate multi-pixel ramp, and re-thresholding that
    // to one pixel would undo the very thing the toggle asks for.
    gl.uniform1f(this.locEdgeAA, this.featherPx > 0 ? 0 : 1);

    // Bind the blurred form layer once (unit 2); it's shared by every region pass.
    if (this.blurTex) {
      gl.activeTexture(gl.TEXTURE2);
      gl.bindTexture(gl.TEXTURE_2D, this.blurTex);
    }
    // Same for the recovered-shading map on unit 3 (neutral until one is supplied).
    if (this.reliefTex) {
      gl.activeTexture(gl.TEXTURE3);
      gl.bindTexture(gl.TEXTURE_2D, this.reliefTex);
    }

    // Base pass: the untouched photograph.
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    gl.uniform1i(this.locUseMask, 0);
    gl.uniform1f(this.locStrength, 1);
    gl.uniform1f(this.locPreserve, 0);
    gl.uniform1f(this.locBaseL, 0);
    gl.uniform1f(this.locAnchor, 0);
    gl.uniform1f(this.locGrain, 0);
    gl.uniform1f(this.locAnchorDiv, 0);
    gl.uniform1f(this.locReliefMix, 0);
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
      gl.uniform1f(this.locAnchor, r.anchor ? 1 : 0);
      gl.uniform1f(this.locGrain, Math.max(0, r.grain ?? DEFAULT_GRAIN));
      // 0 = unmeasured, which the shader reads as "use the built-in REF_WHITE".
      // A caller that passes no whitePoint therefore renders bit-for-bit as it did
      // before any of this existed — see the constant's note in the shader.
      gl.uniform1f(this.locAnchorDiv, r.whitePoint === undefined ? 0 : anchorDivisor(r.whitePoint));
      // Relief is ignored outright with no map loaded, rather than sampling the
      // neutral tile and trusting the multiply to come out at 1.
      gl.uniform1f(this.locReliefMix, this.hasRelief ? clamp01(r.relief ?? 0) : 0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
  }

  /** Draw just the untouched photo (e.g. the "before" compare view). */
  renderBase() {
    this.renderRegions([]);
  }

  exportPng(): string {
    // A lost context reads back as a fully transparent canvas. Returning that would
    // put a blank page on the customer's colour board, so refuse instead — every
    // caller already treats "" as "could not capture this image".
    if (this.contextLost) return "";
    return this.canvas.toDataURL("image/png");
  }

  dispose() {
    this.canvas.removeEventListener("webglcontextlost", this.handleContextLost);
    this.canvas.removeEventListener("webglcontextrestored", this.handleContextRestored);
    this.onContextLost = null;
    this.onContextRestored = null;
    // Deleting objects that died with the context is not just pointless, it is calls
    // against a dead context — and the handles were dropped when it was lost.
    if (this.contextLost) return;
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.blurTex) gl.deleteTexture(this.blurTex);
    if (this.reliefTex) gl.deleteTexture(this.reliefTex);
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
