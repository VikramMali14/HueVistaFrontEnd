"use client";

import { useState } from "react";
import { Mono } from "@/components/ui/eyebrow";
import { nearestShades } from "@/lib/color";
import { closenessRating } from "@/lib/color-science";
import { findCompetitorShade, type CompetitorShade } from "@/lib/competitor-shades";
import type { PaintShade } from "@/lib/types";

interface Translation {
  /** What the customer brought in. */
  source: { label: string; hex: string; fromSample: boolean };
  results: Array<{ shade: PaintShade; deltaE: number }>;
}

/**
 * Counter tool: a customer arrives with a Berger/Nerolac code on a slip.
 * Type the code → if our (sample) competitor list knows it, we translate
 * straight away; if not, staff pick the colour off the customer's shade
 * card with the colour input and we match that instead. Either way: the
 * three nearest catalogue shades with an honest closeness rating.
 */
export function CompetitorTranslator({ shades }: { shades: ReadonlyArray<PaintShade> }) {
  const [code, setCode] = useState("");
  const [hex, setHex] = useState("#b46a4a");
  const [unknownCode, setUnknownCode] = useState<string | null>(null);
  const [out, setOut] = useState<Translation | null>(null);

  const translate = (source: { label: string; hex: string; fromSample: boolean }) => {
    setOut({ source, results: nearestShades(source.hex, shades, 3) });
  };

  const onSubmit = () => {
    setUnknownCode(null);
    const q = code.trim();
    if (!q) return;
    const hit: CompetitorShade | undefined = findCompetitorShade(q);
    if (hit) {
      translate({ label: `${hit.brand} ${hit.code} · ${hit.name}`, hex: hit.hex, fromSample: true });
    } else {
      setOut(null);
      setUnknownCode(q);
    }
  };

  return (
    <div style={{ border: "1px solid var(--rule)", padding: "24px 24px 28px", marginBottom: 48 }}>
      <Mono brass>Have a Berger or Nerolac code?</Mono>
      <p style={{ font: "400 18px/1.5 var(--serif)", color: "var(--fg-soft)", margin: "10px 0 18px", maxWidth: "52ch" }}>
        Type the code from the customer&apos;s slip and we&apos;ll find the nearest shades in our
        catalogue — with an honest rating of how close the match really is.
      </p>

      <form onSubmit={(e) => { e.preventDefault(); onSubmit(); }} style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="e.g. BG-3T-0525 or NK-2563"
          aria-label="Competitor shade code"
          spellCheck={false}
          style={{ width: 220, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", fontFamily: "var(--mono)" }}
        />
        <button type="submit" className="btn">Translate <span className="arr">→</span></button>
      </form>

      {unknownCode && (
        <div style={{ marginTop: 18, padding: "14px 16px", border: "1px solid var(--rule)", background: "var(--surface)", borderRadius: 8 }}>
          <p style={{ font: "400 15px/1.5 var(--sans)", color: "var(--fg-soft)", margin: 0 }}>
            We don&apos;t know <span style={{ fontFamily: "var(--mono)" }}>{unknownCode}</span> yet.
            Pick the colour straight off the customer&apos;s shade card instead:
          </p>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginTop: 12, flexWrap: "wrap" }}>
            <input
              type="color"
              value={/^#[0-9a-fA-F]{6}$/.test(hex) ? hex : "#b46a4a"}
              onChange={(e) => setHex(e.target.value)}
              aria-label="Pick the shade card colour"
              style={{ width: 48, height: 40, border: "1px solid var(--rule-strong)", background: "none", cursor: "pointer" }}
            />
            <input
              type="text"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              aria-label="Hex colour"
              spellCheck={false}
              style={{ width: 120, padding: "10px 12px", border: "1px solid var(--rule-strong)", background: "var(--surface)", color: "var(--fg)", fontFamily: "var(--mono)" }}
            />
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                if (/^#?[0-9a-fA-F]{6}$/.test(hex.trim())) {
                  translate({ label: `${unknownCode} (colour picked by eye)`, hex: hex.startsWith("#") ? hex : `#${hex}`, fromSample: false });
                  setUnknownCode(null);
                }
              }}
            >
              Match this colour
            </button>
          </div>
        </div>
      )}

      {out && (
        <div style={{ marginTop: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
            <span style={{ width: 34, height: 34, background: out.source.hex, border: "1px solid var(--rule-strong)", borderRadius: 6, display: "inline-block" }} />
            <Mono>{out.source.label}{out.source.fromSample ? " · sample data, colour approximate" : ""}</Mono>
          </div>
          <div style={{ display: "flex", gap: 16, marginTop: 16, flexWrap: "wrap" }}>
            {out.results.map((r) => {
              const rating = closenessRating(r.deltaE);
              return (
                <div key={r.shade.code} style={{ width: 150 }}>
                  <div style={{ aspectRatio: "1 / 0.8", background: r.shade.hex, border: "1px solid var(--rule-strong)", borderRadius: 6 }} />
                  <div style={{ marginTop: 8, font: "500 14px/1.25 var(--sans)", color: "var(--fg)" }}>{r.shade.name}</div>
                  <Mono>{r.shade.code}</Mono>
                  <div
                    style={{
                      marginTop: 6,
                      font: "500 10px/1 var(--mono)",
                      letterSpacing: ".14em",
                      textTransform: "uppercase",
                      color: rating === "Very close" ? "var(--sage)" : rating === "Close" ? "var(--fg-soft)" : "var(--terracotta)",
                    }}
                  >
                    {rating}
                  </div>
                </div>
              );
            })}
          </div>
          {out.results.some((r) => closenessRating(r.deltaE) === "Not exact") && (
            <p style={{ margin: "14px 0 0", font: "400 13px/1.5 var(--sans)", color: "var(--fg-mute)", maxWidth: "52ch" }}>
              &ldquo;Not exact&rdquo; means the customer may see the difference on a full wall — show
              them the swatch before mixing.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
