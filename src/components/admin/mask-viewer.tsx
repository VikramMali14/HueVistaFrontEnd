"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { resolveMediaUrl } from "@/lib/media";
import type { ProjectDetail, ProjectSummary, RegionCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Admin mask-viewer: loads a project's RAW colour-coded model mask and the
 * STORED (post-processed) per-region masks, splits the raw image into its
 * red/green/blue category layers client-side, and composites everything over
 * the photo as toggleable overlays. Pure diagnostics; nothing here writes to
 * the backend.
 */

/** Longest side of the working canvas — everything is rasterized to one grid. */
const MAX_DIM = 1600;

/** Raw palette anchors the model was instructed to output. */
const ANCHORS: ReadonlyArray<{ key: "red" | "green" | "blue" | "black"; rgb: [number, number, number] }> = [
  { key: "red", rgb: [255, 0, 0] },
  { key: "green", rgb: [0, 255, 0] },
  { key: "blue", rgb: [0, 0, 255] },
  { key: "black", rgb: [0, 0, 0] },
];
/** Pixels farther than this (squared distance) from every anchor are off-palette. */
const OFF_PALETTE_DIST2 = 120 * 120;

type BaseMode = "cleaned" | "original" | "black";

interface Layer {
  id: string;
  group: "raw" | "stored";
  label: string;
  /** Legend swatch colour. */
  color: string;
  canvas: HTMLCanvasElement;
  /** Foreground pixel share of the canvas, 0..100. */
  pct: number;
  detail?: string;
}

const RAW_TINT = {
  red: "#ff2d20",
  green: "#00d24b",
  blue: "#2f6bff",
  off: "#ff00e5",
} as const;
const STORED_TINT: Record<RegionCategory, string> = {
  MAIN_WALL: "#ff8a7a",
  ACCENT_WALL: "#7ce68a",
  OTHER_WALL: "#ffd166",
  TRIM: "#8fb0ff",
  MANUAL: "#ffa94d",
};

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load " + url));
    img.src = url;
  });
}

