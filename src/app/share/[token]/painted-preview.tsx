"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas2DRecolor } from "@/lib/canvas2d-recolor";
import { hexToRgb01, Recolor, regionMeanLuma, type RegionPaint } from "@/lib/webgl-recolor";
import type { RecolorEngine } from "@/lib/recolor-engine";

export interface PaintedRegion {
  maskUrl: string | null;
  hex: string;
  label?: string | null;
}

interface PaintedPreviewProps {
  /** Base photo (cleaned image when available, else the original). */
  imageUrl: string;
  alt: string;
  /** Regions with an applied colour; masks may be unreachable (we fall back). */
  regions: ReadonlyArray<PaintedRegion>;
  /** True when imageUrl is the CLEANED image (surfaces repainted fresh white):
   *  enables scene-light anchored shading so the preview keeps the photo's own
   *  light — matching what the studio rendered. */
  anchored?: boolean;
}

// Mirrors the studio's always-on shadow preservation so the shared preview
// looks exactly like what the retailer saw when they applied the colours.
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

/**
 * The share page's hero: the room WITH its applied colours, rendered in the
 * browser from the saved masks — the same compositing the studio does. The
 * recolour result is the product's wow moment, and previously the share link
 * showed only the unpainted photo with swatches beside it.
 *
 * Progressive enhancement: starts as a plain <img>; if the engine initialises,
 * the base image loads (CORS-clean) and at least one mask is fetchable, the
 * painted canvas replaces it and a compare toggle appears. Any failure —
 * no WebGL, tainted canvas, unreachable masks — quietly leaves the photo.
 */
export function PaintedPreview({ imageUrl, alt, regions, anchored = false }: PaintedPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<RecolorEngine | null>(null);
  const [painted, setPainted] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    const paintable = regions.filter((r) => r.maskUrl);
    if (!canvas || paintable.length === 0) return;

    let cancelled = false;
    let engine: RecolorEngine | null = null;

    (async () => {
      try {
        const base = await loadImage(imageUrl);
        if (cancelled) return;

        try {
          engine = new Recolor(canvas);
        } catch {
          engine = new Canvas2DRecolor(canvas);
        }
        engineRef.current = engine;
        engine.setImage(base);

        const paints: RegionPaint[] = [];
        for (const r of paintable) {
          try {
            const mask = await loadImage(r.maskUrl!);
            if (cancelled) return;
            paints.push({
              mask,
              target: hexToRgb01(r.hex),
              preserve: SHADOW_STRENGTH,
              baseL: regionMeanLuma(base, mask),
              anchor: anchored,
            });
          } catch {
            /* this mask didn't load — paint the ones that did */
          }
        }
        if (cancelled || paints.length === 0) return;

        engine.renderRegions(paints);
        // exportPng() throws on a tainted canvas — probe it so we never show a
        // canvas that silently rendered nothing usable.
        engine.exportPng();
        setPainted(true);
      } catch {
        /* fall back to the plain <img> below */
      }
    })();

    return () => {
      cancelled = true;
      engineRef.current?.dispose();
      engineRef.current = null;
    };
    // regions is built once server-side per page load — stringify to keep the
    // effect stable without deep-compare machinery.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageUrl, JSON.stringify(regions)]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt={alt}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "contain",
          display: painted && !showOriginal ? "none" : "block",
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
          display: painted && !showOriginal ? "block" : "none",
        }}
      />
      {painted && (
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
  );
}
