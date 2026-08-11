import type { Metadata } from "next";
import { contact } from "@/lib/config";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { Footer } from "@/components/layout/footer";
import { Eyebrow, Lead, Mono } from "@/components/ui/eyebrow";
import { RevealMount } from "@/components/ui/reveal-mount";
import { PricingTiers } from "@/components/pricing/pricing-tiers";
import { PricingFaq } from "@/components/pricing/pricing-faq";
import { getCurrentUser } from "@/lib/auth";
import { fetchCatalogueSize } from "@/lib/catalogue";
import {
  FREE_PLAN_EXTRA_PROJECT_POINTS,
  FREE_PLAN_EXTRA_PROJECT_RUPEES,
  FREE_PLAN_PROJECTS,
  FREE_PLAN_PROJECTS_WORD,
} from "@/lib/free-plan";

export const metadata: Metadata = {
  title: "Pricing",
  description: "For retailers, not consumers. Four tiers, one of them free. One catalogue.",
};

type Row = readonly [string, string, string, string, string];
type Section = { title: string; rows: ReadonlyArray<Row> };

// Every cell states what ships today; unbuilt items say "Soon" (never "●").
//
// The quota rows state totals, matching the tier cards above. They briefly showed
// the arithmetic ("15 + 30 = 45") because a bare total under an "everything in the
// tier below, plus" framing had been read as cumulative — 15 AND 45. In a table the
// columns sit side by side, so the progression is visible without a sum in each cell;
// the cards carry the derivation as a footnote for the reading that needs it.
//
// Four columns. Free is a real tier — the plan every shop is on until it buys one, and
// the one it returns to if it stops paying — so it belongs in the comparison the page
// exists to make. Enterprise is still absent: it is not offered for now, and the backend
// does not serve it from /api/billing/plans, so an "On request" column would be quoting a
// plan nothing in the product can sell.
//
// The free column is where the tier boundary shows itself. Three rows separate it from
// Starter: the project allowance, the colour finder, and how much of the catalogue the
// shop reaches — a free counter works with one paint company, and the two capability
// rows are the only ones in the product gated on the tier rather than on a quota.
const MATRIX: ReadonlyArray<Section> = [
  {
    title: "The preview",
    rows: [
      ["Projects per month (clean-up + walls found for you)", String(FREE_PLAN_PROJECTS), "15", "45", "100"],
      ["Allowance renews every month", "●", "●", "●", "●"],
      ["Marking walls yourself", "Unlimited", "Unlimited", "Unlimited", "Unlimited"],
      ["Extra project — by card, or with points (HueVista credit bought up front)", `₹${FREE_PLAN_EXTRA_PROJECT_RUPEES} or ${FREE_PLAN_EXTRA_PROJECT_POINTS} pts`, "₹65 or 60 pts", "₹55 or 50 pts", "₹45 or 40 pts"],
      ["Unused projects carried over when you upgrade", "●", "●", "●", "●"],
      ["Colour boards (PDF) per month", "5 (4 photos)", "25 (4 photos)", "100 (8 photos)", "300 (12 photos)"],
      ["Paint each wall its own colour", "●", "●", "●", "●"],
      ["Colour scheme suggestions", "—", "—", "●", "●"],
    ],
  },
  {
    title: "The catalogue",
    rows: [
      // No hard-coded brand list. This row used to read "Berger · Nerolac · Dulux ·
      // Nippon ✓" on every tier, which said those four catalogues were loaded — the
      // FAQ on this same page had already been corrected for making exactly that
      // claim when they were not. Which companies a shop sees depends on what its
      // distributor assigned it, so the catalogue page states the live list and this
      // table says only how much of it each tier reaches.
      ["Every company your distributor assigned you", "Asian Paints only", "●", "●", "●"],
      // The tier line. Colour matching — read a photograph, get the nearest catalogue
      // shade codes — is the one tool that earns at the counter without a project behind
      // it, so it is what the free plan does not carry.
      ["Colour finder — shade codes from any photo", "—", "●", "●", "●"],
      ["Find the closest shade across companies", "—", "—", "●", "●"],
    ],
  },
  {
    title: "The counter",
    rows: [
      ["Send by link or WhatsApp", "●", "●", "●", "●"],
      ["Codes for your customers", "●", "●", "●", "●"],
      ["Your own web address", "—", "—", "—", "Soon"],
      ["Painter portal", "—", "—", "—", "Soon"],
    ],
  },
  {
    title: "Engineering",
    rows: [
      ["SLA", "Best-effort", "Best-effort", "Business hrs", "99.5%"],
      ["Support", "Community", "Email", "Priority", "Account lead"],
    ],
  },
];

