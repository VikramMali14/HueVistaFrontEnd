"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { PipelineBar, type PipelineStage } from "./pipeline-bar";
import { ShadeGrid } from "./shade-grid";
import { hexToRgb01, Recolor } from "@/lib/webgl-recolor";
import type { PaintShade, RegionKind } from "@/lib/types";

interface VisualizerProps { accessToken: string; }

interface RegionState {
  id: string;
  kind: RegionKind;
  label: string;
  hex: string;
  shade?: PaintShade;
}

const DEFAULT_REGIONS: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "MAIN_WALL · 01", hex: "#a47148" },
  { id: "accent", kind: "ACCENT_WALL", label: "ACCENT_WALL", hex: "#5b6c5b" },
  { id: "trim", kind: "TRIM", label: "TRIM", hex: "#f3eee4" },
];

export function Visualizer({ accessToken }: VisualizerProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recolorRef = useRef<Recolor | null>(null);
  const [stage, setStage] = useState<PipelineStage>("upload");
  const [done, setDone] = useState<Partial<Record<PipelineStage, boolean>>>({});
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [classification, setClassification] = useState<"INDOOR" | "OUTDOOR" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [regions, setRegions] = useState<RegionState[]>([...DEFAULT_REGIONS]);
  const [activeRegion, setActiveRegion] = useState<string>(DEFAULT_REGIONS[0]!.id);
  const [strength, setStrength] = useState(0.78);
  const [cleanOn, setCleanOn] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try { recolorRef.current = new Recolor(canvas); }
    catch (err) { setError(err instanceof Error ? err.message : String(err)); }
    return () => { recolorRef.current?.dispose(); recolorRef.current = null; };
  }, []);

  useEffect(() => {
    const rc = recolorRef.current;
    if (!rc || !imageUrl) return;
    const active = regions.find((r) => r.id === activeRegion);
    if (!active) return;
    rc.render(hexToRgb01(active.hex), strength);
  }, [activeRegion, regions, strength, imageUrl]);

  const onFileChosen = useCallback(async (file: File) => {
    setError(null);
    setUploading(true);
    try {
      const localUrl = URL.createObjectURL(file);
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => resolve(i); i.onerror = reject; i.src = localUrl;
      });
      recolorRef.current?.setImage(img);
      setImageUrl(localUrl);
      setStage("clean");
      setDone((d) => ({ ...d, upload: true }));
      try {
        const { api } = await import("@/lib/api");
        const uploaded = await api.uploadImage(file, accessToken);
        setClassification(uploaded.classification);
        setStage("mask");
        setDone((d) => ({ ...d, upload: true, clean: cleanOn }));
      } catch (err) {
        if (err instanceof Error) setError(err.message);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not open the image.");
    } finally {
      setUploading(false);
    }
  }, [accessToken, cleanOn]);

  const onSelectShade = useCallback((shade: PaintShade) => {
    setRegions((prev) => prev.map((r) => (r.id === activeRegion ? { ...r, hex: shade.hex, shade } : r)));
    setStage("recolor");
    setDone((d) => ({ ...d, mask: true, recolor: true }));
  }, [activeRegion]);

  const addManual = useCallback(() => {
    const idx = regions.filter((r) => r.kind === "MANUAL").length + 1;
    const id = `manual-${idx}`;
    setRegions((prev) => [...prev, { id, kind: "MANUAL", label: `MANUAL · 0${idx}`, hex: "#b89968" }]);
    setActiveRegion(id);
    setStage("refine");
    setDone((d) => ({ ...d, refine: true }));
  }, [regions]);

  const active = useMemo(() => regions.find((r) => r.id === activeRegion)!, [regions, activeRegion]);

  return (
    <div style={{ border: "1px solid var(--rule-strong)", overflow: "hidden", background: "var(--charcoal)" }}>
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
          {imageUrl && <Mono>Saved · auto</Mono>}
          <Button size="sm" variant="ghost" disabled={!imageUrl} onClick={() => recolorRef.current && downloadPng(recolorRef.current.exportPng())}>Export</Button>
        </div>
      </div>

      <PipelineBar current={stage} done={done} />

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, minHeight: 640 }}>
        <div style={{ position: "relative", background: "var(--charcoal-warm)" }}>
          {!imageUrl && (
            <DropZone uploading={uploading} error={error} onChoose={() => fileRef.current?.click()} onDrop={(file) => void onFileChosen(file)} />
          )}
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFileChosen(f); }} />
          {imageUrl && (
            <>
              <div style={{ position: "absolute", top: 20, left: 20, padding: "10px 14px", background: "var(--charcoal)", border: "1px solid var(--rule-strong)", zIndex: 5 }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  <Mono>Image clean</Mono>
                  <button type="button" onClick={() => setCleanOn((v) => !v)} aria-pressed={cleanOn} style={{ width: 34, height: 18, position: "relative", background: cleanOn ? "var(--brass)" : "var(--charcoal-soft)", border: "1px solid " + (cleanOn ? "var(--brass)" : "var(--rule-strong)"), padding: 0, cursor: "pointer" }}>
                    <span style={{ position: "absolute", top: 1, ...(cleanOn ? { right: 1 } : { left: 1 }), width: 14, height: 14, background: "var(--ivory)" }} />
                  </button>
                  <Mono>{cleanOn ? "On" : "Off"} · Nano Banana Pro</Mono>
                </div>
              </div>
              <div style={{ position: "absolute", top: 20, right: 20, padding: "10px 14px", background: "var(--charcoal)", border: "1px solid var(--rule-strong)", zIndex: 5 }}>
                <Mono>Strength</Mono>
                <input type="range" min={0} max={1} step={0.01} value={strength} onChange={(e) => setStrength(Number(e.target.value))} style={{ marginTop: 8, width: 160, accentColor: "var(--brass)", display: "block" }} />
              </div>
              <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }} />
              <div style={{ position: "absolute", bottom: 20, left: 20, right: 20, background: "var(--charcoal)", border: "1px solid var(--rule-strong)" }}>
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
                  <button type="button" onClick={addManual} style={{ marginLeft: "auto", padding: "4px 14px", background: "transparent", border: "1px solid var(--rule-strong)", color: "var(--ivory-soft)", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", cursor: "pointer" }}>+ Manual</button>
                </div>
              </div>
            </>
          )}
        </div>
        <ShadeGrid selected={active.shade?.code} onSelect={onSelectShade} />
      </div>
    </div>
  );
}

function DropZone({ uploading, error, onChoose, onDrop }: { uploading: boolean; error: string | null; onChoose: () => void; onDrop: (file: File) => void; }) {
  return (
    <div onClick={onChoose} onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChoose()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); const f = e.dataTransfer.files?.[0]; if (f) onDrop(f); }} role="button" tabIndex={0} style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 18, cursor: "pointer", padding: 40, textAlign: "center" }}>
      <span style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".32em", textTransform: "uppercase", color: "var(--brass)" }}>the atelier</span>
      <h2 style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 64, lineHeight: 0.95, color: "var(--ivory)", margin: 0, maxWidth: "20ch" }}>Drop a photograph <i>here.</i></h2>
      <p style={{ font: "300 italic 19px/1.5 var(--serif)", color: "var(--ivory-soft)", maxWidth: "44ch" }}>JPEG, PNG, or WebP up to 10 MB. Claude will classify it as indoor or outdoor in under a second.</p>
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
