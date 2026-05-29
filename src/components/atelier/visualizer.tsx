"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { Button } from "@/components/ui/button";
import { LoaderOverlay } from "@/components/ui/loader-overlay";
import { Spinner } from "@/components/ui/spinner";
import { PipelineBar, type PipelineStage } from "./pipeline-bar";
import { ShadeGrid } from "./shade-grid";
import { hexToRgb01, Recolor } from "@/lib/webgl-recolor";
import { api, HttpError } from "@/lib/api";
import { t } from "@/lib/i18n";
import type {
  PaintShade,
  ProjectDetail,
  RegionCategory,
  RegionDetail,
  RegionKind,
  UiLocale,
  UiVariant,
} from "@/lib/types";

interface VisualizerProps {
  variant?: UiVariant;
  locale?: UiLocale;
}

interface RegionState {
  id: string;
  backendId?: number;
  kind: RegionKind;
  label: string;
  hex: string;
  shade?: PaintShade;
  maskUrl?: string | null;
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const DEFAULT_REGIONS_PREMIUM: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "MAIN_WALL · 01", hex: "#a47148" },
  { id: "accent", kind: "ACCENT_WALL", label: "ACCENT_WALL", hex: "#5b6c5b" },
  { id: "trim", kind: "TRIM", label: "TRIM", hex: "#f3eee4" },
];

const DEFAULT_REGIONS_CLASSIC: ReadonlyArray<RegionState> = [
  { id: "main", kind: "MAIN_WALL", label: "Main wall", hex: "#a47148" },
  { id: "accent", kind: "ACCENT_WALL", label: "Accent wall", hex: "#5b6c5b" },
  { id: "trim", kind: "TRIM", label: "Trim", hex: "#f3eee4" },
];

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

const CLASSIC_KIND_LABEL: Record<RegionKind, string> = {
  MAIN_WALL: "Main wall",
  ACCENT_WALL: "Accent wall",
  TRIM: "Trim",
  MANUAL: "Wall",
};

