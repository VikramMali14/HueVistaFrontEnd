"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { lightShift, LIGHT_SHIFT_BADGE, undertoneClash } from "@/lib/color-science";
import { readableInk } from "@/lib/color";
import { useShadeLabels } from "@/hooks/use-shade-code-scheme";
import { UndertoneTag } from "./undertone-tag";
import { FullscreenSwatch } from "./fullscreen-swatch";
import type { PaintShade } from "@/lib/types";

export const COMPARE_MAX = 4;

/** Sticky bottom tray showing the shades queued for comparison. */
export function CompareTray({
  shades,
  onRemove,
  onClear,
  onOpen,
}: {
  shades: ReadonlyArray<PaintShade>;
  onRemove: (code: string) => void;
  onClear: () => void;
  onOpen: () => void;
}) {
  // Before the early return — hooks can't hide behind a condition.
  const { nameOf } = useShadeLabels();
  if (shades.length === 0) return null;
  return (
    <div
      style={{
        position: "fixed",
        left: "50%",
        transform: "translateX(-50%)",
        bottom: "calc(18px + env(safe-area-inset-bottom))",
        zIndex: 120,
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "10px 12px",
        borderRadius: 999,
        background: "var(--nav-bg-strong)",
        border: "1px solid var(--rule-strong)",
        boxShadow: "0 24px 48px -20px rgba(0,0,0,.5)",
        backdropFilter: "blur(14px)",
        WebkitBackdropFilter: "blur(14px)",
        // Never wider than a phone screen; swatches shrink before it clips.
        maxWidth: "calc(100vw - 16px)",
      }}
    >
      <div style={{ display: "flex", gap: 6 }}>
        {shades.map((s) => (
          <button
            key={s.code}
            type="button"
            onClick={() => onRemove(s.code)}
            title={`Remove ${nameOf(s)} from compare`}
            aria-label={`Remove ${nameOf(s)} from compare`}
            style={{ width: 30, height: 30, minHeight: 30, borderRadius: 6, background: s.hex, border: "1px solid var(--rule-strong)", cursor: "pointer", padding: 0 }}
          />
        ))}
      </div>
      <button
        type="button"
        className="btn btn-sm"
        onClick={onOpen}
        disabled={shades.length < 2}
        title={shades.length < 2 ? "Pick one more shade to compare" : undefined}
      >
        Compare {shades.length}
      </button>
      <button
        type="button"
        onClick={onClear}
        aria-label="Clear comparison"
        style={{ background: "transparent", border: "none", color: "var(--fg-mute)", cursor: "pointer", font: "400 12px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", padding: "6px 4px" }}
      >
        Clear
      </button>
    </div>
  );
}

/** Full-screen side-by-side comparison of 2–4 shades. */
export function CompareOverlay({
  shades,
  onClose,
  onRemove,
  hideCodes = false,
}: {
  shades: ReadonlyArray<PaintShade>;
  onClose: () => void;
  onRemove: (code: string) => void;
  hideCodes?: boolean;
}) {
  const [wall, setWall] = useState<ReadonlyArray<PaintShade> | null>(null);
  const { showNames, codeOf, nameOf } = useShadeLabels();

  // Pairwise undertone check — surface the first fight we find.
  const clashNote = useMemo(() => {
    for (let i = 0; i < shades.length; i++) {
      for (let j = i + 1; j < shades.length; j++) {
        const v = undertoneClash(shades[i]!.hex, shades[j]!.hex);
        if (v.clash) return `${nameOf(shades[i]!)} + ${nameOf(shades[j]!)}: ${v.reason}`;
      }
    }
    return null;
  }, [shades, nameOf]);

  if (wall) {
    return <FullscreenSwatch shades={wall} onClose={() => setWall(null)} hideCodes={hideCodes} />;
  }

  return (
    <div role="dialog" aria-label="Compare shades" style={{ position: "fixed", inset: 0, zIndex: 150, background: "var(--bg)", display: "flex", flexDirection: "column" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "14px var(--gutter)", borderBottom: "1px solid var(--rule)" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
          <span style={{ font: "600 16px/1.2 var(--sans)", color: "var(--fg)" }}>Side by side</span>
          <Mono>{shades.length} shades · tap a column for full screen</Mono>
        </div>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onClose}>Done</button>
      </div>

      {clashNote && (
        <div role="note" style={{ padding: "10px var(--gutter)", borderBottom: "1px solid var(--rule)", background: "var(--surface-soft)", font: "400 13px/1.45 var(--sans)", color: "var(--fg-soft)" }}>
          ⚠ {clashNote}
        </div>
      )}

      <div
        className="hv-compare-cols"
        style={{ "--cols": shades.length, "--cols-sm": Math.min(2, shades.length) } as React.CSSProperties}
      >
        {shades.map((s) => {
          const { soft: inkSoft } = readableInk(s.hex);
          const shift = lightShift(s.hex);
          return (
            <div key={s.code} className="hv-compare-col" style={{ minWidth: 0, display: "flex", flexDirection: "column", borderRight: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
              <button
                type="button"
                className="hv-compare-swatch"
                onClick={() => setWall([s])}
                aria-label={`View ${nameOf(s)} full screen`}
                style={{ background: s.hex, border: "none", cursor: "pointer", position: "relative" }}
              >
                <span style={{ position: "absolute", top: 12, left: 12, font: "400 12px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", color: inkSoft }}>
                  {s.brand}
                </span>
              </button>
              <div style={{ padding: "12px 12px 14px", display: "flex", flexDirection: "column", gap: 6, background: "var(--surface)" }}>
                <span style={{ font: "600 14px/1.25 var(--sans)", color: "var(--fg)", overflow: "hidden", textOverflow: "ellipsis" }}>{nameOf(s)}</span>
                <Mono>
                  {hideCodes ? s.brand : (
                    <>
                      <span className="shade-code">{codeOf(s)}</span>{showNames ? ` · ${s.brand}` : ""}
                    </>
                  )}
                </Mono>
                <UndertoneTag hex={s.hex} prefix />
                {shift.score >= LIGHT_SHIFT_BADGE && (
                  <span title="This colour changes noticeably under a warm bulb" style={{ display: "inline-flex", alignItems: "center", gap: 6, font: "400 12px/1 var(--mono)", letterSpacing: ".12em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
                    <span aria-hidden style={{ width: 14, height: 8, borderRadius: 2, background: `linear-gradient(90deg, ${s.hex} 50%, ${shift.warmHex} 50%)`, border: "1px solid var(--rule-strong)" }} />
                    shifts in lamplight
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => onRemove(s.code)}
                  style={{ alignSelf: "flex-start", marginTop: 2, background: "transparent", border: "none", color: "var(--fg-mute)", cursor: "pointer", font: "400 12px/1 var(--mono)", letterSpacing: ".14em", textTransform: "uppercase", padding: "6px 0" }}
                >
                  Remove
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <style>{`
        /* One column per shade on wide screens; phones get a 2-up grid that
           scrolls vertically, so 3-4 swatches stay big enough to judge. */
        .hv-compare-cols {
          flex: 1; min-height: 0;
          display: grid;
          grid-template-columns: repeat(var(--cols), 1fr);
          overflow-y: auto;
        }
        .hv-compare-swatch { flex: 1; min-height: 200px; }
        @media (max-width: 640px) {
          .hv-compare-cols { grid-template-columns: repeat(var(--cols-sm), 1fr); align-content: start; }
          .hv-compare-swatch { flex: none; min-height: clamp(140px, 26vh, 240px); }
        }
      `}</style>
    </div>
  );
}
