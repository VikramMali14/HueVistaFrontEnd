import { Mono } from "@/components/ui/eyebrow";

const BRANDS = [
  { name: "Asian Paints", mark: "i" },
  { name: "Berger", mark: "ii" },
  { name: "Nerolac", mark: "ii" },
  { name: "Dulux", mark: "iii" },
  { name: "Indigo", mark: "iii" },
] as const;

export function Partners() {
  return (
    <section id="partners" style={{ padding: "80px 0", borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)" }}>
      <div className="reveal" style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 48, flexWrap: "wrap" }}>
        <Mono>Built for the catalogues of</Mono>
        <div style={{ display: "flex", gap: 56, alignItems: "baseline", flexWrap: "wrap" }}>
          {BRANDS.map((b, i) => (
            <span key={b.name} style={{ fontFamily: "var(--serif)", fontStyle: "italic", fontSize: 32, color: i === 0 ? "var(--fg)" : "var(--fg-mute)" }}>
              {b.name}
              <sup style={{ fontSize: 11, marginLeft: 2, color: i === 0 ? "var(--accent)" : "inherit" }}>{b.mark}</sup>
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