function mapBackendRegion(region: RegionDetail, isClassic: boolean): RegionState {
  const kind = CATEGORY_TO_KIND[region.category] ?? "MANUAL";
  const fallback = isClassic ? CLASSIC_KIND_LABEL[kind] : kind;
  return {
    id: `r-${region.id}`,
    backendId: region.id,
    kind,
    label: region.label || fallback,
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

type SaveStatus = "idle" | "saving" | "saved" | "failed";

export function Visualizer({ variant = "premium", locale = "en" }: VisualizerProps) {
  const isClassic = variant === "classic";
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
  const [regions, setRegions] = useState<RegionState[]>(() =>
    isClassic ? [...DEFAULT_REGIONS_CLASSIC] : [...DEFAULT_REGIONS_PREMIUM],
  );
  const [activeRegion, setActiveRegion] = useState<string>(regions[0]!.id);
  const [strength, setStrength] = useState(0.78);
  const [cleanOn, setCleanOn] = useState(true);
  const [compare, setCompare] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [segmenting, setSegmenting] = useState(false);
  const [masksReady, setMasksReady] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      recolorRef.current = new Recolor(canvas);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    return () => {
      recolorRef.current?.dispose();
      recolorRef.current = null;
    };
  }, []);

  const loadMask = useCallback((url: string) => {
    const cache = maskCacheRef.current;
    const cached = cache.get(url);
    if (cached) return cached;
    const promise = loadImage(url);
    cache.set(url, promise);
    promise.catch(() => cache.delete(url));
    return promise;
  }, []);

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
          const mask = await loadMask(active.maskUrl);
          if (cancelled) return;
          rc.setMask(mask);
        } else {
          rc.setMask(null);
        }
      } catch (err) {
        if (cancelled) return;
        rc.setMask(null);
        if (process.env.NODE_ENV !== "production") console.warn("Mask load failed:", err);
      }
      if (cancelled || !active) return;
      rc.render(hexToRgb01(active.hex), compare ? 0 : strength);
    }

    void applyAndRender();
    return () => {
      cancelled = true;
    };
  }, [activeRegion, regions, strength, imageUrl, compare, loadMask]);

  useEffect(() => {
    return () => {
      if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    };
  }, []);

  const applyProjectDetail = useCallback(
    async (detail: ProjectDetail) => {
      const rc = recolorRef.current;
      const canvasUrl = detail.cleanedImageUrl || detail.imageUrl;
      if (rc && canvasUrl) {
        try {
          const img = await loadImage(canvasUrl);
          rc.setImage(img);
          setImageUrl(canvasUrl);
        } catch (err) {
          if (process.env.NODE_ENV !== "production") {
            console.warn("Failed to load cleaned image, keeping local preview:", err);
          }
        }
      }
      const mapped = detail.regions
        .slice()
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map((r) => mapBackendRegion(r, isClassic));
      if (mapped.length > 0) {
        setRegions(mapped);
        setActiveRegion(mapped[0]!.id);
      }
    },
    [isClassic],
  );

  const pollUntilSegmented = useCallback(async (id: string) => {
    if (pollAbortRef.current) pollAbortRef.current.cancelled = true;
    const token = { cancelled: false };
    pollAbortRef.current = token;
    const start = Date.now();
    const timeoutMs = 90_000;
    const intervalMs = 1500;
    while (!token.cancelled) {
      if (Date.now() - start > timeoutMs) {
        throw new Error("Detecting walls timed out. Please try again.");
      }
      const status = await api.getProjectStatus(id);
      if (status.status === "SEGMENTED") return status;
      if (status.status === "FAILED") {
        throw new Error(status.failureReason || "Could not detect the walls.");
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
    throw new Error("Cancelled.");
  }, []);

  const validateFile = useCallback((file: File): string | null => {
    if (!ALLOWED_MIME.has(file.type)) {
      return "Only JPEG, PNG or WebP photos are accepted.";
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      return "Photo is larger than 10 MB. Use a smaller copy.";
    }
    return null;
  }, []);

  const onFileChosen = useCallback(
    async (file: File) => {
      setError(null);
      const validation = validateFile(file);
      if (validation) {
        setError(validation);
        return;
      }
      setUploading(true);
      setMasksReady(false);
      setProjectId(null);
      setSaveStatus("idle");
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
          const uploaded = await api.uploadImage(file);
          if (!uploaded?.imageId) {
            throw new Error("Upload failed. Please try again.");
          }
          setClassification(uploaded.imageType);
          setStage("mask");
          setDone((d) => ({ ...d, upload: true, clean: cleanOn }));

          const project = await api.createProject({ imageId: uploaded.imageId });
          setProjectId(project.id);
          setSegmenting(true);
          await api.requestSegmentation(project.id);
          const segmented = await pollUntilSegmented(project.id);
          await applyProjectDetail(segmented);
          setMasksReady(true);
          setDone((d) => ({ ...d, mask: true }));
        } catch (err) {
          if (err instanceof HttpError && err.status === 401) {
            setError("Your session expired. Please sign in again.");
            setTimeout(() => {
              window.location.href = "/sign-in?next=/atelier";
            }, 1200);
          } else if (err instanceof Error) {
            setError(err.message);
          } else {
            setError("Something went wrong.");
          }
        } finally {
          setSegmenting(false);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not open the image.");
      } finally {
        setUploading(false);
      }
    },
    [cleanOn, pollUntilSegmented, applyProjectDetail, validateFile],
  );

  const onSelectShade = useCallback(
    (shade: PaintShade) => {
      let updatedBackendId: number | undefined;
      setRegions((prev) =>
        prev.map((r) => {
          if (r.id !== activeRegion) return r;
          updatedBackendId = r.backendId;
          return { ...r, hex: shade.hex, shade };
        }),
      );
      setStage("recolor");
      setDone((d) => ({ ...d, mask: true, recolor: true }));

      if (projectId && updatedBackendId !== undefined) {
        setSaveStatus("saving");
        void (async () => {
          try {
            await api.updateRegionColors(projectId, [
              { regionId: updatedBackendId!, shadeCode: shade.code, hexCode: shade.hex },
            ]);
            setSaveStatus("saved");
          } catch (err) {
            if (process.env.NODE_ENV !== "production") console.warn("Auto-save failed:", err);
            setSaveStatus("failed");
          }
        })();
      }
    },
    [activeRegion, projectId],
  );

  const addManual = useCallback(() => {
    const idx = regions.filter((r) => r.kind === "MANUAL").length + 1;
    const id = `manual-${idx}`;
    const labelIdx = String(idx).padStart(2, "0");
    const label = isClassic ? `Wall ${idx}` : `MANUAL · ${labelIdx}`;
    setRegions((prev) => [...prev, { id, kind: "MANUAL", label, hex: "#b89968" }]);
    setActiveRegion(id);
    setStage("refine");
    setDone((d) => ({ ...d, refine: true }));
  }, [regions, isClassic]);

  const active = useMemo(() => regions.find((r) => r.id === activeRegion)!, [regions, activeRegion]);

  const overlayLabel = uploading && !segmenting
    ? t(locale, "atelier.status.uploading")
    : segmenting
      ? t(locale, "atelier.status.segmenting")
      : "Working";
  const overlayHint = uploading && !segmenting
    ? t(locale, "atelier.status.uploadingHint")
    : segmenting
      ? t(locale, "atelier.status.segmentingHint")
      : undefined;

  // Style maps for the two variants
  const labelFont = isClassic ? "var(--sans, system-ui)" : "var(--serif)";
  const regionLabelStyle: React.CSSProperties = isClassic
    ? { font: "500 13px/1 var(--sans, system-ui)", color: "var(--fg)" }
    : { font: "300 italic 14px/1 var(--serif)" };
  const controlChipStyle: React.CSSProperties = isClassic
    ? {
        font: "500 12px/1 var(--sans, system-ui)",
        letterSpacing: 0,
        textTransform: "none",
        color: "var(--fg-soft)",
      }
    : {};

  return (
    <div
      className={`hv-visualizer ${isClassic ? "is-classic" : ""}`}
      style={{ border: "1px solid var(--rule-strong)", overflow: "hidden", background: "var(--bg)" }}
    >
      <div className="hv-vis-topbar">
        {!isClassic && (
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div className="brand-mark" style={{ width: 12, height: 12 }} />
            <span style={{ fontFamily: "var(--serif)", fontSize: 22, color: "var(--fg)" }}>HueVista</span>
          </div>
        )}
        <div className="hv-vis-project">
          {isClassic ? (
            <span style={{ font: "500 14px/1.2 var(--sans, system-ui)", color: "var(--fg)" }}>
              {projectId ? `Project #${projectId.slice(0, 8)}` : t(locale, "atelier.toolbar.untitled")}
            </span>
          ) : (
            <>
              <Mono>Project</Mono>
              <span style={{ font: "300 italic 16px/1 var(--serif)", color: "var(--fg-soft)" }}>
                {projectId ? `#${projectId.slice(0, 8)}` : "Belgavi 3 BHK"}
              </span>
            </>
          )}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
          {classification && !isClassic && <Mono brass>{classification}</Mono>}
          {classification && isClassic && (
            <span style={{ ...controlChipStyle, color: "var(--accent)" }}>
              {classification === "INDOOR" ? "Indoor" : classification === "OUTDOOR" ? "Outdoor" : "Unknown"}
            </span>
          )}
          {segmenting && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Spinner size={12} color="var(--accent)" />
              {isClassic ? (
                <span style={controlChipStyle}>{t(locale, "atelier.status.segmenting")}…</span>
              ) : (
                <Mono>Segmenting…</Mono>
              )}
            </span>
          )}
          {masksReady && (isClassic ? (
            <span style={{ ...controlChipStyle, color: "var(--accent)" }}>
              {t(locale, "atelier.status.masksReady")}
            </span>
          ) : (
            <Mono brass>Masks ready</Mono>
          ))}
          {saveStatus === "saving" && (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <Spinner size={12} color="var(--fg-mute)" />
              {isClassic ? (
                <span style={controlChipStyle}>{t(locale, "atelier.status.saving")}</span>
              ) : (
                <Mono>Saving…</Mono>
              )}
            </span>
          )}
          {saveStatus === "saved" && (isClassic ? (
            <span style={controlChipStyle}>{t(locale, "atelier.status.saved")}</span>
          ) : (
            <Mono>Saved · auto</Mono>
          ))}
          {saveStatus === "failed" && (
            <span
              style={{
                ...controlChipStyle,
                color: "#dc2626",
              }}
            >
              {t(locale, "atelier.status.saveFailed")}
            </span>
          )}
          <Button
            size="sm"
            variant="ghost"
            disabled={!imageUrl}
            onClick={() => recolorRef.current && downloadPng(recolorRef.current.exportPng())}
          >
            {isClassic ? t(locale, "atelier.toolbar.export") : "Export"}
          </Button>
        </div>
      </div>

      <PipelineBar current={stage} done={done} variant={variant} locale={locale} />

      <div className="hv-vis-body" style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: 0, minHeight: 640 }}>
        <div className="hv-vis-canvas-wrap" style={{ position: "relative", background: "var(--surface)" }}>
          <canvas
            ref={canvasRef}
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: imageUrl ? "block" : "none",
            }}
          />
          {!imageUrl && (
            <DropZone
              variant={variant}
              locale={locale}
              uploading={uploading}
              error={error}
              onChoose={() => fileRef.current?.click()}
              onDrop={(file) => void onFileChosen(file)}
            />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFileChosen(f);
              e.target.value = "";
            }}
          />
          {imageUrl && (
            <>
              {/* TIDY / CLEAN-UP CONTROL */}
              <div
                className="hv-vis-control"
                style={{
                  position: "absolute",
                  top: 20,
                  left: 20,
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: 5,
                  borderRadius: isClassic ? 8 : 0,
                }}
              >
                <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                  {isClassic ? (
                    <span style={controlChipStyle}>{t(locale, "atelier.control.tidy")}</span>
                  ) : (
                    <Mono>Image clean</Mono>
                  )}
                  <button
                    type="button"
                    onClick={() => setCleanOn((v) => !v)}
                    aria-pressed={cleanOn}
                    aria-label={cleanOn ? "Turn off image clean-up" : "Turn on image clean-up"}
                    style={{
                      width: 34,
                      height: 18,
                      position: "relative",
                      background: cleanOn ? "var(--accent)" : "var(--surface-soft)",
                      border: "1px solid " + (cleanOn ? "var(--accent)" : "var(--rule-strong)"),
                      padding: 0,
                      cursor: "pointer",
                      borderRadius: isClassic ? 999 : 0,
                    }}
                  >
                    <span
                      style={{
                        position: "absolute",
                        top: 1,
                        ...(cleanOn ? { right: 1 } : { left: 1 }),
                        width: 14,
                        height: 14,
                        background: "var(--fg)",
                        borderRadius: isClassic ? "50%" : 0,
                      }}
                    />
                  </button>
                  {!isClassic && (
                    <Mono>{cleanOn ? "On" : "Off"} · Nano Banana Pro</Mono>
                  )}
                </div>
              </div>

              {/* INTENSITY CONTROL */}
              <div
                className="hv-vis-control"
                style={{
                  position: "absolute",
                  top: 20,
                  right: 20,
                  padding: "10px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: 5,
                  borderRadius: isClassic ? 8 : 0,
                }}
              >
                <label htmlFor="hv-strength" style={isClassic ? controlChipStyle : undefined}>
                  {isClassic ? (
                    <span>{t(locale, "atelier.control.intensity")}</span>
                  ) : (
                    <Mono>Strength</Mono>
                  )}
                </label>
                <input
                  id="hv-strength"
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={strength}
                  onChange={(e) => setStrength(Number(e.target.value))}
                  aria-valuemin={0}
                  aria-valuemax={1}
                  aria-valuenow={strength}
                  style={{ marginTop: 8, width: 160, accentColor: "var(--accent)", display: "block" }}
                />
              </div>

              {/* REGION TABS */}
              <div
                className="hv-vis-control hv-vis-regions"
                style={{
                  position: "absolute",
                  bottom: 20,
                  left: 20,
                  right: 20,
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  zIndex: 5,
                  borderRadius: isClassic ? 8 : 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    padding: "10px 16px",
                    overflowX: "auto",
                  }}
                >
                  {isClassic ? (
                    <span style={controlChipStyle}>{t(locale, "atelier.control.regions")}</span>
                  ) : (
                    <Mono>Regions</Mono>
                  )}
                  <div
                    aria-hidden
                    style={{
                      width: 1,
                      height: 16,
                      background: "var(--rule)",
                      marginLeft: 14,
                      marginRight: 14,
                    }}
                  />
                  {regions.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => setActiveRegion(r.id)}
                      aria-pressed={r.id === activeRegion}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "4px 14px",
                        borderRight: "1px solid var(--rule)",
                        opacity: r.id === activeRegion ? 1 : 0.6,
                        background: "transparent",
                        borderTop: "none",
                        borderBottom: "none",
                        borderLeft: "none",
                        cursor: "pointer",
                        color: "var(--fg)",
                      }}
                    >
                      <span
                        aria-hidden
                        style={{
                          width: 12,
                          height: 12,
                          background: r.hex,
                          border: "1px solid var(--rule-strong)",
                          borderRadius: isClassic ? "50%" : 0,
                        }}
                      />
                      <span style={regionLabelStyle}>{r.label}</span>
                      {!isClassic && <Mono>{r.shade?.code ?? "—"}</Mono>}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={addManual}
                    style={{
                      marginLeft: "auto",
                      padding: isClassic ? "6px 12px" : "4px 14px",
                      background: "transparent",
                      border: "1px solid var(--rule-strong)",
                      borderRadius: isClassic ? 6 : 0,
                      color: "var(--fg-soft)",
                      ...(isClassic
                        ? { font: "500 12px/1 var(--sans, system-ui)" }
                        : {
                            font: "400 10px/1 var(--mono)",
                            letterSpacing: ".22em",
                            textTransform: "uppercase",
                          }),
                      cursor: "pointer",
                    }}
                  >
                    + {isClassic ? t(locale, "atelier.control.addRegion") : "Manual"}
                  </button>
                </div>
              </div>

              {/* COMPARE TOGGLE */}
              <button
                type="button"
                onClick={() => setCompare((v) => !v)}
                aria-pressed={compare}
                style={{
                  position: "absolute",
                  bottom: 80,
                  right: 20,
                  padding: isClassic ? "6px 12px" : "6px 10px",
                  background: compare ? "var(--accent)" : "var(--bg)",
                  border: "1px solid " + (compare ? "var(--accent)" : "var(--rule-strong)"),
                  borderRadius: isClassic ? 6 : 0,
                  color: compare ? "var(--bg)" : "var(--fg-soft)",
                  ...(isClassic
                    ? { font: "500 12px/1 var(--sans, system-ui)" }
                    : { font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase" }),
                  cursor: "pointer",
                  zIndex: 5,
                }}
              >
                {compare
                  ? (isClassic ? t(locale, "atelier.control.before") : "Before")
                  : (isClassic ? t(locale, "atelier.control.compare") : "Compare")}
              </button>
            </>
          )}
          <LoaderOverlay show={uploading || segmenting} label={overlayLabel} hint={overlayHint} />
        </div>
        <ShadeGrid
          variant={variant}
          locale={locale}
          selected={active.shade?.code}
          onSelect={onSelectShade}
          activeShade={active.shade}
          activeRegionLabel={active.label}
        />
      </div>
      <style>{`
        .hv-vis-topbar {
          display: flex;
          align-items: center;
          gap: 24px;
          padding: 18px 24px;
          border-bottom: 1px solid var(--rule);
          flex-wrap: wrap;
        }
        .hv-visualizer.is-classic .hv-vis-topbar { padding: 12px 16px; gap: 16px; background: var(--surface); }
        .hv-vis-project {
          display: flex;
          gap: 10px;
          align-items: center;
          border-left: 1px solid var(--rule);
          padding-left: 20px;
        }
        .hv-visualizer.is-classic .hv-vis-project { border-left: none; padding-left: 0; }
        @media (max-width: 768px) {
          .hv-vis-topbar { gap: 12px; padding: 12px 16px; }
          .hv-vis-project { padding-left: 12px; }
          .hv-vis-body { grid-template-columns: 1fr !important; min-height: 0 !important; }
          .hv-vis-canvas-wrap { min-height: 60vh; }
        }
        @media (max-width: 1024px) {
          .hv-vis-body { grid-template-columns: 1fr 320px !important; }
        }
        @media (max-width: 480px) {
          .hv-vis-topbar { padding: 10px 12px; }
          .hv-vis-project { border-left: none; padding-left: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}

function DropZone({
  variant,
  locale,
  uploading,
  error,
  onChoose,
  onDrop,
}: {
  variant: UiVariant;
  locale: UiLocale;
  uploading: boolean;
  error: string | null;
  onChoose: () => void;
  onDrop: (file: File) => void;
}) {
  const isClassic = variant === "classic";
  return (
    <div
      onClick={onChoose}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onChoose()}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files?.[0];
        if (f) onDrop(f);
      }}
      role="button"
      tabIndex={0}
      aria-label={isClassic ? t(locale, "atelier.dropzone.choose") : "Choose or drop a photograph"}
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: isClassic ? 14 : 18,
        cursor: "pointer",
        padding: 40,
        textAlign: "center",
      }}
    >
      {isClassic ? (
        <>
          <span
            aria-hidden
            style={{
              width: 64,
              height: 64,
              border: "1px dashed var(--rule-strong)",
              borderRadius: 12,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
            }}
          >
            <svg width={28} height={28} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 16V4M6 10l6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
          </span>
          <h2
            style={{
              font: "600 28px/1.2 var(--sans, system-ui)",
              color: "var(--fg)",
              margin: 0,
              maxWidth: "24ch",
            }}
          >
            {t(locale, "atelier.dropzone.title")}
          </h2>
          <p style={{ font: "400 15px/1.5 var(--sans, system-ui)", color: "var(--fg-soft)", maxWidth: "44ch", margin: 0 }}>
            {t(locale, "atelier.dropzone.hint")}
          </p>
          <div style={{ display: "flex", gap: 10, marginTop: 10, flexWrap: "wrap", justifyContent: "center" }}>
            <span className="btn">{t(locale, "atelier.dropzone.choose")}</span>
            <span className="btn btn-ghost">{t(locale, "atelier.dropzone.sample")}</span>
          </div>
        </>
      ) : (
        <>
          <span
            style={{
              font: "400 10px/1 var(--mono)",
              letterSpacing: ".32em",
              textTransform: "uppercase",
              color: "var(--accent)",
            }}
          >
            the atelier
          </span>
          <h2
            style={{
              fontFamily: "var(--serif)",
              fontWeight: 300,
              fontSize: 64,
              lineHeight: 0.95,
              color: "var(--fg)",
              margin: 0,
              maxWidth: "20ch",
            }}
          >
            Drop a photograph <i style={{ color: "var(--accent-soft)" }}>here.</i>
          </h2>
          <p style={{ font: "300 italic 19px/1.5 var(--serif)", color: "var(--fg-soft)", maxWidth: "44ch" }}>
            JPEG, PNG, or WebP up to 10 MB. Claude will classify it as indoor or outdoor in under a second.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 12 }}>
            <span className="btn">Choose a photograph</span>
            <span className="btn btn-ghost">Use a sample room</span>
          </div>
        </>
      )}
      {uploading && (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8, color: "var(--accent)" }}>
          <Spinner size={14} color="var(--accent)" />
          {isClassic ? (
            <span style={{ font: "500 13px/1 var(--sans, system-ui)" }}>
              {t(locale, "atelier.dropzone.uploading")}
            </span>
          ) : (
            <Mono>Uploading…</Mono>
          )}
        </span>
      )}
      {error && (
        <div className="field-error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

function downloadPng(dataUrl: string) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = `huevista-${Date.now()}.png`;
  a.click();
}
