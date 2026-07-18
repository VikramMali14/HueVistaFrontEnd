"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import { hexToRgb01, Recolor, regionMeanLuma, type RegionPaint } from "@/lib/webgl-recolor";
import type { RecolorEngine } from "@/lib/recolor-engine";

export interface RepaintRegion {
  id: number;
  label: string;
  maskUrl: string | null;
  /** The colour the retailer applied, if any (hex). */
  initialHex: string | null;
}

export interface RepaintBrand {
  name: string;
  slug: string;
}

interface ShareRepaintProps {
  /** Base photo (cleaned image when available, else the original). */
  imageUrl: string;
  alt: string;
  regions: ReadonlyArray<RepaintRegion>;
  /** True when imageUrl is the CLEANED image — enables scene-light anchoring. */
  anchored: boolean;
  /** Paint companies the retailer opened up for this share (already filtered). */
  brands: ReadonlyArray<RepaintBrand>;
  /** Public backend origin the browser can fetch the shade catalogue from. */
  apiOrigin: string;
}

interface CatalogShade {
  shadeCode?: string;
  name?: string;
  hexCode?: string;
  shadeFamily?: string | null;
  brandName?: string | null;
}

/** What the viewer picked for one region (or the retailer's original colour). */
interface AppliedPaint {
  hex: string;
  shadeName: string | null;
  brandName: string | null;
}

// Mirrors the studio's always-on shadow preservation so the repaint looks
// exactly like what the retailer's own studio would render.
const SHADOW_STRENGTH = 0.85;

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image: " + url));
    img.src = url;
  });
}

const chipStyle = (active: boolean): React.CSSProperties => ({
  padding: "8px 14px",
  borderRadius: 999,
  border: `1px solid ${active ? "var(--accent)" : "var(--rule-strong)"}`,
  background: active ? "var(--accent)" : "transparent",
  color: active ? "#fff" : "var(--fg-soft)",
  cursor: "pointer",
  font: "400 12px/1 var(--mono)",
  letterSpacing: ".08em",
});

/**
 * The share page's interactive heart: the recipient opens the retailer's shared
 * room and repaints it themselves, wall by wall, using the paint companies the
 * retailer opened up (e.g. Asian Paints). Shade NAMES are shown; codes stay
 * with the retailer — exactly the shop-visit hook the share link is for.
 *
 * Progressive enhancement like the old static preview: if the engine, base
 * image or every mask fails, the plain photo (with the retailer's colours when
 * renderable) remains, and the picker hides.
 */
