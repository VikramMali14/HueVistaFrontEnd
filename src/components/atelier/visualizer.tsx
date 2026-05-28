"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { PipelineBar, type PipelineStage } from "./pipeline-bar";
import { ShadeGrid } from "./shade-grid";
import { hexToRgb01, Recolor } from "@/lib/webgl-recolor";
import type {
  PaintShade,
  ProjectDetail,
  RegionCategory,
  RegionDetail,
  RegionKind,
} from "@/lib/types";

interface VisualizerProps { accessToken: string; }

interface RegionState {
  id: string;
  backendId?: number;
  kind: RegionKind;
  label: string;
  hex: string;
  shade?: PaintShade;
  maskUrl?: string | null;
}

type Tool = "select" | "add" | "refine";

const DEFAULT_REGIONS: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "MAIN_WALL · 01", hex: "#a47148" },
  { id: "accent", kind: "ACCENT_WALL", label: "ACCENT_WALL", hex: "#5b6c5b" },
  { id: "trim", kind: "TRIM", label: "TRIM", hex: "#f3eee4" },
];

const REGION_DOT: Record<RegionKind, string> = {
  MAIN_WALL: "#f3eee4",
  ACCENT_WALL: "#5b6c5b",
  TRIM: "#3e4a52",
  MANUAL: "var(--brass)",
};

const CATEGORY_TO_KIND: Record<RegionCategory, RegionKind> = {
  MAIN_WALL: "MAIN_WALL",
  ACCENT_WALL: "ACCENT_WALL",
  OTHER_WALL: "ACCENT_WALL",
  TRIM: "TRIM",
  MANUAL: "MANUAL",
};

const DEFAULT_HEX_FOR_KIND: Record<RegionKind, string> = {
  MAIN_WALL: "#a47148",
  ACCENT_WALL: "#5b6c5b",
  TRIM: "#f3eee4",
  MANUAL: "#b89968",
};