/** Draw an image onto a fresh W×H grid and return its pixels. */
function rasterize(img: HTMLImageElement, w: number, h: number, smooth: boolean): ImageData {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = smooth;
  ctx.drawImage(img, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

/** Solid-colour overlay canvas from a 0/1 bitmap. */
function bitmapToCanvas(bits: Uint8Array, w: number, h: number, hex: string): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const out = ctx.createImageData(w, h);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  for (let i = 0; i < bits.length; i++) {
    if (!bits[i]) continue;
    const o = i * 4;
    out.data[o] = r;
    out.data[o + 1] = g;
    out.data[o + 2] = b;
    out.data[o + 3] = 255;
  }
  ctx.putImageData(out, 0, 0);
  return c;
}

const pctOf = (bits: Uint8Array) => {
  let n = 0;
  for (let i = 0; i < bits.length; i++) n += bits[i] ?? 0;
  return Math.round((n / bits.length) * 1000) / 10;
};

export function MaskViewer() {
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [layers, setLayers] = useState<Layer[]>([]);
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [baseMode, setBaseMode] = useState<BaseMode>("cleaned");
  const [hasCleaned, setHasCleaned] = useState(false);
  const [opacity, setOpacity] = useState(0.55);
  const [meta, setMeta] = useState<string | null>(null);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const cleanedRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    api
      .listProjects()
      .then((list) => {
        // Segmented projects first (the only ones with masks), then newest.
        const sorted = [...list].sort((a, b) => {
          if ((a.status === "SEGMENTED") !== (b.status === "SEGMENTED")) {
            return a.status === "SEGMENTED" ? -1 : 1;
          }
          return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
        });
        setProjects(sorted);
        const first = sorted[0];
        if (first) setSelected(first.id);
      })
      .catch(() => setError("Could not load your projects. Refresh to retry."));
  }, []);

  const load = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    setNotes([]);
    setLayers([]);
    setMeta(null);
    try {
      const detail: ProjectDetail = await api.getProject(projectId);
      const warn: string[] = [];

      const originalUrl = resolveMediaUrl(detail.imageUrl);
      if (!originalUrl) throw new Error("Project has no photo URL");
      const original = await loadImage(originalUrl);
      originalRef.current = original;

      let cleaned: HTMLImageElement | null = null;
      if (detail.cleanedImageUrl) {
        try {
          cleaned = await loadImage(resolveMediaUrl(detail.cleanedImageUrl)!);
        } catch {
          warn.push("The cleaned canvas failed to load — falling back to the original photo.");
        }
      }
      cleanedRef.current = cleaned;
      setHasCleaned(Boolean(cleaned));
      setBaseMode(cleaned ? "cleaned" : "original");

      // One working grid for every layer, sized off the paint canvas — the
      // same image the stored masks are aligned to.
      const sizeSrc = cleaned ?? original;
      const scale = Math.min(1, MAX_DIM / Math.max(sizeSrc.naturalWidth, sizeSrc.naturalHeight));
      const w = Math.max(1, Math.round(sizeSrc.naturalWidth * scale));
      const h = Math.max(1, Math.round(sizeSrc.naturalHeight * scale));

      const built: Layer[] = [];

      // ---- RAW: classify every pixel of the colour-coded model output ----
      if (detail.rawMaskUrl) {
        try {
          const rawImg = await loadImage(resolveMediaUrl(detail.rawMaskUrl)!);
          const px = rasterize(rawImg, w, h, true).data;
          const bits = {
            red: new Uint8Array(w * h),
            green: new Uint8Array(w * h),
            blue: new Uint8Array(w * h),
            off: new Uint8Array(w * h),
          };
          for (let i = 0; i < w * h; i++) {
            const o = i * 4;
            const r = px[o] ?? 0, g = px[o + 1] ?? 0, b = px[o + 2] ?? 0;
            let best: string = "black";
            let bestD = Infinity;
            for (const a of ANCHORS) {
              const d =
                (r - a.rgb[0]) * (r - a.rgb[0]) +
                (g - a.rgb[1]) * (g - a.rgb[1]) +
                (b - a.rgb[2]) * (b - a.rgb[2]);
              if (d < bestD) {
                bestD = d;
                best = a.key;
              }
            }
            if (bestD > OFF_PALETTE_DIST2) bits.off[i] = 1;
            else if (best !== "black") bits[best as "red" | "green" | "blue"][i] = 1;
          }
          const rawAspect = rawImg.naturalWidth / rawImg.naturalHeight;
          const canvasAspect = w / h;
          if (Math.abs(rawAspect - canvasAspect) / canvasAspect > 0.015) {
            warn.push(
              `Aspect drift: the raw mask is ${rawImg.naturalWidth}×${rawImg.naturalHeight} ` +
              `(${rawAspect.toFixed(3)}) but the canvas aspect is ${canvasAspect.toFixed(3)} — ` +
              `regions from this generation are stretched onto the photo.`,
            );
          }

          const rawMeta = ` · raw mask ${rawImg.naturalWidth}×${rawImg.naturalHeight}`;
          setMeta(`canvas ${w}×${h}${rawMeta}`);

          built.push(
            { id: "raw-red", group: "raw", label: "Red — main walls", color: RAW_TINT.red, canvas: bitmapToCanvas(bits.red, w, h, RAW_TINT.red), pct: pctOf(bits.red) },
            { id: "raw-green", group: "raw", label: "Green — accent wall", color: RAW_TINT.green, canvas: bitmapToCanvas(bits.green, w, h, RAW_TINT.green), pct: pctOf(bits.green) },
            { id: "raw-blue", group: "raw", label: "Blue — trim & borders", color: RAW_TINT.blue, canvas: bitmapToCanvas(bits.blue, w, h, RAW_TINT.blue), pct: pctOf(bits.blue) },
          );
          const offPct = pctOf(bits.off);
          if (offPct > 0) {
            built.push({
              id: "raw-off",
              group: "raw",
              label: "Off-palette pixels",
              color: RAW_TINT.off,
              canvas: bitmapToCanvas(bits.off, w, h, RAW_TINT.off),
              pct: offPct,
              detail: "colours outside the 4-colour contract (white/grey/blends)",
            });
          }
        } catch {
          warn.push("The raw mask image failed to load.");
        }
      } else {
        warn.push(
          "No raw mask is stored for this project — it was segmented before raw-mask " +
          "capture shipped (or has only manual regions). Re-run segmentation to capture one.",
        );
        setMeta(`canvas ${w}×${h}`);
      }

      // ---- STORED: each persisted region mask (white-on-black PNG) ----
      for (const region of detail.regions) {
        if (!region.maskUrl) continue;
        try {
          const img = await loadImage(resolveMediaUrl(region.maskUrl)!);
          const px = rasterize(img, w, h, false).data;
          const bits = new Uint8Array(w * h);
          for (let i = 0; i < w * h; i++) {
            const o = i * 4;
            // Foreground = bright pixel (white-on-black), respecting alpha.
            if ((px[o + 3] ?? 0) > 127 && (px[o] ?? 0) + (px[o + 1] ?? 0) + (px[o + 2] ?? 0) > 382) bits[i] = 1;
          }
          const tint = STORED_TINT[region.category] ?? STORED_TINT.MANUAL;
          built.push({
            id: `stored-${region.id}`,
            group: "stored",
            label: `${region.label || region.category}${region.manual ? " (manual)" : ""}`,
            color: tint,
            canvas: bitmapToCanvas(bits, w, h, tint),
            pct: pctOf(bits),
            detail: `${img.naturalWidth}×${img.naturalHeight}`,
          });
        } catch {
          warn.push(`Mask for region "${region.label}" failed to load.`);
        }
      }

      // Default view: the three raw layers on (the screenshot view).
      const initial: Record<string, boolean> = {};
      for (const l of built) initial[l.id] = l.group === "raw" && l.id !== "raw-off";
      setLayers(built);
      setVisible(initial);
      setNotes(warn);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load the project.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Composite base + visible overlays whenever anything changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    const firstLayer = layers[0];
    if (!canvas || !firstLayer) return;
    canvas.width = firstLayer.canvas.width;
    canvas.height = firstLayer.canvas.height;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const base = baseMode === "cleaned" ? cleanedRef.current
      : baseMode === "original" ? originalRef.current : null;
    if (base) ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
    ctx.globalAlpha = opacity;
    for (const layer of layers) {
      if (visible[layer.id]) ctx.drawImage(layer.canvas, 0, 0);
    }
    ctx.globalAlpha = 1;
  }, [layers, visible, baseMode, opacity]);

  const groups: Array<{ key: Layer["group"]; title: string; hint: string }> = [
    { key: "raw", title: "Raw model output", hint: "extracted from the colour-coded image, before any processing" },
    { key: "stored", title: "Stored regions", hint: "the processed masks the studio actually paints through" },
  ];

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 20 }}>
        <div className="field" style={{ minWidth: 260, flex: "0 1 380px" }}>
          <label className="field-label" htmlFor="mv-project">Project</label>
          <select
            id="mv-project"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!projects || loading}
          >
            {!projects && <option value="">Loading projects…</option>}
            {projects?.length === 0 && <option value="">No projects on this account</option>}
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {p.status.toLowerCase()}{p.regionCount ? ` · ${p.regionCount} regions` : ""}
              </option>
            ))}
          </select>
        </div>
        <Button type="button" variant="brass" onClick={() => selected && load(selected)}
          disabled={!selected || loading} style={{ marginBottom: 2 }}>
          {loading
            ? <><Spinner size={14} color="currentColor" decorative /> Extracting…</>
            : <>Load masks <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginTop: 20 }}>{error}</div>}
      {notes.map((n) => (
        <div key={n} role="note" style={{ marginTop: 14, padding: "10px 14px", border: "1px solid var(--rule-strong)", borderRadius: "var(--radius)", font: "400 13px/1.5 var(--sans)", color: "var(--fg-soft)" }}>
          {n}
        </div>
      ))}

      {layers.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 28, marginTop: 28, alignItems: "flex-start" }}>
          <div style={{ flex: "1 1 420px", minWidth: 300 }}>
            <canvas ref={canvasRef} style={{ width: "100%", height: "auto", display: "block", borderRadius: "var(--radius)", border: "1px solid var(--rule-strong)" }} />
            {meta && (
              <div style={{ marginTop: 8, font: "400 11px/1.4 var(--mono)", color: "var(--fg-mute)" }}>{meta}</div>
            )}
          </div>

          <div style={{ flex: "0 1 300px", minWidth: 260 }}>
            <div className="field" style={{ marginBottom: 18 }}>
              <span className="field-label">Background</span>
              <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
                {(["cleaned", "original", "black"] as const).map((mode) => (
                  (mode !== "cleaned" || hasCleaned) && (
                    <label key={mode} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 14px/1 var(--sans)", cursor: "pointer" }}>
                      <input type="radio" name="mv-base" checked={baseMode === mode} onChange={() => setBaseMode(mode)} />
                      {mode === "cleaned" ? "Cleaned canvas" : mode === "original" ? "Photo" : "Black"}
                    </label>
                  )
                ))}
              </div>
            </div>

            <div className="field" style={{ marginBottom: 22 }}>
              <label className="field-label" htmlFor="mv-opacity">Overlay opacity · {Math.round(opacity * 100)}%</label>
              <input id="mv-opacity" type="range" min={10} max={100} value={Math.round(opacity * 100)}
                onChange={(e) => setOpacity(Number(e.target.value) / 100)} style={{ width: "100%" }} />
            </div>

            {groups.map(({ key, title, hint }) => {
              const inGroup = layers.filter((l) => l.group === key);
              if (inGroup.length === 0) return null;
              return (
                <div key={key} style={{ marginBottom: 22 }}>
                  <div style={{ font: "500 11px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)", marginBottom: 4 }}>
                    {title}
                  </div>
                  <div style={{ font: "300 12px/1.4 var(--serif)", color: "var(--fg-mute)", marginBottom: 10 }}>{hint}</div>
                  {inGroup.map((layer) => (
                    <label key={layer.id} style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "5px 0", font: "400 14px/1.35 var(--sans)", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={Boolean(visible[layer.id])}
                        onChange={(e) => setVisible((v) => ({ ...v, [layer.id]: e.target.checked }))}
                        style={{ flexShrink: 0, position: "relative", top: 2 }}
                      />
                      <span style={{ width: 12, height: 12, borderRadius: 3, background: layer.color, flexShrink: 0, position: "relative", top: 1 }} />
                      <span style={{ flex: 1 }}>
                        {layer.label}
                        {layer.detail && (
                          <span style={{ display: "block", font: "400 11px/1.4 var(--mono)", color: "var(--fg-mute)" }}>{layer.detail}</span>
                        )}
                      </span>
                      <span style={{ font: "400 12px/1 var(--mono)", color: "var(--fg-mute)", flexShrink: 0 }}>{layer.pct}%</span>
                    </label>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
