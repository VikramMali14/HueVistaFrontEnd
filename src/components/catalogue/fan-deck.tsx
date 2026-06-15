"use client";

import { useEffect, useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { fanDeck } from "@/lib/color-science";
import { UndertoneTag } from "./undertone-tag";
import type { PaintShade } from "@/lib/types";

interface FanDeckProps {
  shade: PaintShade;
  catalogue: ReadonlyArray<PaintShade>;
  onClose: () => void;
  /** Optional: "hold to wall" hook for the focused strip entry. */
  onHoldToWall?: (shade: PaintShade) => void;
  hideCodes?: boolean;
}

/**
 * The paper fan-deck strip, on screen: this shade's family from lightest to
 * darkest. ↑/↓ (or the buttons) step the focus one shade lighter or darker —
 * exactly how retailers flip a physical shade card at the counter.
 */
export function FanDeck({ shade, catalogue, onClose, onHoldToWall, hideCodes = false }: FanDeckProps) {
  const strip = useMemo(() => fanDeck(shade, catalogue, 9), [shade, catalogue]);
  const [focusCode, setFocusCode] = useState(shade.code);
  const focusIdx = Math.max(0, strip.findIndex((s) => s.code === focusCode));
  const focused = strip[focusIdx] ?? shade;

  const step = (dir: -1 | 1) => {
    const next = strip[focusIdx + dir];
    if (next) setFocusCode(next.code);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowUp") { e.preventDefault(); step(-1); }
      if (e.key === "ArrowDown") { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  return (
    <div
      role="dialog"
      aria-label={`Shade strip around ${shade.name}`}
      style={{ position: "fixed", inset: 0, zIndex: 180, display: "flex", alignItems: "center", justifyContent: "center", padding: 18 }}
    >
      <button type="button" aria-label="Close shade strip" onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(8,8,7,.6)", border: "none", cursor: "pointer" }} />
      <div
        style={{
          position: "relative",
          width: "min(420px, 94vw)",
          maxHeight: "88vh",
          overflow: "auto",
          background: "var(--surface)",
          border: "1px solid var(--rule-strong)",
          borderRadius: 12,
          boxShadow: "0 40px 80px -32px rgba(0,0,0,.6)",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, rowGap: 10, flexWrap: "wrap", padding: "14px 16px", borderBottom: "1px solid var(--rule)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={{ font: "600 15px/1.2 var(--sans)", color: "var(--fg)" }}>Shade strip</span>
            <Mono>lightest → darkest · like the paper card</Mono>
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button type="button" aria-label="One shade lighter" onClick={() => step(-1)} disabled={focusIdx <= 0} className="hv-fan-step">↑ lighter</button>
            <button type="button" aria-label="One shade darker" onClick={() => step(1)} disabled={focusIdx >= strip.length - 1} className="hv-fan-step">↓ darker</button>
            <button type="button" aria-label="Close" onClick={onClose} className="hv-fan-step">✕</button>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          {strip.map((s) => {
            const isFocus = s.code === focused.code;
            const ink = s.lrv >= 45 ? "rgba(26,22,18,.78)" : "rgba(255,255,255,.85)";
            return (
              <button
                key={s.code}
                type="button"
                onClick={() => setFocusCode(s.code)}
                aria-pressed={isFocus}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: isFocus ? "26px 16px" : "16px 16px",
                  background: s.hex,
                  border: "none",
                  borderTop: "1px solid rgba(0,0,0,.08)",
                  outline: isFocus ? "2px solid var(--accent)" : "none",
                  outlineOffset: -4,
                  cursor: "pointer",
                  transition: "padding .2s var(--ease)",
                  textAlign: "left",
                }}
              >
                <span style={{ font: `${isFocus ? 600 : 500} 14px/1.2 var(--sans)`, color: ink }}>{s.name}</span>
                <span style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".14em", color: ink, opacity: 0.85, whiteSpace: "nowrap" }}>
                  {hideCodes ? `LRV ${s.lrv}` : `${s.code} · LRV ${s.lrv}`}
                </span>
              </button>
            );
          })}
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, rowGap: 10, flexWrap: "wrap", padding: "12px 16px", borderTop: "1px solid var(--rule)", background: "var(--surface-soft)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 0 }}>
            <span style={{ font: "600 14px/1.2 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{focused.name}</span>
            <UndertoneTag hex={focused.hex} prefix />
          </div>
          {onHoldToWall && (
            <button type="button" className="btn btn-sm" onClick={() => onHoldToWall(focused)}>
              Hold to wall
            </button>
          )}
        </div>
      </div>
      <style>{`
        .hv-fan-step { padding: 8px 10px; min-height: 34px; font: 500 12px/1 var(--sans); border: 1px solid var(--rule-strong); border-radius: 6px; background: var(--surface); color: var(--fg); cursor: pointer; }
        .hv-fan-step:disabled { opacity: .4; cursor: default; }
      `}</style>
    </div>
  );
}
