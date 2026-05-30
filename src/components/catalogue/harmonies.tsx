import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";

interface Harmony {
  num: string;
  name: React.ReactNode;
  codes: string;
  stack: ReadonlyArray<[string, string]>;
}

const HARMONIES: ReadonlyArray<Harmony> = [
  { num: "Composition I", name: <>Veranda <em style={{ fontStyle: "italic", color: "var(--brass-soft)" }}>Afternoon</em></>, codes: "AP-1418 · AP-1521 · AP-2001", stack: [["#c87a55", "#9d5236"], ["#d4b88a", "#a47148"], ["#ebe5d7", "#9b8d70"]] },
  { num: "Composition II", name: <>Library <em style={{ fontStyle: "italic", color: "var(--brass-soft)" }}>at Dusk</em></>, codes: "AP-1109 · AP-1820 · AP-0102", stack: [["#7a3a2f", "#3a1612"], ["#d4b88a", "#7a5d3a"], ["#2a2521", "#0a0805"]] },
  { num: "Composition III", name: <>Pondicherry <em style={{ fontStyle: "italic", color: "var(--brass-soft)" }}>Sage</em></>, codes: "AP-1611 · AP-1923 · AP-1718", stack: [["#5b6c5b", "#2e3a2e"], ["#c9bda4", "#8a7c5e"], ["#7a5a3f", "#4a2e1e"]] },
  { num: "Composition IV", name: <>Midnight <em style={{ fontStyle: "italic", color: "var(--brass-soft)" }}>Linen</em></>, codes: "AP-1212 · AP-2001 · AP-1947", stack: [["#3a4870", "#0c1226"], ["#ebe5d7", "#c9bda4"], ["#a89472", "#5a4030"]] },
];

export function Harmonies() {
  return (
    <section style={{ background: "#0a0805", padding: "160px 0", marginTop: 120 }} className="full-bleed">
      <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
        <div className="reveal r-stack-md hv-harmonies-head" style={{ display: "grid", gridTemplateColumns: "60px 1fr 1fr", gap: 48, alignItems: "end", marginBottom: 64 }}>
          <span className="roman" style={{ fontSize: 24 }}>II.</span>
          <div>
            <Eyebrow>Curated harmonies</Eyebrow>
            <h2 className="display" style={{ fontSize: "clamp(48px, 6.5vw, 96px)", marginTop: 24 }}>
              Three-shade <i>combinations.</i>
            </h2>
          </div>
          <Lead style={{ textAlign: "right" }}>A ready triad, each one snapped to a real, in-stock catalogue shade. Tap to apply across main wall, accent, and trim.</Lead>
        </div>

        <div className="reveal d1 r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {HARMONIES.map((h) => (
            <article key={h.num} style={{ border: "1px solid var(--rule)", padding: 0 }}>
              <div className="hv-harmony-stack" style={{ display: "flex", height: 300 }}>
                {h.stack.map(([from, to], i) => (
                  <div key={i} style={{ flex: i === 0 ? 2 : 1, background: `linear-gradient(160deg, ${from}, ${to})` }} />
                ))}
              </div>
              <div style={{ padding: 24 }}>
                <Mono style={{ marginBottom: 10, display: "block" }}>{h.num}</Mono>
                <div className="hv-harmony-name" style={{ fontFamily: "var(--serif)", fontSize: 28, color: "var(--ivory)" }}>{h.name}</div>
                <div style={{ marginTop: 8, font: "300 italic 15px/1.4 var(--serif)", color: "var(--ivory-soft)" }}>{h.codes}</div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
