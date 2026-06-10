"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import type { RegionKind } from "@/lib/types";

const TINT = "rgba(29,78,216,0.5)";
const ACCENT = "#1d4ed8";

/** An existing region the user can start their edit from. */
export interface ExistingMask {
  id: string;
  label: string;
  kind: RegionKind;
  /** Resolved mask URL (white-on-black) — loaded lazily when chosen. */
  maskUrl?: string | null;
  /** In-memory mask (hand-drawn regions) — used directly if present. */
  maskCanvas?: HTMLCanvasElement | null;
}

interface MaskStudioProps {
  imageUrl: string;
  imageDims: { w: number; h: number };
  existing: ReadonlyArray<ExistingMask>;
  /** How many more masks the user may still create (cap is enforced by the parent). */
  remaining: number;
  saving: boolean;
  onClose: () => void;
  onSave: (mask: HTMLCanvasElement, category: RegionKind, label: string) => void;
}

const CATEGORY_OPTIONS: ReadonlyArray<readonly [RegionKind, string]> = [
  ["MAIN_WALL", "Main wall"],
  ["ACCENT_WALL", "Accent / border"],
  ["TRIM", "Trim"],
  ["MANUAL", "Other"],
];

type Phase = "choose" | "edit";
type Tool = "add" | "erase";

/**
 * Mask Studio — a focused popup for building a wall mask by hand. The user
 * either starts from a blank canvas or from one of the masks we already detected,
 * then adds/erases polygon regions and saves. Up to 3 masks total (enforced by
 * the parent via `remaining`).
 */
