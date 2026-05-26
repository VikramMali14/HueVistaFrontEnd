import type { Metadata } from "next";
import { Marquee } from "@/components/layout/marquee";
import { Nav } from "@/components/layout/nav";
import { Footer } from "@/components/layout/footer";
import { LinkButton } from "@/components/ui/button";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";

export const metadata: Metadata = {
  title: "Pricing",
  description: "For retailers, not consumers. Four tiers. One catalogue.",
};

const TIERS = [
  { name: "Starter", price: "₹499", lede: "For the single-counter shop. Test the waters quietly.", featured: false, features: ["Asian Paints catalogue", "20 AI renders / month", "WhatsApp share", "Browser-side recolour", "Email support"] },
  { name: "Professional", price: "₹999", lede: "For the busy counter. Three devices. Recommended.", featured: true, ribbon: "Recommended", features: ["Everything in Starter", "60 AI renders / month", "AI colour recommendations", "Save unlimited projects", "Priority email"] },
  { name: "Business", price: "₹1,999", lede: "For multi-shop and white-label.", featured: false, features: ["Everything in Professional", "150 AI renders / month", "White-label subdomain", "Painter portal", "WhatsApp Business support"] },
  { name: "Enterprise", price: "On request", lede: "API, dedicated onboarding, regional pricing.", featured: false, features: ["Unlimited AI renders", "Public API access", "Dedicated onboarding", "Custom catalogue support", "Phone support"] },
];

const MATRIX: ReadonlyArray<[string, string, string, string, string]> = [
  ["Asian Paints catalogue", "✓", "✓", "✓", "✓"],
  ["AI renders / month", "20", "60", "150", "Unlimited"],
  ["WhatsApp share", "✓", "✓", "✓", "✓"],
  ["AI colour recommendations", "—", "✓", "✓", "✓"],
  ["Projects (saved)", "10", "Unlimited", "Unlimited", "Unlimited"],
  ["White-label subdomain", "—", "—", "✓", "✓"],
  ["Painter portal", "—", "—", "✓", "✓"],
  ["Public API", "—", "—", "—", "✓"],
  ["Onboarding", "Self-serve", "30-min call", "Priority", "Dedicated"],
];

const headStyle: React.CSSProperties = { textAlign: "left", padding: "32px 24px", borderBottom: "1px solid var(--rule-strong)", font: "400 10px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", color: "var(--brass)" };
const cellStyle: React.CSSProperties = { textAlign: "left", padding: "22px 24px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--sans)", fontWeight: 300, fontSize: 15, verticalAlign: "top" };

export default function PricingPage() {
  return (
    <>
      <Marquee items={["Pricing", "Four tiers · one catalogue", "For retailers, not consumers"]} />
      <Nav />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume IV &nbsp;·&nbsp; Pricing</Eyebrow>
            <Mono>All prices ex-GST &nbsp;·&nbsp; INR</Mono>
          </div>
          <h1 className="display">For retailers,<br /><i>not consumers.</i></h1>
          <Lead className="page-lead">Four tiers, priced for the counter. Colour application is unlimited on every tier — only the generative AI quota varies.</Lead>
        </header>
        <section style={{ paddingTop: 80 }}>
          <div className="reveal" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "var(--rule)", border: "1px solid var(--rule)" }}>
            {TIERS.map((t) => (
              <div key={t.name} style={{ background: t.featured ? "var(--ivory)" : "var(--charcoal)", color: t.featured ? "var(--charcoal)" : "var(--ivory)", padding: "56px 36px", display: "flex", flexDirection: "column", gap: 24, position: "relative" }}>
                {t.ribbon && (<span style={{ position: "absolute", top: 0, right: 24, background: "var(--brass)", color: "var(--charcoal)", font: "500 9px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", padding: "8px 14px", transform: "translateY(-50%)" }}>{t.ribbon}</span>)}
                <div style={{ font: "400 11px/1 var(--mono)", letterSpacing: ".3em", textTransform: "uppercase", color: t.featured ? "var(--brass-deep)" : "var(--brass)" }}>{t.name}</div>
                <div style={{ fontFamily: "var(--serif)", fontWeight: 300, fontSize: 72, lineHeight: 1, letterSpacing: "-.025em", color: t.featured ? "var(--charcoal)" : "var(--ivory)" }}>{t.price}{t.price !== "On request" && <span style={{ font: "400 italic 18px/1 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--mute)", marginLeft: 6 }}>/ mo</span>}</div>
                <p style={{ font: "300 italic 17px/1.5 var(--serif)", color: t.featured ? "var(--mute-deep)" : "var(--ivory-soft)", borderTop: "1px solid " + (t.featured ? "rgba(21,17,13,.12)" : "var(--rule)"), paddingTop: 18 }}>{t.lede}</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {t.features.map((f) => (<div key={f} style={{ display: "flex", gap: 10, font: "300 15px/1.45 var(--sans)", color: t.featured ? "var(--charcoal)" : "var(--ivory-soft)" }}><span style={{ color: "var(--brass)", fontFamily: "var(--mono)", fontSize: 18, lineHeight: 1 }}>·</span><span>{f}</span></div>))}
                </div>
                <div style={{ marginTop: "auto" }}><LinkButton href="/trial" variant={t.featured ? "primary" : "ghost"}>Begin a trial <span className="arr">→</span></LinkButton></div>
              </div>
            ))}
          </div>
        </section>
        <section>
          <div className="reveal" style={{ marginBottom: 40, display: "flex", alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
            <h2 className="display" style={{ fontSize: "clamp(40px, 5vw, 64px)" }}>The matrix, <i>in full.</i></h2>
            <Mono>scroll if needed →</Mono>
          </div>
          <div className="reveal d1" style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
              <thead><tr><th style={headStyle}>Feature</th><th style={{ ...headStyle, color: "var(--ivory)" }}>Starter</th><th style={{ ...headStyle, color: "var(--ivory)" }}>Professional</th><th style={{ ...headStyle, color: "var(--ivory)" }}>Business</th><th style={{ ...headStyle, color: "var(--ivory)" }}>Enterprise</th></tr></thead>
              <tbody>{MATRIX.map((row) => (<tr key={row[0]}>{row.map((cell, i) => (<td key={i} style={{ ...cellStyle, color: i === 0 ? "var(--ivory)" : "var(--ivory-soft)" }}>{cell}</td>))}</tr>))}</tbody>
            </table>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
