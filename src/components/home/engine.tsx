import { Eyebrow } from "@/components/ui/eyebrow";
import { Placeholder } from "@/components/ui/placeholder";

export function Engine() {
  return (
    <section className="full-bleed" style={{ background: "#0a0805", color: "var(--ivory)", position: "relative", paddingTop: 160, paddingBottom: 160, borderTop: "1px solid var(--rule-brass)", borderBottom: "1px solid var(--rule-brass)" }}>
      <div className="reveal" style={{ maxWidth: "var(--max)", margin: "0 auto", display: "grid", gridTemplateColumns: "60px 1fr", gap: 48 }}>
        <span className="roman" style={{ fontSize: 24 }}>III.</span>
        <div>
          <Eyebrow>The Engine</Eyebrow>
          <h2 className="display" style={{ fontSize: "clamp(72px, 10vw, 132px)", maxWidth: "13ch", marginTop: 32 }}>It is the original photograph.<br /><i>Only the wall has changed.</i></h2>
          <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, marginTop: 56, alignItems: "center" }}>
            <p style={{ font: "300 italic 22px/1.55 var(--serif)", color: "var(--ivory-soft)", maxWidth: "38ch" }}>
              No generative imagination. No furniture quietly rearranged. No sofa that has drifted four inches to the left. The afternoon light, the shadow under the cornice, the texture of the paint already on the wall — preserved. We replace exactly one thing: the hue.
            </p>
            <Placeholder tone="ink" style={{ aspectRatio: "21 / 12", position: "relative" }}>
              <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "1fr 1fr" }}>
                <div className="center" style={{ borderRight: "1px solid rgba(243,238,228,.4)" }}>
                  <span className="ph-label" style={{ position: "static" }}>before</span>
                </div>
                <div className="center" style={{ background: "rgba(164,113,72,.28)" }}>
                  <span className="ph-label" style={{ position: "static" }}>after</span>
                </div>
              </div>
            </Placeholder>
          </div>
        </div>
      </div>
    </section>
  );
}
