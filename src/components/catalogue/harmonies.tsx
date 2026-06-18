"use client";

import { useState } from "react";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";

interface Harmony {
  num: string;
  name: React.ReactNode;
  codes: string;
  stack: ReadonlyArray<[string, string]>;
}

const HARMONIES: ReadonlyArray<Harmony> = [
  { num: "Composition I", name: <>Veranda <em style={{ color: "var(--brass-soft)" }}>Afternoon</em></>, codes: "AP-1418 · AP-1521 · AP-2001", stack: [["#c87a55", "#9d5236"], ["#d4b88a", "#a47148"], ["var(--ivory)", "#9b8d70"]] },
  { num: "Composition II", name: <>Library <em style={{ color: "var(--brass-soft)" }}>at Dusk</em></>, codes: "AP-1109 · AP-1820 · AP-0102", stack: [["#7a3a2f", "#3a1612"], ["#d4b88a", "#7a5d3a"], ["var(--charcoal-warm)", "var(--charcoal-deep)"]] },
  { num: "Composition III", name: <>Pondicherry <em style={{ color: "var(--brass-soft)" }}>Sage</em></>, codes: "AP-1611 · AP-1923 · AP-1718", stack: [["#5b6c5b", "#2e3a2e"], ["#c9bda4", "#8a7c5e"], ["#7a5a3f", "#4a2e1e"]] },
  { num: "Composition IV", name: <>Midnight <em style={{ color: "var(--brass-soft)" }}>Linen</em></>, codes: "AP-1212 · AP-2001 · AP-1947", stack: [["#3a4870", "#0c1226"], ["var(--ivory)", "#c9bda4"], ["#a89472", "#5a4030"]] },
];

export function Harmonies() {
  const [copied, setCopied] = useState<string | null>(null);

  const copyCodes = (num: string, codes: string) => {
    navigator.clipboard
      ?.writeText(codes)
      .then(() => {
        setCopied(num);
        setTimeout(() => setCopied((c) => (c === num ? null : c)), 1200);
      })
      .catch(() => {});
  };

  return (
    <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "160px 0", marginTop: 120 }} className="full-bleed">
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <div className="reveal r-stack-md hv-harmonies-head" style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 48, alignItems: "end", marginBottom: 64 }}>
          {/* r-hide-md: drop the 60px spacer when the grid stacks, else it leaves an empty row. */}
          <div aria-hidden className="r-hide-md" />
          <div>
            <Eyebrow>Curated harmonies</Eyebrow>
            <h2 className="display" style={{ fontSize: "clamp(48px, 6.5vw, 96px)", marginTop: 24 }}>
              Three-shade <i>combinations.</i>
            </h2>
          </div>
          <Lead style={{ textAlign: "right" }}>Three shades that sit well together — each one a real catalogue colour with its code, ready for main wall, accent and trim.</Lead>
        </div>

        <div className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {HARMONIES.map((h, i) => (
            <article key={h.num} className={`reveal d${i + 1}`} style={{ border: "1px solid var(--rule)", padding: 0 }}>
              <div className="hv-harmony-stack" style={{ display: "flex", height: 300 }}>
                {h.stack.map(([from, to], j) => (
                  <div key={j} style={{ flex: j === 0 ? 2 : 1, background: `linear-gradient(160deg, ${from}, ${to})` }} />
                ))}
              </div>
              <div style={{ padding: 24 }}>
                <Mono style={{ marginBottom: 10, display: "block" }}>{h.num}</Mono>
                <div className="hv-harmony-name" style={{ fontFamily: "var(--serif)", fontSize: 28, color: "var(--ivory)" }}>{h.name}</div>
                <button
                  type="button"
                  onClick={() => copyCodes(h.num, h.codes)}
                  aria-label={`Copy shade codes ${h.codes}`}
                  style={{ marginTop: 8, padding: 0, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", font: "400 15px/1.4 var(--serif)", color: "var(--ivory-soft)" }}
                >
                  {copied === h.num ? `${h.codes} · copied` : `${h.codes} · copy`}
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
