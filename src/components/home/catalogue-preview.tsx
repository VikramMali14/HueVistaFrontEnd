import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Lead } from "@/components/ui/eyebrow";

const SWATCHES = [
  "#a47148", "#d6a78a", "#8a5a3a", "#1a1612", "#f3eee4",
  "#c9a17a", "#5b6c5b", "#7a3c2a", "#ebe5d7", "#3e4a52",
  "#8c98a8", "#a9b8a4", "#d4c7a5", "#6e7d6c", "#bda58a",
  "#2f3b3a", "#e2c7a9", "#9b6e4a", "#465259", "#cbb89e",
  "#79584a", "#a78b6c", "#dac1a3", "#3b4845",
];

export function CataloguePreview() {
  return (
    <section>
      <div className="reveal" style={{ display: "grid", gridTemplateColumns: "1fr 1.4fr", gap: 80, alignItems: "center" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Eyebrow>The catalogue</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(48px, 6vw, 84px)" }}>Every shade. <i>Codes intact.</i></h2>
          <Lead>Filter by family, finish, LRV, regional style. Search by code, name or hex. Find what looks closest across brands by colour science — not by approximation.</Lead>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 8 }}>
            <LinkButton href="/catalogue">Browse the catalogue <span className="arr">→</span></LinkButton>
            <LinkButton href="/catalogue" variant="ghost">View a single shade <span className="arr">→</span></LinkButton>
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
          {SWATCHES.map((hex, i) => (
            <div key={i} title={`AP-${String(2104 + i).padStart(4, "0")}`} style={{ background: hex, aspectRatio: "1 / 1" }} />
          ))}
        </div>
      </div>
    </section>
  );
}
