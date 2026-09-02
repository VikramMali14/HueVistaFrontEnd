"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { loadCrossOriginImage as loadImage } from "@/lib/load-image";
import type {
  AdminProjectRow, MaskRegistration, MaskRegistrationResult, ProjectDetail,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import {
  ACCENT, IDENTITY, MAIN, MAX_MANUAL_OFFSET, MAX_MANUAL_SCALE, MIN_MANUAL_SCALE, NONE, TRIM, WHITE,
  classify, clamp, clampNode, displace, emptyLattice, latticeMoved, latticeWithinCaps,
  maxShift, resampleLattice,
  type Lattice, type Rigid,
} from "@/lib/mask-registration";

/**
 * Admin align bench: put a drifted mask back on its walls by hand.
 *
 * <p>The backend's MaskAligner already measures how a generative colour-coded mask
 * sits on the canvas and corrects it, but its search is deliberately timid — capped
 * at a few percent of the frame and discarded outright unless it beats leaving the
 * mask alone by a clear margin. That is right for a step nobody is watching, and it
 * means the runs it declines are exactly the ones a person has to finish: a facade
 * whose repaint drifted further than the search may reach, or drifted by different
 * amounts in different parts of the frame.
 *
 * <p>Two stages, in the order they actually work:
 *
 * <ol>
 *   <li><b>Whole frame.</b> Drag the mask onto the building and set its size. Most
 *       of the error is here and it takes seconds.</li>
 *   <li><b>Grid.</b> Then pull individual lattice nodes for the parts still off —
 *       the parapet that sits high while the windows below it are already right.</li>
 * </ol>
 *
 * <p>The lattice is ONE continuous mesh over the whole frame, not a per-region
 * nudge, and that is deliberate: neighbouring regions moved independently drift
 * apart, and the gap between them renders as an unpainted white seam. Interpolating
 * one field welds them.
 *
 * <p>What it edits is a REGISTRATION — where the model's drawing sits — never the
 * drawing. A mask whose shape is wrong (a wall the model missed, a window it filled
 * in) is the Mask Studio brush's job and nothing here can substitute for it.
 *
 * <p>The preview is not an approximation of what will be stored: it runs the same
 * inverse resample the backend does, off the same normalised registration, so a
 * placement that looks right here is the placement that ships.
 */

/** Longest side the mask is classified at for drawing. Fine enough that a trim
 *  strip survives, coarse enough to re-composite every pointer move. */
const LABEL_DIM = 720;

/** Longest side of the preview canvas at rest, and while a drag is in flight.
 *  The overlay is resampled per pixel in JS, so the drag figure is what keeps a
 *  node under the pointer instead of trailing it. */
const PREVIEW_DIM = 1000;
const PREVIEW_DIM_DRAGGING = 520;

/** Cells on the frame's longer side. Six matches the automatic local pass; the
 *  range is what a person can actually sit and drag. */
const MIN_CELLS = 2;
const MAX_CELLS = 12;
const DEFAULT_CELLS = 6;

/** How close (in display px) the pointer has to be to grab a node. */
const NODE_GRAB_PX = 22;

const CATS = [
  { id: MAIN, key: "main" as const, label: "Main wall", rgb: [255, 90, 74] },
  { id: ACCENT, key: "accent" as const, label: "Accent wall", rgb: [35, 197, 94] },
  { id: TRIM, key: "trim" as const, label: "Trim", rgb: [74, 125, 255] },
  { id: WHITE, key: "white" as const, label: "Off-palette", rgb: [255, 53, 214] },
];

interface Labels { data: Uint8Array; w: number; h: number }

/** Segmented rooms first (the only ones with masks), then newest. */
function forPicker(rows: AdminProjectRow[]): AdminProjectRow[] {
  return [...rows].sort((a, b) => {
    if ((a.status === "SEGMENTED") !== (b.status === "SEGMENTED")) {
      return a.status === "SEGMENTED" ? -1 : 1;
    }
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

/** How one room reads in the picker: whose it is, and where it came from. A
 *  report names a person and a shop far more often than it names a room. */
function describeOwner(p: AdminProjectRow): string {
  const who = p.ownerEmail || p.ownerName || (p.customerName ? `${p.customerName} (walk-in)` : null);
  const where = p.shopName ?? (p.accessCode ? `code ${p.accessCode}` : null);
  return [who, where].filter(Boolean).join(" · ") || "no owner on record";
}

interface MaskAlignProps {
  initial: AdminProjectRow[] | null;
  searchAction: (q: string) => Promise<{ rows?: AdminProjectRow[]; error?: string }>;
  loadAction: (projectId: string) => Promise<{ project?: ProjectDetail; error?: string }>;
  loadRegistrationAction: (
    projectId: string,
  ) => Promise<{ registration?: MaskRegistration | null; error?: string }>;
  applyAction: (
    projectId: string,
    registration: MaskRegistration,
  ) => Promise<{ result?: MaskRegistrationResult; error?: string }>;
  initialProjectId?: string;
}

export function MaskAlign({
  initial, searchAction, loadAction, loadRegistrationAction, applyAction, initialProjectId,
}: MaskAlignProps) {
  const [projects, setProjects] = useState<AdminProjectRow[] | null>(
    initial ? forPicker(initial) : null,
  );
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(
    () => initialProjectId ?? (initial ? forPicker(initial)[0]?.id ?? "" : ""),
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(
    initial ? null : "Could not load the rooms. Refresh to retry.",
  );

  const [detail, setDetail] = useState<ProjectDetail | null>(null);
  const [labels, setLabels] = useState<Labels | null>(null);
  const [canvasDims, setCanvasDims] = useState<{ w: number; h: number } | null>(null);

  const [rigid, setRigid] = useState<Rigid>(IDENTITY);
  const [lattice, setLattice] = useState<Lattice | null>(null);
  const [mode, setMode] = useState<"frame" | "grid">("frame");
  const [cellsLong, setCellsLong] = useState(DEFAULT_CELLS);
  const [activeNode, setActiveNode] = useState<number | null>(null);

  const [opacity, setOpacity] = useState(0.55);
  const [show, setShow] = useState<Record<string, boolean>>({
    main: true, accent: true, trim: true, white: true,
  });
  const [peek, setPeek] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ u: 0, v: 0 });

  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<MaskRegistrationResult | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [hadStored, setHadStored] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const draggingRef = useRef<
    | { kind: "frame"; startU: number; startV: number; fromOx: number; fromOy: number }
    | { kind: "node"; index: number; grabU: number; grabV: number; fromDu: number; fromDv: number }
    | { kind: "pan"; startX: number; startY: number; fromU: number; fromV: number }
    | null
  >(null);
  const [isDragging, setIsDragging] = useState(false);

  const search = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    try {
      const res = await searchAction(q);
      if (res.error) { setError(res.error); return; }
      const rows = forPicker(res.rows ?? []);
      setProjects(rows);
      setSelected((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
    } finally {
      setSearching(false);
    }
  }, [searchAction]);

  /** Open a room: its canvas, its raw colour-coded mask, and whatever
   *  registration somebody left on it last time. */
  const load = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setSaveError(null);
    setLabels(null);
    setDetail(null);
    setRigid(IDENTITY);
    setLattice(null);
    setActiveNode(null);
    setZoom(1);
    setPan({ u: 0, v: 0 });
    setNote("");
    setHadStored(false);
    try {
      const res = await loadAction(projectId);
      if (res.error || !res.project) throw new Error(res.error ?? "Could not open that room.");
      const project = res.project;
      setDetail(project);

      if (!project.rawMaskUrl) {
        throw new Error(
          "This room has no stored colour-coded mask, so there is nothing to re-register. " +
          "Rooms segmented before raw-mask capture shipped, and rooms whose walls were all " +
          "drawn by hand, are in this position.",
        );
      }

      // The CLEANED canvas whenever there is one: it is what the studio paints
      // and what the masks are stored against. Registering against the original
      // would line the mask up with a photo nobody looks at.
      const canvasUrl = resolveMediaUrl(project.cleanedImageUrl) ?? resolveMediaUrl(project.imageUrl);
      if (!canvasUrl) throw new Error("This room has no canvas to register against.");
      const base = await loadImage(canvasUrl);
      baseRef.current = base;
      setCanvasDims({ w: base.naturalWidth, h: base.naturalHeight });

      const maskImg = await loadImage(resolveMediaUrl(project.rawMaskUrl)!);
      setLabels(buildLabels(maskImg));

      // A lattice's node count depends on the grid it was made on, so the grid
      // follows the stored registration rather than the other way round.
      const stored = await loadRegistrationAction(projectId);
      if (stored.registration) {
        const r = stored.registration;
        setRigid({
          sx: r.scaleX || 1, sy: r.scaleY || 1,
          ox: r.offsetX || 0, oy: r.offsetY || 0,
        });
        if (r.warpCols && r.warpRows && r.warpDu && r.warpDv) {
          setLattice({
            cols: r.warpCols, rows: r.warpRows,
            du: Float64Array.from(r.warpDu), dv: Float64Array.from(r.warpDv),
          });
          setCellsLong(Math.max(r.warpCols, r.warpRows));
        }
        setNote(r.note ?? "");
        setHadStored(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that room.");
    } finally {
      setLoading(false);
    }
  }, [loadAction, loadRegistrationAction]);

  useEffect(() => {
    if (selected) void load(selected);
  }, [selected, load]);

  /** The lattice the grid mode edits, created on first use at the current
   *  density — a purely rigid registration should not carry an all-zero field
   *  the backend would resample for nothing. */
  const ensureLattice = useCallback((): Lattice => {
    if (lattice) return lattice;
    const dims = canvasDims;
    const portrait = !dims || dims.h >= dims.w;
    const long = cellsLong;
    const short = Math.max(
      MIN_CELLS,
      Math.round(long * (portrait ? (dims ? dims.w / dims.h : 0.6) : (dims ? dims.h / dims.w : 0.6))),
    );
    const next = portrait ? emptyLattice(short, long) : emptyLattice(long, short);
    setLattice(next);
    return next;
  }, [lattice, canvasDims, cellsLong]);

  // ─── rendering ──────────────────────────────────────────────────────────

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const base = baseRef.current;
    if (!canvas || !base || !labels) return;

    const target = isDragging ? PREVIEW_DIM_DRAGGING : PREVIEW_DIM;
    const k = Math.min(1, target / Math.max(base.naturalWidth, base.naturalHeight));
    const W = Math.max(1, Math.round(base.naturalWidth * k));
    const H = Math.max(1, Math.round(base.naturalHeight * k));
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Base, cropped to the visible normalised rect (this is the zoom).
    const span = 1 / zoom;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      base,
      pan.u * base.naturalWidth, pan.v * base.naturalHeight,
      span * base.naturalWidth, span * base.naturalHeight,
      0, 0, W, H,
    );

    if (!peek) {
      const img = ctx.getImageData(0, 0, W, H);
      const data = img.data;
      const { sx, sy, ox, oy } = rigid;
      const d: [number, number] = [0, 0];
      const { data: lab, w: lw, h: lh } = labels;

      for (let y = 0; y < H; y++) {
        const v0 = pan.v + ((y + 0.5) / H) * span;
        // Without a lattice every pixel in the row samples the same v, so the
        // whole inverse for this axis is one multiply outside the inner loop.
        const vFlat = 0.5 + (v0 - 0.5 - oy) / sy;
        for (let x = 0; x < W; x++) {
          const u0 = pan.u + ((x + 0.5) / W) * span;
          let u: number, v: number;
          if (lattice) {
            displace(lattice, u0, v0, d);
            u = 0.5 + (u0 - d[0] - 0.5 - ox) / sx;
            v = 0.5 + (v0 - d[1] - 0.5 - oy) / sy;
          } else {
            u = 0.5 + (u0 - 0.5 - ox) / sx;
            v = vFlat;
          }
          if (u < 0 || u >= 1 || v < 0 || v >= 1) continue;
          const lv = lab[Math.min(lh - 1, (v * lh) | 0) * lw + Math.min(lw - 1, (u * lw) | 0)]!;
          if (lv === NONE) continue;
          const cat = CATS.find((c) => c.id === lv);
          if (!cat || !show[cat.key]) continue;
          const o = (y * W + x) * 4;
          data[o] = data[o]! + (cat.rgb[0]! - data[o]!) * opacity;
          data[o + 1] = data[o + 1]! + (cat.rgb[1]! - data[o + 1]!) * opacity;
          data[o + 2] = data[o + 2]! + (cat.rgb[2]! - data[o + 2]!) * opacity;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    if (mode === "grid" && lattice && !peek) {
      drawLattice(ctx, W, H, lattice, zoom, pan, activeNode);
    }
  }, [labels, rigid, lattice, mode, opacity, show, peek, zoom, pan, isDragging, activeNode]);

  useEffect(() => { draw(); }, [draw]);

  // ─── pointer + keyboard ─────────────────────────────────────────────────

  /** Pointer position as normalised canvas coordinates, through the zoom. */
  const pointerUV = (e: React.PointerEvent<HTMLCanvasElement>): [number, number] => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const span = 1 / zoom;
    return [
      pan.u + ((e.clientX - rect.left) / rect.width) * span,
      pan.v + ((e.clientY - rect.top) / rect.height) * span,
    ];
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!labels) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const [u, v] = pointerUV(e);

    // Middle button, or space held, pans — the two conventions people arrive with.
    if (e.button === 1 || e.shiftKey) {
      draggingRef.current = { kind: "pan", startX: e.clientX, startY: e.clientY, fromU: pan.u, fromV: pan.v };
      setIsDragging(true);
      return;
    }

    if (mode === "grid") {
      const l = ensureLattice();
      const rect = e.currentTarget.getBoundingClientRect();
      const span = 1 / zoom;
      const stride = l.cols + 1;
      let best = -1, bestDist = Infinity;
      for (let j = 0; j <= l.rows; j++) {
        for (let i = 0; i <= l.cols; i++) {
          const idx = j * stride + i;
          const nx = ((i / l.cols + l.du[idx]! - pan.u) / span) * rect.width;
          const ny = ((j / l.rows + l.dv[idx]! - pan.v) / span) * rect.height;
          const dist = Math.hypot(nx - (e.clientX - rect.left), ny - (e.clientY - rect.top));
          if (dist < bestDist) { bestDist = dist; best = idx; }
        }
      }
      if (best >= 0 && bestDist <= NODE_GRAB_PX) {
        setActiveNode(best);
        draggingRef.current = {
          kind: "node", index: best, grabU: u, grabV: v,
          fromDu: l.du[best]!, fromDv: l.dv[best]!,
        };
        setIsDragging(true);
        return;
      }
      // Nowhere near a node: fall through and move the whole frame, which is
      // almost always what a drag on empty canvas means.
    }

    draggingRef.current = { kind: "frame", startU: u, startV: v, fromOx: rigid.ox, fromOy: rigid.oy };
    setIsDragging(true);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = draggingRef.current;
    if (!drag) return;

    if (drag.kind === "pan") {
      const rect = e.currentTarget.getBoundingClientRect();
      const span = 1 / zoom;
      const max = Math.max(0, 1 - span);
      setPan({
        u: Math.min(max, Math.max(0, drag.fromU - ((e.clientX - drag.startX) / rect.width) * span)),
        v: Math.min(max, Math.max(0, drag.fromV - ((e.clientY - drag.startY) / rect.height) * span)),
      });
      return;
    }

    const [u, v] = pointerUV(e);
    if (drag.kind === "frame") {
      setRigid((r) => ({
        ...r,
        ox: clamp(drag.fromOx + (u - drag.startU), -MAX_MANUAL_OFFSET, MAX_MANUAL_OFFSET),
        oy: clamp(drag.fromOy + (v - drag.startV), -MAX_MANUAL_OFFSET, MAX_MANUAL_OFFSET),
      }));
      return;
    }

    setLattice((prev) => {
      if (!prev) return prev;
      const stride = prev.cols + 1;
      const i = drag.index % stride, j = Math.floor(drag.index / stride);
      const [du, dv] = clampNode(
        prev, i, j,
        drag.fromDu + (u - drag.grabU),
        drag.fromDv + (v - drag.grabV),
      );
      const next: Lattice = { ...prev, du: Float64Array.from(prev.du), dv: Float64Array.from(prev.dv) };
      next.du[drag.index] = du;
      next.dv[drag.index] = dv;
      return next;
    });
  };

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!draggingRef.current) return;
    draggingRef.current = null;
    setIsDragging(false);
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    if (!labels) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fx = (e.clientX - rect.left) / rect.width;
    const fy = (e.clientY - rect.top) / rect.height;
    const nextZoom = clamp(zoom * (e.deltaY < 0 ? 1.15 : 1 / 1.15), 1, 12);
    // Keep whatever is under the cursor under the cursor.
    const u = pan.u + fx / zoom, v = pan.v + fy / zoom;
    const span = 1 / nextZoom;
    const max = Math.max(0, 1 - span);
    setZoom(nextZoom);
    setPan({
      u: Math.min(max, Math.max(0, u - fx * span)),
      v: Math.min(max, Math.max(0, v - fy * span)),
    });
  };

  /**
   * Arrow keys nudge by ONE canvas pixel — the reason this screen exists rather
   * than a slider. A drag gets within a few pixels; the last two are keyboard
   * work, and they are the two that decide whether paint sits on the parapet or
   * a hair above it. Shift multiplies by ten for the coarse stage.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && el.matches("input, textarea, select, button")) return;
      if (e.code === "Space") { e.preventDefault(); setPeek(true); return; }

      const dims = canvasDims;
      if (!dims) return;
      const stepU = (e.shiftKey ? 10 : 1) / dims.w;
      const stepV = (e.shiftKey ? 10 : 1) / dims.h;
      let du = 0, dv = 0;
      if (e.key === "ArrowLeft") du = -stepU;
      else if (e.key === "ArrowRight") du = stepU;
      else if (e.key === "ArrowUp") dv = -stepV;
      else if (e.key === "ArrowDown") dv = stepV;
      else return;
      e.preventDefault();

      if (mode === "grid" && lattice && activeNode !== null) {
        setLattice((prev) => {
          if (!prev) return prev;
          const stride = prev.cols + 1;
          const i = activeNode % stride, j = Math.floor(activeNode / stride);
          const [nu, nv] = clampNode(prev, i, j, prev.du[activeNode]! + du, prev.dv[activeNode]! + dv);
          const next: Lattice = { ...prev, du: Float64Array.from(prev.du), dv: Float64Array.from(prev.dv) };
          next.du[activeNode] = nu;
          next.dv[activeNode] = nv;
          return next;
        });
      } else {
        setRigid((r) => ({
          ...r,
          ox: clamp(r.ox + du, -MAX_MANUAL_OFFSET, MAX_MANUAL_OFFSET),
          oy: clamp(r.oy + dv, -MAX_MANUAL_OFFSET, MAX_MANUAL_OFFSET),
        }));
      }
    };
    const onKeyUp = (e: KeyboardEvent) => { if (e.code === "Space") setPeek(false); };
    window.addEventListener("keydown", onKey);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [mode, lattice, activeNode, canvasDims]);

  // ─── grid density ───────────────────────────────────────────────────────

  const setDensity = (long: number) => {
    setCellsLong(long);
    setActiveNode(null);
    setLattice((prev) => {
      const dims = canvasDims;
      const portrait = !dims || dims.h >= dims.w;
      const ratio = dims ? (portrait ? dims.w / dims.h : dims.h / dims.w) : 0.6;
      const short = Math.max(MIN_CELLS, Math.round(long * ratio));
      const cols = portrait ? short : long;
      const rows = portrait ? long : short;
      if (!prev) return null;
      return resampleLattice(prev, cols, rows);
    });
  };

  // ─── save ───────────────────────────────────────────────────────────────

  const dirty = rigid.sx !== 1 || rigid.sy !== 1 || rigid.ox !== 0 || rigid.oy !== 0
    || latticeMoved(lattice);

  const save = async () => {
    if (!detail || !dirty) return;
    setSaving(true);
    setSaveError(null);
    setResult(null);
    // A lattice nobody moved is not sent: it would make the backend resample
    // through a field of zeroes and file a registration that claims a local
    // correction was needed when none was.
    const useWarp = latticeMoved(lattice);
    // Dragging cannot reach a lattice the server refuses, but a fine grid whose
    // neighbours are all at their caps can be argued into one. Say so here rather
    // than let the server say it after the work is done.
    if (useWarp && lattice && !latticeWithinCaps(lattice)) {
      setSaveError(
        "Some nodes have been pulled further than a registration may carry. Ease the " +
        "steepest ones back, or spread the same correction over more cells.",
      );
      setSaving(false);
      return;
    }
    const payload: MaskRegistration = {
      scaleX: rigid.sx, scaleY: rigid.sy, offsetX: rigid.ox, offsetY: rigid.oy,
      note: note.trim() || null,
      ...(useWarp && lattice
        ? {
            warpCols: lattice.cols,
            warpRows: lattice.rows,
            warpDu: Array.from(lattice.du),
            warpDv: Array.from(lattice.dv),
          }
        : {}),
    };
    try {
      const res = await applyAction(detail.id, payload);
      if (res.error || !res.result) {
        setSaveError(res.error ?? "Could not apply the registration.");
        return;
      }
      setResult(res.result);
      setHadStored(true);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setRigid(IDENTITY);
    setLattice(null);
    setActiveNode(null);
    setResult(null);
    setSaveError(null);
  };

  const scaleField = (axis: "sx" | "sy", label: string) => (
    <div className="field" key={axis}>
      <label className="field-label" htmlFor={`ma-${axis}`}>
        {label} <span style={{ font: "400 11px/1 var(--mono)", color: "var(--ink-soft)" }}>
          {rigid[axis].toFixed(3)}
        </span>
      </label>
      <input
        id={`ma-${axis}`}
        type="range"
        min={-200}
        max={200}
        value={Math.round((rigid[axis] - 1) * 1000)}
        onChange={(e) => setRigid((r) => ({
          ...r,
          [axis]: clamp(1 + Number(e.target.value) / 1000, MIN_MANUAL_SCALE, MAX_MANUAL_SCALE),
        }))}
        style={{ width: "100%" }}
      />
    </div>
  );

  const rows = projects ?? [];

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 20 }}>
        <form
          className="field"
          style={{ minWidth: 220, flex: "0 1 300px" }}
          onSubmit={(e) => { e.preventDefault(); void search(query); }}
        >
          <label className="field-label" htmlFor="ma-search">Find a room</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="ma-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Room, owner, e-mail, shop, code"
              disabled={searching || loading}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button type="submit" variant="ghost" disabled={searching || loading}>
              {searching ? "…" : "Search"}
            </Button>
          </div>
        </form>

        <div className="field" style={{ minWidth: 260, flex: "1 1 340px" }}>
          <label className="field-label" htmlFor="ma-room">Room</label>
          <select
            id="ma-room"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={loading || rows.length === 0}
            style={{ width: "100%" }}
          >
            {rows.length === 0 && <option value="">No rooms found</option>}
            {rows.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {describeOwner(p)}{p.status === "SEGMENTED" ? "" : ` · ${p.status}`}
              </option>
            ))}
          </select>
        </div>
      </div>

      {error && (
        <p role="alert" style={{ marginTop: 16, color: "var(--danger, #ff6459)", maxWidth: "68ch" }}>
          {error}
        </p>
      )}

      {loading && (
        <p style={{ marginTop: 24, display: "flex", alignItems: "center", gap: 10 }}>
          <Spinner /> Opening the room…
        </p>
      )}

      {!loading && labels && (
        <div
          style={{
            marginTop: 24,
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) 300px",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div>
            <div
              style={{
                display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10,
                marginBottom: 10, font: "500 12px/1.4 var(--mono)", color: "var(--ink-soft)",
              }}
            >
              <div style={{ display: "flex", gap: 0, border: "1px solid var(--line)", borderRadius: 4, overflow: "hidden" }}>
                {(["frame", "grid"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => { setMode(m); if (m === "grid") ensureLattice(); }}
                    aria-pressed={mode === m}
                    style={{
                      appearance: "none", border: 0, cursor: "pointer",
                      padding: "6px 12px", font: "inherit",
                      background: mode === m ? "var(--accent-soft)" : "transparent",
                      color: mode === m ? "var(--bg, #12161b)" : "var(--ink-soft)",
                      fontWeight: mode === m ? 600 : 400,
                    }}
                  >
                    {m === "frame" ? "Whole frame" : "Grid"}
                  </button>
                ))}
              </div>
              <span>zoom {zoom.toFixed(1)}×</span>
              <Button type="button" variant="ghost" onClick={() => { setZoom(1); setPan({ u: 0, v: 0 }); }}>
                Fit
              </Button>
              <span style={{ marginLeft: "auto" }}>
                hold <b>space</b> to hide the mask · <b>shift-drag</b> to pan · <b>arrows</b> nudge 1px
              </span>
            </div>

            <canvas
              ref={canvasRef}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              onWheel={onWheel}
              style={{
                width: "100%", display: "block", borderRadius: 6,
                background: "#101418", touchAction: "none",
                cursor: draggingRef.current ? "grabbing" : mode === "grid" ? "crosshair" : "grab",
              }}
            />

            <p style={{ marginTop: 10, font: "400 12px/1.6 var(--mono)", color: "var(--ink-soft)" }}>
              canvas {canvasDims?.w}×{canvasDims?.h} · scale {rigid.sx.toFixed(3)}×{rigid.sy.toFixed(3)} ·
              {" "}offset {fmt(rigid.ox)},{fmt(rigid.oy)}
              {latticeMoved(lattice) && lattice
                ? ` · lattice ${lattice.cols}×${lattice.rows}, up to ${(maxShift(lattice) * 100).toFixed(2)}% of frame`
                : " · no local field"}
              {canvasDims && (
                <> · <span>{Math.round(rigid.ox * canvasDims.w)}, {Math.round(rigid.oy * canvasDims.h)} px</span></>
              )}
            </p>
          </div>

          <aside style={{ display: "flex", flexDirection: "column", gap: 18 }}>
            <section>
              <h2 className="field-label" style={{ marginBottom: 8 }}>Overlay</h2>
              <div className="field">
                <label className="field-label" htmlFor="ma-opacity">
                  Opacity <span style={{ font: "400 11px/1 var(--mono)" }}>{opacity.toFixed(2)}</span>
                </label>
                <input
                  id="ma-opacity" type="range" min={0} max={100}
                  value={Math.round(opacity * 100)}
                  onChange={(e) => setOpacity(Number(e.target.value) / 100)}
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
                {CATS.map((c) => (
                  <label key={c.key} style={{ display: "flex", alignItems: "center", gap: 9, font: "400 12px/1 var(--sans)" }}>
                    <input
                      type="checkbox"
                      checked={show[c.key]}
                      onChange={(e) => setShow((s) => ({ ...s, [c.key]: e.target.checked }))}
                    />
                    <span style={{
                      width: 12, height: 12, borderRadius: 2,
                      background: `rgb(${c.rgb.join(",")})`,
                    }} />
                    {c.label}
                  </label>
                ))}
              </div>
            </section>

            <section>
              <h2 className="field-label" style={{ marginBottom: 8 }}>Whole frame</h2>
              {scaleField("sx", "Scale X")}
              {scaleField("sy", "Scale Y")}
              <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", marginTop: 6 }}>
                Drag the picture to move the mask. Most of the drift is here — set this
                first, then switch to the grid for what is still off.
              </p>
            </section>

            <section>
              <h2 className="field-label" style={{ marginBottom: 8 }}>Grid</h2>
              <div className="field">
                <label className="field-label" htmlFor="ma-cells">
                  Cells on the long side <span style={{ font: "400 11px/1 var(--mono)" }}>{cellsLong}</span>
                </label>
                <input
                  id="ma-cells" type="range" min={MIN_CELLS} max={MAX_CELLS}
                  value={cellsLong}
                  onChange={(e) => setDensity(Number(e.target.value))}
                  style={{ width: "100%" }}
                />
              </div>
              <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)" }}>
                Coarse moves smoothly and cannot fix one surface on its own; fine is
                precise and slower to place. Changing this keeps the work already done —
                the field is re-sampled onto the new grid.
              </p>
              {lattice && (
                <p style={{ font: "400 11.5px/1.5 var(--mono)", color: "var(--ink-soft)", marginTop: 6 }}>
                  {activeNode === null
                    ? "No node selected — click one, then use the arrow keys."
                    : `node ${activeNode % (lattice.cols + 1)},${Math.floor(activeNode / (lattice.cols + 1))} · ` +
                      `${fmt(lattice.du[activeNode] ?? 0)},${fmt(lattice.dv[activeNode] ?? 0)}`}
                </p>
              )}
            </section>

            <section>
              <h2 className="field-label" style={{ marginBottom: 8 }}>Apply</h2>
              <div className="field">
                <label className="field-label" htmlFor="ma-note">What you saw</label>
                <input
                  id="ma-note" type="text" value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="parapet 2% high, boundary wall 3% low"
                  style={{ width: "100%" }}
                />
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
                <Button type="button" onClick={() => void save()} disabled={!dirty || saving}>
                  {saving ? "Applying…" : "Apply to this room"}
                </Button>
                <Button type="button" variant="ghost" onClick={reset} disabled={!dirty || saving}>
                  Reset
                </Button>
              </div>
              <p style={{ font: "400 11.5px/1.5 var(--sans)", color: "var(--ink-soft)", marginTop: 8 }}>
                Re-lands every detected wall at this registration. Hand-drawn walls are
                left alone, colours and labels survive, and nothing here spends a credit.
                The first apply files each mask as its original, so Restore original still
                works.
                {hadStored && " This room already carries a registration — applying replaces it."}
              </p>

              {saveError && (
                <p role="alert" style={{ marginTop: 10, color: "var(--danger, #ff6459)", font: "400 12px/1.5 var(--sans)" }}>
                  {saveError}
                </p>
              )}
              {result && (
                <div style={{ marginTop: 10, font: "400 12px/1.6 var(--mono)", color: "var(--ink-soft)" }}>
                  <div style={{ color: "var(--accent-soft)" }}>
                    moved: {result.moved.join(", ") || "nothing"}
                  </div>
                  {result.skipped.length > 0 && <div>skipped: {result.skipped.join(", ")}</div>}
                  <div>written at {result.canvasWidth}×{result.canvasHeight}</div>
                </div>
              )}
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

const fmt = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(4)}`;

/**
 * Classifies the colour-coded mask once, nearest-neighbour.
 *
 * NEVER a smooth downsample: a bilinear shrink of a colour-block image invents
 * mixed colours along every boundary — magenta where red meets blue — and
 * classify() reads those as a category of their own. The backend samples this
 * image the same way for the same reason.
 */
