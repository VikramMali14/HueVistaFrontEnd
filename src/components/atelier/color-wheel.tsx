"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { hexToHsv, hsvToHex, nearestShades, type HSV } from "@/lib/color";
import type { PaintShade } from "@/lib/types";

/**
 * Inline HSV colour wheel: hue around the circle, saturation along the radius,
 * with a separate brightness (value) slider. Fully controlled by `hex`.
 */
function ColorWheel({
  hex,
  onChange,
  size = 184,
}: {
  hex: string;
  onChange: (hex: string) => void;
  size?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Internal HSV is the source of truth for the marker so hue/saturation are
  // preserved even when the colour goes fully dark or grey (where they're
  // mathematically undefined). Synced from `hex` only when it changes externally.
  const [hsv, setHsv] = useState<HSV>(() => hexToHsv(hex));

  useEffect(() => {
    if (hsvToHex(hsv).toLowerCase() !== hex.toLowerCase()) {
      setHsv(hexToHsv(hex));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hex]);

  const radius = size / 2;

  // Repaint the wheel whenever brightness changes (saturated ring stays, the
  // whole disc darkens with lower value).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const img = ctx.createImageData(size, size);
    const data = img.data;
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const dx = x - radius;
        const dy = y - radius;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const i = (y * size + x) * 4;
        if (dist > radius) {
          data[i + 3] = 0;
          continue;
        }
        const hue = (Math.atan2(dy, dx) * 180) / Math.PI;
        const sat = Math.min(1, dist / radius);
        const { r, g, b } = hsvToRgbLocal((hue + 360) % 360, sat, hsv.v);
        data[i] = r;
        data[i + 1] = g;
        data[i + 2] = b;
        data[i + 3] = 255;
      }
    }
    ctx.putImageData(img, 0, 0);
  }, [hsv.v, size, radius]);

  const pick = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const rect = canvas.getBoundingClientRect();
      const dx = clientX - rect.left - radius;
      const dy = clientY - rect.top - radius;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const hue = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
      const sat = Math.min(1, dist / radius);
      const next = { h: hue, s: sat, v: hsv.v };
      setHsv(next);
      onChange(hsvToHex(next));
    },
    [hsv.v, onChange, radius],
  );

  const dragging = useRef(false);

  // Marker position from current hue/sat.
  const markerX = radius + Math.cos((hsv.h * Math.PI) / 180) * hsv.s * radius;
  const markerY = radius + Math.sin((hsv.h * Math.PI) / 180) * hsv.s * radius;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "center" }}>
      <div style={{ position: "relative", width: size, height: size, touchAction: "none" }}>
        <canvas
          ref={canvasRef}
          width={size}
          height={size}
          tabIndex={0}
          aria-label={`Colour wheel, currently ${hex}. Arrow keys adjust hue and saturation; hold Shift for larger steps.`}
          style={{ borderRadius: "50%", cursor: "crosshair", display: "block", boxShadow: "inset 0 0 0 1px var(--rule-strong)" }}
          onPointerDown={(e) => {
            dragging.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            pick(e.clientX, e.clientY);
          }}
          onPointerMove={(e) => {
            if (dragging.current) pick(e.clientX, e.clientY);
          }}
          onPointerUp={(e) => {
            dragging.current = false;
            if (e.currentTarget.hasPointerCapture(e.pointerId)) {
              e.currentTarget.releasePointerCapture(e.pointerId);
            }
          }}
          onKeyDown={(e) => {
            let { h, s } = hsv;
            const dh = e.shiftKey ? 12 : 3;
            const ds = e.shiftKey ? 0.1 : 0.025;
            if (e.key === "ArrowLeft") h = (h - dh + 360) % 360;
            else if (e.key === "ArrowRight") h = (h + dh) % 360;
            else if (e.key === "ArrowUp") s = Math.min(1, s + ds);
            else if (e.key === "ArrowDown") s = Math.max(0, s - ds);
            else return;
            e.preventDefault();
            const next = { h, s, v: hsv.v };
            setHsv(next);
            onChange(hsvToHex(next));
          }}
        />
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: markerX,
            top: markerY,
            width: 14,
            height: 14,
            transform: "translate(-50%, -50%)",
            borderRadius: "50%",
            border: "2px solid #fff",
            boxShadow: "0 0 0 1px rgba(0,0,0,.6)",
            background: hex,
            pointerEvents: "none",
          }}
        />
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 10, width: size }}>
        <Mono>Bright</Mono>
        <input
          type="range"
          min={0}
          max={1}
          step={0.01}
          value={hsv.v}
          aria-label="Brightness"
          onChange={(e) => {
            const next = { ...hsv, v: Number(e.target.value) };
            setHsv(next);
            onChange(hsvToHex(next));
          }}
          style={{ flex: 1, accentColor: "var(--accent)" }}
        />
      </label>
    </div>
  );
}

// Local HSV→RGB so the wheel has no import cycle worries; mirrors lib/color hsvToRgb.
function hsvToRgbLocal(h: number, s: number, v: number) {
  const c = v * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = v - c;
  return { r: Math.round((r + m) * 255), g: Math.round((g + m) * 255), b: Math.round((b + m) * 255) };
}