function mapBackendRegion(region: RegionDetail): RegionState {
  const kind = CATEGORY_TO_KIND[region.category] ?? "MANUAL";
  return {
    id: `r-${region.id}`,
    backendId: region.id,
    kind,
    label: region.label || kind,
    hex: region.appliedHexCode || DEFAULT_HEX_FOR_KIND[kind],
    maskUrl: region.maskUrl ?? null,
  };
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

async function loadImageAuthed(url: string, accessToken: string): Promise<HTMLImageElement> {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status} ${res.statusText}`);
  const blob = await res.blob();
  const blobUrl = URL.createObjectURL(blob);
  try {
    return await loadImage(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

export function Visualizer({ accessToken }: VisualizerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recolorRef = useRef<Recolor | null>(null);
  const maskCacheRef = useRef<Map<string, Promise<HTMLImageElement>>>(new Map());
  const pollAbortRef = useRef<{ cancelled: boolean } | null>(null);
  const [stage, setStage] = useState<PipelineStage>("upload");
  const [done, setDone] = useState<Partial<Record<PipelineStage, boolean>>>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [classification, setClassification] = useState<"INDOOR" | "OUTDOOR" | "UNKNOWN" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<RegionState[]>([...DEFAULT_REGIONS]);
  const [activeRegion, setActiveRegion] = useState<string>(DEFAULT_REGIONS[0]!.id);
  const [strength, setStrength] = useState(0.78);
  const [cleanOn, setCleanOn] = useState(true);
  const [tool, setTool] = useState<Tool>("select");
  const [compare, setCompare] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [masksReady, setMasksReady] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { recolorRef.current = new Recolor(canvas); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    return () => { recolorRef.current?.dispose(); recolorRef.current = null; };
  }, []);

  const loadMask = useCallback((primaryUrl: string, fallbackUrl?: string | null) => {
    const cache = maskCacheRef.current;
    const cacheKey = primaryUrl + "|" + (fallbackUrl ?? "");
    const cached = cache.get(cacheKey);
    if (cached) return cached;
    const promise = loadImage(primaryUrl).catch((err) => {
      if (!fallbackUrl) throw err;
      console.warn("Primary mask URL failed, trying same-origin proxy:", err);
      return loadImageAuthed(fallbackUrl, accessToken);
    });
    cache.set(cacheKey, promise);
    promise.catch(() => cache.delete(cacheKey));
    return promise;
  }, [accessToken]);

  useEffect(() => {
    const rc = recolorRef.current;
    if (!rc || !imageUrl) return;
    const active = regions.find((r) => r.id === activeRegion);
    if (!active) return;

    let cancelled = false;

    async function applyAndRender() {
      if (!rc) return;
      try {
        if (active && active.maskUrl) {
          const proxyUrl =
            projectId && active.backendId !== undefined
              ? `/api/projects/${encodeURIComponent(projectId)}/regions/${active.backendId}/mask`
              : null;
          const mask = await loadMask(active.maskUrl, proxyUrl);
          if (cancelled) return;
          rc.setMask(mask);
        } else {
          rc.setMask(null);
        }
      } catch (err) {
        if (cancelled) return;
        rc.setMask(null);
        console.warn("Mask load failed:", err);
      }
      if (cancelled || !active) return;
      rc.render(hexToRgb01(active.hex), compare ? 0 : strength);
    }

    void applyAndRender();
    return () => { cancelled = true; };
  }, [activeRegion, regions, strength, imageUrl, compare, loadMask, projectId]);

  useEffect(() => {
    return () => {
      if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    };
  }, []);

  const applyProjectDetail = useCallback(async (detail: ProjectDetail) => {
    const rc = recolorRef.current;
    const canvasUrl = detail.cleanedImageUrl || detail.imageUrl;
    if (rc && canvasUrl) {
      try {
        const img = await loadImage(canvasUrl);
        rc.setImage(img);
        setImageUrl(canvasUrl);
      } catch (err) {
        console.warn("Failed to load cleaned image, keeping local preview:", err);
      }
    }
    const mapped = detail.regions
      .slice()
      .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
      .map(mapBackendRegion);
    if (mapped.length > 0) {
      setRegions(mapped);
      setActiveRegion(mapped[0]!.id);
    }
  }, []);

  const pollUntilSegmented = useCallback(async (id: string) => {
    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    const token = { cancelled: false };
    pollAbortRef.current = token;
    const { api } = await import("@/lib/api");
    const start = Date.now();
    const timeoutMs = 90_000;
    const intervalMs = 1500;
    while (!token.cancelled) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Segmentation timed out. Please try again.");
      }
      const status = await api.getProjectStatus(id, accessToken);
      if (status.status === "SEGMENTED") return status;
      if (status.status === "FAILED") {
        throw new Error(status.failureReason || "Segmentation failed.");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Segmentation cancelled.");
  }, [accessToken]);

  const onFileChosen = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    setMasksReady(false);
    setProjectId(null);
    maskCacheRef.current.clear();
    try {
      const localUrl = URL.createObjectURL(file);
      const img = await loadImage(localUrl);
      recolorRef.current?.setImage(img);
      recolorRef.current?.setMask(null);
      setImageUrl(localUrl);
      setStage("clean");
      setDone((d) => ({ ...d, upload: true }));
      try {
        const { api } = await import("@/lib/api");
        const uploaded = await api.uploadImage(file, accessToken);
        if (!uploaded?.imageId) {
          throw new Error(
            "Upload response missing imageId — got keys: " +
              Object.keys(uploaded ?? {}).join(", "),
          );
        }
        setClassification(uploaded.imageType);
        setStage("mask");
        setDone((d) => ({ ...d, upload: true, clean: cleanOn }));

        const project = await api.createProject({ imageId: uploaded.imageId }, accessToken);
        setProjectId(project.id);
        setSegmenting(true);
        await api.requestSegmentation(project.id, accessToken);
        const segmented = await pollUntilSegmented(project.id);
        await applyProjectDetail(segmented);
        setMasksReady(true);
        setDone((d) => ({ ...d, mask: true }));
      } catch (err) {
        if (err instanceof Error) setError(err.message);
      } finally {
        setSegmenting(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the image.");
    } finally {
      setUploading(false);
    }
  }, [accessToken, cleanOn, pollUntilSegmented, applyProjectDetail]);

  const onSelectShade = useCallback((shade: PaintShade) => {
    let updatedBackendId: number | undefined;
    setRegions((prev) => prev.map((r) => {
      if (r.id !== activeRegion) return r;
      updatedBackendId = r.backendId;
      return { ...r, hex: shade.hex, shade };
    }));
    setStage("recolor");
    setDone((d) => ({ ...d, mask: true, recolor: true }));

    if (projectId && updatedBackendId !== undefined) {
      void (async () => {
        try {
          const { api } = await import("@/lib/api");
          await api.updateRegionColors(
            projectId,
            [{ regionId: updatedBackendId!, shadeCode: shade.code, hexCode: shade.hex }],
            accessToken,
          );
        } catch (err) {
          console.warn("Auto-save failed:", err);
        }
      })();
    }
  }, [activeRegion, projectId, accessToken]);

  const addManual = useCallback(() => {
    const idx = regions.filter((r) => r.kind === "MANUAL").length + 1;
    const id = `manual-${idx}`;
    const labelIdx = String(idx).padStart(2, "0");
    setRegions((prev) => [...prev, { id, kind: "MANUAL", label: `MANUAL · ${labelIdx}`, hex: "#b89968" }]);
    setActiveRegion(id);
    setStage("refine");
    setDone((d) => ({ ...d, refine: true }));
    setTool("refine");
  }, [regions]);

  const active = useMemo(() => regions.find((r) => r.id === activeRegion)!, [regions, activeRegion]);

  return (
    <div style={{ border: "1px solid var(--rule-strong)", overflow: "hidden", background: "var(--bg)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 24, padding: "18px 24px", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <div className="brand-mark" style={{ width: 12, height: 12 }} />
          <span style={{ fontFamily: "var(--serif)", fontSize: 22 }}>HueVista</span>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", borderLeft: "1px solid var(--rule)", paddingLeft: 20 }}>
          <Mono>Project</Mono>
          <span style={{ font: "300 italic 16px/1 var(--serif)" }}>Belgavi 3 BHK</span>
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          {classification && <Mono brass>{classification}</Mono>}
          {segmenting && <Mono>Segmenting…</Mono>}
          {masksReady && <Mono brass>Masks ready</Mono>}
          {imageUrl && <Mono>Saved · auto</Mono>}
          <Button size="sm" variant="ghost" disabled={!imageUrl} onClick={() => recolorRef.current && downloadPng(recolorRef.current.exportPng())}>Export</Button>
        </div>
      </div>

      <PipelineBar current={stage} done={done} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, minHeight: 640 }}>
        <div style={{ position: "relative", background: "var(--surface)" }}>
          <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: imageUrl ? "block" : "none" }} />
          {!imageUrl && (
            <DropZone uploading={uploading} error={error} onChoose={() => fileRef.current?.click()} onDrop={(file) => void onFileChosen(file)} />
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFileChosen(f); }} />
          {imageUrl && (
            <>
              <div style={{ position: "absolute", top: 20, left: 20, padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--rule-strong)", zIndex: 5 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Mono>Image clean</Mono>
                  <button type="button" onClick={() => setCleanOn((v) => !v)} aria-pressed={cleanOn} style={{ width: 34, height: 18, position: "relative", background: cleanOn ? "var(--accent)" : "var(--surface-soft)", border: "1px solid " + (cleanOn ? "var(--accent)" : "var(--rule-strong)"), padding: 0, cursor: "pointer" }}>
                    <span style={{ position: "absolute", top: 1, ...(cleanOn ? { right: 1 } : { left: 1 }), width: 14, height: 14, background: "var(--fg)" }} />
                  </button>
                  <Mono>{cleanOn ? "On" : "Off"} · Nano Banana Pro</Mono>
                </div>
              </div>
              <div style={{ position: "absolute", top: 20, right: 20, padding: "10px 14px", background: "var(--bg)", border: "1px solid var(--rule-strong)", zIndex: 5 }}>
                <Mono>Strength</Mono>
                <input type="range" min={0} max={1} step={0.01} value={strength} onChange={(e) => setStrength(Number(e.target.value))} style={{ marginTop: 8, width: 160, accentColor: "var(--accent)", display: "block" }} />
              </div>
              <div style={{ position: "absolute", bottom: 20, left: 20, right: 20, background: "var(--bg)", border: "1px solid var(--rule-strong)" }}>
                <div style={{ display: "flex", alignItems: "center", padding: "10px 16px", overflowX: "auto" }}>
                  <Mono>Regions</Mono>
                  <div style={{ width: 1, height: 16, background: "var(--rule)", marginLeft: 14, marginRight: 14 }} />
                  {regions.map((r) => (
                    <button key={r.id} type="button" onClick={() => setActiveRegion(r.id)} style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 14px", borderRight: "1px solid var(--rule)", opacity: r.id === activeRegion ? 1 : 0.55, background: "transparent", borderTop: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", color: "inherit" }}>
                      <span style={{ width: 10, height: 10, background: r.hex, border: "1px solid var(--rule-strong)" }} />
                      <span style={{ font: "300 italic 14px/1 var(--serif)" }}>{r.label}</span>
                      <Mono>{r.shade?.code ?? "—"}</Mono>
                    </button>
                  ))}
                  <button type="button" onClick={addManual} style={{ marginLeft: "auto", padding: "4px 14px", background: "transparent", border: "1px solid var(--rule-strong)", color: "var(--fg-soft)", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer" }}>+ Manual</button>
                </div>
              </div>
            </>
          )}
        </div>
        <ShadeGrid selected={active.shade?.code} onSelect={onSelectShade} activeShade={active.shade} activeRegionLabel={active.label} />
      </div>
    </div>
  );
}

function ToolRail({ tool, setTool, onAddManual, compare, setCompare, disabled }: { tool: Tool; setTool: (t: Tool) => void; onAddManual: () => void; compare: boolean; setCompare: (v: boolean) => void; disabled: boolean; }) {
  const cellStyle = (active: boolean): React.CSSProperties => ({
    width: 38, height: 38, display: "flex", alignItems: "center", justifyContent: "center",
    background: active ? "var(--brass)" : "transparent",
    border: active ? "none" : "1px solid var(--rule)",
    color: active ? "var(--charcoal)" : "var(--ivory-soft)",
    font: "300 italic 18px/1 var(--serif)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
  });
  const tools: ReadonlyArray<{ id: Tool; glyph: string; label: string }> = [
    { id: "select", glyph: "◉", label: "Select" },
    { id: "add", glyph: "✦", label: "Add region" },
    { id: "refine", glyph: "✎", label: "Refine" },
  ];
  return (
    <div style={{ borderRight: "1px solid var(--rule)", padding: 16, display: "flex", flexDirection: "column", alignItems: "center", gap: 8, background: "var(--charcoal-soft)" }}>
      {tools.map((t) => (
        <button
          key={t.id}
          type="button"
          title={t.label}
          aria-pressed={tool === t.id}
          disabled={disabled}
          onClick={() => {
            if (disabled) return;
            setTool(t.id);
            if (t.id === "add") onAddManual();
          }}
          style={cellStyle(tool === t.id)}
        >
          {t.glyph}
        </button>
      ))}
      <div style={{ width: 24, height: 1, background: "var(--rule)", margin: "4px 0" }} />
      {[
        { glyph: "↶", label: "Undo" },
        { glyph: "↷", label: "Redo" },
        { glyph: "⊞", label: "Grid" },
      ].map((b) => (
        <button key={b.label} type="button" title={b.label} disabled={disabled} style={cellStyle(false)}>{b.glyph}</button>
      ))}
      <button
        type="button"
        title="Compare"
        aria-pressed={compare}
        disabled={disabled}
        onClick={() => !disabled && setCompare(!compare)}
        style={cellStyle(compare)}
      >
        ◐
      </button>
      <div style={{ width: 24, height: 1, background: "var(--rule)", margin: "4px 0" }} />
      {[
        { glyph: "＋", label: "Zoom in" },
        { glyph: "－", label: "Zoom out" },
        { glyph: "⊡", label: "Fit" },
      ].map((b) => (
        <button key={b.label} type="button" title={b.label} disabled={disabled} style={cellStyle(false)}>{b.glyph}</button>
      ))}
    </div>
  );
}

function MaskLegend() {
  const items: ReadonlyArray<[string, string]> = [
    ["#f3eee4", "main wall"],
    ["#5b6c5b", "accent wall"],
    ["#3e4a52", "trim"],
    ["var(--brass)", "manual · sam 2"],
  ];
  return (
    <div style={{ position: "absolute", top: 20, right: 20, padding: "10px 14px", background: "var(--charcoal)", border: "1px solid var(--rule-strong)", zIndex: 5 }}>
      <Mono style={{ display: "block", marginBottom: 8 }}>Auto-mask · Nano Banana</Mono>
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", maxWidth: 280 }}>
        {items.map(([color, label]) => (
          <span key={label} style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 9.5px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--ivory-soft)" }}>
            <span style={{ width: 8, height: 8, background: color, border: "1px solid var(--rule-strong)" }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

function RegionTag({ position, region, top = 20 }: { position: "top-left" | "top-right"; region?: RegionState; top?: number }) {
  if (!region) return null;
  const horiz = position === "top-left" ? { left: 96 } : { right: 96 };
  return (
    <div style={{ position: "absolute", top, ...horiz, padding: "6px 10px", background: "var(--charcoal)", border: "1px solid var(--rule)", zIndex: 4, display: "flex", alignItems: "center", gap: 8 }}>
      <span style={{ width: 8, height: 8, background: REGION_DOT[region.kind], opacity: 0.85, border: "1px solid var(--rule-strong)" }} />
      <span style={{ font: "300 italic 13px/1 var(--serif)", color: "var(--ivory)" }}>{region.label}</span>
      <Mono>{region.shade?.code ?? "—"}</Mono>
    </div>
  );
}

function ClickHint() {
  return (
    <div style={{ position: "absolute", top: "44%", left: "50%", transform: "translate(-50%, -50%)", padding: "8px 14px", background: "rgba(21,17,13,.92)", border: "1px solid var(--brass)", zIndex: 4, font: "300 italic 14px/1.3 var(--serif)", color: "var(--ivory)", maxWidth: 320, textAlign: "center", pointerEvents: "none" }}>
      click any point — SAM 2 segments the surface as a manual region
    </div>
  );
}

function DropZone({ uploading, error, onChoose, onDrop }: { uploading: boolean; error: string | null; onChoose: () => void; onDrop: (file: File) => void; }) {
  return (
    <div onClick={onChoose} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChoose()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onDrop(f); }} role="button" tabIndex={0} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, cursor: "pointer", padding: 40, textAlign: "center" }}>
      <span style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".32em", textTransform: "uppercase", color: "var(--accent)" }}>the atelier</span>
      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 64, lineHeight: 0.95, color: "var(--fg)", margin: 0, maxWidth: "20ch" }}>Drop a photograph <i>here.</i></h2>
      <p style={{ font: "300 italic 19px/1.5 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>JPEG, PNG, or WebP up to 10 MB. Claude will classify it as indoor or outdoor in under a second.</p>
      <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
        <span className="btn">Choose a photograph</span>
        <span className="btn btn-ghost">Use a sample room</span>
      </div>
      {uploading && <Mono>Uploading…</Mono>}
      {error && <div className="field-error" role="alert">{error}</div>}
    </div>
  );
}

function downloadPng(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `huevista-${Date.now()}.png`;
  a.click();
}
