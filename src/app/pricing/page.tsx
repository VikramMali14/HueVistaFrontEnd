import type { Metadata } from "next";
import Link from "next/link";
import { Marquee } from "@/components/layout/marquee";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { PricingTiers } from "@/components/pricing/pricing-tiers";
import { PricingFaq } from "@/components/pricing/pricing-faq";

export const metadata: Metadata = {
  title: "Pricing",
  description: "For retailers, not consumers. Four tiers. One catalogue.",
};

type Row = readonly [string, string, string, string, string];
type Section = { title: string; rows: ReadonlyArray<Row> };

const MATRIX: ReadonlyArray<Section> = [
  {
    title: "The render",
    rows: [
      ["AI renders / month", "XX", "LX", "CL", "Unlimited"],
      ["Recolour speed", "60 fps", "60 fps", "60 fps", "60 fps"],
      ["Per-region recolour", "—", "●", "●", "●"],
      ["SAM 2 manual regions", "—", "●", "●", "●"],
      ["Image cleaning (Nano Banana Pro)", "—", "Add-on", "Add-on", "Included"],
    ],
  },
  {
    title: "The catalogue",
    rows: [
      ["Asian Paints — full", "●", "●", "●", "●"],
      ["Berger · Nerolac · Dulux", "Soon", "Soon", "Soon", "Day one"],
      ["CIELAB find-similar across brands", "—", "●", "●", "●"],
      ["Paint quantity estimator", "—", "●", "●", "●"],
    ],
  },
  {
    title: "The counter",
    rows: [
      ["Counter devices", "1", "3", "10", "Unlimited"],
      ["WhatsApp & link share", "●", "●", "●", "●"],
      ["White-label subdomain", "—", "—", "●", "●"],
      ["Custom palette & wordmark", "—", "—", "●", "●"],
    ],
  },
  {
    title: "Engineering",
    rows: [
      ["API & SDK", "—", "—", "—", "●"],
      ["SLA", "Best-effort", "Business hrs", "99.5%", "99.9%"],
      ["Support", "Email", "Priority", "Account lead", "Named tech lead"],
    ],
  },
];

const cellStyle: React.CSSProperties = { textAlign: "left", padding: "22px 24px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--sans)", fontWeight: 300, fontSize: 15, color: "var(--ivory-soft)", verticalAlign: "top" };
const featCellStyle: React.CSSProperties = { ...cellStyle, color: "var(--ivory)", fontFamily: "var(--serif)", fontSize: 19 };
const featuredColStyle: React.CSSProperties = { background: "rgba(184,153,104,.05)", color: "var(--ivory)" };
const headStyle: React.CSSProperties = { textAlign: "left", padding: "32px 24px", borderBottom: "1px solid var(--rule-strong)", font: "400 10px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", color: "var(--brass)" };
const sectionHeadStyle: React.CSSProperties = { font: "400 italic 22px/1 var(--serif)", color: "var(--brass-soft)", padding: "56px 24px 12px" };
const yesStyle: React.CSSProperties = { color: "var(--brass)", fontFamily: "var(--mono)", fontSize: 13 };
const noStyle: React.CSSProperties = { color: "var(--mute-deep)", fontFamily: "var(--mono)", fontSize: 13 };

function MatrixCell({ v, featured }: { v: string; featured?: boolean }) {
  const style: React.CSSProperties = { ...cellStyle, ...(featured ? featuredColStyle : {}) };
  if (v === "●") return <td style={style}><span style={yesStyle}>●</span></td>;
  if (v === "—") return <td style={style}><span style={noStyle}>—</span></td>;
  return <td style={style}>{v}</td>;
}

export default function PricingPage() {
  return (
    <>
      <Marquee items={["Pricing · For retailers, not consumers", "Fourteen days · no card · cancel quietly", "White-label available from ₹1,999"]} />
      <SiteHeader />
      <main>
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Volume IV &nbsp;·&nbsp; Pricing</Eyebrow>
            <Mono>Built for retailers · not consumers</Mono>
          </div>
          <h1 className="display">For retailers,<br /><i>not consumers.</i></h1>
          <Lead className="page-lead">Four tiers, each tuned to a different counter. Begin with fourteen unbilled days. No card. Cancel quietly when you wish.</Lead>
          <PricingTiers />
        </header>

        <section style={{ background: "#0a0805", padding: "140px 0", marginTop: 80 }} className="full-bleed">
          <div style={{ maxWidth: 1240, margin: "0 auto", padding: "0 var(--gutter)" }}>
            <div className="reveal">
              <Eyebrow>Feature matrix</Eyebrow>
              <h2 className="display" style={{ fontSize: "clamp(48px, 6.5vw, 96px)", marginTop: 24 }}>
                Every line item, <i>compared.</i>
              </h2>
            </div>
            <div className="reveal d1" style={{ marginTop: 64, overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead>
                  <tr>
                    <th style={{ ...headStyle, width: "34%" }}>Capability</th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Starter</th>
                    <th style={{ ...headStyle, color: "var(--brass-soft)", background: "rgba(184,153,104,.08)" }}>Professional</th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Business</th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Enterprise</th>
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
                </tbody>
              </table>
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
              <p style={{ font: "300 italic 18px/1.5 var(--serif)", color: "var(--ivory-soft)", marginTop: 32 }}>
                If your question isn't here, write to us. We answer within an afternoon.
              </p>
              <Link href="/trial" className="text-link" style={{ marginTop: 32, display: "inline-block" }}>Write to us &nbsp;→</Link>
            </div>
            <PricingFaq />
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "180px 0", background: "radial-gradient(ellipse at 50% 50%, rgba(184,153,104,.10), transparent 65%)" }}>
          <div className="reveal">
            <Mono brass>Commencement</Mono>
            <h2 className="display" style={{ fontSize: "clamp(56px, 9vw, 142px)", marginTop: 32, lineHeight: 0.92 }}>
              Fourteen days.<br /><i>No card.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Begin a trial <span className="arr">→</span></Link>
              <Link href="/trial" className="btn btn-ghost">Book a demonstration <span className="arr">→</span></Link>
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
