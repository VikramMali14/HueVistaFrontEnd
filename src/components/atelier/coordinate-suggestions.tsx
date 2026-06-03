"use client";

import { useMemo } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { suggestForRole } from "@/lib/harmony";
import type { PaintShade, RegionKind, UiVariant } from "@/lib/types";

/** The minimal slice of a region the coordinate panel needs. */
export interface RegionLite {
  id: string;
  kind: RegionKind;
  label: string;
  hex: string;
  applied: boolean;
  shadeCode?: string;
}

/**
 * "Complete the look": once a colour is on the active wall, suggest catalogue
 * shades that coordinate with it for every wall in the room — tonal neighbours
 * for the active wall, soft trims for the trim, contrasting accents for the
 * accent/border. Clicking a suggestion applies it to that specific wall.
 */
export function CoordinateSuggestions({
  baseHex,
  activeRegionId,
  regions,
  catalogue,
  onApplyToRegion,
  variant = "premium",
}: {
  baseHex: string;
  activeRegionId: string;
  regions: ReadonlyArray<RegionLite>;
  catalogue: ReadonlyArray<PaintShade>;
  onApplyToRegion: (regionId: string, shade: PaintShade) => void;
  variant?: UiVariant;
}) {
  const isClassic = variant === "classic";

  const groups = useMemo(() => {
    // Start by excluding colours already placed on a wall, then grow the exclude
    // list as we go so two groups never surface the SAME shade (e.g. two walls of
    // the same kind would otherwise render identical suggestion rows).
    const seen = regions.map((r) => r.shadeCode).filter((c): c is string => Boolean(c));
    // Active wall first, then the rest in their natural order.
    const ordered = [...regions].sort((a, b) =>
      a.id === activeRegionId ? -1 : b.id === activeRegionId ? 1 : 0,
    );
    const out: Array<{ region: RegionLite; shades: PaintShade[]; isActive: boolean }> = [];
    for (const r of ordered) {
      const isActive = r.id === activeRegionId;
      // Active wall → tonal neighbours of the pick; other walls → role-coordinated.
      const role: RegionKind = isActive ? "MAIN_WALL" : r.kind;
      const shades = suggestForRole(baseHex, role, catalogue, isClassic ? 3 : 4, seen);
      if (shades.length === 0) continue;
      out.push({ region: r, shades, isActive });
      for (const s of shades) seen.push(s.code);
    }
    return out;
  }, [baseHex, activeRegionId, regions, catalogue, isClassic]);

  if (groups.length === 0) return null;

  return (
    <div style={{ marginTop: 22, paddingTop: 18, borderTop: "1px solid var(--rule)" }}>
      {isClassic ? (
        <span
          style={{
            display: "block",
            marginBottom: 4,
            font: "600 11px/1 var(--sans, system-ui)",
            letterSpacing: ".06em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
          }}
        >
          Shades that pair with this
        </span>
      ) : (
        <Mono style={{ display: "block", marginBottom: 4 }}>Shades that pair · complete the look</Mono>
      )}
      <p
        style={{
          margin: "0 0 14px",
          ...(isClassic
            ? { font: "400 12px/1.4 var(--sans, system-ui)" }
            : { font: "300 italic 13px/1.4 var(--serif)" }),
          color: "var(--fg-mute)",
        }}
      >
        Tap a swatch to apply it to that wall.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {groups.map(({ region, shades, isActive }) => (
          <div key={region.id}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <span
                aria-hidden
                style={{
                  width: 11,
                  height: 11,
                  background: region.hex,
                  border: "1px solid var(--rule-strong)",
                  borderRadius: isClassic ? "50%" : 0,
                  flexShrink: 0,
                }}
              />
              <span
                style={{
                  ...(isClassic
                    ? { font: "600 13px/1 var(--sans, system-ui)" }
                    : { font: "300 italic 15px/1 var(--serif)" }),
                  color: "var(--fg)",
                }}
              >
                {isActive ? `More like this · ${region.label}` : `For ${region.label}`}
              </span>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              {shades.map((s) => (
                <button
                  key={s.code}
                  type="button"
                  onClick={() => onApplyToRegion(region.id, s)}
                  title={`${s.name} · ${s.code} → ${region.label}`}
                  aria-label={`Apply ${s.name} to ${region.label}`}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                    padding: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      height: isClassic ? 40 : 44,
                      background: s.hex,
                      border: "1px solid var(--rule-strong)",
                      borderRadius: isClassic ? 4 : 0,
                    }}
                  />
                  <span
                    style={{
                      font: "400 9px/1.2 var(--mono)",
                      letterSpacing: ".04em",
                      color: "var(--fg-mute)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {s.code}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
