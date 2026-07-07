"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { rgbToHex } from "@/lib/color";
import { extractPalette } from "@/lib/palette";
import { IMAGE_ACCEPT, imageFileError, loadImageFromFile, scaleToFit } from "@/lib/image-upload";
import { useShadeMatch } from "@/hooks/use-shade-match";
import { MatchList } from "@/components/catalogue/match-list";
import { SHADES } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";
import { PhoneHandoff } from "@/components/shared/phone-handoff";

const MAX_DIM = 1400; // cap the canvas backing store so getImageData stays fast

export function ColorFinder({ shades }: { shades?: ReadonlyArray<PaintShade> }) {
  const catalogue = useMemo(() => (shades && shades.length > 0 ? shades : SHADES), [shades]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [hasImage, setHasImage] = useState(false);
  const [loadedImg, setLoadedImg] = useState<HTMLImageElement | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [hover, setHover] = useState<{ hex: string; x: number; y: number } | null>(null);
  const [palette, setPalette] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  // The shared matching path: backend full-catalogue matcher with the bundled
  // client-side matcher as the offline fallback.
  const { matches, source: matchSource } = useShadeMatch(picked, catalogue, 6);

  // Draw + analyse runs in an effect *after* the canvas has mounted. The canvas only
  // renders once `hasImage` is true, so drawing straight from the image-load callback
  // would hit a not-yet-mounted ref (canvasRef.current === null) and the upload would
  // silently do nothing. Setting `loadedImg` mounts the canvas, then this effect paints.
  useEffect(() => {
    const img = loadedImg;
    const canvas = canvasRef.current;
    if (!img || !canvas) return;
    const { width: w, height: h } = scaleToFit(img, MAX_DIM);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) return;
    ctxRef.current = ctx;
    ctx.drawImage(img, 0, 0, w, h);
    try {
      const { data } = ctx.getImageData(0, 0, w, h);
      setPalette(extractPalette(data, 8));
    } catch {
      setPalette([]);
    }
  }, [loadedImg]);

  const onFile = useCallback((file: File) => {
    setError(null);
    const problem = imageFileError(file);
    if (problem) {
      setError(problem);
      return;
    }
    loadImageFromFile(file)
      .then((img) => {
        // Mount the canvas (hasImage) and hand the decoded image to the draw effect.
        setHasImage(true);
        setPicked(null);
        setHover(null);
        setLoadedImg(img);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const sampleAt = useCallback((clientX: number, clientY: number): string | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return null;
    const px = Math.floor((clientX - rect.left) * (canvas.width / rect.width));
    const py = Math.floor((clientY - rect.top) * (canvas.height / rect.height));
    if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return null;
    const ctx = ctxRef.current;
    if (!ctx) return null;
    const d = ctx.getImageData(px, py, 1, 1).data;
    return rgbToHex({ r: d[0]!, g: d[1]!, b: d[2]! });
  }, []);

  return (
    <div className="hv-finder" style={{ border: "1px solid var(--rule)", padding: "24px 24px 28px" }}>
      <Mono brass>Find a colour in a photo</Mono>
      <p className="finder-lead" style={{ font: "400 18px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 20px", maxWidth: "56ch" }}>
        Upload a photograph, then click anywhere on it to sample a colour — we match it to the nearest real
        catalogue shade by perceptual distance. We also pull a palette from the image automatically.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept={IMAGE_ACCEPT}
        style={{ display: "none" }}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = "";
        }}
      />

      {!hasImage ? (
        <div
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && fileRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) onFile(f);
          }}
          aria-label="Choose or drop a photograph"
          style={{
            border: "1px dashed var(--rule-strong)",
            padding: "64px 24px",
            textAlign: "center",
            cursor: "pointer",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 14,
          }}
        >
          <span aria-hidden style={{ color: "var(--accent)" }}>
            <svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 16V4M6 10l6-6 6 6" />
              <path d="M4 20h16" />
            </svg>
          </span>
          <span className="finder-drop" style={{ font: "400 22px/1.2 var(--serif)", color: "var(--fg)" }}>
            Drop a photograph here
          </span>
          <span className="btn">Choose a photograph</span>
          <Mono>JPEG, PNG or WebP</Mono>
        </div>
      ) : null}

      {!hasImage && (
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 12, marginTop: 16 }}>
          <Mono>The photo is on your phone?</Mono>
          <PhoneHandoff onImage={onFile} />
        </div>
      )}

      {hasImage && (
        <div className="r-cols-md-1" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24, alignItems: "start" }}>
          {/* IMAGE + EYEDROPPER */}
          <div>
            <div style={{ position: "relative", lineHeight: 0 }}>
              <canvas
                ref={canvasRef}
                onClick={(e) => {
                  const hex = sampleAt(e.clientX, e.clientY);
                  if (hex) setPicked(hex);
                }}
                onMouseMove={(e) => {
                  const hex = sampleAt(e.clientX, e.clientY);
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (hex) setHover({ hex, x: e.clientX - rect.left, y: e.clientY - rect.top });
                }}
                onMouseLeave={() => setHover(null)}
                onTouchStart={(e) => {
                  const tch = e.touches[0];
                  if (!tch) return;
                  const hex = sampleAt(tch.clientX, tch.clientY);
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (hex) {
                    setPicked(hex);
                    setHover({ hex, x: tch.clientX - rect.left, y: tch.clientY - rect.top });
                  }
                }}
                onTouchMove={(e) => {
                  const tch = e.touches[0];
                  if (!tch) return;
                  const hex = sampleAt(tch.clientX, tch.clientY);
                  const rect = e.currentTarget.getBoundingClientRect();
                  if (hex) {
                    setPicked(hex);
                    setHover({ hex, x: tch.clientX - rect.left, y: tch.clientY - rect.top });
                  }
                }}
                onTouchEnd={() => setHover(null)}
                style={{
                  maxWidth: "100%",
                  maxHeight: "70vh",
                  width: "auto",
                  height: "auto",
                  cursor: "crosshair",
                  border: "1px solid var(--rule-strong)",
                  display: "block",
                  touchAction: "none",
                }}
              />
              {hover && (
                <div
                  aria-hidden
                  style={{
                    position: "absolute",
                    left: Math.max(0, Math.min(hover.x + 14, (canvasRef.current?.clientWidth ?? 9999) - 92)),
                    top: hover.y + 14,
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "4px 6px",
                    background: "var(--bg)",
                    border: "1px solid var(--rule-strong)",
                    pointerEvents: "none",
                    transform: "translateZ(0)",
                  }}
                >
                  <span style={{ width: 16, height: 16, background: hover.hex, border: "1px solid var(--rule-strong)" }} />
                  <Mono>{hover.hex}</Mono>
                </div>
              )}
            </div>
            <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" className="btn btn-ghost" onClick={() => fileRef.current?.click()}>
                Choose another photo
              </button>
              <PhoneHandoff onImage={onFile} />
              <Mono>Click or tap the image to sample a colour</Mono>
            </div>

            {/* AUTO PALETTE */}
            {palette.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <Mono style={{ display: "block", marginBottom: 10 }}>Palette pulled from the image</Mono>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {palette.map((hex) => (
                    <button
                      key={hex}
                      type="button"
                      onClick={() => setPicked(hex)}
                      title={`Match ${hex}`}
                      aria-label={`Match ${hex}`}
                      style={{
                        width: 40,
                        height: 40,
                        background: hex,
                        cursor: "pointer",
                        padding: 0,
                        border: "1px solid " + (picked === hex ? "var(--accent)" : "var(--rule-strong)"),
                        outline: picked === hex ? "2px solid var(--accent)" : "none",
                        outlineOffset: 2,
                      }}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* MATCH RESULTS */}
          <div>
            {picked ? (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 16 }}>
                  <span style={{ width: 48, height: 48, background: picked, border: "1px solid var(--rule-strong)", flexShrink: 0 }} />
                  <div>
                    <Mono>Sampled colour</Mono>
                    <div className="finder-hex" style={{ font: "400 22px/1 var(--serif)", color: "var(--fg)", marginTop: 4 }}>{picked}</div>
                  </div>
                </div>
                <MatchList matches={matches} offline={matchSource === "offline"} />
              </>
            ) : (
              <div style={{ border: "1px solid var(--rule)", padding: 22, background: "var(--surface-soft)" }}>
                <Mono>No colour sampled yet</Mono>
                <p className="finder-empty-hint" style={{ font: "400 15px/1.5 var(--serif)", color: "var(--fg-mute)", margin: "8px 0 0" }}>
                  Click anywhere on the photo, or pick from the palette, and we&apos;ll list the nearest shade codes.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="field-error" role="alert" style={{ marginTop: 16 }}>
          {error}
        </div>
      )}
    </div>
  );
}