export function MaskStudio({
  imageUrl,
  imageDims,
  existing,
  remaining,
  saving,
  onClose,
  onSave,
}: MaskStudioProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);

  const [phase, setPhase] = useState<Phase>("choose");
  const [tool, setTool] = useState<Tool>("add");
  const [polygon, setPolygon] = useState<Array<{ x: number; y: number }>>([]);
  const [category, setCategory] = useState<RegionKind>("MAIN_WALL");
  const [label, setLabel] = useState("Main wall");
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [maskVersion, setMaskVersion] = useState(0); // bump to force overlay redraw
  const [loadingBase, setLoadingBase] = useState(false);
  const [hasInk, setHasInk] = useState(false);

  // Lock background scroll while open, restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Track the canvas wrapper size for letterbox math.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWrapSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [phase]);

  // The image's displayed rect inside the wrapper (object-fit: contain).
  const contained = useMemo(() => {
    if (wrapSize.w === 0 || wrapSize.h === 0) return null;
    const scale = Math.min(wrapSize.w / imageDims.w, wrapSize.h / imageDims.h);
    const dispW = imageDims.w * scale;
    const dispH = imageDims.h * scale;
    return { dispW, dispH, offX: (wrapSize.w - dispW) / 2, offY: (wrapSize.h - dispH) / 2 };
  }, [wrapSize, imageDims]);

  /** Create the working mask canvas (transparent outside, white inside). */
  const ensureMask = useCallback(() => {
    if (maskRef.current) return maskRef.current;
    const c = document.createElement("canvas");
    c.width = imageDims.w;
    c.height = imageDims.h;
    maskRef.current = c;
    return c;
  }, [imageDims]);

  const startBlank = useCallback(() => {
    const c = ensureMask();
    c.getContext("2d")?.clearRect(0, 0, c.width, c.height);
    setHasInk(false);
    setPolygon([]);
    setPhase("edit");
    setMaskVersion((v) => v + 1);
  }, [ensureMask]);

  // Start from an existing region's mask: paint its coverage (white-on-black or
  // transparent/white) into the working mask as opaque white-on-transparent.
  const startFromExisting = useCallback(
    async (src: ExistingMask) => {
      const c = ensureMask();
      const ctx = c.getContext("2d", { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, c.width, c.height);
      setPolygon([]); // never carry an abandoned in-progress polygon into a new edit
      setCategory(src.kind);
      setLabel(src.label || "Wall");
      setPhase("edit");
      setLoadingBase(true);
      try {
        let img: CanvasImageSource | null = src.maskCanvas ?? null;
        if (!img && src.maskUrl) {
          img = await loadImage(src.maskUrl);
        }
        if (img) {
          // Sample the source mask, keep coverage as alpha on a white fill.
          const tmp = document.createElement("canvas");
          tmp.width = c.width;
          tmp.height = c.height;
          const tctx = tmp.getContext("2d", { willReadFrequently: true });
          if (tctx) {
            tctx.drawImage(img, 0, 0, c.width, c.height);
            try {
              const data = tctx.getImageData(0, 0, c.width, c.height);
              const px = data.data;
              for (let i = 0; i < px.length; i += 4) {
                // Coverage = luminance of the source mask (white = inside).
                const cov = (0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!) | 0;
                px[i] = 255;
                px[i + 1] = 255;
                px[i + 2] = 255;
                px[i + 3] = cov; // white with alpha = coverage
              }
              ctx.putImageData(data, 0, 0);
              setHasInk(true);
            } catch {
              // Tainted (cross-origin) mask — fall back to a blank canvas.
              setHasInk(false);
            }
          }
        }
      } finally {
        setLoadingBase(false);
        setMaskVersion((v) => v + 1);
      }
    },
    [ensureMask],
  );

  // Redraw the tint + polygon guide overlay.
  useEffect(() => {
    const overlay = overlayRef.current;
    if (!overlay || !contained) return;
    overlay.width = wrapSize.w;
    overlay.height = wrapSize.h;
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, overlay.width, overlay.height);
    const { offX, offY, dispW, dispH } = contained;
    const mask = maskRef.current;
    if (mask) {
      ctx.drawImage(mask, offX, offY, dispW, dispH);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = TINT;
      ctx.fillRect(offX, offY, dispW, dispH);
      ctx.globalCompositeOperation = "source-over";
    }
    if (polygon.length > 0) {
      ctx.beginPath();
      polygon.forEach((p, i) => {
        const X = offX + p.x * dispW;
        const Y = offY + p.y * dispH;
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      if (polygon.length >= 3) ctx.closePath();
      ctx.fillStyle = tool === "add" ? "rgba(29,78,216,0.22)" : "rgba(220,38,38,0.22)";
      ctx.strokeStyle = tool === "add" ? ACCENT : "#dc2626";
      ctx.lineWidth = 2;
      ctx.fill();
      ctx.stroke();
      polygon.forEach((p, i) => {
        const X = offX + p.x * dispW;
        const Y = offY + p.y * dispH;
        ctx.beginPath();
        ctx.arc(X, Y, 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? ACCENT : "#fff";
        ctx.fill();
        ctx.strokeStyle = ACCENT;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
    }
  }, [contained, wrapSize, polygon, tool, maskVersion]);

  const addPoint = useCallback(
    (clientX: number, clientY: number) => {
      const wrap = wrapRef.current;
      if (!wrap || !contained) return;
      const rect = wrap.getBoundingClientRect();
      const x = (clientX - rect.left - contained.offX) / contained.dispW;
      const y = (clientY - rect.top - contained.offY) / contained.dispH;
      if (x < 0 || x > 1 || y < 0 || y > 1) return;
      setPolygon((p) => [...p, { x, y }]);
    },
    [contained],
  );

  // Bake the current polygon into the working mask (add = white, erase = clear).
  const bake = useCallback(() => {
    const mask = maskRef.current;
    if (!mask || polygon.length < 3) return;
    const ctx = mask.getContext("2d");
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    polygon.forEach((p, i) => {
      const X = p.x * mask.width;
      const Y = p.y * mask.height;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    if (tool === "add") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#fff";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
    }
    ctx.fill();
    ctx.restore();
    setPolygon([]);
    setHasInk(true);
    setMaskVersion((v) => v + 1);
  }, [polygon, tool]);

  const clearAll = useCallback(() => {
    const mask = maskRef.current;
    if (mask) mask.getContext("2d")?.clearRect(0, 0, mask.width, mask.height);
    setPolygon([]);
    setHasInk(false);
    setMaskVersion((v) => v + 1);
  }, []);

  // Flatten the transparent/white working mask to an opaque white-on-black PNG
  // canvas (what the recolor shader and the backend both expect).
  const handleSave = useCallback(() => {
    const mask = maskRef.current;
    if (!mask || !hasInk) return;
    const out = document.createElement("canvas");
    out.width = mask.width;
    out.height = mask.height;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(mask, 0, 0);
    onSave(out, category, label.trim() || labelForKind(category));
  }, [hasInk, category, label, onSave]);

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mask Studio"
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 3vw, 32px)",
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--rule-strong)",
          borderRadius: 12,
          width: "min(960px, 100%)",
          maxHeight: "92vh",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "14px 20px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--surface)",
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <span
              style={{
                font: "600 16px/1 var(--sans)",
                color: "var(--fg)",
              }}
            >
              Mask Studio
            </span>
            <Mono>{remaining > 0 ? `${remaining} mask${remaining === 1 ? "" : "s"} left` : "limit reached"}</Mono>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              background: "transparent",
              border: "none",
              cursor: "pointer",
              color: "var(--fg-mute)",
              font: "400 11px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
            }}
          >
            Close ✕
          </button>
        </div>

        {phase === "choose" ? (
          <ChooseStep
            existing={existing}
            onBlank={startBlank}
            onFromExisting={(m) => void startFromExisting(m)}
          />
        ) : (
          <>
            {/* Canvas */}
            <div
              ref={wrapRef}
              style={{
                position: "relative",
                flex: 1,
                minHeight: 320,
                background: "var(--surface)",
                overflow: "hidden",
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={imageUrl}
                alt="Room"
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain" }}
              />
              <canvas
                ref={overlayRef}
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
              />
              <div
                role="presentation"
                onClick={(e) => addPoint(e.clientX, e.clientY)}
                style={{ position: "absolute", inset: 0, cursor: "crosshair" }}
              />
              {loadingBase && (
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "rgba(0,0,0,0.35)",
                  }}
                >
                  <Spinner size={18} color="#fff" />
                </div>
              )}
            </div>

            {/* Toolbar */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                flexWrap: "wrap",
                padding: "12px 20px",
                borderTop: "1px solid var(--rule)",
                background: "var(--surface)",
              }}
            >
              <div style={{ display: "flex", gap: 4 }}>
                {(["add", "erase"] as const).map((tl) => (
                  <button
                    key={tl}
                    type="button"
                    onClick={() => setTool(tl)}
                    aria-pressed={tool === tl}
                    style={chip(tool === tl)}
                  >
                    {tl === "add" ? "✎ Add" : "⌫ Erase"}
                  </button>
                ))}
              </div>

              <span aria-hidden style={{ width: 1, height: 20, background: "var(--rule)" }} />

              <Mono>{polygon.length} pts</Mono>
              <button
                type="button"
                onClick={() => setPolygon((p) => p.slice(0, -1))}
                disabled={polygon.length === 0}
                style={chip(false, polygon.length === 0)}
              >
                Undo pt
              </button>
              <button
                type="button"
                onClick={bake}
                disabled={polygon.length < 3}
                style={chip(false, polygon.length < 3)}
              >
                {tool === "add" ? "Add shape" : "Erase shape"}
              </button>
              <button type="button" onClick={clearAll} disabled={!hasInk && polygon.length === 0} style={chip(false, !hasInk && polygon.length === 0)}>
                Clear
              </button>

              <span aria-hidden style={{ width: 1, height: 20, background: "var(--rule)" }} />

              <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <Mono>Type</Mono>
                <select
                  value={category}
                  onChange={(e) => {
                    const k = e.target.value as RegionKind;
                    setCategory(k);
                    setLabel(labelForKind(k));
                  }}
                  style={{
                    padding: "6px 8px",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    background: "var(--surface)",
                    color: "var(--fg)",
                    font: "500 12px/1 var(--sans, system-ui)",
                    cursor: "pointer",
                  }}
                >
                  {CATEGORY_OPTIONS.map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </label>
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                aria-label="Mask name"
                placeholder="Name"
                style={{
                  width: 130,
                  padding: "6px 8px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 6,
                  background: "var(--surface)",
                  color: "var(--fg)",
                  font: "500 12px/1 var(--sans, system-ui)",
                }}
              />

              <div style={{ flex: 1 }} />
              <button
                type="button"
                onClick={() => {
                  setPolygon([]);
                  setPhase("choose");
                }}
                style={chip(false)}
              >
                Back
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!hasInk || saving || remaining <= 0}
                style={{
                  ...chip(true, !hasInk || saving || remaining <= 0),
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                {saving ? (
                  <>
                    <Spinner size={12} color="currentColor" /> Saving…
                  </>
                ) : (
                  "Save mask"
                )}
              </button>
            </div>
            <p
              style={{
                margin: 0,
                padding: "0 20px 12px",
                font: "400 12px/1.4 var(--sans)",
                color: "var(--fg-mute)",
                background: "var(--surface)",
              }}
            >
              Click the room to drop corners, then <strong>Add shape</strong>. Switch to <strong>Erase</strong> to
              carve windows or trim out of the selection. Save when the blue area covers the wall.
            </p>
          </>
        )}
      </div>
    </div>
  );

  return createPortal(body, document.body);
}

function ChooseStep({
  existing,
  onBlank,
  onFromExisting,
}: {
  existing: ReadonlyArray<ExistingMask>;
  onBlank: () => void;
  onFromExisting: (m: ExistingMask) => void;
}) {
  return (
    <div style={{ padding: "clamp(20px, 4vw, 40px)", display: "flex", flexDirection: "column", gap: 20 }}>
      <p
        style={{
          margin: 0,
          font: "400 14px/1.5 var(--sans)",
          color: "var(--fg-soft)",
        }}
      >
        How do you want to start your mask?
      </p>
      <div className="r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
        {/* From scratch */}
        <button
          type="button"
          onClick={onBlank}
          style={{
            textAlign: "left",
            padding: 20,
            border: "1px solid var(--rule-strong)",
            borderRadius: 10,
            background: "var(--surface)",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <span aria-hidden style={{ fontSize: 28, color: "var(--accent)" }}>✎</span>
          <span style={{ font: "600 15px/1.2 var(--sans)", color: "var(--fg)" }}>
            Draw from scratch
          </span>
          <span style={{ font: "400 13px/1.4 var(--sans, system-ui)", color: "var(--fg-mute)" }}>
            Start with a blank canvas and outline the wall yourself.
          </span>
        </button>

        {/* From an existing detected mask */}
        <div
          style={{
            padding: 20,
            border: "1px solid var(--rule-strong)",
            borderRadius: 10,
            background: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <span aria-hidden style={{ fontSize: 28, color: "var(--accent)" }}>⧉</span>
          <span style={{ font: "600 15px/1.2 var(--sans)", color: "var(--fg)" }}>
            Edit a detected mask
          </span>
          <span style={{ font: "400 13px/1.4 var(--sans, system-ui)", color: "var(--fg-mute)" }}>
            Start from a wall we already found, then tweak it.
          </span>
          {existing.length === 0 ? (
            <Mono>None available yet</Mono>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 2 }}>
              {existing.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => onFromExisting(m)}
                  style={{
                    padding: "6px 10px",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 999,
                    background: "transparent",
                    color: "var(--fg-soft)",
                    cursor: "pointer",
                    font: "500 12px/1 var(--sans, system-ui)",
                  }}
                >
                  {m.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function chip(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "7px 12px",
    cursor: disabled ? "not-allowed" : "pointer",
    background: active ? "var(--accent)" : "transparent",
    border: "1px solid " + (active ? "var(--accent)" : "var(--rule-strong)"),
    color: active ? "var(--bg)" : "var(--fg-soft)",
    opacity: disabled ? 0.45 : 1,
    borderRadius: 6,
    font: "500 12px/1 var(--sans)",
    letterSpacing: 0,
  };
}

function labelForKind(kind: RegionKind): string {
  switch (kind) {
    case "MAIN_WALL":
      return "Main wall";
    case "ACCENT_WALL":
      return "Accent / border";
    case "TRIM":
      return "Trim";
    default:
      return "Wall";
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("mask load failed"));
    img.src = url;
  });
}