export function ShareRepaint({ imageUrl, alt, regions, anchored, brands, apiOrigin }: ShareRepaintProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RecolorEngine | null>(null);
  const baseRef = useRef<HTMLImageElement | null>(null);
  const masksRef = useRef<Map<number, { mask: HTMLImageElement; baseL: number }>>(new Map());

  const [ready, setReady] = useState(false); // engine + ≥1 mask loaded → interactive
  const [showOriginal, setShowOriginal] = useState(false);
  const [paintableIds, setPaintableIds] = useState<number[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [paints, setPaints] = useState<Record<number, AppliedPaint | null>>({});

  const [activeBrand, setActiveBrand] = useState<string | null>(brands[0]?.slug ?? null);
  const [shadesByBrand, setShadesByBrand] = useState<Record<string, CatalogShade[]>>({});
  const [shadesLoading, setShadesLoading] = useState(false);
  const [shadeError, setShadeError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const initialPaints = useMemo(() => {
    const map: Record<number, AppliedPaint | null> = {};
    for (const r of regions) {
      map[r.id] = r.initialHex ? { hex: r.initialHex, shadeName: null, brandName: null } : null;
    }
    return map;
  }, [regions]);

  const renderAll = useCallback((state: Record<number, AppliedPaint | null>) => {
    const engine = engineRef.current;
    const base = baseRef.current;
    if (!engine || !base) return;
    const paintList: RegionPaint[] = [];
    for (const [idStr, loaded] of masksRef.current) {
      const paint = state[Number(idStr)];
      if (!paint) continue;
      paintList.push({
        mask: loaded.mask,
        target: hexToRgb01(paint.hex),
        preserve: SHADOW_STRENGTH,
        baseL: loaded.baseL,
        anchor: anchored,
      });
    }
    engine.renderRegions(paintList);
  }, [anchored]);

  // Boot: base image + engine + all masks, then the initial (retailer) render.
  useEffect(() => {
    const canvas = canvasRef.current;
    const withMasks = regions.filter((r) => r.maskUrl);
    if (!canvas || withMasks.length === 0) return;

    let cancelled = false;
    let engine: RecolorEngine | null = null;

    (async () => {
      try {
        const base = await loadImage(imageUrl);
        if (cancelled) return;
        baseRef.current = base;

        try {
          engine = new Recolor(canvas);
        } catch {
          engine = new Canvas2DRecolor(canvas);
        }
        engineRef.current = engine;
        engine.setImage(base);

        const loadedIds: number[] = [];
        await Promise.all(
          withMasks.map(async (r) => {
            try {
              const mask = await loadImage(r.maskUrl!);
              if (cancelled) return;
              masksRef.current.set(r.id, { mask, baseL: regionMeanLuma(base, mask) });
              loadedIds.push(r.id);
            } catch {
              /* this mask didn't load — the region just isn't repaintable */
            }
          }),
        );
        if (cancelled || loadedIds.length === 0) return;

        renderAll(initialPaints);
        // exportPng() throws on a tainted canvas — probe before showing anything.
        engine.exportPng();

        loadedIds.sort((a, b) => a - b);
        setPaints(initialPaints);
        setPaintableIds(loadedIds);
        setSelectedId(loadedIds[0] ?? null);
        setReady(true);
      } catch {
        /* fall back to the plain <img> below */
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
      masksRef.current = new Map();
    };
    // Server-built props are stable per page load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl]);

  // Lazily pull the active brand's shade list from the public catalogue.
  useEffect(() => {
    if (!ready || !activeBrand || shadesByBrand[activeBrand]) return;
    let cancelled = false;
    setShadesLoading(true);
    setShadeError(null);
    (async () => {
      try {
        const res = await fetch(`${apiOrigin}/api/shades/${encodeURIComponent(activeBrand)}`, {
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error("Could not load this company's colours.");
        const shades = (await res.json()) as CatalogShade[];
        if (cancelled) return;
        setShadesByBrand((prev) => ({ ...prev, [activeBrand]: shades.filter((s) => s.hexCode) }));
      } catch {
        if (!cancelled) setShadeError("Could not load this company's colours — try another one.");
      } finally {
        if (!cancelled) setShadesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, activeBrand, shadesByBrand, apiOrigin]);

  function applyShade(shade: CatalogShade) {
    if (selectedId == null || !shade.hexCode) return;
    const brandName = shade.brandName ?? brands.find((b) => b.slug === activeBrand)?.name ?? null;
    const next: Record<number, AppliedPaint | null> = {
      ...paints,
      [selectedId]: { hex: shade.hexCode, shadeName: shade.name ?? null, brandName },
    };
    setPaints(next);
    setShowOriginal(false);
    renderAll(next);
  }

  function reset() {
    setPaints(initialPaints);
    setShowOriginal(false);
    renderAll(initialPaints);
  }

  const activeShades = activeBrand ? shadesByBrand[activeBrand] : undefined;
  const q = query.trim().toLowerCase();
  const visibleShades = (activeShades ?? []).filter(
    (s) => !q || (s.name ?? "").toLowerCase().includes(q) || (s.shadeFamily ?? "").toLowerCase().includes(q),
  );
  const changed = paintableIds.some((id) => paints[id] !== initialPaints[id]);
  const paletteRows = regions
    .filter((r) => paints[r.id])
    .map((r) => ({ region: r, paint: paints[r.id]! }));

  return (
    <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 32, alignItems: "start" }}>
      {/* The room */}
      <div>
        <div
          style={{
            position: "relative",
            border: "1px solid var(--rule-strong)",
            background: "var(--surface)",
            aspectRatio: "4 / 3",
            overflow: "hidden",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={imageUrl}
            alt={alt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: ready && !showOriginal ? "none" : "block",
            }}
          />
          <canvas
            ref={canvasRef}
            role="img"
            aria-label={`${alt} — with the chosen colours applied`}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "contain",
              display: ready && !showOriginal ? "block" : "none",
            }}
          />
          {ready && (
            <button
              type="button"
              onClick={() => setShowOriginal((v) => !v)}
              aria-pressed={showOriginal}
              style={{
                position: "absolute",
                right: 12,
                bottom: 12,
                padding: "8px 14px",
                background: "rgba(10,10,15,.72)",
                color: "#f7f7f5",
                border: "1px solid rgba(247,247,245,.28)",
                borderRadius: 999,
                cursor: "pointer",
                font: "400 10px/1 var(--mono)",
                letterSpacing: ".22em",
                textTransform: "uppercase",
              }}
            >
              {showOriginal ? "Show painted" : "Show original"}
            </button>
          )}
        </div>

        {/* The palette on the wall right now */}
        {paletteRows.length > 0 && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
            {paletteRows.map(({ region, paint }) => (
              <div key={region.id} style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span
                  aria-hidden
                  style={{ width: 34, height: 34, background: paint.hex, border: "1px solid var(--rule-strong)", flexShrink: 0 }}
                />
                <span style={{ font: "400 16px/1.2 var(--serif)", color: "var(--fg)" }}>
                  {region.label || "Wall"}
                </span>
                <span style={{ font: "400 13px/1.2 var(--sans)", color: "var(--fg-mute)" }}>
                  {paint.shadeName
                    ? `${paint.shadeName}${paint.brandName ? ` · ${paint.brandName}` : ""}`
                    : "Retailer's pick"}
                </span>
              </div>
            ))}
            {changed && (
              <button type="button" onClick={reset} style={{ ...chipStyle(false), alignSelf: "flex-start", marginTop: 4 }}>
                ↺ Back to the retailer&rsquo;s colours
              </button>
            )}
          </div>
        )}
      </div>

      {/* The picker */}
      <aside>
        {!ready ? (
          <p style={{ font: "400 15px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
            {regions.some((r) => r.maskUrl)
              ? "Preparing the repaint tools…"
              : "This share doesn't include repaintable walls — enjoy the preview."}
          </p>
        ) : (
          <>
            <span style={{ display: "block", font: "400 10px/1 var(--mono)", letterSpacing: ".22em", textTransform: "uppercase", color: "var(--brass, var(--accent-soft))", marginBottom: 10 }}>
              Try your own colours
            </span>
            <p style={{ font: "300 15px/1.6 var(--serif)", color: "var(--fg-soft)", margin: "0 0 14px" }}>
              Pick a wall, then tap any colour to repaint it. Your retailer has the exact shades.
            </p>

            {/* Wall chips */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
              {regions
                .filter((r) => paintableIds.includes(r.id))
                .map((r) => (
                  <button key={r.id} type="button" onClick={() => setSelectedId(r.id)} style={chipStyle(selectedId === r.id)}>
                    {r.label || "Wall"}
                  </button>
                ))}
            </div>

            {/* Brand tabs */}
            {brands.length > 1 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
                {brands.map((b) => (
                  <button key={b.slug} type="button" onClick={() => setActiveBrand(b.slug)} style={chipStyle(activeBrand === b.slug)}>
                    {b.name}
                  </button>
                ))}
              </div>
            )}
            {brands.length === 1 && brands[0] && (
              <p style={{ font: "500 14px/1.2 var(--serif)", color: "var(--fg)", margin: "0 0 12px" }}>
                {brands[0].name}
              </p>
            )}

            {brands.length === 0 ? (
              <p style={{ font: "400 14px/1.6 var(--sans)", color: "var(--fg-mute)" }}>
                No colour library is available right now.
              </p>
            ) : (
              <>
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search colours…"
                  aria-label="Search colours by name"
                  style={{
                    width: "100%",
                    font: "400 14px/1.4 var(--sans)",
                    color: "var(--fg)",
                    background: "var(--surface)",
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 6,
                    padding: "9px 12px",
                    marginBottom: 12,
                  }}
                />

                {shadesLoading && (
                  <p style={{ font: "400 13px/1 var(--mono)", color: "var(--fg-mute)" }}>Loading colours…</p>
                )}
                {shadeError && <p className="field-error" role="alert">{shadeError}</p>}

                {!shadesLoading && activeShades && (
                  <div
                    role="listbox"
                    aria-label="Colours"
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(auto-fill, minmax(52px, 1fr))",
                      gap: 6,
                      maxHeight: 360,
                      overflowY: "auto",
                      paddingRight: 4,
                    }}
                  >
                    {visibleShades.map((s, i) => (
                      <button
                        key={`${s.shadeCode ?? s.name ?? "shade"}-${i}`}
                        type="button"
                        onClick={() => applyShade(s)}
                        title={s.name ?? undefined}
                        aria-label={s.name ?? "Colour"}
                        style={{
                          aspectRatio: "1 / 1",
                          background: s.hexCode,
                          border: "1px solid var(--rule-strong)",
                          borderRadius: 4,
                          cursor: selectedId == null ? "not-allowed" : "pointer",
                          padding: 0,
                        }}
                      />
                    ))}
                    {visibleShades.length === 0 && (
                      <p style={{ gridColumn: "1 / -1", font: "400 14px/1.5 var(--sans)", color: "var(--fg-mute)" }}>
                        No colours match &ldquo;{query.trim()}&rdquo;.
                      </p>
                    )}
                  </div>
                )}
              </>
            )}

            <p style={{ marginTop: 18, font: "400 13px/1.6 var(--serif)", color: "var(--fg-mute)" }}>
              Shade codes are kept with your retailer — visit them with your favourite look to
              order the exact colours.
            </p>
          </>
        )}
      </aside>
    </div>
  );
}