const cellStyle: React.CSSProperties = { textAlign: "left", padding: "22px 24px", borderBottom: "1px solid var(--rule)", fontFamily: "var(--sans)", fontWeight: 400, fontSize: 15, color: "var(--ivory-soft)", verticalAlign: "top" };
const featCellStyle: React.CSSProperties = { ...cellStyle, color: "var(--ivory)", fontFamily: "var(--serif)", fontSize: 19 };
const featuredColStyle: React.CSSProperties = { background: "rgba(124,92,255,.05)", color: "var(--ivory)" };
const headStyle: React.CSSProperties = { textAlign: "left", padding: "32px 24px", borderBottom: "1px solid var(--rule-strong)", font: "400 12px/1 var(--mono)", letterSpacing: ".28em", textTransform: "uppercase", color: "var(--brass)" };
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
  // The lede used to overstate the catalogue ("10,000+ shades across five brands"
  // against a real 4,522 across two) and contradicted the rest of the page on the
  // trial length. It reads the live figure now; the FAQ below takes the same numbers.
  const size = await fetchCatalogueSize();
  return (
    <>
      <SiteHeader />
      <main id="main">
        <RevealMount />
        <header className="page-head">
          <div className="eyebrow-row">
            <Eyebrow>Pricing</Eyebrow>
            <Mono>Built for retailers · not consumers</Mono>
          </div>
          <h1 className="display">For retailers,{" "}<br /><i>not consumers.</i></h1>
          <Lead className="page-lead">Four tiers, each tuned to a different counter, and the first one is free for good — {FREE_PLAN_PROJECTS} complete projects every month, renewing, no card. Request an account, confirm your email, and it opens within a day. Move up when the counter outgrows it; cancel quietly when you wish and drop back to free rather than to nothing.</Lead>
          <PricingTiers isCustomer={isCustomer} signedIn={Boolean(user)} />
        </header>

        <div className="reveal" style={{ borderTop: "1px solid var(--rule)", borderBottom: "1px solid var(--rule)", padding: "22px 0", marginTop: 64, display: "flex", flexWrap: "wrap", gap: "12px 36px", justifyContent: "center", font: "400 12px/1.7 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
          <span>Payment receipt for every order</span>
          <span aria-hidden>·</span>
          <span>UPI · cards · netbanking</span>
          <span aria-hidden>·</span>
          {/* "scenes kept 30 days" was the only place on the site using that word, and it
              did not match what the policies promise. The thirty days is an extra
              project's EDIT window (Terms §8), not a retention period after cancelling —
              and what the terms actually guarantee past that window is more generous:
              the project stays viewable with its colours intact. State that instead;
              a trust bar next to a price is the worst place to invent a term. */}
          <span>Cancel anytime — projects stay viewable</span>
          <span aria-hidden>·</span>
          {/* Plan.GST_PERCENT is 0 — this runs as a non-GST-registered proprietorship,
              so the price on the card is the whole price. Say so rather than leave a
              buyer (or a payment reviewer) to wonder what gets added at checkout. */}
          <span>Prices in INR, all-inclusive — no GST added at checkout</span>
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
                    <th style={{ ...headStyle, width: "30%" }}>Capability</th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Free<div style={thPriceStyle}>₹0 · no card</div></th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Starter<div style={thPriceStyle}>₹999 / mo</div></th>
                    {/* Literal metallic on the always-dark band. Opaque composite
                        so the tint survives sticky overlap. */}
                    <th style={{ ...headStyle, color: "var(--accent-soft)", background: "linear-gradient(rgba(124,92,255,.08), rgba(124,92,255,.08)) var(--band)" }}>Professional<div style={{ ...thPriceStyle, color: "var(--accent-soft)" }}>₹2,499 / mo</div></th>
                    <th style={{ ...headStyle, color: "var(--ivory)" }}>Business<div style={thPriceStyle}>₹4,999 / mo</div></th>
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
                        <MatrixCell v={row[2]} />
                        <MatrixCell v={row[3]} featured />
                        <MatrixCell v={row[4]} />
                      </tr>
                    )),
                  ])}
                  {/* This row lives on the always-dark band, so the buttons use
                      fixed ivory/brass values rather than tokens.

                      Labelled "Start free", not "Request account": every column
                      leads to the same free account — which is now literally the
                      leftmost column, not a trial of the others — and a per-tier
                      "Request" button reads as a way to ask for that tier. You buy
                      the tier from inside the app once you have the account. */}
                  <tr key="cta">
                    <td style={ctaCellStyle} />
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--ivory)", borderColor: "var(--ivory)", color: "var(--charcoal)" }}>Start free</Link></td>
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--ivory)", borderColor: "var(--ivory)", color: "var(--charcoal)" }}>Start free</Link></td>
                    <td style={{ ...ctaCellStyle, ...featuredColStyle, borderBottom: "none" }}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--accent)", borderColor: "var(--accent)", color: "#0a0a0f" }}>Start free</Link></td>
                    <td style={ctaCellStyle}><Link href="/trial" className="btn btn-sm" style={{ background: "var(--ivory)", borderColor: "var(--ivory)", color: "var(--charcoal)" }}>Start free</Link></td>
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
              <a href={`mailto:${contact.general}?subject=Shop%20account`} className="text-link" style={{ marginTop: 32, display: "inline-block" }}>Write to us &nbsp;→</a>
            </div>
            <PricingFaq catalogue={size ? { shades: size.shades, names: size.names } : null} />
          </div>
        </section>

        <section style={{ textAlign: "center", padding: "180px 0", background: "radial-gradient(ellipse at 50% 50%, rgba(124,92,255,.10), transparent 65%)" }}>
          <div className="reveal">
            <Mono brass>Commencement</Mono>
            <h2 className="display" style={{ fontSize: "clamp(56px, 9vw, 142px)", marginTop: 32, lineHeight: 0.92 }}>
              {FREE_PLAN_PROJECTS_WORD} rooms.<br /><i>Every month.</i>
            </h2>
            <div style={{ marginTop: 56, display: "inline-flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
              <Link href="/trial" className="btn btn-brass">Request a shop account <span className="arr">→</span></Link>
              <Link href="/unlock" className="btn btn-ghost">Have a shop code? <span className="arr">→</span></Link>
            </div>
            <div style={{ marginTop: 24, font: "400 12px/1.7 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", color: "var(--fg-mute)" }}>
              Free plan needs no card · payment receipt for every order · UPI accepted · cancel anytime
            </div>
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