const HEX_RE = /^#?[0-9a-fA-F]{6}$/;

/**
 * "Match any colour" panel: pick on the wheel (or type a hex) and we surface the
 * nearest real catalogue shades by perceptual distance (ΔE76). Clicking a match
 * applies that real shade to the active region.
 */
export function CustomMatchPanel({
  onSelect,
  onApplyExact,
  catalogue,
  activeRegionLabel,
  initialHex,
}: {
  onSelect: (shade: PaintShade) => void;
  /** Apply the picked colour exactly, without snapping to a catalogue shade. */
  onApplyExact?: (hex: string) => void;
  catalogue: ReadonlyArray<PaintShade>;
  activeRegionLabel?: string;
  /** Seed colour, e.g. when arriving from a shade's "Find similar" button. */
  initialHex?: string;
}) {
  const seed = initialHex && HEX_RE.test(initialHex) ? initialHex : "#7C9CBF";
  const [hex, setHex] = useState(seed);
  const [text, setText] = useState(seed);

  // Keep the free-text field in sync when the wheel drives the colour.
  useEffect(() => setText(hex), [hex]);

  const matches = useMemo(
    () => (HEX_RE.test(hex) ? nearestShades(hex, catalogue, 6) : []),
    [hex, catalogue],
  );

  const onText = (value: string) => {
    setText(value);
    if (HEX_RE.test(value)) setHex(value.startsWith("#") ? value : `#${value}`);
  };

  return (
    <div style={{ padding: 20, flex: 1, overflow: "auto" }}>
      <Mono style={{ display: "block", marginBottom: 14 }}>Pick a colour</Mono>

      <ColorWheel hex={hex} onChange={setHex} />

      <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 16 }}>
        <input
          type="color"
          value={HEX_RE.test(hex) ? hex : "#7C9CBF"}
          onChange={(e) => setHex(e.target.value)}
          aria-label="Pick a colour"
          style={{ width: 40, height: 36, border: "1px solid var(--rule-strong)", background: "none", cursor: "pointer", padding: 0 }}
        />
        <input
          type="text"
          value={text}
          onChange={(e) => onText(e.target.value)}
          aria-label="Hex colour"
          spellCheck={false}
          placeholder="#A47148"
          style={{
            flex: 1,
            padding: "9px 12px",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            background: "var(--surface)",
            color: "var(--fg)",
            fontFamily: "var(--mono)",
            fontSize: 13,
          }}
        />
      </div>

      {onApplyExact && (
        <button
          type="button"
          onClick={() => HEX_RE.test(hex) && onApplyExact(hex)}
          disabled={!HEX_RE.test(hex)}
          aria-label={`Apply the exact colour ${hex}`}
          style={{
            marginTop: 12,
            width: "100%",
            padding: "9px 12px",
            cursor: HEX_RE.test(hex) ? "pointer" : "not-allowed",
            background: "transparent",
            border: "1px solid var(--rule-strong)",
            borderRadius: 6,
            color: "var(--fg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
            font: "500 12px/1 var(--sans)",
          }}
        >
          <span aria-hidden style={{ width: 14, height: 14, background: hex, border: "1px solid var(--rule-strong)", borderRadius: 3 }} />
          Use this exact colour
        </button>
      )}

      <div style={{ marginTop: 20 }}>
        <Mono style={{ display: "block", marginBottom: 10 }}>Nearest catalogue shades</Mono>
        {matches.length === 0 ? (
          <p style={{ font: "400 13px/1.4 var(--sans)", color: "var(--fg-mute)" }}>
            Enter a 6-digit hex like #A47148.
          </p>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {matches.map(({ shade, deltaE }, i) => (
              <button
                key={shade.code}
                type="button"
                onClick={() => onSelect(shade)}
                title={`${shade.name} · ${shade.code} · ΔE ${deltaE.toFixed(1)}`}
                aria-label={`Apply ${shade.name}, code ${shade.code}`}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 8,
                  border: "1px solid " + (i === 0 ? "var(--accent)" : "var(--rule)"),
                  borderRadius: 6,
                  background: "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    width: 34,
                    height: 34,
                    flexShrink: 0,
                    background: shade.hex,
                    border: "1px solid var(--rule-strong)",
                    borderRadius: 4,
                  }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                  <span
                    style={{
                      font: "600 13px/1.2 var(--sans)",
                      color: "var(--fg)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {shade.name}
                  </span>
                  <Mono>
                    {shade.code} · {shade.hex} · ΔE {deltaE.toFixed(1)}
                  </Mono>
                </span>
                {i === 0 && <Mono brass>closest</Mono>}
              </button>
            ))}
          </div>
        )}
      </div>

      {activeRegionLabel && (
        <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ font: "400 13px/1.3 var(--sans)", color: "var(--fg-mute)" }}>
            {`Applies to ${activeRegionLabel}`}
          </span>
        </div>
      )}
    </div>
  );
}
