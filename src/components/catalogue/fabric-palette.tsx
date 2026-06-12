"use client";

import { useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { deltaE, hexToLab, nearestShades } from "@/lib/color";
import { extractPalette } from "@/lib/palette";
import { chroma, pairCeilingAndTrim } from "@/lib/color-science";
import { UndertoneTag } from "./undertone-tag";
import type { PaintShade } from "@/lib/types";

const MAX_DIM = 900;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

interface Scheme {
  sourceColors: string[];
  matched: PaintShade[];
  mainWall?: PaintShade;
  accentWall?: PaintShade;
  ceiling?: PaintShade;
  trim?: PaintShade;
}

/**
 * Saree → walls: pull the main colours out of a fabric/furniture photo,
 * snap each to the nearest catalogue shade, then propose a simple room
 * scheme around them — quietest match on the main walls, boldest as the
 * accent, plus a ceiling white and trim that sit well with the main wall.
 * Everything runs on-device; no AI credit is spent.
 */
export function FabricPalette({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [scheme, setScheme] = useState<Scheme | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const onFile = (file: File | undefined) => {
    setError(null);
    if (!file) return;
    if (!ALLOWED.has(file.type)) {
      setError("Use a JPG, PNG or WebP photo.");
      return;
    }
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
      const w = Math.max(1, Math.round(img.naturalWidth * scale));
      const h = Math.max(1, Math.round(img.naturalHeight * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) {
        setError("This browser can't read the photo. Try another one.");
        URL.revokeObjectURL(url);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const colors = extractPalette(ctx.getImageData(0, 0, w, h).data, 5);
      setPreview(url);
      setScheme(buildScheme(colors, shades));
    };
    img.onerror = () => {
      setError("Could not open that photo. Try another one.");
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const copyScheme = () => {
    if (!scheme) return;
    const lines = [
      scheme.mainWall && `Main walls: ${scheme.mainWall.name} (${scheme.mainWall.code})`,
      scheme.accentWall && `Accent wall: ${scheme.accentWall.name} (${scheme.accentWall.code})`,
      scheme.ceiling && `Ceiling: ${scheme.ceiling.name} (${scheme.ceiling.code})`,
      scheme.trim && `Trim: ${scheme.trim.name} (${scheme.trim.code})`,
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join("\n")).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    }).catch(() => {});
  };

  return (
    <div style={{ border: "1px solid var(--rule)", padding: "24px 24px 28px" }}>
      <Mono brass>From a saree, sofa or curtain</Mono>
      <p style={{ font: "400 18px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 18px", maxWidth: "52ch" }}>
        Upload a photo of a fabric or furniture you love. We pull out its main colours and build a
        wall scheme around them — real catalogue shades, codes intact.
      </p>

      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        style={{ display: "none" }}
        onChange={(e) => onFile(e.target.files?.[0])}
      />
      <button type="button" className="btn" onClick={() => fileRef.current?.click()}>
        {preview ? "Try another photo" : "Upload a photo"} <span className="arr">→</span>
      </button>
      {error && <div className="field-error" role="alert" style={{ marginTop: 14 }}>{error}</div>}

      {preview && scheme && (
        <div style={{ marginTop: 24, display: "grid", gridTemplateColumns: "minmax(180px, 280px) 1fr", gap: 28 }} className="r-stack-sm">
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview} alt="Your fabric photo" style={{ width: "100%", borderRadius: 8, border: "1px solid var(--rule-strong)" }} />
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              {scheme.sourceColors.map((hex) => (
                <span key={hex} title={hex} style={{ flex: 1, height: 26, background: hex, border: "1px solid var(--rule-strong)", borderRadius: 4 }} />
              ))}
            </div>
            <Mono style={{ display: "block", marginTop: 8 }}>colours found in the photo</Mono>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            {([
              ["Main walls", scheme.mainWall],
              ["Accent wall", scheme.accentWall],
              ["Ceiling", scheme.ceiling],
              ["Trim & frames", scheme.trim],
            ] as ReadonlyArray<readonly [string, PaintShade | undefined]>).map(([label, s]) =>
              s ? (
                <div key={label} style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <span style={{ width: 56, height: 44, background: s.hex, border: "1px solid var(--rule-strong)", borderRadius: 6, flexShrink: 0 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: 3, minWidth: 0 }}>
                    <Mono>{label}</Mono>
                    <span style={{ font: "600 15px/1.2 var(--sans)", color: "var(--fg)" }}>{s.name}</span>
                    <span style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
                      <Mono>{s.code} · LRV {s.lrv}</Mono>
                      <UndertoneTag hex={s.hex} />
                    </span>
                  </div>
                </div>
              ) : null,
            )}
            <div>
              <button type="button" className="btn btn-ghost btn-sm" onClick={copyScheme}>
                {copied ? "Copied ✓" : "Copy shade codes"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function buildScheme(sourceColors: string[], catalogue: ReadonlyArray<PaintShade>): Scheme {
  // Snap each extracted colour to its nearest catalogue shade, dropping dupes.
  const matched: PaintShade[] = [];
  for (const hex of sourceColors) {
    const [hit] = nearestShades(hex, catalogue, 1);
    if (hit && !matched.some((m) => m.code === hit.shade.code)) matched.push(hit.shade);
  }

  // Main walls: the lightest, calmest match (rooms need a quiet base).
  // Accent: the most saturated match that isn't the main wall.
  const byCalm = [...matched].sort(
    (a, b) => b.lrv - chroma(hexToLab(b.hex)) - (a.lrv - chroma(hexToLab(a.hex))),
  );
  const mainWall = byCalm[0];
  const byBold = matched
    .filter((s) => s.code !== mainWall?.code)
    .sort((a, b) => chroma(hexToLab(b.hex)) - chroma(hexToLab(a.hex)));
  // Prefer an accent that actually differs from the main wall to the eye.
  const accentWall =
    byBold.find((s) => mainWall && deltaE(hexToLab(s.hex), hexToLab(mainWall.hex)) > 18) ?? byBold[0];

  const pairing = mainWall ? pairCeilingAndTrim(mainWall, catalogue) : {};
  return { sourceColors, matched, mainWall, accentWall, ...pairing };
}
