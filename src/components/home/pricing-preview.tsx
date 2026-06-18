import { LinkButton } from "@/components/ui/button";
import { Mono } from "@/components/ui/eyebrow";

interface Tier { name: string; price: string; feature: string; featured?: boolean; }

const TIERS: ReadonlyArray<Tier> = [
  { name: "Starter", price: "₹499", feature: "20 AI previews / mo" },
  { name: "Professional", price: "₹999", feature: "60 AI previews / mo", featured: true },
  { name: "Business", price: "₹1,999", feature: "150 / mo · white-label" },
  { name: "Enterprise", price: "On request", feature: "Unlimited · API" },
];

export function PricingPreview() {
  return (
    <section>
      <div className="reveal" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 80, flexWrap: "wrap", gap: 24 }}>
        <h2 className="display" style={{ fontSize: "clamp(48px, 7vw, 84px)", maxWidth: "14ch" }}>For retailers, <i>not consumers.</i></h2>
        <LinkButton href="/pricing" size="lg">See all tiers <span className="arr">→</span></LinkButton>
      </div>
      <div className="r-cols-md-2 r-cols-xs-1" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(247,247,245,.14)", border: "1px solid var(--rule)" }}>
        {TIERS.map((t, i) => (
          <div key={t.name} className={`${t.featured ? "hv-tier hv-tier--featured" : "hv-tier"} reveal d${i + 1}`} style={{ background: t.featured ? "var(--ivory)" : "var(--charcoal-soft)", color: t.featured ? "var(--charcoal)" : "var(--ivory)", padding: "48px 36px", display: "flex", flexDirection: "column", gap: 18 }}>
            <Mono style={{ color: t.featured ? "var(--brass-deep)" : "var(--mute)" }}>{t.name}</Mono>
            <div style={{ minHeight: 64, display: "flex", alignItems: "flex-end" }}>
              {t.price === "On request" ? (
                <span style={{ fontFamily: "var(--serif)", fontWeight: 600, fontStyle: "italic", fontSize: 32, lineHeight: 1.1, whiteSpace: "nowrap", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>On request</span>
              ) : (
                <>
                  <span style={{ fontFamily: "var(--serif)", fontWeight: 600, fontSize: 56, lineHeight: 1, color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>{t.price}</span>
                  <span style={{ fontFamily: "var(--serif)", fontSize: 16, marginLeft: 6, color: t.featured ? "var(--mute-deep)" : "var(--mute)" }}>/ month</span>
                </>
              )}
            </div>
            <div style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".2em", textTransform: "uppercase", color: t.featured ? "var(--brass-deep)" : "var(--brass)", borderTop: "1px solid " + (t.featured ? "rgba(21,17,13,.12)" : "rgba(247,247,245,.14)"), paddingTop: 16, marginTop: 8 }}>{t.feature}</div>
          </div>
        ))}
      </div>
      <Mono style={{ display: "block", marginTop: 24 }}>Every tier starts with the same fourteen-day free trial · no card · cancel anytime</Mono>
    </section>
  );
}
