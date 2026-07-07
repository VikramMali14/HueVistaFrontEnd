"use client";

import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { useCopied } from "@/hooks/use-copied";
import { hexToHsv, hsvToHex } from "@/lib/color";
import { findShadeByCode } from "@/lib/shades";
import type { PaintShade } from "@/lib/types";

interface Harmony {
  num: string;
  name: React.ReactNode;
  /** Real catalogue shades, main → accent → trim. */
  trio: [PaintShade, PaintShade, PaintShade];
}

/** A slightly darker step of the same colour, for the gradient band. */
function deepen(hex: string): string {
  const { h, s, v } = hexToHsv(hex);
  return hsvToHex({ h, s: Math.min(1, s * 1.08), v: v * 0.62 });
}

/**
 * Curated three-shade compositions built from REAL shades in the bundled
 * catalogue (lib/shades.ts) — the same codes the studio and colour finder
 * fall back to — so every code shown here can actually be looked up.
 */
function trio(codes: [string, string, string]): [PaintShade, PaintShade, PaintShade] | null {
  const shades = codes.map(findShadeByCode);
  return shades.every(Boolean) ? (shades as [PaintShade, PaintShade, PaintShade]) : null;
}

const COMPOSITIONS: ReadonlyArray<{ num: string; name: React.ReactNode; codes: [string, string, string] }> = [
  { num: "Composition I", name: <>Veranda <em style={{ color: "var(--brass-soft)" }}>Afternoon</em></>, codes: ["AP-1428", "AP-2104", "AP-N101"] },
  { num: "Composition II", name: <>Library <em style={{ color: "var(--brass-soft)" }}>at Dusk</em></>, codes: ["AP-3318", "AP-2208", "AP-9921"] },
  { num: "Composition III", name: <>Pondicherry <em style={{ color: "var(--brass-soft)" }}>Sage</em></>, codes: ["AP-7720", "AP-9940", "AP-3304"] },
  { num: "Composition IV", name: <>Midnight <em style={{ color: "var(--brass-soft)" }}>Linen</em></>, codes: ["AP-9912", "AP-N110", "AP-2230"] },
];

const HARMONIES: ReadonlyArray<Harmony> = COMPOSITIONS.flatMap(({ num, name, codes }) => {
  const t = trio(codes);
  return t ? [{ num, name, trio: t }] : [];
});

export function Harmonies() {
  const { copied, copy } = useCopied();

  return (
    <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "160px 0", marginTop: 120 }} className="full-bleed">
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <div className="reveal r-stack-md hv-harmonies-head" style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 48, alignItems: "end", marginBottom: 64 }}>
          {/* r-hide-md: drop the 60px spacer when the grid stacks, else it leaves an empty row. */}
          <div aria-hidden className="r-hide-md" />
          <div>
            <Eyebrow>Curated harmonies</Eyebrow>
            <h2 className="display" style={{ fontSize: "clamp(48px, 6.5vw, 96px)", marginTop: 24, color: "var(--ivory)" }}>
              Three-shade <i>combinations.</i>
            </h2>
          </div>
          <Lead style={{ textAlign: "right" }}>Three shades that sit well together — each one a real catalogue colour with its code, ready for main wall, accent and trim.</Lead>
        </div>

        <div className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {HARMONIES.map((h, i) => {
            const codes = h.trio.map((s) => s.code).join(" · ");
            return (
              <article key={h.num} className={`reveal d${i + 1}`} style={{ border: "1px solid var(--rule)", padding: 0 }}>
                <div className="hv-harmony-stack" style={{ display: "flex", height: 300 }}>
                  {h.trio.map((s, j) => (
                    <div key={s.code} title={`${s.name} · ${s.code}`} style={{ flex: j === 0 ? 2 : 1, background: `linear-gradient(160deg, ${s.hex}, ${deepen(s.hex)})` }} />
                  ))}
                </div>
                <div style={{ padding: 24 }}>
                  <Mono style={{ marginBottom: 10, display: "block" }}>{h.num}</Mono>
                  <div className="hv-harmony-name" style={{ fontFamily: "var(--serif)", fontSize: 28, color: "var(--ivory)" }}>{h.name}</div>
                  <button
                    type="button"
                    onClick={() => copy(h.num, codes)}
                    aria-label={`Copy shade codes ${codes}`}
                    style={{ marginTop: 8, padding: 0, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", font: "400 15px/1.4 var(--serif)", color: "var(--ivory-soft)" }}
                  >
                    {copied === h.num ? `${codes} · copied` : `${codes} · copy`}
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
