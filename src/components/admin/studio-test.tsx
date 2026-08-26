"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveMediaUrl } from "@/lib/media";
import { loadCrossOriginImage as loadImage } from "@/lib/load-image";
import { hexToRgb01, Recolor, regionMeanLuma, type RecolorEngine, type RegionPaint } from "@/lib/webgl-recolor";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import { SOFT_EDGE_FEATHER_PX } from "@/lib/recolor-engine";
import { lrvCorrectedRgb01 } from "@/lib/color-science";
import type { AdminProjectRow, PaintShade, ProjectDetail, RegionCategory } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";

/**
 * Admin studio bench: the studio's paint step, taken apart.
 *
 * The studio answers "does this colour suit this room". This answers the question
 * behind it — "is the paint landing where and how it should" — and the two need
 * different screens, because the studio deliberately hides everything this one is
 * for. It opens ANY room on the platform, paints its stored masks through the SAME
 * recolour engine the studio runs (WebGL2, Canvas 2D fallback), and puts the result
 * against the untouched canvas in one frame so the difference is the only thing
 * moving.
 *
 * Two things here that the studio does not offer, and the reasons they are worth a
 * separate screen:
 *
 *  - The canvas is switchable. The studio always paints the cleaned photo when there
 *    is one; here you can put the same colour on the ORIGINAL and see the clean-up's
 *    contribution, which is otherwise invisible after the fact.
 *  - The engine's knobs are on the surface. Shadow preservation, the edge nudge and
 *    soft edges are compiled-in constants in the studio (SHADOW_STRENGTH, EDGE_NUDGE_PX,
 *    SOFT_EDGE_ON); every one is a judgement call somebody has to be able to re-check
 *    against a real room before changing it for everyone.
 *
 * Read-only, like the mask viewer beside it: nothing here writes to a project, spends
 * a credit or touches the shade a customer chose. Rooms and detail arrive through
 * server actions because the BFF's allow-list deliberately does not carry `api/admin`.
 */

/** The studio's own defaults, so a knob moved off one is visibly off the product. */
const STUDIO_SHADOW_STRENGTH = 0.85;
const STUDIO_EDGE_NUDGE_PX = 1;
const STUDIO_SOFT_EDGE = false;

/** Colour a region starts on, by what the region is — the studio's opening picks. */
const DEFAULT_HEX: Record<RegionCategory, string> = {
  MAIN_WALL: "#D8CDBE",
  ACCENT_WALL: "#7C8C7A",
  OTHER_WALL: "#D8CDBE",
  TRIM: "#F2EFE7",
  MANUAL: "#C9B79C",
};

type CanvasSource = "cleaned" | "original";
type CompareMode = "slider" | "split" | "painted" | "clean";

/** One paintable surface on the bench: the stored mask, and what is on it now. */
interface Surface {
  id: string;
  label: string;
  category: RegionCategory;
  maskUrl: string;
  manual: boolean;
  /** Off = the mask is left unpainted, so one wall can be judged on its own. */
  applied: boolean;
  hex: string;
  /** Set when the colour came from the catalogue: its LRV corrects the hex. */
  shade: PaintShade | null;
}

/** Segmented rooms first (the only ones with masks), then newest. */
function forPicker(rows: AdminProjectRow[]): AdminProjectRow[] {
  return [...rows].sort((a, b) => {
    if ((a.status === "SEGMENTED") !== (b.status === "SEGMENTED")) {
      return a.status === "SEGMENTED" ? -1 : 1;
    }
    return (b.updatedAt ?? "").localeCompare(a.updatedAt ?? "");
  });
}

/** How one room reads in the picker: whose it is, then what its run produced. */
function describeOwner(p: AdminProjectRow): string {
  const who = p.ownerEmail || p.ownerName || (p.customerName ? `${p.customerName} (walk-in)` : null);
  const where = p.shopName ?? (p.accessCode ? `code ${p.accessCode}` : null);
  return [who, where].filter(Boolean).join(" · ") || "no owner on record";
}

/** #rgb / #rrggbb, with or without the hash — what a hex field may accept. */
function normaliseHex(raw: string): string | null {
  const h = raw.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{3}$/.test(h) && !/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return `#${full.toUpperCase()}`;
}

