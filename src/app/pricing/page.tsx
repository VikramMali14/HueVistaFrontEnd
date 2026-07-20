import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { PricingTiers } from "@/components/pricing/pricing-tiers";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { getCurrentUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Pricing",
  description: "For retailers, not consumers. Four tiers. One catalogue.",
};

type Row = readonly [string, string, string, string, string];
type Section = { title: string; rows: ReadonlyArray<Row> };

// Every cell states what ships today; unbuilt items say "Soon" (never "●").
const MATRIX: ReadonlyArray<Section> = [
  {
    title: "The preview",
    rows: [
      ["Images / month (AI photo clean-up on every one)", "25", "60", "120", "Unlimited"],
      ["AI auto-masks / month (instant wall detection)", "—", "40", "90", "Unlimited"],
      ["Manual wall masking (click-to-segment)", "Unlimited", "Unlimited", "Unlimited", "Unlimited"],
      ["Extra images after the quota", "₹59 each", "₹59 each", "₹59 each", "—"],
      ["Colour-board PDFs / month", "25 (4 img)", "100 (8 img)", "300 (12 img)", "Unlimited (16 img)"],
      ["Recolour speed", "60 fps", "60 fps", "60 fps", "60 fps"],
      ["Per-region recolour", "●", "●", "●", "●"],
      ["AI colour palette suggestions", "—", "●", "●", "●"],
    ],
  },
  {
    title: "The catalogue",
    rows: [
      ["Asian Paints — full", "●", "●", "●", "●"],
      ["Berger · Nerolac · Dulux · Nippon", "●", "●", "●", "●"],
      ["CIELAB find-similar across brands", "—", "●", "●", "●"],
    ],
  },
  {
    title: "The counter",
    rows: [
      ["Link & WhatsApp share", "●", "●", "●", "●"],
      ["Customer access codes", "●", "●", "●", "●"],
      ["White-label subdomain", "—", "—", "Soon", "Soon"],
      ["Painter portal", "—", "—", "Soon", "Soon"],
    ],
  },
  {
    title: "Engineering",
    rows: [
      ["API & SDK", "—", "—", "—", "On request"],
      ["SLA", "Best-effort", "Business hrs", "99.5%", "99.9%"],
      ["Support", "Email", "Priority", "Account lead", "Named tech lead"],
    ],
  },
];

