"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import type { RegionKind } from "@/lib/types";

// Selection blue is the one deliberate non-token colour: it must read against
// warm room photos. Red marks "remove" actions.
const SELECT_BLUE = "#1d4ed8";
const REMOVE_RED = "#dc2626";

/** Working-mask cap — masks don't need 12 MP fidelity, and a smaller canvas
 *  keeps undo snapshots, flood fills and overlay redraws fast. */
const MASK_MAX = 1600;
/** Wand sampling resolution — flood fill runs on a downscaled copy. */
const WAND_MAX = 700;
const HISTORY_MAX = 20;
const COACH_KEY = "hv-mask-coach-v1";

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

type Tool = "wand" | "brush" | "poly";
type Mode = "add" | "remove";

interface View {
  s: number;
  tx: number;
  ty: number;
}

const FIT_VIEW: View = { s: 1, tx: 0, ty: 0 };

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/**
 * Mask Studio — "Mark a wall". A focused popup for selecting a wall by hand.
 * Three tools, easiest first: the magic wand (tap the wall, a colour flood
 * fill selects it), a brush (finger-paint it), and corner-tapping for crisp
 * architectural edges. Everything is undoable; two fingers (or the wheel)
 * zoom in for precision. Saves a white-on-black mask at photo resolution —
 * the same contract the recolor shader and the backend expect.
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
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const outlineRef = useRef<HTMLCanvasElement | null>(null);
  const wandCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Downscaled photo pixels the wand samples; null until loaded (or tainted). */
  const wandPixelsRef = useRef<{ data: Uint8ClampedArray; w: number; h: number } | null>(null);

  // Undo/redo: alpha-plane snapshots of the working mask. Refs so painting
  // never re-renders; a small counts state drives button enablement.
  const historyRef = useRef<Uint8Array[]>([]);
  const futureRef = useRef<Uint8Array[]>([]);
  const [histCounts, setHistCounts] = useState({ undo: 0, redo: 0 });

  // Live wand editing: the mask as it was BEFORE the current tap, plus the
  // tap's seed — dragging Reach restores + re-fills so it feels direct.
  const wandSeedRef = useRef<{ x: number; y: number; mode: Mode; preTap: Uint8Array } | null>(null);

  // Pointer plumbing (brush strokes, taps, pan/pinch).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ dist: number; cx: number; cy: number; v: View } | null>(null);
  const strokeRef = useRef<{ x: number; y: number } | null>(null); // last point, mask px
  const downRef = useRef<{ x: number; y: number; moved: boolean; pan: boolean; px: number; py: number } | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null); // client coords
  const spaceRef = useRef(false);

  const [tool, setTool] = useState<Tool>("wand");
  const [mode, setMode] = useState<Mode>("add");
  const [reach, setReach] = useState(28);
  const [brushSize, setBrushSize] = useState(36); // screen px
  const [overlayAlpha, setOverlayAlpha] = useState(0.55);
  const [peek, setPeek] = useState(false);
  const [view, setView] = useState<View>(FIT_VIEW);
  const [polygon, setPolygon] = useState<Array<{ x: number; y: number }>>([]);
  const [category, setCategory] = useState<RegionKind>("MAIN_WALL");
  const [label, setLabel] = useState("Main wall");
  const [wrapSize, setWrapSize] = useState({ w: 0, h: 0 });
  const [hasInk, setHasInk] = useState(false);
  const [wandReady, setWandReady] = useState(false);
  const [wandAvailable, setWandAvailable] = useState(true);
  const [loadingBase, setLoadingBase] = useState(false);
  const [coachOpen, setCoachOpen] = useState(() => {
    // localStorage itself can throw (blocked cookies / sandboxed webviews).
    try {
      return typeof window !== "undefined" && !window.localStorage.getItem(COACH_KEY);
    } catch {
      return true;
    }
  });
  const [startFromError, setStartFromError] = useState<string | null>(null);

  const maskDims = useMemo(() => {
    const s = Math.min(1, MASK_MAX / Math.max(imageDims.w, imageDims.h));
    return { w: Math.max(1, Math.round(imageDims.w * s)), h: Math.max(1, Math.round(imageDims.h * s)) };
  }, [imageDims]);

  // Lock background scroll while open, restore on unmount.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Move focus into the dialog on open; hand it back to the opener on close.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    modalRef.current?.focus();
    return () => {
      opener?.focus?.();
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
  }, []);

  // The image's displayed rect inside the wrapper at fit zoom (object-fit: contain).
  const contained = useMemo(() => {
    if (wrapSize.w === 0 || wrapSize.h === 0) return null;
    const scale = Math.min(wrapSize.w / imageDims.w, wrapSize.h / imageDims.h);
    const dispW = imageDims.w * scale;
    const dispH = imageDims.h * scale;
    return { dispW, dispH, offX: (wrapSize.w - dispW) / 2, offY: (wrapSize.h - dispH) / 2 };
  }, [wrapSize, imageDims]);

  const ensureMask = useCallback(() => {
    if (maskRef.current) return maskRef.current;
    const c = document.createElement("canvas");
    c.width = maskDims.w;
    c.height = maskDims.h;
    maskRef.current = c;
    return c;
  }, [maskDims]);

  // ---- snapshots / history -------------------------------------------------

  const snapshotAlpha = useCallback((): Uint8Array => {
    const mask = ensureMask();
    const ctx = mask.getContext("2d", { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, mask.width, mask.height).data;
    const a = new Uint8Array(mask.width * mask.height);
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]!;
    return a;
  }, [ensureMask]);

  const restoreAlpha = useCallback(
    (alpha: Uint8Array) => {
      const mask = ensureMask();
      const ctx = mask.getContext("2d", { willReadFrequently: true })!;
      const img = ctx.createImageData(mask.width, mask.height);
      const d = img.data;
      for (let i = 0; i < alpha.length; i++) {
        const j = i * 4;
        d[j] = 255;
        d[j + 1] = 255;
        d[j + 2] = 255;
        d[j + 3] = alpha[i]!;
      }
      ctx.putImageData(img, 0, 0);
    },
    [ensureMask],
  );

  const syncHistCounts = useCallback(() => {
    setHistCounts({ undo: historyRef.current.length, redo: futureRef.current.length });
  }, []);

  /** Push the CURRENT mask onto the undo stack (call before each mutation). */
  const pushHistory = useCallback(() => {
    historyRef.current.push(snapshotAlpha());
    if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
    futureRef.current = [];
    syncHistCounts();
  }, [snapshotAlpha, syncHistCounts]);

  const anyInk = (alpha: Uint8Array): boolean => {
    for (let i = 0; i < alpha.length; i++) if (alpha[i]! > 0) return true;
    return false;
  };

  // ---- overlay drawing -----------------------------------------------------

  /** Cache the mask's edge outline at wand resolution; recomputed on commits
   *  (not per pointer-move) so the overlay redraw stays cheap. */
  const recomputeOutline = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) return;
    const s = Math.min(1, WAND_MAX / Math.max(mask.width, mask.height));
    const w = Math.max(1, Math.round(mask.width * s));
    const h = Math.max(1, Math.round(mask.height * s));
    let oc = outlineRef.current;
    if (!oc || oc.width !== w || oc.height !== h) {
      oc = document.createElement("canvas");
      oc.width = w;
      oc.height = h;
      outlineRef.current = oc;
    }
    const tmp = document.createElement("canvas");
    tmp.width = w;
    tmp.height = h;
    const tctx = tmp.getContext("2d", { willReadFrequently: true })!;
    tctx.drawImage(mask, 0, 0, w, h);
    const src = tctx.getImageData(0, 0, w, h).data;
    const octx = oc.getContext("2d")!;
    const out = octx.createImageData(w, h);
    const d = out.data;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const on = src[i * 4 + 3]! > 127;
        if (!on) continue;
        const edge =
          x === 0 || x === w - 1 || y === 0 || y === h - 1 ||
          src[(i - 1) * 4 + 3]! <= 127 ||
          src[(i + 1) * 4 + 3]! <= 127 ||
          src[(i - w) * 4 + 3]! <= 127 ||
          src[(i + w) * 4 + 3]! <= 127;
        if (edge) {
          const j = i * 4;
          d[j] = 255;
          d[j + 1] = 255;
          d[j + 2] = 255;
          d[j + 3] = 235;
        }
      }
    }
    octx.putImageData(out, 0, 0);
  }, []);

  const drawOverlay = useCallback(() => {
    const overlay = overlayRef.current;
    if (!overlay || !contained) return;
    const dpr = window.devicePixelRatio || 1;
    if (overlay.width !== Math.round(wrapSize.w * dpr) || overlay.height !== Math.round(wrapSize.h * dpr)) {
      overlay.width = Math.round(wrapSize.w * dpr);
      overlay.height = Math.round(wrapSize.h * dpr);
    }
    const ctx = overlay.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, wrapSize.w, wrapSize.h);

    const { offX, offY, dispW, dispH } = contained;
    const x0 = view.tx + view.s * offX;
    const y0 = view.ty + view.s * offY;
    const dw = view.s * dispW;
    const dh = view.s * dispH;

    const mask = maskRef.current;
    if (mask && !peek) {
      ctx.drawImage(mask, x0, y0, dw, dh);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = `rgba(29,78,216,${overlayAlpha})`;
      ctx.fillRect(x0, y0, dw, dh);
      ctx.globalCompositeOperation = "source-over";
      if (outlineRef.current) ctx.drawImage(outlineRef.current, x0, y0, dw, dh);
    }

    const toScreen = (p: { x: number; y: number }) => ({
      X: x0 + p.x * dw,
      Y: y0 + p.y * dh,
    });

    // Corners tool: committed points, rubber band to the cursor, first-dot halo.
    if (tool === "poly" && polygon.length > 0) {
      const stroke = mode === "add" ? SELECT_BLUE : REMOVE_RED;
      ctx.beginPath();
      polygon.forEach((p, i) => {
        const { X, Y } = toScreen(p);
        if (i === 0) ctx.moveTo(X, Y);
        else ctx.lineTo(X, Y);
      });
      const cur = cursorRef.current;
      const wrap = wrapRef.current;
      if (cur && wrap) {
        const rect = wrap.getBoundingClientRect();
        ctx.lineTo(cur.x - rect.left, cur.y - rect.top);
      }
      if (polygon.length >= 3) ctx.closePath();
      ctx.fillStyle = mode === "add" ? "rgba(29,78,216,0.20)" : "rgba(220,38,38,0.20)";
      ctx.strokeStyle = stroke;
      ctx.lineWidth = 2;
      if (polygon.length >= 2) ctx.fill();
      ctx.stroke();
      polygon.forEach((p, i) => {
        const { X, Y } = toScreen(p);
        ctx.beginPath();
        ctx.arc(X, Y, i === 0 && polygon.length >= 3 ? 8 : 5, 0, Math.PI * 2);
        ctx.fillStyle = i === 0 ? stroke : "#fff";
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
      });
      // "Tap to finish" halo around the first dot once the shape can close.
      if (polygon.length >= 3) {
        const { X, Y } = toScreen(polygon[0]!);
        ctx.beginPath();
        ctx.arc(X, Y, 14, 0, Math.PI * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // Brush ring cursor.
    if (tool === "brush") {
      const cur = cursorRef.current;
      const wrap = wrapRef.current;
      if (cur && wrap) {
        const rect = wrap.getBoundingClientRect();
        ctx.beginPath();
        ctx.arc(cur.x - rect.left, cur.y - rect.top, brushSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = mode === "add" ? SELECT_BLUE : REMOVE_RED;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cur.x - rect.left, cur.y - rect.top, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = mode === "add" ? SELECT_BLUE : REMOVE_RED;
        ctx.fill();
      }
    }
  }, [contained, wrapSize, view, peek, overlayAlpha, tool, mode, polygon, brushSize]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // ---- wand (flood fill) ---------------------------------------------------

  // Sample the photo once at wand resolution. If the canvas is tainted
  // (cross-origin photo), hide the wand rather than show a broken tool.
  useEffect(() => {
    let cancelled = false;
    setWandReady(false);
    (async () => {
      try {
        const img = await loadImage(imageUrl);
        if (cancelled) return;
        const s = Math.min(1, WAND_MAX / Math.max(img.naturalWidth, img.naturalHeight));
        const w = Math.max(1, Math.round(img.naturalWidth * s));
        const h = Math.max(1, Math.round(img.naturalHeight * s));
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        wandPixelsRef.current = { data, w, h };
        setWandReady(true);
      } catch {
        if (cancelled) return;
        wandPixelsRef.current = null;
        setWandAvailable(false);
        setTool((t) => (t === "wand" ? "brush" : t));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [imageUrl]);

  /** Restore the pre-tap mask and re-apply the current seed's fill at `r` reach. */
  const applyWand = useCallback(
    (r: number) => {
      const seed = wandSeedRef.current;
      const px = wandPixelsRef.current;
      if (!seed || !px) return;
      restoreAlpha(seed.preTap);
      const bits = floodFill(px.data, px.w, px.h, seed.x, seed.y, r);
      const closed = morph3x3(morph3x3(bits, px.w, px.h, true), px.w, px.h, false);
      let wc = wandCanvasRef.current;
      if (!wc || wc.width !== px.w || wc.height !== px.h) {
        wc = document.createElement("canvas");
        wc.width = px.w;
        wc.height = px.h;
        wandCanvasRef.current = wc;
      }
      const wctx = wc.getContext("2d")!;
      const img = wctx.createImageData(px.w, px.h);
      const d = img.data;
      for (let i = 0; i < closed.length; i++) {
        const j = i * 4;
        d[j] = 255;
        d[j + 1] = 255;
        d[j + 2] = 255;
        d[j + 3] = closed[i]!;
      }
      wctx.putImageData(img, 0, 0);
      const mask = ensureMask();
      const mctx = mask.getContext("2d", { willReadFrequently: true })!;
      mctx.save();
      mctx.globalCompositeOperation = seed.mode === "add" ? "source-over" : "destination-out";
      mctx.imageSmoothingEnabled = true;
      mctx.drawImage(wc, 0, 0, mask.width, mask.height);
      mctx.restore();
      if (seed.mode === "add") setHasInk(true);
      recomputeOutline();
      drawOverlay();
    },
    [restoreAlpha, ensureMask, recomputeOutline, drawOverlay],
  );

  const wandTap = useCallback(
    (nx: number, ny: number) => {
      const px = wandPixelsRef.current;
      if (!px) return;
      const x = clamp(Math.round(nx * px.w), 0, px.w - 1);
      const y = clamp(Math.round(ny * px.h), 0, px.h - 1);
      pushHistory();
      wandSeedRef.current = {
        x,
        y,
        mode,
        preTap: historyRef.current[historyRef.current.length - 1]!,
      };
      applyWand(reach);
      // A remove tap may have emptied the mask — recompute once per tap (not
      // during Reach drags; handleSave double-checks anyway).
      if (mode === "remove") setHasInk(anyInk(snapshotAlpha()));
    },
    [mode, reach, pushHistory, applyWand, snapshotAlpha],
  );

  // ---- brush ---------------------------------------------------------------

  /** Screen px → mask px for the brush radius at the current zoom. */
  const brushMaskRadius = useCallback(() => {
    if (!contained) return 8;
    return Math.max(1, ((brushSize / 2) * maskDims.w) / (view.s * contained.dispW));
  }, [contained, brushSize, maskDims, view.s]);

  const paintSegment = useCallback(
    (fromX: number, fromY: number, toX: number, toY: number) => {
      const mask = ensureMask();
      const ctx = mask.getContext("2d", { willReadFrequently: true })!;
      ctx.save();
      ctx.globalCompositeOperation = mode === "add" ? "source-over" : "destination-out";
      ctx.strokeStyle = "#fff";
      ctx.fillStyle = "#fff";
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      const r = brushMaskRadius();
      if (fromX === toX && fromY === toY) {
        ctx.beginPath();
        ctx.arc(toX, toY, r, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.lineWidth = r * 2;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
      }
      ctx.restore();
    },
    [ensureMask, mode, brushMaskRadius],
  );

  /** A second finger landed mid-stroke: roll the stroke back and let the pinch take over. */
  const abortStroke = useCallback(() => {
    if (!strokeRef.current) return;
    strokeRef.current = null;
    const prev = historyRef.current.pop();
    if (prev) restoreAlpha(prev);
    syncHistCounts();
    recomputeOutline();
    drawOverlay();
  }, [restoreAlpha, syncHistCounts, recomputeOutline, drawOverlay]);

  // ---- polygon -------------------------------------------------------------

  const bakePolygon = useCallback(() => {
    const mask = ensureMask();
    if (polygon.length < 3) return;
    pushHistory();
    wandSeedRef.current = null;
    const ctx = mask.getContext("2d", { willReadFrequently: true })!;
    ctx.save();
    ctx.beginPath();
    polygon.forEach((p, i) => {
      const X = p.x * mask.width;
      const Y = p.y * mask.height;
      if (i === 0) ctx.moveTo(X, Y);
      else ctx.lineTo(X, Y);
    });
    ctx.closePath();
    if (mode === "add") {
      ctx.globalCompositeOperation = "source-over";
      ctx.fillStyle = "#fff";
    } else {
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "#000";
    }
    ctx.fill();
    ctx.restore();
    setPolygon([]);
    if (mode === "add") setHasInk(true);
    else setHasInk(anyInk(snapshotAlpha()));
    recomputeOutline();
  }, [polygon, mode, ensureMask, pushHistory, recomputeOutline, snapshotAlpha]);

  // ---- undo / redo / clear -------------------------------------------------

  const undo = useCallback(() => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    futureRef.current.push(snapshotAlpha());
    restoreAlpha(prev);
    wandSeedRef.current = null;
    setHasInk(anyInk(prev));
    syncHistCounts();
    recomputeOutline();
    drawOverlay();
  }, [snapshotAlpha, restoreAlpha, syncHistCounts, recomputeOutline, drawOverlay]);

  const redo = useCallback(() => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(snapshotAlpha());
    restoreAlpha(next);
    wandSeedRef.current = null;
    setHasInk(anyInk(next));
    syncHistCounts();
    recomputeOutline();
    drawOverlay();
  }, [snapshotAlpha, restoreAlpha, syncHistCounts, recomputeOutline, drawOverlay]);

  const clearAll = useCallback(() => {
    const mask = ensureMask();
    pushHistory();
    wandSeedRef.current = null;
    mask.getContext("2d", { willReadFrequently: true })!.clearRect(0, 0, mask.width, mask.height);
    setPolygon([]);
    setHasInk(false);
    recomputeOutline();
    drawOverlay();
  }, [ensureMask, pushHistory, recomputeOutline, drawOverlay]);

  // ---- start from an existing detected wall --------------------------------

  const startFromExisting = useCallback(
    async (src: ExistingMask) => {
      const mask = ensureMask();
      pushHistory();
      wandSeedRef.current = null;
      const ctx = mask.getContext("2d", { willReadFrequently: true })!;
      ctx.clearRect(0, 0, mask.width, mask.height);
      setPolygon([]);
      setCategory(src.kind);
      setLabel(src.label || "Wall");
      setStartFromError(null);
      setLoadingBase(true);
      let loaded = false;
      try {
        let img: CanvasImageSource | null = src.maskCanvas ?? null;
        if (!img && src.maskUrl) img = await loadImage(src.maskUrl);
        if (img) {
          // Sample the source mask (white-on-black or white-on-transparent),
          // keep its coverage as alpha on a white fill.
          const tmp = document.createElement("canvas");
          tmp.width = mask.width;
          tmp.height = mask.height;
          const tctx = tmp.getContext("2d", { willReadFrequently: true });
          if (tctx) {
            tctx.drawImage(img, 0, 0, mask.width, mask.height);
            // getImageData throws on tainted (cross-origin) sources.
            const data = tctx.getImageData(0, 0, mask.width, mask.height);
            const px = data.data;
            for (let i = 0; i < px.length; i += 4) {
              const cov = (0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!) | 0;
              px[i] = 255;
              px[i + 1] = 255;
              px[i + 2] = 255;
              px[i + 3] = cov;
            }
            ctx.putImageData(data, 0, 0);
            setHasInk(true);
            loaded = true;
          }
        }
      } catch {
        /* expired URL, network, or tainted canvas — restored below */
      } finally {
        if (!loaded) {
          // Roll back to the snapshot we pushed — never trade the user's work
          // for a blank canvas.
          const prev = historyRef.current.pop();
          if (prev) {
            restoreAlpha(prev);
            setHasInk(anyInk(prev));
          }
          syncHistCounts();
          setStartFromError("Couldn't load that wall — mark it with the tools instead.");
        }
        setLoadingBase(false);
        recomputeOutline();
        drawOverlay();
      }
    },
    [ensureMask, pushHistory, restoreAlpha, syncHistCounts, recomputeOutline, drawOverlay],
  );

  // ---- view (zoom / pan) ---------------------------------------------------

  const clampView = useCallback(
    (s: number, tx: number, ty: number): View => {
      if (s <= 1) return FIT_VIEW;
      return {
        s,
        tx: clamp(tx, wrapSize.w * (1 - s), 0),
        ty: clamp(ty, wrapSize.h * (1 - s), 0),
      };
    },
    [wrapSize],
  );

  const zoomAt = useCallback(
    (clientX: number, clientY: number, factor: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      setView((v) => {
        const ns = clamp(v.s * factor, 1, 5);
        const px = (clientX - rect.left - v.tx) / v.s;
        const py = (clientY - rect.top - v.ty) / v.s;
        return clampView(ns, clientX - rect.left - ns * px, clientY - rect.top - ns * py);
      });
    },
    [clampView],
  );

  const zoomCentre = useCallback(
    (factor: number) => {
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
    },
    [zoomAt],
  );

  // Wheel zoom needs a non-passive listener to preventDefault.
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
    };
    wrap.addEventListener("wheel", onWheel, { passive: false });
    return () => wrap.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- pointer handling ----------------------------------------------------

  const clientToNorm = useCallback(
    (clientX: number, clientY: number): { x: number; y: number } | null => {
      const wrap = wrapRef.current;
      if (!wrap || !contained) return null;
      const rect = wrap.getBoundingClientRect();
      const fx = (clientX - rect.left - view.tx) / view.s;
      const fy = (clientY - rect.top - view.ty) / view.s;
      return {
        x: (fx - contained.offX) / contained.dispW,
        y: (fy - contained.offY) / contained.dispH,
      };
    },
    [contained, view],
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (saving) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        abortStroke();
        const [p1, p2] = Array.from(pointersRef.current.values());
        gestureRef.current = {
          dist: Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y),
          cx: (p1!.x + p2!.x) / 2,
          cy: (p1!.y + p2!.y) / 2,
          v: view,
        };
        downRef.current = null;
        return;
      }
      if (pointersRef.current.size > 2) return;

      const pan = spaceRef.current || e.button === 1;
      downRef.current = { x: e.clientX, y: e.clientY, moved: false, pan, px: e.clientX, py: e.clientY };

      if (!pan && tool === "brush") {
        const n = clientToNorm(e.clientX, e.clientY);
        if (!n || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;
        wandSeedRef.current = null;
        pushHistory();
        const mask = ensureMask();
        const mx = n.x * mask.width;
        const my = n.y * mask.height;
        strokeRef.current = { x: mx, y: my };
        paintSegment(mx, my, mx, my);
        drawOverlay();
      }
    },
    [saving, view, tool, abortStroke, clientToNorm, pushHistory, ensureMask, paintSegment, drawOverlay],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };

      if (pointersRef.current.has(e.pointerId)) {
        pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
      }

      // Two-finger pinch: pan + zoom, always.
      if (gestureRef.current && pointersRef.current.size >= 2) {
        const [p1, p2] = Array.from(pointersRef.current.values());
        const g = gestureRef.current;
        const dist = Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y);
        const cx = (p1!.x + p2!.x) / 2;
        const cy = (p1!.y + p2!.y) / 2;
        const wrap = wrapRef.current;
        if (!wrap) return;
        const rect = wrap.getBoundingClientRect();
        const ns = clamp(g.v.s * (dist / Math.max(1, g.dist)), 1, 5);
        // Keep the image point that was under the gesture centre under it still.
        const px = (g.cx - rect.left - g.v.tx) / g.v.s;
        const py = (g.cy - rect.top - g.v.ty) / g.v.s;
        setView(clampView(ns, cx - rect.left - ns * px, cy - rect.top - ns * py));
        return;
      }

      const down = downRef.current;
      if (down) {
        const dist = Math.hypot(e.clientX - down.x, e.clientY - down.y);
        if (dist > 8) down.moved = true;

        if (down.pan || (down.moved && !strokeRef.current && tool !== "brush" && view.s > 1)) {
          // Single-pointer pan: explicit (space/middle-drag) or implicit drag
          // while zoomed on the tap tools.
          down.pan = true;
          const dx = e.clientX - down.px;
          const dy = e.clientY - down.py;
          setView((v) => clampView(v.s, v.tx + dx, v.ty + dy));
        }
        down.px = e.clientX;
        down.py = e.clientY;
      }

      if (strokeRef.current) {
        const mask = ensureMask();
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [e.nativeEvent];
        for (const ev of events) {
          const n = clientToNorm(ev.clientX, ev.clientY);
          if (!n) continue;
          const mx = clamp(n.x, 0, 1) * mask.width;
          const my = clamp(n.y, 0, 1) * mask.height;
          paintSegment(strokeRef.current.x, strokeRef.current.y, mx, my);
          strokeRef.current = { x: mx, y: my };
        }
      }
      drawOverlay();
    },
    [tool, view.s, clampView, clientToNorm, ensureMask, paintSegment, drawOverlay],
  );

  const onPointerUp = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      const wasPinch = gestureRef.current !== null;
      pointersRef.current.delete(e.pointerId);
      if (pointersRef.current.size >= 2) {
        // The active pair may have changed (e.g. first of three fingers lifted)
        // — re-baseline so the view doesn't lurch on the next move.
        const [p1, p2] = Array.from(pointersRef.current.values());
        gestureRef.current = {
          dist: Math.hypot(p2!.x - p1!.x, p2!.y - p1!.y),
          cx: (p1!.x + p2!.x) / 2,
          cy: (p1!.y + p2!.y) / 2,
          v: view,
        };
      } else {
        gestureRef.current = null;
      }

      if (strokeRef.current) {
        strokeRef.current = null;
        if (mode === "add") setHasInk(true);
        else setHasInk(anyInk(snapshotAlpha()));
        recomputeOutline();
        drawOverlay();
        downRef.current = null;
        return;
      }

      const down = downRef.current;
      downRef.current = null;
      if (!down || wasPinch || down.pan || down.moved || saving) return;

      const n = clientToNorm(e.clientX, e.clientY);
      if (!n || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;

      if (tool === "wand" && wandReady) {
        wandTap(n.x, n.y);
        return;
      }
      if (tool === "poly") {
        // Tapping the first dot (or close to it) finishes the shape.
        if (polygon.length >= 3 && contained) {
          const wrap = wrapRef.current!;
          const rect = wrap.getBoundingClientRect();
          const first = polygon[0]!;
          const fx = view.tx + view.s * (contained.offX + first.x * contained.dispW) + rect.left;
          const fy = view.ty + view.s * (contained.offY + first.y * contained.dispH) + rect.top;
          if (Math.hypot(e.clientX - fx, e.clientY - fy) <= 18) {
            bakePolygon();
            return;
          }
        }
        setPolygon((p) => [...p, n]);
      }
    },
    [mode, saving, tool, wandReady, polygon, contained, view, clientToNorm, wandTap, bakePolygon, recomputeOutline, drawOverlay, snapshotAlpha],
  );

  const onPointerLeave = useCallback(() => {
    cursorRef.current = null;
    drawOverlay();
  }, [drawOverlay]);

  // ---- save / close ----------------------------------------------------------

  // Flatten to an opaque white-on-black canvas at FULL photo resolution —
  // exactly what the recolor shader and the backend expect.
  const handleSave = useCallback(() => {
    const mask = maskRef.current;
    if (!mask || !hasInk) return;
    // hasInk can be stale after remove-mode edits — never save an empty mask.
    if (!anyInk(snapshotAlpha())) {
      setHasInk(false);
      return;
    }
    const out = document.createElement("canvas");
    out.width = imageDims.w;
    out.height = imageDims.h;
    const ctx = out.getContext("2d");
    if (!ctx) return;
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(mask, 0, 0, out.width, out.height);
    onSave(out, category, label.trim() || labelForKind(category));
  }, [hasInk, imageDims, category, label, onSave, snapshotAlpha]);

  const requestClose = useCallback(() => {
    if ((hasInk || polygon.length > 0) && !window.confirm("Discard this wall?")) return;
    onClose();
  }, [hasInk, polygon.length, onClose]);

  // ---- keyboard --------------------------------------------------------------

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      // Escape closes from anywhere — including the Name input / Type select.
      if (e.key === "Escape") {
        if (polygon.length > 0) setPolygon([]);
        else requestClose();
        return;
      }
      // Keep Tab inside the dialog (the portal sits after the whole page).
      if (e.key === "Tab") {
        const root = modalRef.current;
        if (!root) return;
        const focusables = Array.from(
          root.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
          ),
        );
        if (focusables.length === 0) return;
        const first = focusables[0]!;
        const last = focusables[focusables.length - 1]!;
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && (active === first || !root.contains(active))) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && (active === last || !root.contains(active))) {
          e.preventDefault();
          first.focus();
        }
        return;
      }
      if (t && (t.tagName === "INPUT" || t.tagName === "SELECT" || t.tagName === "TEXTAREA")) return;
      // Space/Enter on a focused control must keep their native activation.
      const onControl = Boolean(t && typeof t.closest === "function" && t.closest("button, a, [role='button']"));
      if (e.key === " ") {
        if (onControl) return;
        spaceRef.current = true;
        e.preventDefault();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }
      switch (e.key) {
        case "Enter":
          if (!onControl && tool === "poly" && polygon.length >= 3) bakePolygon();
          break;
        case "Backspace":
          if (tool === "poly" && polygon.length > 0) {
            e.preventDefault();
            setPolygon((p) => p.slice(0, -1));
          }
          break;
        case "w":
          if (wandAvailable) setTool("wand");
          break;
        case "b":
          setTool("brush");
          break;
        case "c":
          setTool("poly");
          break;
        case "x":
          setMode((m) => (m === "add" ? "remove" : "add"));
          break;
        case "[":
          setBrushSize((s) => clamp(s - 6, 12, 80));
          break;
        case "]":
          setBrushSize((s) => clamp(s + 6, 12, 80));
          break;
        case "+":
        case "=":
          zoomCentre(1.3);
          break;
        case "-":
          zoomCentre(1 / 1.3);
          break;
        case "0":
          setView(FIT_VIEW);
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key === " ") spaceRef.current = false;
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [polygon.length, tool, wandAvailable, undo, redo, bakePolygon, requestClose, zoomCentre]);

  // ---- copy ------------------------------------------------------------------

  const hint = coachOpen
    ? null
    : tool === "wand"
      ? !wandReady
        ? "Preparing the photo…"
        : mode === "add"
          ? "Tap a wall to select it. If the colour spills past the wall, lower Reach."
          : "Tap a selected area to remove it."
      : tool === "brush"
        ? mode === "add"
          ? "Paint over the wall. Two fingers (or scroll) to zoom in."
          : "Paint over anything selected by mistake."
        : polygon.length === 0
          ? "Tap corner points around the wall."
          : polygon.length < 3
            ? "Keep tapping corners — at least three."
            : "Tap the first dot (or press Enter) to finish the shape.";

  const dismissCoach = useCallback(() => {
    setCoachOpen(false);
    try {
      window.localStorage.setItem(COACH_KEY, "1");
    } catch {
      /* private mode — the coach just shows again next time */
    }
  }, []);

  const railBtn = (active: boolean, disabled = false): React.CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    width: 62,
    height: 54,
    padding: 0,
    border: "1px solid " + (active ? "var(--accent)" : "var(--rule)"),
    borderRadius: 8,
    background: active ? "var(--surface-soft)" : "transparent",
    color: active ? "var(--fg)" : "var(--fg-soft)",
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.4 : 1,
    font: "500 10px/1 var(--sans)",
  });

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Mark a wall"
      aria-describedby="hv-ms-kbd-help"
      onClick={requestClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "rgba(0,0,0,0.72)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "clamp(8px, 2vw, 28px)",
      }}
    >
      <div
        ref={modalRef}
        tabIndex={-1}
        className="hv-ms-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--bg)",
          border: "1px solid var(--rule-strong)",
          borderRadius: 12,
          width: "min(1240px, 100%)",
          height: "min(92vh, 100%)",
          display: "flex",
          flexDirection: "column",
          overflow: "hidden",
          outline: "none",
        }}
      >
        {/* Screen-reader-only usage instructions (referenced by aria-describedby on the dialog). */}
        <p id="hv-ms-kbd-help" className="sr-only">
          Mark the wall on the room photo using the wand, brush, or corners tool. Keyboard
          shortcuts: W magic wand, B brush, C corners, X switches between add and remove,
          left and right bracket change the brush size, plus and minus zoom, 0 fits the photo,
          Control+Z undoes, Control+Y redoes, Enter finishes a corner shape, Backspace removes
          the last corner, and Escape closes this dialog.
        </p>
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
            padding: "13px 20px",
            borderBottom: "1px solid var(--rule)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
            <span style={{ font: "600 16px/1 var(--sans)", color: "var(--fg)" }}>Mark a wall</span>
            <Mono>
              {remaining === 1 ? "Last wall you can add" : `You can add ${remaining} more walls`}
            </Mono>
          </div>
          <button
            type="button"
            onClick={requestClose}
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

        {/* Start from a wall we already found */}
        {existing.length > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              flexWrap: "wrap",
              padding: "9px 20px",
              borderBottom: "1px solid var(--rule)",
              background: "var(--surface)",
              flexShrink: 0,
            }}
          >
            <Mono>Start from</Mono>
            {existing.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => void startFromExisting(m)}
                style={{
                  padding: "6px 10px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--fg-soft)",
                  cursor: "pointer",
                  font: "500 12px/1 var(--sans)",
                }}
              >
                {m.label}
              </button>
            ))}
            <span style={{ font: "400 12px/1 var(--sans)", color: "var(--fg-mute)" }}>
              — or just start marking below.
            </span>
            {startFromError && (
              <span role="alert" style={{ font: "500 12px/1.3 var(--sans)", color: REMOVE_RED }}>
                {startFromError}
              </span>
            )}
          </div>
        )}

        {/* Body: tool rail + canvas */}
        <div className="hv-ms-body" style={{ display: "flex", flex: 1, minHeight: 0 }}>
          <div
            className="hv-ms-rail"
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 8,
              padding: 10,
              borderRight: "1px solid var(--rule)",
              background: "var(--surface)",
              overflowY: "auto",
              flexShrink: 0,
            }}
          >
            {wandAvailable && (
              <button type="button" onClick={() => setTool("wand")} aria-pressed={tool === "wand"} aria-keyshortcuts="w" title="Magic wand — tap the wall (W)" style={railBtn(tool === "wand")}>
                <WandIcon />
                Wand
              </button>
            )}
            <button type="button" onClick={() => setTool("brush")} aria-pressed={tool === "brush"} aria-keyshortcuts="b" title="Brush — paint the wall (B)" style={railBtn(tool === "brush")}>
              <BrushIcon />
              Brush
            </button>
            <button type="button" onClick={() => setTool("poly")} aria-pressed={tool === "poly"} aria-keyshortcuts="c" title="Corners — tap around the wall (C)" style={railBtn(tool === "poly")}>
              <CornersIcon />
              Corners
            </button>

            <span aria-hidden style={{ width: 40, height: 1, background: "var(--rule)", margin: "2px 0" }} />

            <div style={{ display: "flex", flexDirection: "column", gap: 2, border: "1px solid var(--rule)", borderRadius: 8, overflow: "hidden" }} className="hv-ms-mode">
              {(["add", "remove"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  aria-pressed={mode === m}
                  aria-keyshortcuts="x"
                  title={m === "add" ? "Add to the selection" : "Remove from the selection (X toggles)"}
                  style={{
                    width: 60,
                    padding: "7px 0",
                    border: "none",
                    cursor: "pointer",
                    font: "600 10px/1 var(--sans)",
                    letterSpacing: ".04em",
                    background: mode === m ? (m === "add" ? SELECT_BLUE : REMOVE_RED) : "transparent",
                    color: mode === m ? "#fff" : "var(--fg-mute)",
                  }}
                >
                  {m === "add" ? "Add" : "Remove"}
                </button>
              ))}
            </div>

            <span aria-hidden style={{ width: 40, height: 1, background: "var(--rule)", margin: "2px 0" }} />

            <div style={{ display: "flex", gap: 4 }} className="hv-ms-undo">
              <button type="button" onClick={undo} disabled={histCounts.undo === 0} aria-keyshortcuts="Control+Z" title="Undo (Ctrl+Z)" style={{ ...railBtn(false, histCounts.undo === 0), width: 29, height: 32, borderRadius: 6 }}>
                <UndoIcon />
              </button>
              <button type="button" onClick={redo} disabled={histCounts.redo === 0} aria-keyshortcuts="Control+Y" title="Redo (Ctrl+Y)" style={{ ...railBtn(false, histCounts.redo === 0), width: 29, height: 32, borderRadius: 6 }}>
                <RedoIcon />
              </button>
            </div>

            <button
              type="button"
              onPointerDown={() => setPeek(true)}
              onPointerUp={() => setPeek(false)}
              onPointerLeave={() => setPeek(false)}
              onPointerCancel={() => setPeek(false)}
              onKeyDown={(e) => {
                if (e.key === " " || e.key === "Enter") {
                  e.preventDefault();
                  setPeek(true);
                }
              }}
              onKeyUp={(e) => {
                if (e.key === " " || e.key === "Enter") setPeek(false);
              }}
              onBlur={() => setPeek(false)}
              aria-pressed={peek}
              title="Hold to hide the blue overlay"
              style={railBtn(peek)}
            >
              <EyeIcon />
              Peek
            </button>

            <button
              type="button"
              onClick={clearAll}
              disabled={!hasInk && polygon.length === 0}
              title="Start over (you can undo this)"
              style={railBtn(false, !hasInk && polygon.length === 0)}
            >
              <ClearIcon />
              Clear
            </button>
          </div>

          {/* Canvas */}
          <div
            ref={wrapRef}
            className="hv-ms-canvas"
            style={{
              position: "relative",
              flex: 1,
              minHeight: 300,
              background: "var(--surface)",
              overflow: "hidden",
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={imageUrl}
              alt="Room"
              draggable={false}
              style={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                transform: `translate(${view.tx}px, ${view.ty}px) scale(${view.s})`,
                transformOrigin: "0 0",
                pointerEvents: "none",
                userSelect: "none",
              }}
            />
            <canvas
              ref={overlayRef}
              aria-hidden="true"
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}
            />
            <div
              role="presentation"
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              onPointerLeave={onPointerLeave}
              style={{
                position: "absolute",
                inset: 0,
                touchAction: "none",
                cursor: tool === "brush" ? "none" : "crosshair",
              }}
            />

            {/* Contextual hint */}
            {hint && (
              <div
                style={{
                  position: "absolute",
                  top: 12,
                  left: "50%",
                  transform: "translateX(-50%)",
                  maxWidth: "calc(100% - 24px)",
                  padding: "8px 14px",
                  background: "var(--bg)",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 999,
                  font: "500 12px/1.35 var(--sans)",
                  color: "var(--fg-soft)",
                  pointerEvents: "none",
                  textAlign: "center",
                  zIndex: 3,
                }}
              >
                {hint}
              </div>
            )}

            {/* Zoom cluster */}
            <div
              className="hv-ms-zoom"
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                display: "flex",
                alignItems: "center",
                gap: 4,
                background: "var(--bg)",
                border: "1px solid var(--rule-strong)",
                borderRadius: 8,
                padding: 4,
                zIndex: 3,
              }}
            >
              <button type="button" onClick={() => zoomCentre(1 / 1.3)} aria-label="Zoom out" aria-keyshortcuts="-" style={zoomBtnStyle}>
                −
              </button>
              <span style={{ font: "500 11px/1 var(--mono)", color: "var(--fg-mute)", minWidth: 38, textAlign: "center" }}>
                {Math.round(view.s * 100)}%
              </span>
              <button type="button" onClick={() => zoomCentre(1.3)} aria-label="Zoom in" aria-keyshortcuts="+" style={zoomBtnStyle}>
                +
              </button>
              {view.s > 1 && (
                <button type="button" onClick={() => setView(FIT_VIEW)} aria-keyshortcuts="0" style={{ ...zoomBtnStyle, width: "auto", padding: "0 8px", font: "500 11px/1 var(--sans)" }}>
                  Fit
                </button>
              )}
            </div>

            {loadingBase && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.35)",
                  zIndex: 4,
                }}
              >
                <Spinner size={18} color="#fff" />
              </div>
            )}

            {/* One-time coach */}
            {coachOpen && (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  background: "rgba(0,0,0,0.45)",
                  zIndex: 5,
                  padding: 20,
                }}
              >
                <div
                  style={{
                    maxWidth: 380,
                    background: "var(--bg)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 12,
                    padding: 24,
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  <span style={{ font: "600 17px/1.2 var(--sans)", color: "var(--fg)" }}>
                    Three ways to mark a wall
                  </span>
                  {([
                    [<WandIcon key="w" />, "Tap it", "The wand selects the whole wall from one tap."],
                    [<BrushIcon key="b" />, "Paint it", "Brush over the wall with a finger or mouse."],
                    [<CornersIcon key="c" />, "Outline it", "Tap corner points for crisp, straight edges."],
                  ] as const).map(([icon, t, d]) => (
                    <div key={t} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                      <span style={{ color: "var(--accent)", flexShrink: 0, marginTop: 1 }}>{icon}</span>
                      <span style={{ font: "400 13px/1.45 var(--sans)", color: "var(--fg-soft)" }}>
                        <strong style={{ color: "var(--fg)" }}>{t}.</strong> {d}
                      </span>
                    </div>
                  ))}
                  <button type="button" onClick={dismissCoach} className="btn btn-sm" style={{ alignSelf: "flex-start" }}>
                    Got it
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tool options */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 18,
            flexWrap: "wrap",
            padding: "9px 20px",
            borderTop: "1px solid var(--rule)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
          {tool === "wand" && (
            <label style={sliderLabelStyle} title="How far the tap spreads across similar colours">
              <Mono>Reach</Mono>
              <input
                type="range"
                min={8}
                max={80}
                step={1}
                value={reach}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setReach(v);
                  applyWand(v);
                }}
                aria-label="Wand reach"
                style={{ width: 130, accentColor: "var(--accent)" }}
              />
            </label>
          )}
          {tool === "brush" && (
            <label style={sliderLabelStyle}>
              <Mono>Brush size</Mono>
              <input
                type="range"
                min={12}
                max={80}
                step={2}
                value={brushSize}
                onChange={(e) => setBrushSize(Number(e.target.value))}
                aria-label="Brush size"
                style={{ width: 130, accentColor: "var(--accent)" }}
              />
            </label>
          )}
          <label style={sliderLabelStyle}>
            <Mono>Overlay</Mono>
            <input
              type="range"
              min={0.2}
              max={0.85}
              step={0.05}
              value={overlayAlpha}
              onChange={(e) => setOverlayAlpha(Number(e.target.value))}
              aria-label="Overlay opacity"
              style={{ width: 110, accentColor: "var(--accent)" }}
            />
          </label>
          <span className="hv-ms-legend" style={{ marginLeft: "auto", font: "400 10px/1.6 var(--mono)", letterSpacing: ".08em", color: "var(--fg-mute)" }}>
            W wand · B brush · C corners · X add/remove · Ctrl+Z undo · scroll zooms
          </span>
        </div>

        {/* Footer: identity + commitment */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            padding: "12px 20px",
            borderTop: "1px solid var(--rule)",
            background: "var(--surface)",
            flexShrink: 0,
          }}
        >
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
                padding: "7px 8px",
                border: "1px solid var(--rule-strong)",
                borderRadius: 6,
                background: "var(--surface)",
                color: "var(--fg)",
                font: "500 12px/1 var(--sans)",
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
            aria-label="Wall name"
            placeholder="Name"
            style={{
              width: 140,
              padding: "7px 8px",
              border: "1px solid var(--rule-strong)",
              borderRadius: 6,
              background: "var(--surface)",
              color: "var(--fg)",
              font: "500 12px/1 var(--sans)",
            }}
          />
          <div style={{ flex: 1 }} />
          {!hasInk && (
            <span style={{ font: "400 12px/1 var(--sans)", color: "var(--fg-mute)" }}>
              Select the wall first
            </span>
          )}
          <button
            type="button"
            onClick={requestClose}
            style={{
              padding: "9px 14px",
              border: "1px solid var(--rule-strong)",
              borderRadius: 6,
              background: "transparent",
              color: "var(--fg-soft)",
              cursor: "pointer",
              font: "500 12px/1 var(--sans)",
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!hasInk || saving || remaining <= 0}
            style={{
              padding: "9px 18px",
              border: "1px solid var(--accent)",
              borderRadius: 6,
              background: !hasInk || saving || remaining <= 0 ? "transparent" : "var(--accent)",
              color: !hasInk || saving || remaining <= 0 ? "var(--fg-mute)" : "var(--bg)",
              opacity: !hasInk || saving || remaining <= 0 ? 0.5 : 1,
              cursor: !hasInk || saving || remaining <= 0 ? "not-allowed" : "pointer",
              font: "600 12px/1 var(--sans)",
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
              "Save wall"
            )}
          </button>
        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .hv-ms-body { flex-direction: column !important; }
          .hv-ms-rail {
            flex-direction: row !important;
            width: 100% !important;
            overflow-x: auto !important;
            overflow-y: hidden !important;
            border-right: none !important;
            border-bottom: 1px solid var(--rule);
            justify-content: flex-start !important;
          }
          .hv-ms-rail > span[aria-hidden] { width: 1px !important; height: 40px !important; margin: 0 2px !important; }
          .hv-ms-mode { flex-direction: row !important; }
          .hv-ms-legend { display: none !important; }
          /* Short phones: let the column scroll instead of burying the
             options/footer rows under an overflowing canvas. */
          .hv-ms-modal { overflow-y: auto !important; }
          .hv-ms-canvas { min-height: 220px !important; flex: 1 0 220px !important; }
        }
        @media (hover: none), (pointer: coarse) {
          .hv-ms-zoom button, .hv-ms-undo button { min-width: 44px; }
        }
      `}</style>
    </div>
  );

  return createPortal(body, document.body);
}

const zoomBtnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  border: "none",
  borderRadius: 6,
  background: "transparent",
  color: "var(--fg-soft)",
  cursor: "pointer",
  font: "500 15px/1 var(--sans)",
};

const sliderLabelStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

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
    img.onerror = () => reject(new Error("image load failed"));
    img.src = url;
  });
}

/**
 * Scanline flood fill from a seed pixel. Matching is SEED-relative (not
 * neighbour-relative) so the fill can't drift across the whole room: a pixel
 * joins when its luma-weighted RGB distance to the seed colour is within
 * `reach`. Returns a 0/255 byte per pixel.
 */
function floodFill(
  px: Uint8ClampedArray,
  w: number,
  h: number,
  sx: number,
  sy: number,
  reach: number,
): Uint8Array {
  const seedIdx = (sy * w + sx) * 4;
  const sr = px[seedIdx]!;
  const sg = px[seedIdx + 1]!;
  const sb = px[seedIdx + 2]!;
  const t2 = reach * reach * 9; // weights below sum to 9 → reach ≈ per-channel distance
  const out = new Uint8Array(w * h);
  const match = (i: number): boolean => {
    const j = i * 4;
    const dr = px[j]! - sr;
    const dg = px[j + 1]! - sg;
    const db = px[j + 2]! - sb;
    return 2 * dr * dr + 4 * dg * dg + 3 * db * db <= t2;
  };
  const stack: number[] = [sy * w + sx];
  while (stack.length > 0) {
    const p = stack.pop()!;
    if (out[p]) continue;
    if (!match(p)) continue;
    const y = (p / w) | 0;
    const rowStart = y * w;
    let xl = p - rowStart;
    let xr = xl;
    while (xl > 0 && !out[rowStart + xl - 1] && match(rowStart + xl - 1)) xl--;
    while (xr < w - 1 && !out[rowStart + xr + 1] && match(rowStart + xr + 1)) xr++;
    for (let x = xl; x <= xr; x++) out[rowStart + x] = 255;
    for (const ny of [y - 1, y + 1]) {
      if (ny < 0 || ny >= h) continue;
      const nRow = ny * w;
      for (let x = xl; x <= xr; x++) {
        const q = nRow + x;
        if (!out[q] && match(q)) stack.push(q);
      }
    }
  }
  return out;
}

/** Separable 3×3 dilate (max) or erode (min) — dilate-then-erode closes speckle holes. */
function morph3x3(src: Uint8Array, w: number, h: number, dilate: boolean): Uint8Array {
  const pick = dilate
    ? (a: number, b: number, c: number) => Math.max(a, b, c)
    : (a: number, b: number, c: number) => Math.min(a, b, c);
  const tmp = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const a = src[i]!;
      tmp[i] = pick(a, x > 0 ? src[i - 1]! : a, x < w - 1 ? src[i + 1]! : a);
    }
  }
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const i = row + x;
      const a = tmp[i]!;
      out[i] = pick(a, y > 0 ? tmp[i - w]! : a, y < h - 1 ? tmp[i + w]! : a);
    }
  }
  return out;
}

// ---- icons (20px, stroke = currentColor) ------------------------------------

function WandIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M15 4V2m0 12v-2m-5-5H8m11 0h-2m-1.8-3.2 1.4-1.4M9.4 14.6 3 21m13.4-6.4 1.4 1.4M9.4 9.4 8 8" />
      <path d="m12.3 6.3 5.4 5.4" />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9.06 11.9 8.07-8.06a2.85 2.85 0 1 1 4.03 4.03l-8.06 8.08" />
      <path d="M7.07 14.94c-1.66 0-3 1.35-3 3.02 0 1.33-2.5 1.52-2 2.02 1.08 1.1 2.49 2.02 4 2.02 2.2 0 4-1.8 4-4.04a3.01 3.01 0 0 0-3-3.02z" />
    </svg>
  );
}

function CornersIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M5 5h6l8 4-3 10H7z" />
      <circle cx="5" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="11" cy="5" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="19" cy="9" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="16" cy="19" r="1.6" fill="currentColor" stroke="none" />
      <circle cx="7" cy="19" r="1.6" fill="currentColor" stroke="none" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function ClearIcon() {
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0-1 14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 6" />
    </svg>
  );
}

function UndoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 15-6.7L21 13" />
    </svg>
  );
}
