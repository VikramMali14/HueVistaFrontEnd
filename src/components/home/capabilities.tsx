import { Eyebrow, Mono } from "@/components/ui/eyebrow";

const ROWS = [
  ["01", "WhatsApp-first share", "A single tap. PNG or short link."],
  ["02", "White-label subdomain", "{your-shop}.huevista.com. Your name on the door."],
  ["03", "Per-region recolour", "Different walls, different colours. The feature wall, alone."],
  ["04", "AI three-colour combination", "Claude proposes; ΔE snaps each hex to a real shade."],
  ["05", "CIELAB find-similar", "Show me what is close to this. Across brands."],
  ["06", "Paint quantity estimate", "Pixel area → square feet → litres per finish."],
  ["07", "Auto-save", "Every two seconds. There is no save button."],
  ["08", "Image cleaning", "Optional. Wires, debris, parked cars — quietly removed."],
] as const;

export function Capabilities() {
  return (
    <section id="capabilities" className="hv-capabilities">
      <div className="reveal r-stack-sm hv-cap-head" style={{ display: "grid", gridTemplateColumns: "80px 1fr", gap: 48, marginBottom: 64 }}>
        <span className="roman" style={{ fontSize: 24 }}>IV.</span>
        <div>
          <Eyebrow>Built for the way paint sells</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 84px)", marginTop: 24 }}>An index of <i>quiet capabilities.</i></h2>
        </div>
      </div>
      <div className="reveal d1">
        {ROWS.map(([n, t, d], i) => (
          <div key={n} className="hv-cap-row" style={{ display: "grid", gridTemplateColumns: "80px 360px 1fr auto", alignItems: "baseline", gap: 40, padding: "32px 0", borderTop: "1px solid var(--rule)", borderBottom: i === ROWS.length - 1 ? "1px solid var(--rule)" : "none" }}>
            <Mono>{n}</Mono>
            <span className="hv-cap-name" style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 36, lineHeight: 1, color: "var(--fg)" }}>{t}</span>
            <span className="hv-cap-desc" style={{ font: "300 italic 18px/1.5 var(--serif)", color: "var(--fg-mute)", maxWidth: "60ch" }}>{d}</span>
            <Mono>→</Mono>
          </div>
        ))}
      </div>
    </section>
  );
}