const cellStyle: React.CSSProperties = { textAlign: "left", padding: "22px 24px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--sans)", fontWeight: 400, fontSize: 15, color: "var(--ivory-soft)", verticalAlign: "top" };
const featCellStyle: React.CSSProperties = { ...cellStyle, color: "var(--ivory)", fontFamily: "var(--serif)", fontSize: 19 };
const featuredColStyle: React.CSSProperties = { background: "rgba(124,92,255,.05)", color: "var(--ivory)" };
const headStyle: React.CSSProperties = { textAlign: "left", padding: "32px 24px", borderBottom: "1px solid var(--rule-strong)", font: "400 10px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", color: "var(--brass)" };
const sectionHeadStyle: React.CSSProperties = { font: "400 22px/1 var(--serif)", color: "var(--brass-soft)", padding: "56px 24px 12px" };
const yesStyle: React.CSSProperties = { color: "var(--brass)", fontFamily: "var(--mono)", fontSize: 13 };
const noStyle: React.CSSProperties = { color: "var(--mute-deep)", fontFamily: "var(--mono)", fontSize: 13 };
const thPriceStyle: React.CSSProperties = { marginTop: 10, font: "400 14px/1.2 var(--serif)", letterSpacing: "normal", textTransform: "none", color: "var(--ivory-soft)" };
const visuallyHidden: React.CSSProperties = { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap" };
const ctaCellStyle: React.CSSProperties = { ...cellStyle, borderBottom: "none" };

function MatrixCell({ v, featured }: { v: string; featured?: boolean }) {
  const style: React.CSSProperties = { ...cellStyle, ...(featured ? featuredColStyle : {}) };
  if (v === "●") return <td style={style}><span aria-hidden style={yesStyle}>✓</span><span style={visuallyHidden}>Included</span></td>;
  if (v === "—") return <td style={style}><span aria-hidden style={noStyle}>—</span><span style={visuallyHidden}>Not included</span></td>;
  return <td style={style}>{v}</td>;
}

export default async function PricingPage() {
  // Signed-in customers see guidance instead of shop-plan buy buttons — the
  // backend refuses those charges anyway (plans unlock nothing for a customer).
  const user = await getCurrentUser();
  const isCustomer = user?.role === "CUSTOMER";
  return (
    <>
      <Marquee items={["Pricing · For retailers, not consumers", "14-day trial · no card · we set you up", "10,000+ shades across five brands"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Pricing</Eyebrow>
            <Mono>Built for retailers · not consumers</Mono>
          </div>
          <h1 className="display">For retailers,<br /><i>not consumers.</i></h1>
          <Lead className="page-lead">Four tiers, each tuned to a different counter. Every new shop starts with fourteen unbilled days — request an account and we set you up. Cancel quietly when you wish.</Lead>
          <PricingTiers isCustomer={isCustomer} />
        </header>

        <div className="reveal" style={{ borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", padding: "22px 0", marginTop: 64, display: "flex", flexWrap: "wrap", gap: "12px 36px", justifyContent: "center", font: "400 10px/1.7 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
          <span>GST invoice on request</span>
          <span aria-hidden>·</span>
          <span>UPI · cards · netbanking</span>
          <span aria-hidden>·</span>
          <span>Cancel anytime — scenes kept 30 days</span>
          <span aria-hidden>·</span>
          <span>Built in India for Indian counters</span>
        </div>

        <section style={{ background: "var(--band)", borderTop: "1px solid var(--band-rule)", borderBottom: "1px solid var(--band-rule)", padding: "140px 0", marginTop: 80 }} className="full-bleed">
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <div className="reveal">
              <Eyebrow>Feature matrix</Eyebrow>
              <h2 className="display" style={{ fontSize: "clamp(48px, 6.5vw, 96px)", marginTop: 24, color: "var(--ivory)" }}>
                Every line item, <i>compared.</i>
              </h2>
            </div>
            <div className="reveal d1" style={{ marginTop: 64 }}>
              <p className="mono hv-matrix-hint" style={{ marginBottom: 14, color: "var(--accent-soft)" }}>
                Swipe to compare every tier →
              </p>
              {/* Overflow is lifted at >=964px (globals) so the sticky thead can
                  engage against the page scroll instead of this wrapper. */}
              <div className="r-scroll-x hv-matrix-wrap">
                <table className="hv-matrix" style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead className="hv-matrix-head">
                  <tr>
                    <th style={{ ...headStyle, width: "34%" }}>Capability</th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Starter<div style={thPriceStyle}>₹999 / mo + GST</div></th>
                    {/* Literal metallic on the always-dark band. Opaque composite
                        so the tint survives sticky overlap. */}
                    <th style={{ ...headStyle, color: "var(--accent-soft)", background: "linear-gradient(rgba(124,92,255,.08), rgba(124,92,255,.08)) var(--band)" }}>Professional<div style={{ ...thPriceStyle, color: "var(--accent-soft)" }}>₹2,499 / mo + GST</div></th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Business<div style={thPriceStyle}>₹4,999 / mo + GST</div></th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Enterprise<div style={thPriceStyle}>On request</div></th>
                  </tr>
                </thead>
                <tbody>
                  {MATRIX.flatMap((section) => [
                    (
                      <tr key={`s-${section.title}`}>
                        <td colSpan={5} style={sectionHeadStyle}>{section.title}</td>
                      </tr>
                    ),
                    ...section.rows.map((row) => (
                      <tr key={`${section.title}-${row[0]}`}>
                        <td style={featCellStyle}>{row[0]}</td>
                        <MatrixCell v={row[1]} />
                        <MatrixCell v={row[2]} featured />
                        <MatrixCell v={row[3]} />
                        <MatrixCell v={row[4]} />
                      </tr>
                    )),
                  ])}
                  {/* This row lives on the always-dark band, so the buttons use
                      fixed ivory/brass values rather than tokens. */}
                  <tr key="cta">
                    <td style={ctaCellStyle} />
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--ivory)", borderColor: "var(--ivory)", color: "var(--charcoal)" }}>Request account</Link></td>
                    <td style={{ ...ctaCellStyle, ...featuredColStyle, borderBottom: "none" }}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#0a0a0f" }}>Request account</Link></td>
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--ivory)", borderColor: "var(--ivory)", color: "var(--charcoal)" }}>Request account</Link></td>
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-ghost btn-sm" style={{ color: "var(--ivory)", borderColor: "rgba(247,247,245,.35)" }}>Talk to us</Link></td>
                  </tr>
                </tbody>
                </table>
              </div>
            </div>
          </div>
        </section>

        <section style={{ paddingTop: 140 }}>
          <div className="reveal r-stack-md" style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: 80, alignItems: "start" }}>
            <div>
              <Eyebrow>Common questions</Eyebrow>
              <h2 className="display" style={{ fontSize: "clamp(40px, 5.5vw, 80px)", marginTop: 24, lineHeight: 0.95 }}>
                Quietly <i>answered.</i>
              </h2>
              <p style={{ font: "400 18px/1.5 var(--serif)", color: "var(--fg-soft)", marginTop: 32 }}>
                If your question isn't here, write to us. We answer within an afternoon.
              </p>
              <a href="mailto:hello@huevista.com?subject=Shop%20account" className="text-link" style={{ marginTop: 32, display: "inline-block" }}>Write to us &nbsp;→</a>
            </div>
            <PricingFaq />
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "180px 0", background: "radial-gradient(ellipse at 50% 50%, rgba(124,92,255,.10), transparent 65%)" }}>
          <div className="reveal">
            <Mono brass>Commencement</Mono>
            <h2 className="display" style={{ fontSize: "clamp(56px, 9vw, 142px)", marginTop: 32, lineHeight: 0.92 }}>
              Fourteen days.<br /><i>No card.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Request a shop account <span className="arr">→</span></Link>
              <Link href="/redeem" className="btn btn-ghost">Have a shop code? <span className="arr">→</span></Link>
            </div>
            <div style={{ marginTop: 24, font: "400 10px/1.7 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
              GST invoice on request · UPI accepted · cancel anytime
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
