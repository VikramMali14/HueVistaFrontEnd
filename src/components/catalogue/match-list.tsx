"use client";

import { Mono } from "@/components/ui/eyebrow";
import { useCopied } from "@/hooks/use-copied";
import { useShadeCodeScheme } from "@/hooks/use-shade-code-scheme";
import { closenessRating } from "@/lib/color-science";
import { encodeShadeCode, hasScheme } from "@/lib/shade-codes";
import type { ShadeMatch } from "@/hooks/use-shade-match";

/**
 * The ONE result list every colour-matching tool renders: swatch, shade name,
 * code · company, and a plain-words closeness rating a counter customer can
 * act on — never a raw ΔE number. Clicking a row copies the shade code
 * (default) or hands the shade to `onPick` when the caller applies it instead.
 *
 * Under a shop's own numbering this shows — and copies — the SHOP's code, and
 * drops the paint name and company when the shop hides names. This list is the
 * counter's colour finder: printing the manufacturer's code here would undo the
 * shop's pattern at exactly the moment a customer is reading over the shoulder.
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
  const scheme = useShadeCodeScheme();
  const showNames = scheme?.showNames !== false;
  const codeOf = (code: string) => (hasScheme(scheme) ? encodeShadeCode(scheme, code) : code);

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
          const code = codeOf(shade.code);
          const label = showNames ? shade.name : code;
          const action = onPick
            ? () => onPick(shade)
            : () => copy(code);
          return (
            <button
              key={shade.code}
              type="button"
              onClick={action}
              title={onPick ? `Apply ${label} (${code})` : `Copy code ${code}`}
              aria-label={
                onPick
                  ? `Apply ${label}, code ${code}, ${rating.toLowerCase()} match.`
                  : `${label}, code ${code}, ${rating.toLowerCase()} match. Click to copy the code.`
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
                  {label}
                </span>
                <Mono>
                  {code} · {showNames ? `${shade.brand} · ` : ""}
                  {rating}
                </Mono>
              </span>
              <Mono brass>
                {onPick ? "apply" : copied === code ? "copied" : i === 0 ? "closest" : "copy"}
              </Mono>
            </button>
          );
        })}
      </div>
    </div>
  );
}
