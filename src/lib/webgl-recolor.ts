/**
 * WebGL2 exact-shade recolor engine.
 * Uploads the source photograph + an optional per-region mask; the
 * fragment shader fills the masked region with the EXACT target colour
 * (the true paint swatch), not a luminance-blended approximation — so the
 * preview matches the can. 60 fps on mid-range mobile, with zero backend
 * round-trip per swatch change. The mask's soft (anti-aliased) edge is the
 * only place the colour blends, which keeps region boundaries clean.
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

void main() {
  vec4 src = texture(u_image, v_uv);
  // Only paint inside a region mask. With no mask (failed load, manual region,
  // or pre-segmentation) leave the photo untouched rather than flooding the
  // whole canvas with a flat colour.
  if (u_useMask == 0) {
    outColor = src;
    return;
  }
  // Fill with the EXACT target colour — no luminance preservation, so the
  // painted wall reads as the true swatch everywhere, never lighter or darker.
  float m = texture(u_mask, v_uv).r;
  float w = u_strength * m;
  outColor = vec4(mix(src.rgb, u_target, w), src.a);
}`;

export class Recolor {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vbo: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private imgTex: WebGLTexture | null = null;
  private maskTex: WebGLTexture | null = null;
  private locTarget: WebGLUniformLocation | null;
  private locStrength: WebGLUniformLocation | null;
  private locUseMask: WebGLUniformLocation | null;
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
  }

  setMask(mask: TexImageSource | null) {
    const gl = this.gl;
    if (!mask) { this.maskTex = null; return; }
    if (!this.maskTex) this.maskTex = gl.createTexture();
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mask);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  }

  render(target: [number, number, number], strength = 1.0) {
    const gl = this.gl;
    if (!this.imgTex) return;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.imgTex);
    if (this.maskTex) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, this.maskTex);
      gl.uniform1i(this.locUseMask, 1);
    } else {
      gl.uniform1i(this.locUseMask, 0);
    }
    gl.uniform3fv(this.locTarget, target);
    gl.uniform1f(this.locStrength, Math.max(0, Math.min(1, strength)));
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  exportPng(): string { return this.canvas.toDataURL("image/png"); }

  dispose() {
    const gl = this.gl;
    if (this.imgTex) gl.deleteTexture(this.imgTex);
    if (this.maskTex) gl.deleteTexture(this.maskTex);
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