interface StudioTestProps {
  /** The first page of rooms, fetched on the server. Null means the fetch FAILED —
   *  distinct from an empty list, which means the platform genuinely has none. */
  initial: AdminProjectRow[] | null;
  /** Re-runs the platform-wide search. */
  searchAction: (q: string) => Promise<{ rows?: AdminProjectRow[]; error?: string }>;
  /** Opens one room's full detail, whoever owns it. */
  loadAction: (projectId: string) => Promise<{ project?: ProjectDetail; error?: string }>;
  /** The live catalogue, for painting a region the colour a customer would get. */
  shades: ReadonlyArray<PaintShade>;
  /** Room to select on mount — set when arriving from the mask viewer or a report. */
  initialProjectId?: string;
}

export function StudioTest({ initial, searchAction, loadAction, shades, initialProjectId }: StudioTestProps) {
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
  const [notes, setNotes] = useState<string[]>([]);

  const [surfaces, setSurfaces] = useState<Surface[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [canvasSource, setCanvasSource] = useState<CanvasSource>("cleaned");
  const [hasCleaned, setHasCleaned] = useState(false);
  const [baseUrl, setBaseUrl] = useState<string | null>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [meta, setMeta] = useState<string | null>(null);
  /** Bumped by every completed load. The effect below keys off this rather than
   *  the surface count, which does not move for a room with no masks at all —
   *  and such a room still has a canvas worth putting on screen. */
  const [generation, setGeneration] = useState(0);

  const [compare, setCompare] = useState<CompareMode>("slider");
  const [sliderPos, setSliderPos] = useState(50);

  const [preserve, setPreserve] = useState(STUDIO_SHADOW_STRENGTH);
  const [edgeNudge, setEdgeNudge] = useState(STUDIO_EDGE_NUDGE_PX);
  const [softEdges, setSoftEdges] = useState(STUDIO_SOFT_EDGE);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RecolorEngine | null>(null);
  // 0 = try WebGL2; 1 = the Canvas 2D fallback, on a freshly mounted canvas.
  const [engineEpoch, setEngineEpoch] = useState(0);
  const [basicPreview, setBasicPreview] = useState(false);
  /** Both canvases, kept so switching source never re-fetches. */
  const cleanedRef = useRef<HTMLImageElement | null>(null);
  const originalRef = useRef<HTMLImageElement | null>(null);
  const maskCacheRef = useRef<Map<string, Promise<HTMLImageElement>>>(new Map());
  /** Region mean luminance, per surface AND per canvas — the two differ, which is
   *  the whole reason the canvas is switchable here. */
  const lumaRef = useRef<Map<string, number>>(new Map());

  const active = surfaces.find((s) => s.id === activeId) ?? null;

  // ---- engine ---------------------------------------------------------------
  // Mirrors the studio exactly: WebGL2 first, and a canvas remount before the
  // 2D fallback, because the failed attempt may have claimed the first one.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      engineRef.current = engineEpoch === 0 ? new Recolor(canvas) : new Canvas2DRecolor(canvas);
      if (engineEpoch !== 0) setBasicPreview(true);
    } catch (err) {
      if (engineEpoch === 0) {
        setEngineEpoch(1);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, [engineEpoch]);

  // Hand the chosen canvas to the engine. Kept separate from the load below so
  // flipping cleaned/original repaints from memory instead of re-fetching.
  useEffect(() => {
    const rc = engineRef.current;
    const img = canvasSource === "cleaned" ? cleanedRef.current : originalRef.current;
    if (!rc || !img) return;
    rc.setImage(img);
    setDims({ w: img.naturalWidth, h: img.naturalHeight });
    setBaseUrl(img.src);
    // Luminance is measured against the canvas in play, so it does not survive
    // the switch.
    lumaRef.current.clear();
  }, [canvasSource, engineEpoch, generation]);

  const loadMask = useCallback((url: string) => {
    const cache = maskCacheRef.current;
    const cached = cache.get(url);
    if (cached) return cached;
    const promise = loadImage(url);
    cache.set(url, promise);
    promise.catch(() => cache.delete(url));
    return promise;
  }, []);

  // Composite every applied surface over the canvas in one frame — the same call
  // the studio makes, with the same arguments, so what shows here is what ships.
  useEffect(() => {
    const rc = engineRef.current;
    const base = canvasSource === "cleaned" ? cleanedRef.current : originalRef.current;
    if (!rc || !base) return;
    let cancelled = false;

    rc.setEdgeOffset?.(edgeNudge);
    rc.setMaskFeather?.(softEdges ? SOFT_EDGE_FEATHER_PX : 0);
    // The studio renders at the photograph's own exposure and so does the bench:
    // a wall judged under a gamma lift is not the wall that gets painted.
    rc.setBrightness?.(1);

    (async () => {
      if (compare === "clean") {
        rc.renderBase();
        return;
      }
      const applied = surfaces.filter((s) => s.applied);
      const masks = await Promise.all(
        applied.map(async (s) => {
          try {
            return await loadMask(s.maskUrl);
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      const paints: RegionPaint[] = [];
      for (let i = 0; i < applied.length; i++) {
        const s = applied[i]!;
        const mask = masks[i];
        if (!mask) continue;
        let baseL = 0;
        if (preserve > 0) {
          const key = `${canvasSource}:${s.id}`;
          const cached = lumaRef.current.get(key);
          if (cached !== undefined) {
            baseL = cached;
          } else {
            baseL = regionMeanLuma(base, mask);
            lumaRef.current.set(key, baseL);
          }
        }
        paints.push({
          // Catalogue shades paint at their MEASURED brightness (hue with the
          // luminance corrected to the shade's LRV); a raw hex paints unchanged.
          target: s.shade ? lrvCorrectedRgb01(s.hex, s.shade.lrv) : hexToRgb01(s.hex),
          mask,
          preserve,
          baseL,
          // Scene-light anchoring belongs to the CLEANED canvas alone: only there
          // were the walls repainted white, which is what makes the photo an
          // illumination map. On the original it would double-count the old paint.
          anchor: canvasSource === "cleaned",
        });
      }
      if (cancelled) return;
      rc.renderRegions(paints);
    })();

    return () => {
      cancelled = true;
    };
  }, [surfaces, compare, canvasSource, preserve, edgeNudge, softEdges, loadMask, engineEpoch, generation]);

  // ---- picker ---------------------------------------------------------------
  const search = useCallback(async (q: string) => {
    setSearching(true);
    setError(null);
    try {
      const res = await searchAction(q);
      if (res.error) {
        setError(res.error);
        return;
      }
      const rows = forPicker(res.rows ?? []);
      setProjects(rows);
      setSelected((prev) => (rows.some((r) => r.id === prev) ? prev : rows[0]?.id ?? ""));
    } finally {
      setSearching(false);
    }
  }, [searchAction]);

  const load = useCallback(async (projectId: string) => {
    setLoading(true);
    setError(null);
    setNotes([]);
    setSurfaces([]);
    setMeta(null);
    maskCacheRef.current.clear();
    lumaRef.current.clear();
    try {
      const res = await loadAction(projectId);
      if (res.error || !res.project) {
        throw new Error(res.error ?? "Could not open that room.");
      }
      const detail: ProjectDetail = res.project;
      const warn: string[] = [];

      const originalUrl = resolveMediaUrl(detail.imageUrl);
      if (!originalUrl) throw new Error("That room has no photo to paint.");
      const original = await loadImage(originalUrl);
      originalRef.current = original;

      let cleaned: HTMLImageElement | null = null;
      if (detail.cleanedImageUrl) {
        try {
          cleaned = await loadImage(resolveMediaUrl(detail.cleanedImageUrl)!);
        } catch {
          warn.push("The cleaned canvas failed to load — the bench is on the original photo.");
        }
      } else {
        warn.push(
          "This room has no cleaned canvas: the clean-up either never ran or produced " +
          "nothing, so its masks sit on the original photo. Scene-light anchoring is off " +
          "for it, which is what the studio does too.",
        );
      }
      cleanedRef.current = cleaned;
      setHasCleaned(Boolean(cleaned));
      setCanvasSource(cleaned ? "cleaned" : "original");

      const built: Surface[] = detail.regions
        .filter((r) => r.maskUrl)
        .map((r) => {
          const hex = r.appliedHexCode ?? DEFAULT_HEX[r.category] ?? DEFAULT_HEX.MAIN_WALL;
          return {
            id: String(r.id),
            label: r.label || r.category,
            category: r.category,
            maskUrl: resolveMediaUrl(r.maskUrl)!,
            manual: Boolean(r.manual),
            applied: true,
            hex,
            // The room's own shade, when the catalogue still carries that code —
            // so a room reopens on the colour it was left on, LRV correction and
            // all, rather than on a lookalike hex.
            shade: shades.find((s) => s.code === r.appliedShadeCode) ?? null,
          };
        });

      if (built.length === 0) {
        warn.push(
          "No stored masks on this room, so there is nothing to paint. Rooms marked " +
          "\"no regions\" in the picker are either mid-run, failed, or waiting for " +
          "hand-marked walls.",
        );
      }

      const sizeSrc = cleaned ?? original;
      setMeta(
        `canvas ${sizeSrc.naturalWidth}×${sizeSrc.naturalHeight} · ${built.length} mask${built.length === 1 ? "" : "s"}` +
        `${detail.maskMode === "MANUAL" ? " · hand-marked" : ""}` +
        `${detail.cleanModel ? ` · pinned to clean ${detail.cleanModel}` : ""}` +
        `${detail.maskModel ? `, mask ${detail.maskModel}` : ""}`,
      );
      setSurfaces(built);
      setActiveId(built[0]?.id ?? "");
      setNotes(warn);
      setGeneration((g) => g + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not open that room.");
    } finally {
      setLoading(false);
    }
  }, [loadAction, shades]);

  const patch = useCallback((id: string, next: Partial<Surface>) => {
    setSurfaces((prev) => prev.map((s) => (s.id === id ? { ...s, ...next } : s)));
  }, []);

  const painted = surfaces.filter((s) => s.applied).length;
  const opened = Boolean(baseUrl);

  return (
    <div style={{ marginTop: 32 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", gap: 20 }}>
        <form
          className="field"
          style={{ minWidth: 220, flex: "0 1 300px" }}
          onSubmit={(e) => {
            e.preventDefault();
            void search(query);
          }}
        >
          <label className="field-label" htmlFor="st-search">Find a room</label>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              id="st-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Room, owner, e-mail, shop, code"
              disabled={searching || loading}
              style={{ flex: 1, minWidth: 0 }}
            />
            <Button type="submit" variant="ghost" size="sm" disabled={searching || loading}>
              {searching ? <Spinner size={14} color="currentColor" decorative /> : "Search"}
            </Button>
          </div>
        </form>
        <div className="field" style={{ minWidth: 280, flex: "1 1 420px" }}>
          <label className="field-label" htmlFor="st-project">
            Room {projects ? `(${projects.length})` : ""}
          </label>
          <select
            id="st-project"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            disabled={!projects || loading || searching}
          >
            {!projects && <option value="">Rooms unavailable</option>}
            {projects?.length === 0 && (
              <option value="">{query ? "Nothing matched that search" : "No rooms yet"}</option>
            )}
            {projects?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} — {describeOwner(p)} · {p.status.toLowerCase()}
                {p.regionCount ? ` · ${p.regionCount} regions` : " · no regions"}
                {p.maskMode === "MANUAL" ? " · manual" : ""}
                {p.hasCleanedImage ? "" : " · not cleaned"}
              </option>
            ))}
          </select>
        </div>
        <Button
          type="button"
          variant="brass"
          onClick={() => selected && load(selected)}
          disabled={!selected || loading}
          style={{ marginBottom: 2 }}
        >
          {loading
            ? <><Spinner size={14} color="currentColor" decorative /> Opening…</>
            : <>Open on the bench <span className="arr">→</span></>}
        </Button>
      </div>

      {error && <div className="field-error" role="alert" style={{ marginTop: 20 }}>{error}</div>}
      {notes.map((n) => (
        <div key={n} role="note" style={NOTE_STYLE}>{n}</div>
      ))}
      {basicPreview && (
        <div role="note" style={NOTE_STYLE}>
          This browser has no WebGL2, so the bench is running the Canvas 2D fallback —
          the same one the studio drops to. It approximates the shading, so judge the
          engine&rsquo;s fidelity somewhere else; placement and masking are still exact.
        </div>
      )}

      {/* Rendered even before a room is open, and HIDDEN rather than unmounted: the
          engine binds to this canvas on mount and a WebGL2 context is not cheap to
          rebuild, so it outlives every room opened on it. */}
      <div
        style={{
          display: opened ? "flex" : "none",
          flexWrap: "wrap",
          gap: 28,
          marginTop: 28,
          alignItems: "flex-start",
        }}
      >
        {/* ---- the viewport ---- */}
        <div style={{ flex: "1 1 460px", minWidth: 300 }}>
          <Viewport
            canvasRef={canvasRef}
            engineEpoch={engineEpoch}
            baseUrl={baseUrl}
            dims={dims}
            mode={compare}
            pos={sliderPos}
            onPos={setSliderPos}
            painted={painted}
          />
          {meta && <div style={META_STYLE}>{meta}</div>}

          <div className="field" style={{ marginTop: 16 }}>
            <span className="field-label">Compare</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 6 }}>
              {COMPARE_MODES.map((m) => (
                <label key={m.id} style={RADIO_STYLE}>
                  <input
                    type="radio"
                    name="st-compare"
                    checked={compare === m.id}
                    onChange={() => setCompare(m.id)}
                  />
                  {m.label}
                </label>
              ))}
            </div>
            <p style={{ ...HINT_STYLE, marginTop: 8 }}>
              {COMPARE_MODES.find((m) => m.id === compare)?.hint}
            </p>
          </div>
        </div>

        {/* ---- the controls ---- */}
        <div style={{ flex: "0 1 340px", minWidth: 280 }}>
          <div className="field" style={{ marginBottom: 22 }}>
            <span className="field-label">Canvas</span>
            <div style={{ display: "flex", gap: 14, marginTop: 6 }}>
              {(["cleaned", "original"] as const).map((src) => (
                (src !== "cleaned" || hasCleaned) && (
                  <label key={src} style={RADIO_STYLE}>
                    <input
                      type="radio"
                      name="st-canvas"
                      checked={canvasSource === src}
                      onChange={() => setCanvasSource(src)}
                    />
                    {src === "cleaned" ? "Cleaned" : "Original photo"}
                  </label>
                )
              ))}
            </div>
            <p style={{ ...HINT_STYLE, marginTop: 8 }}>
              The studio always paints the cleaned canvas when there is one. Putting the
              same colour on the original shows what the clean-up contributed — and, on a
              room somebody reported, whether the paint is landing badly because of the
              mask or because of the canvas under it.
            </p>
          </div>

          <div style={{ marginBottom: 22 }}>
            <div style={GROUP_TITLE_STYLE}>Surfaces</div>
            <p style={{ ...HINT_STYLE, marginBottom: 10 }}>
              Every stored mask on this room. Untick one to leave it unpainted and judge
              a wall on its own.
            </p>
            {surfaces.map((s) => {
              const isActive = s.id === activeId;
              return (
                <div
                  key={s.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 8px",
                    marginBottom: 4,
                    borderRadius: "var(--radius)",
                    border: `1px solid ${isActive ? "var(--accent-soft)" : "transparent"}`,
                    background: isActive ? "var(--surface-soft)" : "transparent",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={s.applied}
                    aria-label={`Paint ${s.label}`}
                    onChange={(e) => patch(s.id, { applied: e.target.checked })}
                    style={{ flexShrink: 0 }}
                  />
                  <button
                    type="button"
                    onClick={() => setActiveId(s.id)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      background: "none",
                      border: "none",
                      padding: 0,
                      cursor: "pointer",
                      textAlign: "left",
                      color: "inherit",
                    }}
                  >
                    <span
                      aria-hidden
                      style={{
                        width: 30,
                        height: 30,
                        borderRadius: 5,
                        background: s.hex,
                        border: "1px solid var(--rule-strong)",
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span style={{ display: "block", font: "400 14px/1.3 var(--sans)" }}>
                        {s.label}{s.manual ? " (manual)" : ""}
                      </span>
                      <span style={{ display: "block", font: "400 11px/1.4 var(--mono)", color: "var(--fg-mute)" }}>
                        {s.shade ? `${s.shade.name} · LRV ${s.shade.lrv}` : `${s.hex} · raw hex`}
                      </span>
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {active && (
            <ColourPicker
              key={active.id}
              surface={active}
              shades={shades}
              onPick={(hex, shade) => patch(active.id, { hex, shade, applied: true })}
            />
          )}

          <div style={{ marginTop: 26, borderTop: "1px solid var(--rule)", paddingTop: 20 }}>
            <div style={GROUP_TITLE_STYLE}>Engine knobs</div>
            <p style={{ ...HINT_STYLE, marginBottom: 14 }}>
              Compiled-in constants in the studio, one per judgement call. Anything moved
              off its default is marked, because a bench left on odd settings is the
              easiest way to mis-read a room.
            </p>

            <Knob
              id="st-preserve"
              label="Shadow preservation"
              value={`${Math.round(preserve * 100)}%`}
              off={preserve !== STUDIO_SHADOW_STRENGTH}
            >
              <input
                id="st-preserve"
                type="range"
                min={0}
                max={100}
                value={Math.round(preserve * 100)}
                onChange={(e) => setPreserve(Number(e.target.value) / 100)}
                style={{ width: "100%" }}
              />
              <p style={HINT_STYLE}>
                How much of the room&rsquo;s own light and curvature survives the repaint.
                At 0 the wall is a flat swatch — useful for reading the mask&rsquo;s exact
                shape, useless for judging the colour.
              </p>
            </Knob>

            <Knob
              id="st-nudge"
              label="Edge nudge"
              value={`${edgeNudge > 0 ? "+" : ""}${edgeNudge}px`}
              off={edgeNudge !== STUDIO_EDGE_NUDGE_PX}
            >
              <input
                id="st-nudge"
                type="range"
                min={-4}
                max={4}
                value={edgeNudge}
                onChange={(e) => setEdgeNudge(Number(e.target.value))}
                style={{ width: "100%" }}
              />
              <p style={HINT_STYLE}>
                Grows (or shrinks) every painted region uniformly. The studio&rsquo;s +1px
                hides the unpainted seam a mask leaves at a wall&rsquo;s border; push it
                further to see paint start crossing onto the trim.
              </p>
            </Knob>

            <Knob id="st-soft" label="Soft edges" value={softEdges ? "on" : "off"} off={softEdges !== STUDIO_SOFT_EDGE}>
              <label style={RADIO_STYLE}>
                <input
                  id="st-soft"
                  type="checkbox"
                  checked={softEdges}
                  onChange={(e) => setSoftEdges(e.target.checked)}
                />
                Feather mask edges inward ({SOFT_EDGE_FEATHER_PX}px)
              </label>
              <p style={HINT_STYLE}>
                Off in the studio. The feather is inward-only, so it never bleeds paint
                past the outline — it fades it in just inside one.
              </p>
            </Knob>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ viewport */

const COMPARE_MODES: ReadonlyArray<{ id: CompareMode; label: string; hint: string }> = [
  {
    id: "slider",
    label: "Slider",
    hint: "Drag the handle: the untouched canvas on the left, the painted one on the right. One frame, so the only thing that moves between them is the paint.",
  },
  {
    id: "split",
    label: "Side by side",
    hint: "Both canvases in full, for a difference too broad to catch through a moving edge — a colour cast, or paint on a surface that should not have any.",
  },
  { id: "painted", label: "Painted only", hint: "The result on its own, the way the studio shows it." },
  { id: "clean", label: "Canvas only", hint: "The chosen canvas with nothing painted — the engine's own base render, not the source file." },
];

interface ViewportProps {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  engineEpoch: number;
  baseUrl: string | null;
  dims: { w: number; h: number } | null;
  mode: CompareMode;
  pos: number;
  onPos: (n: number) => void;
  painted: number;
}

/**
 * The painted canvas, with the untouched one either clipped over it (slider) or
 * beside it (side by side).
 *
 * Every mode is the same DOM, differing only in CSS — see the note on `canvasEl`.
 */
function Viewport({ canvasRef, engineEpoch, baseUrl, dims, mode, pos, onPos, painted }: ViewportProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClient = useCallback((clientX: number) => {
    const el = boxRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    onPos(Math.max(2, Math.min(98, ((clientX - rect.left) / rect.width) * 100)));
  }, [onPos]);

  useEffect(() => {
    const onUp = () => { dragging.current = false; };
    const onMove = (e: PointerEvent) => {
      if (dragging.current) updateFromClient(e.clientX);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateFromClient]);

  const aspect = dims ? `${dims.w} / ${dims.h}` : "3 / 2";
  const frame: React.CSSProperties = {
    position: "relative",
    width: "100%",
    aspectRatio: aspect,
    overflow: "hidden",
    borderRadius: "var(--radius)",
    border: "1px solid var(--rule-strong)",
    background: "var(--surface)",
  };
  const fill: React.CSSProperties = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    // "fill", not "cover": both layers already share the frame's aspect ratio, so
    // this keeps them registered to the pixel. "cover" would crop one of them.
    objectFit: "fill",
    display: "block",
  };

  // ONE canvas element, at ONE position in the tree, in every mode. React reconciles
  // by position, so returning a different shape per mode would tear this node down and
  // build another — and the engine, which bound to the first on mount, would go on
  // drawing into a canvas nobody can see. The modes are CSS, for that reason alone.
  const canvasEl = (
    <canvas
      key={engineEpoch}
      ref={canvasRef}
      role="img"
      aria-label={
        painted > 0
          ? `Room preview with ${painted} surface${painted === 1 ? "" : "s"} painted`
          : "Room preview, nothing painted"
      }
      style={fill}
    />
  );

  const split = mode === "split";

  return (
    <div style={{ display: "grid", gridTemplateColumns: split ? "1fr 1fr" : "1fr", gap: 12 }}>
      <figure style={{ margin: 0, display: split ? "block" : "none" }}>
        <div style={frame}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {baseUrl && <img src={baseUrl} alt="The canvas before any paint" style={fill} draggable={false} />}
        </div>
        <figcaption style={CAPTION_STYLE}>Canvas</figcaption>
      </figure>

      <figure style={{ margin: 0 }}>
        <div
          ref={boxRef}
          style={{
            ...frame,
            cursor: mode === "slider" ? "ew-resize" : "default",
            userSelect: "none",
            touchAction: "pan-y",
          }}
          onPointerDown={(e) => {
            if (mode !== "slider") return;
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            updateFromClient(e.clientX);
          }}
        >
          {canvasEl}
          {mode === "slider" && baseUrl && (
            <>
              {/* The overlay is the SOURCE image, not a second render, and the canvas
                  under it stays live — so the comparison costs nothing per frame and
                  never lags a colour change by an export. Both fill the same
                  aspect-ratio box, so the halves line up pixel for pixel. */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={baseUrl}
                alt=""
                draggable={false}
                style={{ ...fill, clipPath: `inset(0 calc(100% - ${pos}%) 0 0)`, pointerEvents: "none" }}
              />
              <span style={tagStyle("left")}>Canvas</span>
              <span style={tagStyle("right")}>Painted</span>
              <div
                role="slider"
                aria-label="Drag to compare the canvas against the painted result"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(pos)}
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "ArrowLeft") onPos(Math.max(2, pos - 2));
                  if (e.key === "ArrowRight") onPos(Math.min(98, pos + 2));
                }}
                style={{
                  position: "absolute",
                  top: 0,
                  bottom: 0,
                  left: `${pos}%`,
                  width: 2,
                  background: "var(--ivory)",
                  transform: "translateX(-50%)",
                  zIndex: 4,
                  boxShadow: "0 0 14px rgba(0,0,0,.45)",
                }}
              >
                <span style={handleDotStyle} aria-hidden>‹ ›</span>
              </div>
            </>
          )}
        </div>
        <figcaption style={{ ...CAPTION_STYLE, display: split ? "block" : "none" }}>Painted</figcaption>
      </figure>
    </div>
  );
}

/* ------------------------------------------------------------- colour picker */

interface ColourPickerProps {
  surface: Surface;
  shades: ReadonlyArray<PaintShade>;
  onPick: (hex: string, shade: PaintShade | null) => void;
}

/**
 * A deliberately plain palette: brand, a search box, swatches, and a raw hex field.
 *
 * Not the studio's shade grid, which sells a colour — families, harmonies, undertone
 * advice, the whole tray. None of that is what a bench is for, and pulling it in here
 * would tie a diagnostics screen to the one component most likely to change under it.
 * The raw hex field is the part the studio has no equivalent for: a hex paints
 * UNCORRECTED (no LRV), which is how you tell a bad-looking wall caused by the
 * brightness correction from one caused by the mask.
 */
function ColourPicker({ surface, shades, onPick }: ColourPickerProps) {
  const [brand, setBrand] = useState<string>("");
  const [q, setQ] = useState("");
  const [hexDraft, setHexDraft] = useState(surface.hex);
  const [hexError, setHexError] = useState(false);

  const brands = useMemo(
    () => Array.from(new Set(shades.map((s) => s.brand))).sort((a, b) => a.localeCompare(b)),
    [shades],
  );

  const matches = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return shades
      .filter((s) => (!brand || s.brand === brand))
      .filter((s) =>
        !needle ||
        s.name.toLowerCase().includes(needle) ||
        s.code.toLowerCase().includes(needle) ||
        s.family.toLowerCase().includes(needle))
      .slice(0, 96);
  }, [shades, brand, q]);

  return (
    <div style={{ borderTop: "1px solid var(--rule)", paddingTop: 20 }}>
      <div style={GROUP_TITLE_STYLE}>Colour · {surface.label}</div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <div className="field" style={{ flex: "1 1 50%", minWidth: 0 }}>
          <label className="field-label" htmlFor="st-brand">Brand</label>
          <select id="st-brand" value={brand} onChange={(e) => setBrand(e.target.value)}>
            <option value="">Every brand</option>
            {brands.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>
        <div className="field" style={{ flex: "1 1 50%", minWidth: 0 }}>
          <label className="field-label" htmlFor="st-shade-search">Shade</label>
          <input
            id="st-shade-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, code, family"
          />
        </div>
      </div>

      {shades.length === 0 ? (
        <p style={{ ...HINT_STYLE, marginTop: 10 }}>
          The catalogue is unavailable, so only the hex field below can set a colour.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(34px, 1fr))",
            gap: 5,
            marginTop: 12,
            maxHeight: 210,
            overflowY: "auto",
          }}
        >
          {matches.map((s) => (
            <button
              key={`${s.brand}-${s.code}`}
              type="button"
              title={`${s.name} · ${s.code} · ${s.brand} · LRV ${s.lrv}`}
              aria-label={`${s.name}, ${s.brand}`}
              onClick={() => {
                setHexDraft(s.hex);
                setHexError(false);
                onPick(s.hex, s);
              }}
              style={{
                aspectRatio: "1",
                background: s.hex,
                border: `1px solid ${surface.shade?.code === s.code ? "var(--accent)" : "var(--rule-strong)"}`,
                outline: surface.shade?.code === s.code ? "1px solid var(--accent)" : "none",
                borderRadius: 4,
                cursor: "pointer",
                padding: 0,
              }}
            />
          ))}
          {matches.length === 0 && (
            <p style={{ ...HINT_STYLE, gridColumn: "1 / -1" }}>Nothing matched that search.</p>
          )}
        </div>
      )}

      <form
        className="field"
        style={{ marginTop: 14 }}
        onSubmit={(e) => {
          e.preventDefault();
          const hex = normaliseHex(hexDraft);
          if (!hex) {
            setHexError(true);
            return;
          }
          setHexError(false);
          setHexDraft(hex);
          // Deliberately no shade: a raw hex paints UNCORRECTED, which is the
          // comparison this field exists for.
          onPick(hex, null);
        }}
      >
        <label className="field-label" htmlFor="st-hex">Raw hex · painted uncorrected</label>
        <div style={{ display: "flex", gap: 8 }}>
          <input
            id="st-hex"
            value={hexDraft}
            onChange={(e) => { setHexDraft(e.target.value); setHexError(false); }}
            placeholder="#D8CDBE"
            spellCheck={false}
            style={{ flex: 1, minWidth: 0, fontFamily: "var(--mono)" }}
          />
          <Button type="submit" variant="ghost" size="sm">Apply</Button>
        </div>
        {hexError && <span className="field-error">Not a hex colour — try #D8CDBE.</span>}
      </form>
    </div>
  );
}

/* -------------------------------------------------------------------- pieces */

function Knob({
  id, label, value, off, children,
}: {
  id: string;
  label: string;
  value: string;
  off: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="field" style={{ marginBottom: 18 }}>
      <label className="field-label" htmlFor={id}>
        {label} · {value}
        {off && <span style={{ color: "var(--accent)" }}> · off the studio default</span>}
      </label>
      {children}
    </div>
  );
}

const NOTE_STYLE: React.CSSProperties = {
  marginTop: 14,
  padding: "10px 14px",
  border: "1px solid var(--rule-strong)",
  borderRadius: "var(--radius)",
  font: "400 13px/1.5 var(--sans)",
  color: "var(--fg-soft)",
};
const META_STYLE: React.CSSProperties = {
  marginTop: 8,
  font: "400 12px/1.4 var(--mono)",
  color: "var(--fg-mute)",
};
const HINT_STYLE: React.CSSProperties = {
  font: "300 12px/1.5 var(--serif)",
  color: "var(--fg-mute)",
  margin: "6px 0 0",
};
const GROUP_TITLE_STYLE: React.CSSProperties = {
  font: "500 12px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
  marginBottom: 6,
};
const RADIO_STYLE: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  font: "400 14px/1 var(--sans)",
  cursor: "pointer",
};
const CAPTION_STYLE: React.CSSProperties = {
  marginTop: 6,
  font: "400 11px/1 var(--mono)",
  letterSpacing: ".18em",
  textTransform: "uppercase",
  color: "var(--fg-mute)",
};
const tagStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: 10,
  [side]: 10,
  font: "400 12px/1 var(--mono)",
  letterSpacing: ".22em",
  textTransform: "uppercase",
  color: "var(--ivory)",
  background: "rgba(10,9,15,.6)",
  backdropFilter: "blur(6px)",
  padding: "6px 8px",
  border: "1px solid rgba(235,229,215,.2)",
  zIndex: 3,
});
const handleDotStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 34,
  height: 34,
  border: "1px solid var(--ivory)",
  background: "rgba(10,9,15,.7)",
  backdropFilter: "blur(6px)",
  borderRadius: "50%",
  color: "var(--ivory)",
  font: "400 13px/1 var(--mono)",
  letterSpacing: ".05em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