function buildLabels(img: HTMLImageElement): Labels {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const k = Math.min(1, LABEL_DIM / Math.max(iw, ih));
  const w = Math.max(1, Math.round(iw * k));
  const h = Math.max(1, Math.round(ih * k));

  const full = document.createElement("canvas");
  full.width = iw; full.height = ih;
  const fx = full.getContext("2d", { willReadFrequently: true })!;
  fx.imageSmoothingEnabled = false;
  fx.drawImage(img, 0, 0);
  const px = fx.getImageData(0, 0, iw, ih).data;

  const data = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = Math.min(ih - 1, Math.floor(((y + 0.5) * ih) / h));
    for (let x = 0; x < w; x++) {
      const sx = Math.min(iw - 1, Math.floor(((x + 0.5) * iw) / w));
      const o = (sy * iw + sx) * 4;
      data[y * w + x] = classify(px[o]!, px[o + 1]!, px[o + 2]!);
    }
  }
  return { data, w, h };
}

/** The lattice on top of the picture: cell edges where the mask now sits, and
 *  a handle per node. A moved node is filled so the field's shape reads at a
 *  glance rather than needing every handle hovered. */
function drawLattice(
ctx: CanvasRenderingContext2D, W: number, H: number, l: Lattice,
  zoom: number, pan: { u: number; v: number }, activeNode: number | null,
) {
  const span = 1 / zoom;
  const px = (u: number) => ((u - pan.u) / span) * W;
  const py = (v: number) => ((v - pan.v) / span) * H;
  const stride = l.cols + 1;
  const nodeU = (i: number, j: number) => i / l.cols + l.du[j * stride + i]!;
  const nodeV = (i: number, j: number) => j / l.rows + l.dv[j * stride + i]!;

  ctx.save();
  ctx.lineWidth = 1;
  ctx.strokeStyle = "rgba(255,255,255,0.42)";
  for (let j = 0; j <= l.rows; j++) {
    ctx.beginPath();
    for (let i = 0; i <= l.cols; i++) {
      const x = px(nodeU(i, j)), y = py(nodeV(i, j));
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  for (let i = 0; i <= l.cols; i++) {
    ctx.beginPath();
    for (let j = 0; j <= l.rows; j++) {
      const x = px(nodeU(i, j)), y = py(nodeV(i, j));
      if (j === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  for (let j = 0; j <= l.rows; j++) {
    for (let i = 0; i <= l.cols; i++) {
      const idx = j * stride + i;
      const moved = Math.hypot(l.du[idx]!, l.dv[idx]!) > 1e-6;
      const x = px(nodeU(i, j)), y = py(nodeV(i, j));
      ctx.beginPath();
      ctx.arc(x, y, idx === activeNode ? 7 : 5, 0, Math.PI * 2);
      ctx.fillStyle = idx === activeNode ? "#ffd166"
        : moved ? "rgba(255,209,102,0.85)" : "rgba(20,24,30,0.6)";
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = "rgba(255,255,255,0.9)";
      ctx.stroke();
    }
  }
ctx.restore();
}
