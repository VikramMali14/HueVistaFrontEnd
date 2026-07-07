"use client";

import { Mono } from "@/components/ui/eyebrow";
import { useCopied } from "@/hooks/use-copied";
import { closenessRating } from "@/lib/color-science";
import type { ShadeMatch } from "@/hooks/use-shade-match";

/**
 * The ONE result list every colour-matching tool renders: swatch, shade name,
 * code · company, and a plain-words closeness rating a counter customer can
 * act on — never a raw ΔE number. Clicking a row copies the shade code
 * (default) or hands the shade to `onPick` when the caller applies it instead.
 */
export function MatchList({
  matches,
  offline = false,
  heading = "Nearest catalogue shades",
  onPick,
}: {
  matches: ReadonlyArray<ShadeMatch>;
  /** True when the bundled offline matcher answered instead of the backend. */
  offline?: boolean;
  heading?: string | null;
  /** When set, clicking a row calls this instead of copying the code. */
  onPick?: (shade: ShadeMatch["shade"]) => void;
}) {
  const { copied, copy } = useCopied();

  if (matches.length === 0) return null;

  return (
    <div>
      {heading && (
        <Mono style={{ display: "block", marginBottom: 10 }}>
          {heading}
          {offline ? " · offline" : ""}
        </Mono>
      )}
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {matches.map(({ shade, deltaE }, i) => {
          const rating = closenessRating(deltaE);
          const action = onPick
            ? () => onPick(shade)
            : () => copy(shade.code);
          return (
            <button
              key={shade.code}
              type="button"
              onClick={action}
              title={onPick ? `Apply ${shade.name} (${shade.code})` : `Copy code ${shade.code}`}
              aria-label={
                onPick
                  ? `Apply ${shade.name}, code ${shade.code}, ${rating.toLowerCase()} match.`
                  : `${shade.name}, code ${shade.code}, ${rating.toLowerCase()} match. Click to copy the code.`
              }
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: 8,
                border: "1px solid " + (i === 0 ? "var(--accent)" : "var(--rule)"),
                background: "transparent",
                cursor: "pointer",
                textAlign: "left",
                width: "100%",
              }}
            >
              <span
                aria-hidden
                style={{
                  width: 36,
                  height: 36,
                  background: shade.hex,
                  border: "1px solid var(--rule-strong)",
                  flexShrink: 0,
                }}
              />
              <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0, flex: 1 }}>
                <span
                  className="finder-shade-name"
                  style={{
                    font: "400 16px/1.1 var(--serif)",
                    color: "var(--fg)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shade.name}
                </span>
                <Mono>
                  {shade.code} · {shade.brand} · {rating}
                </Mono>
              </span>
              <Mono brass>
                {onPick ? "apply" : copied === shade.code ? "copied" : i === 0 ? "closest" : "copy"}
              </Mono>
            </button>
          );
        })}
      </div>
    </div>
  );
}
