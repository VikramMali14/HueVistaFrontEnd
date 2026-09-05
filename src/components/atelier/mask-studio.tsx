"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Mono } from "@/components/ui/eyebrow";
import { Spinner } from "@/components/ui/spinner";
import { growSelectionToSimilar } from "@/lib/mask-grow";
import { loadCrossOriginImage as loadImage } from "@/lib/load-image";
import type { RegionKind } from "@/lib/types";

// Selection blue is the one deliberate non-token colour: it must read against
// warm room photos. Red marks "remove" actions.
const SELECT_BLUE = "#1d4ed8";
const REMOVE_RED = "#dc2626";
/** The OTHER masks open in this session — violet so "live" and "also open" can never
 *  be confused with each other, or with the red of a remove stroke. */
const OTHER_VIOLET = "#7c3aed";

/** Working-mask cap — masks don't need 12 MP fidelity, and a smaller canvas
 *  keeps undo snapshots, flood fills and overlay redraws fast. */
const MASK_MAX = 1600;
/** How close a right-click has to land to count as "on" a corner point, in screen px. */
const POINT_HIT_PX = 16;
/** Resolution of the cached edge OUTLINE (the blue overlay stroke). Display only,
 *  so a downscaled copy is plenty; the wand itself samples at mask resolution. */
const WAND_MAX = 700;
const HISTORY_MAX = 20;
const COACH_KEY = "hv-mask-coach-v1";

/**
 * Most masks one editing session may hold open at once.
 *
 * Four, because that is one more than detection produces: a room opens with main wall,
 * accent wall and trim, and the fourth slot is the one a shop draws by hand. Editing all
 * of them together is what the alignment tool needs — a mask set that is right in shape
 * but sitting a few pixels off the photo has to move as ONE piece, and moving three
 * walls in three separate visits guarantees they end up in three different places.
 *
 * It is also a ceiling on the finished room. Every mask held here is a surface that gets
 * its own colour downstream, and past four the render stops reading as a colour scheme.
 */
const MAX_EDIT_LAYERS = 4;

/** The scratch layer id used while marking a wall that does not exist yet. */
const NEW_LAYER_ID = "__new__";

/** An existing region the user can edit, or start a new mask from. */
export interface ExistingMask {
  id: string;
  label: string;
  kind: RegionKind;
  /** Resolved mask URL (white-on-black) — loaded lazily when chosen. */
  maskUrl?: string | null;
  /** In-memory mask (hand-drawn regions) — used directly if present. */
  maskCanvas?: HTMLCanvasElement | null;
  /**
   * This region's mask BEFORE anyone hand-edited it — detection's own output.
   *
   * Null/absent means nobody has edited it, so the live mask is already the original
   * and "Restore original" has nothing to offer. The studio reads it exactly that way.
   */
  originalMaskUrl?: string | null;
}

/** One region's re-drawn mask, at photo resolution, ready to persist. */
export interface MaskEdit {
  regionId: string;
  mask: HTMLCanvasElement;
}

/**
 * One mask open for editing.
 *
 * Every tool writes into `canvas` — the whole engine below still edits exactly one
 * canvas at a time, and switching the active layer just re-points it. `dirty` is what
 * decides whether a layer is written back on save: a mask the user opened, looked at
 * and left alone must not be re-uploaded, or opening four masks to fix one would
 * rewrite all four (and, on a detected wall, spend its untouched original).
 */
interface MaskLayer {
  id: string;
  label: string;
  kind: RegionKind;
  canvas: HTMLCanvasElement;
  originalMaskUrl?: string | null;
  dirty: boolean;
}

/**
 * One undoable step: the state every layer it touched was in beforehand.
 *
 * A LIST of layers because moving the masks into alignment changes every open layer at
 * once, and that has to come back as ONE undo — an alignment unpicked one wall per
 * Ctrl+Z would leave the room in a state no single step created. Ordinary edits record
 * one layer.
 *
 * `moved` rides along because the alignment readout is a claim about the pixels, and a
 * step that puts the pixels back has to put the claim back with them. Without it, undo
 * left the panel saying the masks were 12px right of where they now were.
 */
interface HistoryFrame {
  layers: ReadonlyArray<{ id: string; alpha: Uint8Array }>;
  moved: { x: number; y: number };
}

interface MaskStudioProps {
  imageUrl: string;
  imageDims: { w: number; h: number };
  existing: ReadonlyArray<ExistingMask>;
  /** How many more masks the user may still create (cap is enforced by the parent). */
  remaining: number;
  saving: boolean;
  /** When set, the studio opens to REFINE this existing region's mask: it seeds
   *  the canvas from that mask, doesn't count against the new-wall cap, and the
   *  save action reads as "Update". The parent's onSave persists it back to the
   *  same region (works for AI-detected regions too). */
  editTarget?: ExistingMask | null;
  onClose: () => void;
  onSave: (mask: HTMLCanvasElement, category: RegionKind, label: string) => void;
  /**
   * Persist a refining session: every mask the user actually changed, in one go.
   *
   * Separate from {@link onSave} because it is a different act — that one creates a
   * wall, this one rewrites walls that already exist, and a session can rewrite up to
   * four of them. Only dirty layers appear here.
   */
  onSaveEdits: (edits: MaskEdit[]) => void;
}

// The same names the studio, the dock, the plan panel and the backend use. "Accent /
// border" and "Trim" here against "Accent wall" and "Trim & frames" there meant the
// surface a shop had just drawn came back under a different name.
//
// "Another wall" is offered here rather than only in the plan panel, because it is the
// honest answer for most walls somebody draws by hand: a third wall in a room is not a
// second feature wall, and until this option existed the only ways to file one were as
// the accent (wrong — it gets the accent colour) or as "Other" (a surface with no part
// in the scheme at all).
const CATEGORY_OPTIONS: ReadonlyArray<readonly [RegionKind, string]> = [
  ["MAIN_WALL", "Main wall"],
  ["ACCENT_WALL", "Accent wall"],
  ["OTHER_WALL", "Another wall"],
  ["TRIM", "Trim & frames"],
  ["MANUAL", "Other"],
];

