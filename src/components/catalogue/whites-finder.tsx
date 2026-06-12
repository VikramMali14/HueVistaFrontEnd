"use client";

import { useMemo, useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { isWhiteShade, whiteTint, WHITE_TINTS, type WhiteTint } from "@/lib/color-science";
import { FullscreenSwatch } from "./fullscreen-swatch";
import type { PaintShade } from "@/lib/types";

const TINT_LABELS: Record<WhiteTint, string> = {
  warm: "Warm (yellow-leaning)",
  pinkish: "Pinkish",
  neutral: "True neutral",
  greenish: "Greenish",
  cool: "Cool (blue-leaning)",
};

/**
 * Whites finder: every near-white in the catalogue, sorted by its hidden
 * tint. Pick any two and "A/B on screen" splits the whole display between
 * them — the only way phone eyes can really tell two whites apart.
 */
export function WhitesFinder({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const [tint, setTint] = useState<WhiteTint | "all">("all");
  const [picked, setPicked] = useState<PaintShade[]>([]);
  const [abOpen, setAbOpen] = useState(false);

  const whites = useMemo(() => {
    const all = shades.filter(isWhiteShade);
    // Warm side first, brightest first inside each tint.
    return [...all].sort((a, b) => {
      const ta = WHITE_TINTS.indexOf(whiteTint(a.hex));
      const tb = WHITE_TINTS.indexOf(whiteTint(b.hex));
      return ta - tb || b.lrv - a.lrv;
    });
  }, [shades]);

  const shown = tint === "all" ? whites : whites.filter((s) => whiteTint(s.hex) === tint);

  const togglePick = (s: PaintShade) => {
    setPicked((prev) => {
      if (prev.some((p) => p.code === s.code)) return prev.filter((p) => p.code !== s.code);
      return [...prev.slice(-1), s]; // keep at most two, newest wins
    });
  };

  if (whites.length === 0) return null;

  return (
    <div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 24 }}>
        {(["all", ...WHITE_TINTS] as ReadonlyArray<WhiteTint | "all">).map((t) => (
          <button
            key={t}
            type="button"
            className="hv-chip"
            onClick={() => setTint(t)}
            aria-pressed={tint === t}
            style={{
              padding: "10px 16px",
              border: "1px solid " + (tint === t ? "var(--accent)" : "var(--rule)"),
              borderRadius: 999,
              background: tint === t ? "var(--surface-soft)" : "transparent",
              color: tint === t ? "var(--fg)" : "var(--fg-soft)",
              font: "500 12px/1 var(--sans)",
              cursor: "pointer",
            }}
          >
            {t === "all" ? `All whites · ${whites.length}` : TINT_LABELS[t]}
          </button>
        ))}
      </div>

      <div className="hv-cat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 18 }}>
        {shown.map((s) => {
          const sel = picked.some((p) => p.code === s.code);
          return (
            <button
              key={s.code}
              type="button"
              onClick={() => togglePick(s)}
              aria-pressed={sel}
              aria-label={`${s.name}, ${TINT_LABELS[whiteTint(s.hex)]}, LRV ${s.lrv}. ${sel ? "Remove from" : "Add to"} A/B compare.`}
              style={{ display: "block", padding: 0, background: "transparent", border: "none", textAlign: "left", cursor: "pointer" }}
            >
              <div
                style={{
                  aspectRatio: "1 / 0.85",
                  background: s.hex,
                  border: "1px solid var(--rule)",
                  outline: sel ? "2px solid var(--accent)" : "none",
                  outlineOffset: 2,
                  borderRadius: 4,
                  position: "relative",
                }}
              >
                {sel && (
                  <span style={{ position: "absolute", top: 8, right: 8, font: "600 11px/1 var(--sans)", color: "rgba(26,22,18,.7)" }}>
                    {picked.findIndex((p) => p.code === s.code) === 0 ? "A" : "B"}
                  </span>
                )}
              </div>
              <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 3 }}>
                <span style={{ font: "500 14px/1.2 var(--sans)", color: "var(--fg)" }}>{s.name}</span>
                <Mono>{whiteTint(s.hex)} · LRV {s.lrv}</Mono>
              </div>
            </button>
          );
        })}
      </div>

      {picked.length > 0 && (
        <div style={{ marginTop: 28, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div style={{ display: "flex", gap: 6 }}>
            {picked.map((s) => (
              <span key={s.code} title={s.name} style={{ width: 34, height: 34, borderRadius: 6, background: s.hex, border: "1px solid var(--rule-strong)", display: "inline-block" }} />
            ))}
          </div>
          <button type="button" className="btn btn-sm" disabled={picked.length < 2} onClick={() => setAbOpen(true)}>
            A/B on full screen
          </button>
          {picked.length < 2 && <Mono>pick one more white</Mono>}
        </div>
      )}

      {abOpen && picked.length === 2 && (
        <FullscreenSwatch shades={picked} onClose={() => setAbOpen(false)} />
      )}
    </div>
  );
}