type Tool = "wand" | "brush" | "poly" | "move";
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
  editTarget,
  onClose,
  onSave,
  onSaveEdits,
}: MaskStudioProps) {
  const isEditing = Boolean(editTarget);
  const wrapRef = useRef<HTMLDivElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement | null>(null);
  const outlineRef = useRef<HTMLCanvasElement | null>(null);
  const wandCanvasRef = useRef<HTMLCanvasElement | null>(null);
  /** Photo pixels the wand samples, at mask resolution, plus the luminance gradient
   *  magnitude used to snap a fill onto the wall's real edge. Null until loaded (or
   *  tainted). */
  const wandPixelsRef = useRef<{ data: Uint8ClampedArray; w: number; h: number; grad: Uint8Array } | null>(null);

  // Undo/redo: alpha-plane snapshots of the layers each step replaced. Refs so
  // painting never re-renders; a small counts state drives button enablement.
  const historyRef = useRef<HistoryFrame[]>([]);
  const futureRef = useRef<HistoryFrame[]>([]);
  const [histCounts, setHistCounts] = useState({ undo: 0, redo: 0 });

  // The masks open for editing, and which one the tools write into.
  //
  // Refs rather than state because they are the truth the drawing engine reads on every
  // pointer move, and a stale closure over a canvas is a whole edit painted into the
  // wrong layer. `layerTick` exists only to re-render the chips and buttons that
  // describe them.
  const layersRef = useRef<MaskLayer[]>([]);
  const activeIdRef = useRef<string>(NEW_LAYER_ID);
  const [layerTick, bumpLayers] = useReducer((n: number) => n + 1, 0);

  // A live drag/nudge of the whole mask set, in mask pixels, not yet written into any
  // canvas — the overlay draws everything shifted by it so alignment can be judged
  // before it is committed.
  const moveRef = useRef<{ dx: number; dy: number } | null>(null);
  // True while the last committed step was a keyboard nudge, so a run of arrow taps
  // collapses into one undo instead of twenty.
  const nudgeRunRef = useRef(false);
  /** Pre-tinted union of the OTHER open layers — drawn behind the active one. */
  const othersRef = useRef<HTMLCanvasElement | null>(null);
  /** Somewhere for the tools to write when a refining session has no mask left to edit. */
  const detachedRef = useRef<HTMLCanvasElement | null>(null);

  // Live wand editing: the mask as it was BEFORE the current tap, plus the
  // tap's seed — dragging Reach restores + re-fills so it feels direct.
  const wandSeedRef = useRef<{ x: number; y: number; mode: Mode; preTap: Uint8Array } | null>(null);

  // Pointer plumbing (brush strokes, taps, pan/pinch).
  const pointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gestureRef = useRef<{ dist: number; cx: number; cy: number; v: View } | null>(null);
  const strokeRef = useRef<{ x: number; y: number } | null>(null); // last point, mask px
  // Last committed brush point (mask px), kept AFTER the stroke ends so a
  // Shift-click paints a straight run from it to the next click — the fast way
  // to trace long straight trim (parapet copings, string bands, sunshade edges).
  const lastBrushRef = useRef<{ x: number; y: number } | null>(null);
  const shiftRef = useRef(false); // Shift held, for the straight-line preview
  const downRef = useRef<{ x: number; y: number; moved: boolean; pan: boolean; px: number; py: number } | null>(null);
  const cursorRef = useRef<{ x: number; y: number } | null>(null); // client coords
  const spaceRef = useRef(false);
  /** Where an alignment drag started, in client coords; null when not dragging one. */
  const moveStartRef = useRef<{ x: number; y: number } | null>(null);

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
  /** Total committed alignment shift, in mask pixels — shown so a nudge run is countable.
   *  Mirrored in a ref because history frames record it from inside callbacks. */
  const [moved, setMovedState] = useState({ x: 0, y: 0 });
  const movedRef = useRef({ x: 0, y: 0 });
  const setMoved = useCallback((next: { x: number; y: number }) => {
    movedRef.current = next;
    setMovedState(next);
  }, []);
  /** Why the last save attempt didn't go through; cleared by the next one. */
  const [saveError, setSaveError] = useState<string | null>(null);

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

  // ---- layers --------------------------------------------------------------

  const blankCanvas = useCallback(() => {
    const c = document.createElement("canvas");
    c.width = maskDims.w;
    c.height = maskDims.h;
    return c;
  }, [maskDims]);

  /**
   * The canvas the tools write into, creating the scratch layer on first use.
   *
   * Every tool below still edits ONE canvas, exactly as it did when the studio could
   * only hold one mask — all that changed is which canvas this hands back. `maskRef` is
   * kept pointing at it so the overlay and the outline cache stay in step.
   *
   * The scratch layer belongs to MARKING a wall. Refining never invents one: a layer
   * with no region behind it would draw a mask, show a chip nobody can match to a wall,
   * and save to an id the studio's caller cannot resolve. When every mask a refining
   * session opened has failed to load, the honest answer is a detached canvas and an
   * error on screen — there is genuinely nothing to edit.
   */
  const ensureMask = useCallback((): HTMLCanvasElement => {
    let layer = layersRef.current.find((l) => l.id === activeIdRef.current);
    if (!layer) {
      if (isEditing) {
        detachedRef.current ??= blankCanvas();
        maskRef.current = detachedRef.current;
        return detachedRef.current;
      }
      layer = { id: NEW_LAYER_ID, label: "Wall", kind: "MAIN_WALL", canvas: blankCanvas(), dirty: false };
      layersRef.current = [...layersRef.current, layer];
      activeIdRef.current = layer.id;
      bumpLayers();
    }
    maskRef.current = layer.canvas;
    return layer.canvas;
  }, [blankCanvas, isEditing]);

  const canvasFor = useCallback((id: string): HTMLCanvasElement | null => {
    return layersRef.current.find((l) => l.id === id)?.canvas ?? null;
  }, []);

  /** Mark a layer as changed, so save writes it back. */
  const markDirty = useCallback((id: string) => {
    // Checked before mapping: this runs on every brush move, and the answer is "already
    // dirty" for all but the first of them.
    const current = layersRef.current.find((l) => l.id === id);
    if (!current || current.dirty) return;
    layersRef.current = layersRef.current.map((l) => (l.id === id ? { ...l, dirty: true } : l));
    bumpLayers();
  }, []);

  const markActiveDirty = useCallback(() => markDirty(activeIdRef.current), [markDirty]);

  // ---- snapshots / history -------------------------------------------------

  const snapshotOf = useCallback((canvas: HTMLCanvasElement): Uint8Array => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const a = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < a.length; i++) a[i] = data[i * 4 + 3]!;
    return a;
  }, []);

  const snapshotAlpha = useCallback((): Uint8Array => snapshotOf(ensureMask()), [ensureMask, snapshotOf]);

  const restoreInto = useCallback((canvas: HTMLCanvasElement, alpha: Uint8Array) => {
    const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
    const img = ctx.createImageData(canvas.width, canvas.height);
    const d = img.data;
    for (let i = 0; i < alpha.length; i++) {
      const j = i * 4;
      d[j] = 255;
      d[j + 1] = 255;
      d[j + 2] = 255;
      d[j + 3] = alpha[i]!;
    }
    ctx.putImageData(img, 0, 0);
  }, []);

  const restoreAlpha = useCallback(
    (alpha: Uint8Array) => restoreInto(ensureMask(), alpha),
    [ensureMask, restoreInto],
  );

  const syncHistCounts = useCallback(() => {
    setHistCounts({ undo: historyRef.current.length, redo: futureRef.current.length });
  }, []);

  /** Snapshot the named layers, and the alignment, as one undoable step. */
  const frameOf = useCallback(
    (ids: ReadonlyArray<string>): HistoryFrame => ({
      layers: ids
        .map((id) => {
          const canvas = canvasFor(id);
          return canvas ? { id, alpha: snapshotOf(canvas) } : null;
        })
        .filter((e): e is { id: string; alpha: Uint8Array } => e !== null),
      moved: movedRef.current,
    }),
    [canvasFor, snapshotOf],
  );

  const pushFrame = useCallback(
    (frame: HistoryFrame) => {
      if (frame.layers.length === 0) return;
      historyRef.current.push(frame);
      if (historyRef.current.length > HISTORY_MAX) historyRef.current.shift();
      futureRef.current = [];
      nudgeRunRef.current = false;
      syncHistCounts();
    },
    [syncHistCounts],
  );

  /** Push the CURRENT mask onto the undo stack (call before each mutation). */
  const pushHistory = useCallback(() => {
    ensureMask(); // the scratch layer must exist before it can be snapshotted
    pushFrame(frameOf([activeIdRef.current]));
  }, [ensureMask, frameOf, pushFrame]);

  const anyInk = (alpha: Uint8Array): boolean => {
    for (let i = 0; i < alpha.length; i++) if (alpha[i]! > 0) return true;
    return false;
  };

  const canvasHasInk = useCallback(
    (canvas: HTMLCanvasElement | null): boolean => (canvas ? anyInk(snapshotOf(canvas)) : false),
    [snapshotOf],
  );

  // ---- overlay drawing -----------------------------------------------------

  /**
   * Bake the OTHER open layers into one violet-tinted canvas.
   *
   * Pre-tinted, so the per-frame cost of showing three extra masks is a single
   * drawImage: the alternative is compositing each of them into the overlay on every
   * pointer move, and the brush cannot afford that. Rebuilt only when the layer set,
   * the active layer, or their pixels change — never during a stroke, because a stroke
   * only ever touches the active layer.
   */
  const recomputeOthers = useCallback(() => {
    const others = layersRef.current.filter((l) => l.id !== activeIdRef.current);
    if (others.length === 0) {
      othersRef.current = null;
      return;
    }
    let oc = othersRef.current;
    if (!oc || oc.width !== maskDims.w || oc.height !== maskDims.h) {
      oc = document.createElement("canvas");
      oc.width = maskDims.w;
      oc.height = maskDims.h;
      othersRef.current = oc;
    }
    const ctx = oc.getContext("2d")!;
    ctx.clearRect(0, 0, oc.width, oc.height);
    for (const l of others) ctx.drawImage(l.canvas, 0, 0, oc.width, oc.height);
    ctx.save();
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = OTHER_VIOLET;
    ctx.fillRect(0, 0, oc.width, oc.height);
    ctx.restore();
  }, [maskDims]);

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

    // An alignment drag that hasn't been committed yet: every mask draws shifted by it,
    // so what you are lining up against the photo is what you will get.
    const mv = moveRef.current;
    const mx = mv ? (mv.dx / maskDims.w) * dw : 0;
    const my = mv ? (mv.dy / maskDims.h) * dh : 0;

    const mask = maskRef.current;
    if (mask && !peek) {
      // The live mask goes down FIRST, because tinting it uses source-in — which keeps
      // the fill only where the canvas already has pixels, and would recolour anything
      // drawn before it.
      ctx.drawImage(mask, x0 + mx, y0 + my, dw, dh);
      ctx.globalCompositeOperation = "source-in";
      ctx.fillStyle = `rgba(29,78,216,${overlayAlpha})`;
      ctx.fillRect(x0 + mx, y0 + my, dw, dh);
      ctx.globalCompositeOperation = "source-over";
      if (outlineRef.current) ctx.drawImage(outlineRef.current, x0 + mx, y0 + my, dw, dh);
      // The other open masks, already tinted, at a fraction of the live one's weight:
      // present enough to align and to avoid overlapping them, quiet enough that the
      // mask being edited is never in doubt.
      if (othersRef.current) {
        ctx.globalAlpha = overlayAlpha * 0.55;
        ctx.drawImage(othersRef.current, x0 + mx, y0 + my, dw, dh);
        ctx.globalAlpha = 1;
      }
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

    // Brush ring cursor (+ straight-line preview while Shift is held).
    if (tool === "brush") {
      const cur = cursorRef.current;
      const wrap = wrapRef.current;
      if (cur && wrap) {
        const rect = wrap.getBoundingClientRect();
        const cx = cur.x - rect.left;
        const cy = cur.y - rect.top;
        const stroke = mode === "add" ? SELECT_BLUE : REMOVE_RED;
        // Dashed rubber band from the last brush point: shows where a Shift-click
        // would lay a straight run before committing it.
        const last = lastBrushRef.current;
        const m = maskRef.current;
        if (shiftRef.current && last && m) {
          ctx.beginPath();
          ctx.moveTo(x0 + (last.x / m.width) * dw, y0 + (last.y / m.height) * dh);
          ctx.lineTo(cx, cy);
          ctx.strokeStyle = stroke;
          ctx.lineWidth = 1.5;
          ctx.setLineDash([4, 4]);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.beginPath();
        ctx.arc(cx, cy, brushSize / 2, 0, Math.PI * 2);
        ctx.strokeStyle = stroke;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = stroke;
        ctx.fill();
      }
    }
    // Reads the layer canvases through refs rather than state: every layer change already
    // ends in an explicit redraw (see refreshLayers), and re-identifying this callback on
    // each of them would rebuild the overlay listeners mid-stroke.
  }, [contained, wrapSize, view, peek, overlayAlpha, tool, mode, polygon, brushSize, maskDims]);

  useEffect(() => {
    drawOverlay();
  }, [drawOverlay]);

  // Switching tools drops the straight-line anchor so a later Shift-click can't
  // connect to a point left over from an unrelated edit.
  useEffect(() => {
    lastBrushRef.current = null;
  }, [tool]);

  // ---- wand (flood fill) ---------------------------------------------------

  // Sample the photo once, at THE MASK'S OWN RESOLUTION. If the canvas is tainted
  // (cross-origin photo), hide the wand rather than show a broken tool.
  //
  // This used to sample a fixed 700px copy and then scale the fill up onto the mask
  // (1600px on its longest side). Everything the fill decided was therefore quantised
  // to the 700px grid — a 2-3px staircase once it landed on the mask, wider still on
  // the photo — so a wand edge sat beside the wall's real edge rather than on it, and
  // no amount of feathering or edge nudging downstream could put it back. Measured on
  // a 2090px photo, the mask boundary averaged 2.5px from the nearest edge in the
  // photograph, with only half of it inside a pixel.
  //
  // Sampling at mask resolution removes the scale step entirely: the fill is decided
  // on exactly the pixels it is composited onto. It costs one larger getImageData per
  // photo and a flood fill over ~5x more pixels, which is a few ms on a scanline fill
  // — paid once per tap, and the mask is what the whole tool exists to produce.
  useEffect(() => {
    let cancelled = false;
    setWandReady(false);
    (async () => {
      try {
        const img = await loadImage(imageUrl);
        if (cancelled) return;
        const w = maskDims.w;
        const h = maskDims.h;
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true })!;
        ctx.drawImage(img, 0, 0, w, h);
        const data = ctx.getImageData(0, 0, w, h).data;
        wandPixelsRef.current = { data, w, h, grad: gradientMap(data, w, h) };
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
  }, [imageUrl, maskDims]);

  /** Restore the pre-tap mask and re-apply the current seed's fill at `r` reach. */
  const applyWand = useCallback(
    (r: number) => {
      const seed = wandSeedRef.current;
      const px = wandPixelsRef.current;
      if (!seed || !px) return;
      restoreAlpha(seed.preTap);
      const bits = floodFill(px.data, px.w, px.h, seed.x, seed.y, r);
      const closed = snapToEdge(
        morph3x3(morph3x3(bits, px.w, px.h, true), px.w, px.h, false),
        px.grad, px.w, px.h,
      );
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
      markActiveDirty();
      if (seed.mode === "add") setHasInk(true);
      recomputeOutline();
      drawOverlay();
    },
    [restoreAlpha, ensureMask, markActiveDirty, recomputeOutline, drawOverlay],
  );

  const wandTap = useCallback(
    (nx: number, ny: number) => {
      const px = wandPixelsRef.current;
      if (!px) return;
      const x = clamp(Math.round(nx * px.w), 0, px.w - 1);
      const y = clamp(Math.round(ny * px.h), 0, px.h - 1);
      pushHistory();
      const pushed = historyRef.current[historyRef.current.length - 1]!;
      wandSeedRef.current = { x, y, mode, preTap: pushed.layers[0]!.alpha };
      applyWand(reach);
      // A remove tap may have emptied the mask — recompute once per tap (not
      // during Reach drags; handleSave double-checks anyway).
      if (mode === "remove") setHasInk(anyInk(snapshotAlpha()));
    },
    [mode, reach, pushHistory, applyWand, snapshotAlpha],
  );

  // ---- complete (grow the selection to the rest of the object) -------------

  /**
   * "Complete": grow the CURRENT selection into every connected pixel of the
   * same colour, so a half-marked object (one side of a pillar, part of a
   * shaded wall) fills out to its real colour edges in one action. Add-only and
   * undoable; uses the wand's Reach as the colour tolerance so the two tools
   * behave consistently. No-op without a selection or before the photo colours
   * are sampled (tainted / still loading).
   */
  const completeSelection = useCallback(() => {
    const px = wandPixelsRef.current;
    const mask = maskRef.current;
    if (!px || !mask) return;
    // Read the working mask at wand resolution → a 0/255 seed by coverage.
    const tmp = document.createElement("canvas");
    tmp.width = px.w;
    tmp.height = px.h;
    const tctx = tmp.getContext("2d", { willReadFrequently: true });
    if (!tctx) return;
    tctx.drawImage(mask, 0, 0, px.w, px.h);
    const alpha = tctx.getImageData(0, 0, px.w, px.h).data;
    const seed = new Uint8Array(px.w * px.h);
    let any = false;
    for (let i = 0; i < seed.length; i++) {
      if (alpha[i * 4 + 3]! >= 128) {
        seed[i] = 255;
        any = true;
      }
    }
    if (!any) return; // nothing selected to grow from
    pushHistory();
    wandSeedRef.current = null;
    const grown = growSelectionToSimilar(px.data, px.w, px.h, seed, reach);
    // Close speckle the same way the wand does, so the completed edge is clean.
    const closed = morph3x3(morph3x3(grown, px.w, px.h, true), px.w, px.h, false);
    const out = document.createElement("canvas");
    out.width = px.w;
    out.height = px.h;
    const octx = out.getContext("2d")!;
    const img = octx.createImageData(px.w, px.h);
    const d = img.data;
    for (let i = 0; i < closed.length; i++) {
      const j = i * 4;
      d[j] = 255;
      d[j + 1] = 255;
      d[j + 2] = 255;
      d[j + 3] = closed[i]!;
    }
    octx.putImageData(img, 0, 0);
    const mctx = mask.getContext("2d", { willReadFrequently: true })!;
    mctx.save();
    mctx.globalCompositeOperation = "source-over"; // growth only ADDS coverage
    mctx.imageSmoothingEnabled = true;
    mctx.drawImage(out, 0, 0, mask.width, mask.height);
    mctx.restore();
    markActiveDirty();
    setHasInk(true);
    recomputeOutline();
    drawOverlay();
  }, [reach, pushHistory, markActiveDirty, recomputeOutline, drawOverlay]);

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
      markActiveDirty();
    },
    [ensureMask, mode, brushMaskRadius, markActiveDirty],
  );

  /** A second finger landed mid-stroke: roll the stroke back and let the pinch take over. */
  const abortStroke = useCallback(() => {
    if (!strokeRef.current) return;
    strokeRef.current = null;
    const prev = historyRef.current.pop();
    // A stroke only ever touches the active layer, so its frame has one entry.
    if (prev) for (const e of prev.layers) restoreInto(canvasFor(e.id) ?? ensureMask(), e.alpha);
    syncHistCounts();
    recomputeOutline();
    drawOverlay();
  }, [restoreInto, canvasFor, ensureMask, syncHistCounts, recomputeOutline, drawOverlay]);

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
    markActiveDirty();
    if (mode === "add") setHasInk(true);
    else setHasInk(anyInk(snapshotAlpha()));
    recomputeOutline();
  }, [polygon, mode, ensureMask, pushHistory, markActiveDirty, recomputeOutline, snapshotAlpha]);

  // ---- undo / redo / clear -------------------------------------------------

  /**
   * Step one frame between the two stacks.
   *
   * A frame names every layer the step changed, so an alignment that moved four masks
   * comes back in one go. Whatever those layers hold right now becomes the frame on the
   * opposite stack, which is what makes undo and redo exact inverses of each other.
   */
  const stepHistory = useCallback(
    (from: HistoryFrame[], to: HistoryFrame[]) => {
      const frame = from.pop();
      if (!frame) return;
      to.push(frameOf(frame.layers.map((e) => e.id)));
      setMoved(frame.moved);
      for (const e of frame.layers) {
        const canvas = canvasFor(e.id);
        if (canvas) restoreInto(canvas, e.alpha);
        // Every layer in the frame is dirty either way: it was changed to get here,
        // and changed again to get back.
        markDirty(e.id);
      }
      wandSeedRef.current = null;
      nudgeRunRef.current = false;
      setHasInk(canvasHasInk(canvasFor(activeIdRef.current)));
      syncHistCounts();
      recomputeOutline();
      recomputeOthers();
      drawOverlay();
    },
    [frameOf, setMoved, canvasFor, restoreInto, markDirty, canvasHasInk, syncHistCounts, recomputeOutline, recomputeOthers, drawOverlay],
  );

  const undo = useCallback(
    () => stepHistory(historyRef.current, futureRef.current),
    [stepHistory],
  );

  const redo = useCallback(
    () => stepHistory(futureRef.current, historyRef.current),
    [stepHistory],
  );

  const clearAll = useCallback(() => {
    const mask = ensureMask();
    pushHistory();
    wandSeedRef.current = null;
    lastBrushRef.current = null;
    mask.getContext("2d", { willReadFrequently: true })!.clearRect(0, 0, mask.width, mask.height);
    markActiveDirty();
    setPolygon([]);
    setHasInk(false);
    recomputeOutline();
    drawOverlay();
  }, [ensureMask, pushHistory, markActiveDirty, recomputeOutline, drawOverlay]);

  // ---- loading stored masks ------------------------------------------------

  /**
   * Paint a stored mask into `target`, replacing whatever it holds.
   *
   * Masks arrive two ways — white-on-black PNGs from the backend and white-on-transparent
   * canvases for walls drawn in this tab — and both come out the same here: coverage read
   * as luminance, laid down as alpha on a white fill, which is the one shape every tool
   * below understands. Returns false rather than throwing on an expired URL, a network
   * failure or a tainted cross-origin canvas; the callers each have something different
   * to do about it, and none of them should lose the user's work over it.
   */
  const loadMaskInto = useCallback(
    async (target: HTMLCanvasElement, src: { maskUrl?: string | null; maskCanvas?: HTMLCanvasElement | null }) => {
      try {
        let img: CanvasImageSource | null = src.maskCanvas ?? null;
        if (!img && src.maskUrl) img = await loadImage(src.maskUrl);
        if (!img) return false;
        const tmp = document.createElement("canvas");
        tmp.width = target.width;
        tmp.height = target.height;
        const tctx = tmp.getContext("2d", { willReadFrequently: true });
        if (!tctx) return false;
        tctx.drawImage(img, 0, 0, target.width, target.height);
        // getImageData throws on tainted (cross-origin) sources.
        const data = tctx.getImageData(0, 0, target.width, target.height);
        const px = data.data;
        for (let i = 0; i < px.length; i += 4) {
          const cov = (0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!) | 0;
          px[i] = 255;
          px[i + 1] = 255;
          px[i + 2] = 255;
          px[i + 3] = cov;
        }
        target.getContext("2d", { willReadFrequently: true })!.putImageData(data, 0, 0);
        return true;
      } catch {
        return false;
      }
    },
    [],
  );

  /** Everything that has to catch up after the layers or their pixels change. */
  const refreshLayers = useCallback(() => {
    ensureMask();
    setHasInk(canvasHasInk(canvasFor(activeIdRef.current)));
    recomputeOutline();
    recomputeOthers();
    drawOverlay();
  }, [ensureMask, canvasHasInk, canvasFor, recomputeOutline, recomputeOthers, drawOverlay]);

  // ---- start from an existing detected wall --------------------------------

  /** Seed the wall being MARKED from one we already found. New-wall flow only. */
  const startFromExisting = useCallback(
    async (src: ExistingMask) => {
      const mask = ensureMask();
      const before = frameOf([activeIdRef.current]);
      wandSeedRef.current = null;
      lastBrushRef.current = null;
      setPolygon([]);
      setStartFromError(null);
      setLoadingBase(true);
      const loaded = await loadMaskInto(mask, src);
      setLoadingBase(false);
      if (loaded) {
        pushFrame(before);
        setCategory(src.kind);
        setLabel(src.label || "Wall");
        markActiveDirty();
      } else {
        // Never trade the user's work for a blank canvas: the mask is untouched, so
        // there is nothing to roll back — only something to say.
        setStartFromError("Couldn't load that wall — mark it with the tools instead.");
      }
      refreshLayers();
    },
    [ensureMask, frameOf, pushFrame, loadMaskInto, markActiveDirty, refreshLayers],
  );

  // ---- the masks open for editing ------------------------------------------

  /** Point the tools at one of the open masks. */
  const setActiveLayer = useCallback(
    (id: string) => {
      if (!layersRef.current.some((l) => l.id === id) || activeIdRef.current === id) return;
      activeIdRef.current = id;
      wandSeedRef.current = null;
      lastBrushRef.current = null;
      moveRef.current = null;
      setPolygon([]);
      const layer = layersRef.current.find((l) => l.id === id)!;
      setCategory(layer.kind);
      setLabel(layer.label);
      bumpLayers();
      refreshLayers();
    },
    [refreshLayers],
  );

  /**
   * Open another mask alongside the ones already being edited.
   *
   * A mask that will not load is dropped again rather than left open and empty: an empty
   * layer looks like a wall the user has just cleared, and saving it would wipe the
   * region it came from — the exact opposite of what opening it was for.
   */
  const openLayer = useCallback(
    async (src: ExistingMask) => {
      if (layersRef.current.some((l) => l.id === src.id)) {
        setActiveLayer(src.id);
        return;
      }
      if (layersRef.current.length >= MAX_EDIT_LAYERS) return;
      const canvas = blankCanvas();
      layersRef.current = [
        ...layersRef.current,
        {
          id: src.id,
          label: src.label,
          kind: src.kind,
          canvas,
          originalMaskUrl: src.originalMaskUrl,
          dirty: false,
        },
      ];
      const previous = activeIdRef.current;
      activeIdRef.current = src.id;
      setCategory(src.kind);
      setLabel(src.label);
      setStartFromError(null);
      bumpLayers();
      setLoadingBase(true);
      const loaded = await loadMaskInto(canvas, src);
      setLoadingBase(false);
      if (!loaded) {
        layersRef.current = layersRef.current.filter((l) => l.id !== src.id);
        activeIdRef.current = layersRef.current.some((l) => l.id === previous)
          ? previous
          : (layersRef.current[0]?.id ?? NEW_LAYER_ID);
        bumpLayers();
        setStartFromError(`Couldn't load ${src.label} — try opening it on its own.`);
      }
      refreshLayers();
    },
    [blankCanvas, loadMaskInto, setActiveLayer, refreshLayers],
  );

  /** Stop editing one of the open masks. Refuses the last one — there has to be a mask. */
  const closeLayer = useCallback(
    (id: string) => {
      const layer = layersRef.current.find((l) => l.id === id);
      if (!layer || layersRef.current.length <= 1) return;
      if (layer.dirty && !window.confirm(`Close ${layer.label} without saving the changes to it?`)) return;
      layersRef.current = layersRef.current.filter((l) => l.id !== id);
      // Its undo steps go with it, or a later Ctrl+Z would look like it did nothing.
      const withoutLayer = (stack: HistoryFrame[]) =>
        stack
          .map((f) => ({ ...f, layers: f.layers.filter((e) => e.id !== id) }))
          .filter((f) => f.layers.length > 0);
      historyRef.current = withoutLayer(historyRef.current);
      futureRef.current = withoutLayer(futureRef.current);
      syncHistCounts();
      if (activeIdRef.current === id) {
        const next = layersRef.current[0]!;
        activeIdRef.current = next.id;
        setCategory(next.kind);
        setLabel(next.label);
        wandSeedRef.current = null;
        lastBrushRef.current = null;
        setPolygon([]);
      }
      bumpLayers();
      refreshLayers();
    },
    [syncHistCounts, refreshLayers],
  );

  /**
   * Put the active mask back to what wall detection drew.
   *
   * Undoable like any other edit, and it does NOT save on its own — the point is to see
   * the original against the photo and decide, which means it has to be possible to
   * change your mind without having overwritten anything.
   */
  const restoreOriginal = useCallback(async () => {
    const layer = layersRef.current.find((l) => l.id === activeIdRef.current);
    if (!layer?.originalMaskUrl) return;
    const before = frameOf([layer.id]);
    setStartFromError(null);
    setLoadingBase(true);
    const loaded = await loadMaskInto(layer.canvas, { maskUrl: layer.originalMaskUrl });
    setLoadingBase(false);
    if (!loaded) {
      setStartFromError("Couldn't load the original mask — it may have expired. Reload the room and try again.");
      return;
    }
    // Pushed only after the load worked, so a failed restore leaves no undo step that
    // undoes nothing.
    pushFrame(before);
    wandSeedRef.current = null;
    lastBrushRef.current = null;
    setPolygon([]);
    markDirty(layer.id);
    refreshLayers();
  }, [frameOf, pushFrame, loadMaskInto, markDirty, refreshLayers]);

  // ---- aligning the masks with the photo ------------------------------------

  /**
   * Shift every open mask by the same whole number of pixels.
   *
   * All of them together, because that is the problem this solves: a mask set that is
   * right in shape but sitting a few pixels off the photo is off by the SAME few pixels
   * everywhere, and moving one wall at a time turns one misalignment into four.
   *
   * Whole pixels with smoothing off, so the translation is a copy rather than a resample
   * — nudge sixty times and the edges are exactly as crisp as they started, which is not
   * true of anything that interpolates.
   *
   * `coalesce` folds a run of arrow-key taps into one undo step; a mouse drag commits as
   * its own step.
   */
  const commitMove = useCallback(
    (dx: number, dy: number, coalesce: boolean) => {
      const ix = Math.round(dx);
      const iy = Math.round(dy);
      if (ix === 0 && iy === 0) return;
      const layers = layersRef.current;
      if (layers.length === 0) return;
      if (!coalesce || !nudgeRunRef.current) pushFrame(frameOf(layers.map((l) => l.id)));
      for (const layer of layers) {
        const canvas = layer.canvas;
        const tmp = document.createElement("canvas");
        tmp.width = canvas.width;
        tmp.height = canvas.height;
        tmp.getContext("2d")!.drawImage(canvas, 0, 0);
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(tmp, ix, iy);
        markDirty(layer.id);
      }
      // pushFrame clears the run flag, so this has to be set after it.
      nudgeRunRef.current = coalesce;
      wandSeedRef.current = null;
      lastBrushRef.current = null;
      setMoved({ x: movedRef.current.x + ix, y: movedRef.current.y + iy });
      refreshLayers();
    },
    [pushFrame, frameOf, markDirty, setMoved, refreshLayers],
  );

  /** Arrow-key nudge: one mask pixel, or ten with Shift held. */
  const nudge = useCallback(
    (dx: number, dy: number, big: boolean) => {
      const step = big ? 10 : 1;
      commitMove(dx * step, dy * step, true);
    },
    [commitMove],
  );

  // Refining existing regions: open the wall the user pressed ✎ on, once, so they start
  // from the AI's outline and fix it rather than redrawing it.
  const seededEditRef = useRef(false);
  useEffect(() => {
    if (!editTarget || seededEditRef.current) return;
    seededEditRef.current = true;
    void openLayer(editTarget);
  }, [editTarget, openLayer]);

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
      // The right button is the corner tool's delete gesture (see onContextMenu) and
      // must never also lay a point down or start a stroke.
      if (e.button === 2) return;
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

      if (pointersRef.current.size === 2) {
        abortStroke();
        // A pinch takes over from an alignment drag, and the uncommitted shift goes
        // with it rather than being applied on a gesture that became a zoom.
        moveStartRef.current = null;
        moveRef.current = null;
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

      if (!pan && tool === "move") {
        moveStartRef.current = { x: e.clientX, y: e.clientY };
        moveRef.current = { dx: 0, dy: 0 };
        return;
      }

      if (!pan && tool === "brush") {
        const n = clientToNorm(e.clientX, e.clientY);
        if (!n || n.x < 0 || n.x > 1 || n.y < 0 || n.y > 1) return;
        wandSeedRef.current = null;
        pushHistory();
        const mask = ensureMask();
        const mx = n.x * mask.width;
        const my = n.y * mask.height;
        // Shift-click continues a straight line from the last brush point — the
        // quick way to trace a straight trim run without a steady freehand hand.
        if (e.shiftKey && lastBrushRef.current) {
          paintSegment(lastBrushRef.current.x, lastBrushRef.current.y, mx, my);
        } else {
          paintSegment(mx, my, mx, my);
        }
        strokeRef.current = { x: mx, y: my };
        lastBrushRef.current = { x: mx, y: my };
        drawOverlay();
      }
    },
    [saving, view, tool, abortStroke, clientToNorm, pushHistory, ensureMask, paintSegment, drawOverlay],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      cursorRef.current = { x: e.clientX, y: e.clientY };
      shiftRef.current = e.shiftKey;

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

        if (
          down.pan
          || (down.moved && !strokeRef.current && !moveStartRef.current && tool !== "brush" && view.s > 1)
        ) {
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

      // Alignment drag: no pixels move until the pointer comes up — the overlay just
      // draws everything offset, so the shift can be judged against the photo first.
      const moveStart = moveStartRef.current;
      if (moveStart && contained) {
        moveRef.current = {
          dx: ((e.clientX - moveStart.x) * maskDims.w) / (view.s * contained.dispW),
          dy: ((e.clientY - moveStart.y) * maskDims.h) / (view.s * contained.dispH),
        };
        drawOverlay();
        return;
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
          lastBrushRef.current = { x: mx, y: my };
        }
      }
      drawOverlay();
    },
    [tool, view.s, contained, maskDims, clampView, clientToNorm, ensureMask, paintSegment, drawOverlay],
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

      if (moveStartRef.current) {
        const mv = moveRef.current;
        moveStartRef.current = null;
        moveRef.current = null;
        downRef.current = null;
        if (mv && !wasPinch) commitMove(mv.dx, mv.dy, false);
        else drawOverlay();
        return;
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
    [mode, saving, tool, wandReady, polygon, contained, view, clientToNorm, wandTap, bakePolygon, commitMove, recomputeOutline, drawOverlay, snapshotAlpha],
  );

  const onPointerLeave = useCallback(() => {
    cursorRef.current = null;
    drawOverlay();
  }, [drawOverlay]);

  /**
   * Right-click on a corner point deletes THAT point.
   *
   * Backspace already removes the last one, which is the wrong tool for the mistake
   * people actually make: the bad corner is usually three or four taps back, and undoing
   * a good run of points to reach it means tapping them all again. Hit-testing is done in
   * screen space so the target stays a comfortable size at every zoom level.
   *
   * The browser menu is suppressed for the whole canvas while the corner tool is active
   * — a context menu landing over the shape mid-outline is never what was wanted — but
   * only then, so right-click behaves normally everywhere else.
   */
  const onContextMenu = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (tool !== "poly") return;
      e.preventDefault();
      if (polygon.length === 0 || !contained) return;
      const wrap = wrapRef.current;
      if (!wrap) return;
      const rect = wrap.getBoundingClientRect();
      const x0 = view.tx + view.s * contained.offX + rect.left;
      const y0 = view.ty + view.s * contained.offY + rect.top;
      const dw = view.s * contained.dispW;
      const dh = view.s * contained.dispH;

      let hit = -1;
      let best = POINT_HIT_PX;
      polygon.forEach((pt, i) => {
        const d = Math.hypot(e.clientX - (x0 + pt.x * dw), e.clientY - (y0 + pt.y * dh));
        if (d <= best) {
          best = d;
          hit = i;
        }
      });
      if (hit === -1) return;
      setPolygon((pts) => pts.filter((_, i) => i !== hit));
    },
    [tool, polygon, contained, view],
  );

  // ---- save / close ----------------------------------------------------------

  /** Flatten one layer to an opaque white-on-black canvas at FULL photo resolution —
   *  exactly what the recolor shader and the backend expect. */
  const flatten = useCallback(
    (mask: HTMLCanvasElement): HTMLCanvasElement | null => {
      const out = document.createElement("canvas");
      out.width = imageDims.w;
      out.height = imageDims.h;
      const ctx = out.getContext("2d");
      if (!ctx) return null;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, out.width, out.height);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(mask, 0, 0, out.width, out.height);
      return out;
    },
    [imageDims],
  );

  /** The masks this session changed — the only ones save writes back. */
  const dirtyLayers = useMemo(
    () => layersRef.current.filter((l) => l.dirty),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layersRef is mutable; layerTick is the signal it changed.
    [layerTick],
  );

  /**
   * An empty mask is never saved, in either flow.
   *
   * On a new wall that would create a region with nothing in it; on an existing one it
   * would erase the wall while looking like an edit, which is what Delete is for. The
   * check is done on the pixels rather than on `hasInk` because remove-mode edits can
   * leave that flag behind by a stroke.
   */
  const handleSave = useCallback(() => {
    if (saving) return;

    if (isEditing) {
      const edits: MaskEdit[] = [];
      for (const layer of layersRef.current) {
        if (!layer.dirty) continue;
        if (!canvasHasInk(layer.canvas)) {
          setSaveError(
            `${layer.label} has nothing selected. Mark it, undo back to a shape, or close it — an empty mask would erase the wall.`,
          );
          setActiveLayer(layer.id);
          return;
        }
        const out = flatten(layer.canvas);
        if (out) edits.push({ regionId: layer.id, mask: out });
      }
      if (edits.length === 0) return;
      setSaveError(null);
      onSaveEdits(edits);
      return;
    }

    const mask = maskRef.current;
    if (!mask || !hasInk) return;
    if (!anyInk(snapshotAlpha())) {
      setHasInk(false);
      return;
    }
    const out = flatten(mask);
    if (out) onSave(out, category, label.trim() || labelForKind(category));
  }, [
    saving, isEditing, hasInk, category, label, flatten, canvasHasInk,
    setActiveLayer, onSave, onSaveEdits, snapshotAlpha,
  ]);

  const requestClose = useCallback(() => {
    const unsaved = isEditing
      ? layersRef.current.some((l) => l.dirty)
      : hasInk || polygon.length > 0;
    if (unsaved && !window.confirm(isEditing ? "Discard these mask changes?" : "Discard this wall?")) return;
    onClose();
  }, [isEditing, hasInk, polygon.length, onClose]);

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
        case "m":
          setTool("move");
          break;
        case "ArrowUp":
        case "ArrowDown":
        case "ArrowLeft":
        case "ArrowRight": {
          // Only while aligning: everywhere else the arrows have no business moving the
          // masks, and a stray press during a brush edit would be a silent shift.
          if (tool !== "move" || onControl) break;
          e.preventDefault();
          const dx = e.key === "ArrowLeft" ? -1 : e.key === "ArrowRight" ? 1 : 0;
          const dy = e.key === "ArrowUp" ? -1 : e.key === "ArrowDown" ? 1 : 0;
          nudge(dx, dy, e.shiftKey);
          break;
        }
        case "g":
          if (!onControl) completeSelection();
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
  }, [polygon.length, tool, wandAvailable, undo, redo, bakePolygon, completeSelection, nudge, requestClose, zoomCentre]);

  // ---- copy ------------------------------------------------------------------

  // Mutable refs read during render: `layerTick` is what makes React look again.
  const openLayers = useMemo(
    () => layersRef.current,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- layersRef is mutable; layerTick is the signal it changed.
    [layerTick],
  );
  const activeLayer = useMemo(
    () => openLayers.find((l) => l.id === activeIdRef.current) ?? null,
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeIdRef is mutable; layerTick is the signal it changed.
    [openLayers, layerTick],
  );
  const canOpenMore = openLayers.length < MAX_EDIT_LAYERS;

  /**
   * The alignment shift in PHOTO pixels.
   *
   * Masks are edited on a canvas capped at MASK_MAX, so on a big photo one step of the
   * arrow keys is more than one pixel of the picture. Reporting the working canvas's own
   * units would be a number nobody can check against anything; this one can be measured
   * off the photo.
   */
  const movedInPhoto = useMemo(
    () => ({
      x: Math.round((moved.x * imageDims.w) / maskDims.w),
      y: Math.round((moved.y * imageDims.h) / maskDims.h),
    }),
    [moved, imageDims, maskDims],
  );

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
          ? "Paint over the wall. Shift-click to lay a straight line — handy for trim like copings, bands and window shades."
          : "Paint over anything selected by mistake."
        : tool === "move"
          ? openLayers.length > 1
            ? `Drag to line all ${openLayers.length} masks up with the photo — arrow keys nudge a pixel, Shift for ten.`
            : "Drag to line the mask up with the photo — arrow keys nudge a pixel, Shift for ten."
          : polygon.length === 0
            ? "Tap corner points around the wall."
            : polygon.length < 3
              ? "Keep tapping corners — right-click a dot to remove it."
              : "Tap the first dot (or press Enter) to finish. Right-click any dot to remove it.";

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
    font: "500 12px/1 var(--sans)",
  });

  const body = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isEditing ? "Fix a wall's shape" : "Mark a wall"}
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
          shortcuts: W magic wand, B brush, C corners, M align, G completes the object by
          growing the selection to the rest of the same colour, X switches between add and
          remove, left and right bracket change the brush size, plus and minus zoom, 0 fits
          the photo, Control+Z undoes, Control+Y redoes, Enter finishes a corner shape,
          Backspace removes the last corner, and Escape closes this dialog. With the corners
          tool, right-clicking a corner point removes that point. With the align tool, the
          arrow keys move every open mask together by one pixel, or ten with Shift held.
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
            <span style={{ font: "600 16px/1 var(--sans)", color: "var(--fg)" }}>
              {isEditing ? (openLayers.length > 1 ? "Fix these walls" : "Fix this wall") : "Mark a wall"}
            </span>
            <Mono>
              {isEditing
                ? `${openLayers.length} of ${MAX_EDIT_LAYERS} open · editing ${activeLayer?.label ?? "the wall"}`
                : remaining === 1
                  ? "Last wall you can add"
                  : `You can add ${remaining} more walls`}
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
              font: "400 12px/1 var(--mono)",
              letterSpacing: ".22em",
              textTransform: "uppercase",
            }}
          >
            Close ✕
          </button>
        </div>

        {/* Editing: which masks are open. Marking: which wall to start from. */}
        {isEditing ? (
          <div
            className="hv-ms-layers"
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
            <Mono>Masks</Mono>
            {existing.map((m) => {
              const layer = openLayers.find((l) => l.id === m.id);
              const isOpen = Boolean(layer);
              const isActive = activeLayer?.id === m.id;
              // A mask can always be closed to make room, so the cap only blocks OPENING.
              const blocked = !isOpen && !canOpenMore;
              return (
                <span
                  key={m.id}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    borderRadius: 999,
                    border: `1px solid ${isActive ? SELECT_BLUE : isOpen ? OTHER_VIOLET : "var(--rule-strong)"}`,
                    background: isActive ? "var(--surface-soft)" : "transparent",
                    opacity: blocked ? 0.45 : 1,
                    overflow: "hidden",
                  }}
                >
                  <button
                    type="button"
                    disabled={blocked || loadingBase}
                    onClick={() => (isOpen ? setActiveLayer(m.id) : void openLayer(m))}
                    aria-pressed={isActive}
                    title={
                      blocked
                        ? `${MAX_EDIT_LAYERS} masks are already open — close one to open ${m.label}`
                        : isActive
                          ? `${m.label} — the mask the tools are editing`
                          : isOpen
                            ? `Edit ${m.label}`
                            : `Open ${m.label} as well`
                    }
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 7,
                      padding: "6px 10px",
                      border: "none",
                      background: "transparent",
                      color: isActive ? "var(--fg)" : "var(--fg-soft)",
                      cursor: blocked || loadingBase ? "not-allowed" : "pointer",
                      font: `${isActive ? 600 : 500} 12px/1 var(--sans)`,
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 9,
                        height: 9,
                        borderRadius: 2,
                        flexShrink: 0,
                        background: isActive ? SELECT_BLUE : isOpen ? OTHER_VIOLET : "transparent",
                        border: isOpen ? "none" : "1px solid var(--rule-strong)",
                      }}
                    />
                    {m.label}
                    {layer?.dirty && (
                      <span title="Changed — will be saved" style={{ color: "var(--accent-text)" }}>
                        •
                      </span>
                    )}
                  </button>
                  {isOpen && openLayers.length > 1 && (
                    <button
                      type="button"
                      onClick={() => closeLayer(m.id)}
                      aria-label={`Close ${m.label}`}
                      title={`Close ${m.label} — stop editing it`}
                      style={{
                        padding: "6px 8px 6px 2px",
                        border: "none",
                        background: "transparent",
                        color: "var(--fg-mute)",
                        cursor: "pointer",
                        font: "500 12px/1 var(--sans)",
                      }}
                    >
                      ✕
                    </button>
                  )}
                </span>
              );
            })}
            {activeLayer?.originalMaskUrl && (
              <button
                type="button"
                onClick={() => void restoreOriginal()}
                disabled={loadingBase}
                title={`Put ${activeLayer.label} back to the mask wall detection drew. You can undo it, and nothing is saved until you press save.`}
                style={{
                  marginLeft: 4,
                  padding: "6px 11px",
                  border: "1px solid var(--rule-strong)",
                  borderRadius: 999,
                  background: "transparent",
                  color: "var(--fg-soft)",
                  cursor: loadingBase ? "not-allowed" : "pointer",
                  font: "500 12px/1 var(--sans)",
                }}
              >
                ↺ Restore original
              </button>
            )}
            {startFromError && (
              <span role="alert" style={{ font: "500 12px/1.3 var(--sans)", color: REMOVE_RED }}>
                {startFromError}
              </span>
            )}
          </div>
        ) : (
          existing.length > 0 && (
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
          )
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
            <button type="button" onClick={() => setTool("poly")} aria-pressed={tool === "poly"} aria-keyshortcuts="c" title="Corners — tap around the wall, right-click a dot to remove it (C)" style={railBtn(tool === "poly")}>
              <CornersIcon />
              Corners
            </button>
            <button
              type="button"
              onClick={() => setTool("move")}
              aria-pressed={tool === "move"}
              aria-keyshortcuts="m"
              title={
                openLayers.length > 1
                  ? `Align — drag all ${openLayers.length} masks onto the photo together; arrow keys nudge (M)`
                  : "Align — drag the mask onto the photo; arrow keys nudge (M)"
              }
              style={railBtn(tool === "move")}
            >
              <MoveIcon />
              Align
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
                    font: "600 12px/1 var(--sans)",
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
              <button type="button" onClick={undo} disabled={histCounts.undo === 0} aria-label="Undo" aria-keyshortcuts="Control+Z" title="Undo (Ctrl+Z)" style={{ ...railBtn(false, histCounts.undo === 0), width: 29, height: 32, borderRadius: 6 }}>
                <UndoIcon />
              </button>
              <button type="button" onClick={redo} disabled={histCounts.redo === 0} aria-label="Redo" aria-keyshortcuts="Control+Y" title="Redo (Ctrl+Y)" style={{ ...railBtn(false, histCounts.redo === 0), width: 29, height: 32, borderRadius: 6 }}>
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
              onClick={completeSelection}
              disabled={!hasInk || !wandReady}
              aria-keyshortcuts="g"
              title={
                !wandReady
                  ? "Preparing the photo…"
                  : "Complete — grow the selection to cover the rest of the object, same colour (G). Undoable."
              }
              style={railBtn(false, !hasInk || !wandReady)}
            >
              <CompleteIcon />
              Complete
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
              onContextMenu={onContextMenu}
              style={{
                position: "absolute",
                inset: 0,
                touchAction: "none",
                cursor: tool === "brush" ? "none" : tool === "move" ? "move" : "crosshair",
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
              <span style={{ font: "500 12px/1 var(--mono)", color: "var(--fg-mute)", minWidth: 38, textAlign: "center" }}>
                {Math.round(view.s * 100)}%
              </span>
              <button type="button" onClick={() => zoomCentre(1.3)} aria-label="Zoom in" aria-keyshortcuts="+" style={zoomBtnStyle}>
                +
              </button>
              {view.s > 1 && (
                <button type="button" onClick={() => setView(FIT_VIEW)} aria-keyshortcuts="0" style={{ ...zoomBtnStyle, width: "auto", padding: "0 8px", font: "500 12px/1 var(--sans)" }}>
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
                      <span style={{ color: "var(--accent-text)", flexShrink: 0, marginTop: 1 }}>{icon}</span>
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
          {tool === "move" && (
            <span style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
              <Mono>Aligned by</Mono>
              <span style={{ font: "500 12px/1 var(--mono)", color: "var(--fg)", minWidth: 96 }}>
                {movedInPhoto.x === 0 && movedInPhoto.y === 0
                  ? "nothing yet"
                  : `${movedInPhoto.x >= 0 ? "+" : ""}${movedInPhoto.x}, ${movedInPhoto.y >= 0 ? "+" : ""}${movedInPhoto.y} px`}
              </span>
              {(moved.x !== 0 || moved.y !== 0) && (
                <button
                  type="button"
                  onClick={() => commitMove(-moved.x, -moved.y, false)}
                  title="Put the masks back where they started"
                  style={{
                    padding: "5px 10px",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    background: "transparent",
                    color: "var(--fg-soft)",
                    cursor: "pointer",
                    font: "500 12px/1 var(--sans)",
                  }}
                >
                  Recentre
                </button>
              )}
            </span>
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
          <span className="hv-ms-legend" style={{ marginLeft: "auto", font: "400 12px/1.6 var(--mono)", letterSpacing: ".08em", color: "var(--fg-mute)" }}>
            W wand · B brush · C corners · M align · X add/remove · Ctrl+Z undo · scroll zooms
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
          {/* Refining changes the SHAPE of walls that already exist; their type and name
              belong to the room and are set from the wall strip. The controls used to
              show here in both flows and silently did nothing in this one. */}
          {isEditing ? (
            <Mono style={{ color: "var(--fg-soft)" }}>
              {dirtyLayers.length === 0
                ? "No changes yet"
                : `Saving ${dirtyLayers.map((l) => l.label).join(", ")}`}
            </Mono>
          ) : (
            <>
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
            </>
          )}
          <div style={{ flex: 1 }} />
          {saveError && (
            <span role="alert" style={{ font: "500 12px/1.35 var(--sans)", color: REMOVE_RED, maxWidth: 380 }}>
              {saveError}
            </span>
          )}
          {!isEditing && !hasInk && (
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
          {(() => {
            // Editing existing regions never adds a wall, so the new-wall cap
            // (remaining) doesn't gate the save. What gates it there is having actually
            // changed something: with nothing dirty there is nothing to write back.
            const blocked = saving || (isEditing ? dirtyLayers.length === 0 : !hasInk || remaining <= 0);
            return (
              <button
                type="button"
                onClick={handleSave}
                disabled={blocked}
                style={{
                  padding: "9px 18px",
                  border: "1px solid var(--accent)",
                  borderRadius: 6,
                  background: blocked ? "transparent" : "var(--accent)",
                  color: blocked ? "var(--fg-mute)" : "var(--bg)",
                  opacity: blocked ? 0.5 : 1,
                  cursor: blocked ? "not-allowed" : "pointer",
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
                ) : isEditing ? (
                  dirtyLayers.length > 1 ? `Update ${dirtyLayers.length} walls` : "Update wall"
                ) : (
                  "Save wall"
                )}
              </button>
            );
          })()}
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
      return "Accent wall";
    case "TRIM":
      return "Trim & frames";
    case "OTHER_WALL":
    default:
      return "Wall";
  }
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

/** Sobel luminance gradient magnitude, 0..255, at the sampled resolution. */
function gradientMap(px: Uint8ClampedArray, w: number, h: number): Uint8Array {
  const lum = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const i = p * 4;
    lum[p] = (px[i]! + px[i + 1]! + px[i + 2]!) / 3;
  }
  const g = new Uint8Array(w * h);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      const gx = -lum[p - w - 1]! - 2 * lum[p - 1]! - lum[p + w - 1]!
               + lum[p - w + 1]! + 2 * lum[p + 1]! + lum[p + w + 1]!;
      const gy = -lum[p - w - 1]! - 2 * lum[p - w]! - lum[p - w + 1]!
               + lum[p + w - 1]! + 2 * lum[p + w]! + lum[p + w + 1]!;
      g[p] = Math.min(255, Math.round(Math.hypot(gx, gy) / 8));
    }
  }
  return g;
}

/**
 * Push a flood fill out onto the wall's real edge.
 *
 * The fill stops where the colour leaves the seed's tolerance, and at any real edge —
 * lens blur, JPEG, plain antialiasing — that happens partway UP the ramp rather than at
 * the top of it. Measured on a 2090px photo, the wand's boundary landed a consistent
 * 1.8px inside the strongest gradient, so every wall was masked very slightly small and
 * the render left a hairline of the old colour along each edge. (The engine's +1px edge
 * nudge exists to hide exactly that, and could not quite.)
 *
 * So climb: grow one pixel at a time into neighbours whose gradient is at least as
 * strong as the pixel they came from, which walks up the ramp and halts at its crest.
 * The gradient floor is what keeps it honest — inside a flat wall, and along a boundary
 * the user drew by hand across one, there is no ridge to climb and nothing moves.
 */
const SNAP_MAX_PX = 4;
const SNAP_MIN_GRAD = 6;
function snapToEdge(bits: Uint8Array, grad: Uint8Array, w: number, h: number): Uint8Array {
  const out = Uint8Array.from(bits);
  let front: number[] = [];
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const p = y * w + x;
      if (!out[p]) continue;
      if (out[p - 1] && out[p + 1] && out[p - w] && out[p + w]) continue;
      front.push(p);
    }
  }
  for (let step = 0; step < SNAP_MAX_PX && front.length > 0; step++) {
    const next: number[] = [];
    for (const p of front) {
      const y = (p / w) | 0;
      const x = p - y * w;
      if (x < 1 || y < 1 || x >= w - 1 || y >= h - 1) continue;
      for (const q of [p - 1, p + 1, p - w, p + w]) {
        if (out[q]) continue;
        const gq = grad[q]!;
        if (gq < SNAP_MIN_GRAD || gq < grad[p]!) continue;
        out[q] = 255;
        next.push(q);
      }
    }
    front = next;
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

function MoveIcon() {
  return (
    <svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3v18M3 12h18" />
      <path d="M12 3 9.5 5.5M12 3l2.5 2.5M12 21l-2.5-2.5M12 21l2.5-2.5" />
      <path d="M3 12l2.5-2.5M3 12l2.5 2.5M21 12l-2.5-2.5M21 12l-2.5 2.5" />
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

function CompleteIcon() {
  // Outward arrows from a centre — "grow the selection to fill the object".
  return (
    <svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
      <circle cx="12" cy="12" r="2.4" />
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
